import type { Material } from '@babylonjs/core'
import { MaterialPluginBase, RegisterMaterialPlugin, StandardMaterial } from '@babylonjs/core'

/** 外掛的名字 */
const PLUGIN_NAME = 'MinespaceSunShadow'

/**
 * 以下幾個字串都是拿來比對 Babylon 9.20 著色器原文的正規式（shadowsFragmentFunctions 與 lightFragment）
 *
 * 兩條規矩，踩過才知道：
 * - 只能比對單獨一句。Babylon 在外掛改寫之前已經把著色器拆成一句一行，
 *   橫跨兩句的正規式（中間其實隔著換行）永遠比不到，而且是安靜地比不到。
 * - 整句要比對到分號為止。Babylon 會在注入的字串後面補換行，
 *   殘句落到下一行會被前處理丟掉，整支著色器編不過（見 cutout-shading）。
 *
 * 匯出是給測試用的：升級 Babylon 之後原文要是改了寫法，正規式比不到就不做事，
 * 畫面不會壞、只是那幾毫秒又回來了。sun-shadow.test.ts 拿套件裡的著色器原文比對，原文一改測試先壞
 */

/**
 * 分層陰影的接觸硬化裡，「依遮蔽物距離算半影多寬」的那一句
 *
 * `*depthCorrection+AAOffset` 只有分層版才有，單張版不會被誤改。
 * 這一句在遮蔽搜尋之後、比較取樣之前，「有遮蔽物才往下算」的分支從這裡開始
 */
export const CASCADED_PENUMBRA_PATTERN
  = 'float penumbraRatio=\\(\\(depthMetric-avgBlockerDepth\\)\\*depthCorrection\\+AAOffset\\);'

const CASCADED_PENUMBRA_SOURCE
  = 'float penumbraRatio=((depthMetric-avgBlockerDepth)*depthCorrection+AAOffset);'

/**
 * 分層陰影的接觸硬化裡，比較取樣算完之後「依遮蔽物距離把半影調淡」的那一句
 *
 * 同樣只有分層版有 `*depthCorrection*penumbraDarkness`。分支在這一句之後收尾
 */
export const CASCADED_PENUMBRA_DARKNESS_PATTERN
  = 'shadow=mix\\(shadow,1\\.,min\\(\\(depthMetric-avgBlockerDepth\\)\\*depthCorrection\\*penumbraDarkness,1\\.\\)\\);'

const CASCADED_PENUMBRA_DARKNESS_SOURCE
  = 'shadow=mix(shadow,1.,min((depthMetric-avgBlockerDepth)*depthCorrection*penumbraDarkness,1.));'

/**
 * 分層陰影的接觸硬化裡，比較迴圈的那一次取樣
 *
 * `uvDepthLayer+offset*filterRadius` 只有分層版的接觸硬化才有。
 * Babylon 稍後才把 texture2D 換成 texture，兩種寫法都認
 */
export const CASCADED_COMPARE_TAP_PATTERN
  = 'shadow\\+=texture(?:2D)?\\(shadowSampler,uvDepthLayer\\+offset\\*filterRadius\\);'

const CASCADED_COMPARE_TAP_SOURCE
  = 'shadow+=textureGrad(shadowSampler,uvDepthLayer+offset*filterRadius,vec2(0.),vec2(0.));'

/** 分層陰影的接觸硬化裡，遮蔽搜尋迴圈的那一次取樣（只有分層版有 layer 這個參數） */
export const CASCADED_SEARCH_TAP_PATTERN
  = 'blockerDepth=texture(?:2D)?\\(depthSampler,vec3\\(uvDepth\\.xy\\+\\(lightSizeUV\\*lightSizeUVCorrection\\*shadowMapSizeInverse\\*PoissonSamplers32\\[i\\]\\.xy\\),layer\\)\\)\\.r;'

const CASCADED_SEARCH_TAP_SOURCE
  = 'blockerDepth=textureLod(depthSampler,vec3(uvDepth.xy+(lightSizeUV*lightSizeUVCorrection*shadowMapSizeInverse*PoissonSamplers32[i].xy),layer),0.).r;'

/**
 * lightFragment 裡「這個像素落在分層陰影的範圍內才算陰影」的那個判斷
 *
 * 第一個括號是整個變數名（index 加光源編號），第二個是光源編號
 */
export const CASCADED_RANGE_CHECK_PATTERN = 'if \\((index(\\d+))>=0\\)'

/**
 * 分層陰影的 PCF（三乘三與五乘五）每一次比較取樣
 *
 * 鏤空方塊的陰影走這裡（見 cutout-shading）。`layer,uvDepth.z` 只有分層版才有。
 * 每一次取樣各自是一句（權重乘上取樣、加進 shadow），正規式帶著 g 旗標全部換過
 */
export const CASCADED_PCF_TAP_PATTERN
  = 'shadow\\+=(uvw\\d\\.x\\*uvw\\d\\.y)\\*texture(?:2D)?\\(shadowSampler,vec4\\(base_uv\\.xy\\+vec2\\(u\\[(\\d)\\],v\\[(\\d)\\]\\),layer,uvDepth\\.z\\)\\);'

/**
 * 太陽陰影取樣的捷徑（高與極致的分層陰影）
 *
 * 太陽的陰影是分層的接觸硬化（PCSS）：先做一輪遮蔽搜尋（十六或三十二次取樣）
 * 找出擋光的東西有多遠，再依距離做三十二或六十四次比較取樣，是方塊著色器裡最貴的一段。
 * 這支外掛不改陰影的樣子，只讓不必算的像素真的不算：
 *
 * 一、背對太陽的面不算陰影。那種面的日照本來就是零，陰影是多少都不影響漫射；
 *     差別只在背光面的高光不再被陰影壓掉，而背光面的高光本來就趨近零。
 * 二、搜尋完全沒找到遮蔽物（曬得到太陽、附近也沒有東西擋著）就不做後面那幾十次比較取樣。
 *     Babylon 的分層版本來是全部做完才看遮蔽物個數、回傳 1.0，結果相同，只是白算。
 * 三、鏤空方塊提早丟掉透明像素（寫在 cutout-shading，靠這裡把陰影取樣換掉才成立）。
 *
 * ── 動態分支怎樣才是真的 ──
 *
 * 三條捷徑都是「條件成立就跳過一大段」。Windows 上的 Chrome 經 ANGLE 把 GLSL 轉成 HLSL，
 * 分支會不會真的跳過，有兩個條件，都是量出來的，沒有任何警告：
 *
 * - 被跳過的那一段裡不能有要算螢幕微分的貼圖取樣。一般的 texture() 要靠相鄰像素的差來挑 mip，
 *   HLSL 不准它落在動態分支裡，遇到就把分支攤平：兩邊都算完再挑一邊。
 *   所以陰影的每一次取樣都換成 textureLod／textureGrad（指定第零層、微分給零）。
 *   陰影貼圖沒有 mip，取到的值不變。
 * - 要寫成「if 包住那一段」，不能寫成「函式中途 return」。同樣是沒有遮蔽物就不算，
 *   寫成提早 return（Babylon 單張版的寫法）實測一毫秒都沒省，改成 if 包住才有。
 *
 * 之後在方塊著色器的光照段加貼圖取樣，也要用 textureLod，否則這幾條捷徑會安靜地失效
 * （雲影、全局光、焦散都已經這樣寫）。
 *
 * 第二條的改法：在「算半影多寬」那一句前面開一個 if (numBlocker>=1.0) 的區塊，
 * 在「把半影調淡」那一句後面算出結果、關上區塊、返回。原本排在後面的幾句留在返回之後，不會執行。
 * 區塊外先宣告一個同名的 shadow：原本的宣告落進區塊裡，留在後面的那幾句才找得到這個名字。
 *
 * 注入的 GLSL 裡不寫註解，理由在 cloud-shadow
 */
class SunShadowPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 不帶 define 也不帶 uniform，只在著色器組好之後換掉幾句，所以直接啟用 */
    super(material, PLUGIN_NAME, 240, {}, true, true)
  }

  override getClassName(): string {
    return 'SunShadowPlugin'
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      [`!${CASCADED_RANGE_CHECK_PATTERN}`]: 'if ($1>=0 && dot(normalW,light$2.vLightData.xyz)<0.0)',
      [`!${CASCADED_SEARCH_TAP_PATTERN}`]: CASCADED_SEARCH_TAP_SOURCE,
      [`!${CASCADED_COMPARE_TAP_PATTERN}`]: CASCADED_COMPARE_TAP_SOURCE,
      [`!${CASCADED_PCF_TAP_PATTERN}`]: 'shadow+=$1*textureGrad(shadowSampler,vec4(base_uv.xy+vec2(u[$2],v[$3]),layer,uvDepth.z),vec2(0.),vec2(0.));',
      [`!${CASCADED_PENUMBRA_PATTERN}`]:
        `float minespaceShadowResult=1.0;float shadow=0.;if (numBlocker>=1.0) {${CASCADED_PENUMBRA_SOURCE}`,
      [`!${CASCADED_PENUMBRA_DARKNESS_PATTERN}`]:
        `${CASCADED_PENUMBRA_DARKNESS_SOURCE}minespaceShadowResult=computeFallOff(mix(darkness,1.,shadow),clipSpace.xy,frustumEdgeFalloff);}return minespaceShadowResult;`,
    }
  }
}

let isRegistered = false

/**
 * 掛上太陽陰影的捷徑
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同
 */
export function registerSunShadow(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin(PLUGIN_NAME, (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new SunShadowPlugin(material)
  })
}
