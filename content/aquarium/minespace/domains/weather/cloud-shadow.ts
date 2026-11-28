import type { BaseTexture, Material, UniformBuffer } from '@babylonjs/core'
import { MaterialPluginBase, RegisterMaterialPlugin, StandardMaterial, Vector3 } from '@babylonjs/core'

/**
 * 雲影最深時擋掉幾成的直射光
 *
 * 這個數字比「物理上該有的」大。理由與色調映射有關，
 * 寫在下面 SKY_SHADE_DEPTH 那一段，兩個要一起讀
 */
const SHADE_DEPTH = 0.72

/**
 * 雲影連天光一起收掉幾成
 *
 * 原本這一項是零，理由寫得很篤定：「雲擋住的是太陽，不是天空」。
 * 那句話只對了一半。一朵積雲罩在頭頂時，它擋掉的除了那顆太陽，
 * 還有頭頂那一大塊天空，站在雲底下天光確實也少了一截。
 *
 * 而真正逼著這一項從零長出來的，是色調映射。
 *
 * 這座庭園的地是白沙。正午時平行光加天光加上環境色，
 * 線性亮度是 1.75，早就衝過 ACES 的膝點，整片地貼在天花板上。
 * 量過的數字：只收平行光、深度給到 0.6，最暗處是 204，
 * 沒有雲影的地方是 209——差五階，等於看不見。
 * 雲影一直都算對了，只是全部被壓在那道天花板底下。
 *
 * 天光跟著收，兩邊一起把總量壓到膝點以下，那塊暗才掉得出來。
 * 量過的組合（白沙 / 一般方塊，數字是最深處與無雲處）：
 *
 *   0.60 / 0.30 → 204..209 / 142..209   白沙上還是看不見
 *   0.72 / 0.42 → 174..209 / 108..209   白沙看得出來，深色地面也不死黑
 *   0.82 / 0.55 → 130..209 /  75..209   太深，像雲飄過去整個世界暗一下
 *
 * 所以這兩個數字是照著這座場景的曝光配的，不是物理值。
 * 哪天 pipeline 的 exposure 或日夜的光強調低、畫面離開了膝點，
 * 這兩個數字就該一起往回收
 */
const SKY_SHADE_DEPTH = 0.42

/**
 * 天光那一份相對於直射光的比例
 *
 * 兩者共用同一個覆蓋率與同一組淡出，差的只有深度。
 * 直接把比例算成常數塞進著色器，就不必為了它多開一個 uniform
 */
const SKY_SHADE_RATIO = SKY_SHADE_DEPTH / SHADE_DEPTH

/**
 * 擋光量要到多少才開始遮、多少才遮到滿
 *
 * 俯視圖存的是「穿過整層雲之後還剩幾成光」，一減掉它就是擋光量。
 * 體積雲的邊本來就是漸薄的，影子自然帶著半影，不必再像舊的格子圖樣那樣
 * 先糊兩輪才有中間值；這兩個門檻只是把很薄的雲紗濾掉、
 * 讓厚雲的影子早一點到底
 */
const COVER_START = 0.02
const COVER_FULL = 0.55

/**
 * 太陽壓到這麼低就把雲影收掉
 *
 * 兩個理由。一是物理：太陽貼著地平線時，光要橫穿一百多格的空氣
 * 才到得了地面，雲影早就散得沒有形狀了。
 *
 * 二是這個投影法本身。雲在頭頂一百格高，投影點要沿著光線
 * 往回推 (雲高 − 腳下高度) ÷ 太陽仰角——仰角趨近零時那個距離會爆掉，
 * 整片地會被一格雲的顏色蓋滿。與其加保護，不如在還看得出形狀時就淡出
 */
const SUN_HEIGHT_FADE_START = 0.1
const SUN_HEIGHT_FADE_FULL = 0.32

/**
 * 這一刻的雲影
 *
 * 與 aerial-perspective 的 airState 同一種寫法：所有材質共用一份，
 * 每一幀由漫遊控制器寫一次，下一幀各材質綁定時自己來讀。
 * 兩百多份材質各存一套的話，改天氣得走過每一份
 */
const cloudShadowState = {
  /** 最深遮到幾成，零等於這個效果不存在 */
  strength: 0,
  /** 俯視圖的中心，跟著鏡頭走 */
  centerX: 0,
  centerZ: 0,
  /** 雲此刻露出多少，陰天罩蓋滿時雲淡掉，影子也跟著淡 */
  visibleRatio: 0,
  /** 每高出地面一格，投影點要往回退多少（太陽的水平斜率） */
  slopeX: 0,
  slopeZ: 0,
  /** 雲底高度，俯視圖就是在這個高度上量的 */
  height: 0,
  /** 一除以俯視圖涵蓋的世界寬度，世界座標乘上它就是貼圖座標 */
  inverseSpan: 0,
}

/** 雲的俯視透光圖，由 volumetric-cloud 每一幀畫好交過來 */
let shadowMapTexture: BaseTexture | null = null

/**
 * 雲影
 *
 * 天上飄著一整片雲，地面卻從早到晚是同一個亮度——這是原本的樣子。
 * 少了這一層，白沙庭園那一大片高明度的地會平得像一張紙：
 * 太陽角度在變，但「這一塊比較暗」這件事從來沒發生過。
 *
 * ── 為什麼不能用光的投影貼圖 ──
 *
 * 一般引擎的做法是給太陽掛一張捲動的雲圖（light cookie）。
 * Babylon 的 projectionTexture 只有聚光燈有，平行光沒有這個東西，
 * 所以只能走材質外掛，在著色器裡自己算。
 *
 * ── 為什麼要與真正的雲對得起來 ──
 *
 * 大可隨便鋪一張噪聲，但那樣地上的暗塊與頭頂的雲是兩回事，
 * 抬頭一看就穿幫。
 *
 * 方塊雲的年代，這裡拿的是雲層那份布林圖樣，糊一糊烘成小圖。
 * 換成體積雲之後，雲的形狀是著色器裡三張雜訊算出來的，CPU 這一側根本不知道。
 * 所以改由體積雲自己每一幀畫一張俯視圖：在雲底那個高度上，
 * 每一格朝著光源往上穿過整層雲，記下還透得下多少光（見 CLOUD_SHADOW_FRAGMENT）。
 * 用的是與天上那朵雲同一份密度函式，地上那塊暗於是確實是頭頂那朵雲的，
 * 連雲邊被細節雜訊啃出來的缺口都對得上。
 *
 * 那張圖只罩住鏡頭附近幾百格，中心跟著鏡頭走。
 * 循環世界跨過邊界時的平移，由體積雲那邊的 worldShift 補回來，
 * 這裡只管拿世界座標去查
 *
 * ── 這個效果曾經看起來像壞掉的 ──
 *
 * 有很長一段時間畫面上完全看不到雲影，而所有跡象都指向取樣器沒綁上。
 * 那個方向查到底都是錯的，機制從頭到尾都是好的，問題在資料：
 *
 * 一、雲的圖樣幾乎是空的。舊的雲形狀是細胞自動機加上一道削雲團的侵蝕，
 *     兩者疊起來收斂到只剩十二格雲，而且全擠在同一條 Z 帶上。
 *     雲只往 +X 飄，那條帶以外的地面永遠等不到雲經過。
 *
 * 二、門檻踩不到。三乘三糊兩輪之後最濃的一格只剩零點七幾，
 *     而 COVER_FULL 是 0.78——最深的雲影也到不了滿格。
 *
 * 三、週期對不上世界。圖樣寫死 18 格、格寬 14，乘起來是 252，
 *     而世界寬度是 280。
 *
 * 四、算對了也看不見。白沙在正午的線性亮度是 1.75，貼在 ACES 的天花板上，
 *     只收平行光的話最暗處與無雲處只差五階
 *     （見 SKY_SHADE_DEPTH 那一段的量測）。
 *
 * 留兩句給下次。查外掛的取樣器有沒有綁上，最快的方法是拿掉所有變因，
 * 用一張全白的 RawTexture 去比對，地面該整片黑掉；
 * 分不出「沒綁上」與「綁上了但圖是空的」的時候，先讓資料變成常數。
 *
 * 而畫面上看不到效果，不代表效果沒算。加東西之前先確認那塊地
 * 還在色調映射的線性段裡，貼著天花板的地方加什麼都不會動
 */
class CloudShadowPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，理由與 aerial-perspective 相同 */
    super(material, 'MinespaceCloudShadow', 210, {}, true, true)
  }

  getClassName(): string {
    return 'CloudShadowPlugin'
  }

  getSamplers(samplers: string[]): void {
    samplers.push('cloudShadowSampler')
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'cloudShadowParam', size: 4, type: 'vec4' },
        { name: 'cloudShadowProjection', size: 4, type: 'vec4' },
        { name: 'cloudShadowArea', size: 4, type: 'vec4' },
      ],
      /**
       * 這一段只有不支援統一緩衝區時才派得上用場
       *
       * 支援的時候上面那個 ubo 陣列會被塞進材質的統一緩衝區，
       * 而著色器裡根本沒有 ADDITIONAL_FRAGMENT_DECLARATION 這個位置，
       * 這串字會靜靜地被丟掉。兩邊都寫，退路才在
       */
      fragment: `
        uniform vec4 cloudShadowParam;
        uniform vec4 cloudShadowProjection;
        uniform vec4 cloudShadowArea;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const state = cloudShadowState

    /**
     * 俯視圖還沒畫出來、或雲整個淡掉時，強度直接給零
     *
     * 沒綁的取樣器在 WebGL2 讀出來是全黑，等於「整片都被雲遮住」。
     * 強度為零時著色器第一行就跳出去，讀不到那張不存在的圖
     */
    const strength = shadowMapTexture ? state.strength * state.visibleRatio : 0

    uniformBuffer.updateFloat4(
      'cloudShadowParam',
      strength,
      state.inverseSpan,
      COVER_START,
      COVER_FULL,
    )
    uniformBuffer.updateFloat4(
      'cloudShadowProjection',
      state.slopeX,
      state.slopeZ,
      state.height,
      0,
    )
    uniformBuffer.updateFloat4(
      'cloudShadowArea',
      state.centerX,
      state.centerZ,
      0,
      0,
    )

    if (shadowMapTexture) {
      uniformBuffer.setTexture('cloudShadowSampler', shadowMapTexture)
    }
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 沿著光線往上找，看頭頂那個位置透得下多少光
       *
       * 雲底在 height 這麼高，光沿著太陽的方向斜射下來。
       * 腳下這個點被遮住與否，取決於「沿著光線往回推到雲底」的那一點
       * 上面有多少雲——俯視圖存的正是雲底高度上每一點的透光量，
       * 所以依高度差把座標推回去、換到俯視圖的座標就能查。
       *
       * 俯視圖只罩住鏡頭附近一塊。靠近邊緣的那一圈淡掉，
       * 而不是一刀切：出了圖的範圍什麼都查不到，硬切會在地上留下一道方框
       *
       * 取樣用 textureLod 指定第零層，不用一般的 texture2D。那張圖沒有 mip，取到的值一樣；
       * 差別在一般的取樣要算螢幕微分，而 HLSL 不准要算微分的取樣落在動態分支裡，
       * 整支著色器只要後段還有一次這種取樣，前面的提早返回、提早丟像素就全被攤平成照算
       * （見 docs/development-notes.md 效能優化一節的「動態分支與螢幕微分」）
       */
      'CUSTOM_FRAGMENT_DEFINITIONS': `
        uniform sampler2D cloudShadowSampler;

        float minespaceCloudCover() {
          if (cloudShadowParam.x <= 0.0) {
            return 0.0;
          }

          vec2 cloudPoint = vPositionW.xz
            - (cloudShadowProjection.z - vPositionW.y) * cloudShadowProjection.xy;

          vec2 shadowUv = (cloudPoint - cloudShadowArea.xy) * cloudShadowParam.y + 0.5;
          vec2 edgeDistance = min(shadowUv, 1.0 - shadowUv);
          float edgeFade = smoothstep(0.0, 0.1, min(edgeDistance.x, edgeDistance.y));

          #ifdef WEBGL2
            float cover = 1.0 - textureLod(cloudShadowSampler, shadowUv, 0.0).r;
          #else
            float cover = 1.0 - texture2D(cloudShadowSampler, shadowUv).r;
          #endif

          return smoothstep(cloudShadowParam.z, cloudShadowParam.w, cover) * edgeFade;
        }
      `,

      /**
       * 覆蓋率一幀只算一次
       *
       * 平行光與天光都要用到它，而它裡面有一次貼圖取樣。
       * 擺在光照之前算好存起來，兩盞燈共用同一個值
       */
      'CUSTOM_FRAGMENT_BEFORE_LIGHTS': `
        float minespaceCloudCoverValue = minespaceCloudCover();
      `,

      /**
       * 天光也收一截
       *
       * 這一行是半球光專用的，條件編譯已經把它框在 HEMILIGHT 裡面，
       * 不必再自己加一層條件。場景裡的半球光只有一盞，就是天光。
       *
       * 天空色與地面反射色兩份都乘。雲罩在頭頂時擋掉的是天空那一半，
       * 而地面反射的光本來就是曬到的地面反上來的，
       * 那塊地一起在影子裡，反上來的自然也少
       */
      '!info=computeHemisphericLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),([^,]+),glossiness\\);': `
        {
          float cloudSkyShade = 1.0 - cloudShadowParam.x * ${SKY_SHADE_RATIO.toFixed(4)} * minespaceCloudCoverValue;

          info = computeHemisphericLighting(viewDirectionW, normalW, $1, $2 * cloudSkyShade, $4, $5 * cloudSkyShade, glossiness);
        }
      `,

      /**
       * 平行光收得最深，而且漫射與高光都要乘
       *
       * 雲擋掉的主要是那顆太陽，天光只是連帶收了一截（見 SKY_SHADE_DEPTH）。
       * 洞裡那幾盞燈則完全不該跟著暗——
       * DIRLIGHT 這個條件就是在挑「這一盞是不是平行光」，
       * 而整個場景裡只有日月那一盞是。
       *
       * 高光同樣要收。少了那一行，一朵雲飄過水鏡池的時候
       * 池面照樣閃著一道刺眼的反光——那道光的來源明明正被遮著。
       *
       * 這一行是 include 展開後每一盞燈各一份，正規式帶著 g 旗標
       * 會全部換過，靠 $3 把燈的編號帶進條件裡。
       * 哪天 Babylon 改了這行的寫法，正規式找不到就靜靜地不做事，
       * 畫面退回沒有雲影的樣子，不會壞掉。
       *
       * 每個 $n 只准出現一次。Babylon 代換捕獲群組用的是
       * `newCode.replace('$' + i, match[i])`——字串比對，一個編號只換掉
       * 最前面那一個，後面的原封不動留在著色器裡變成 `$` 字元，
       * 整支著色器編不過。所以寧可多切幾個群組，也不要重複用同一個編號。
       * 漫射與高光連同編號各自獨立成群，就是為了守住這條規則。
       *
       * 注入的那段 GLSL 裡不要寫註解。Babylon 的前處理器用
       * `/(#ifdef)|(#else)|(#elif)|(#endif)|(#ifndef)|(#if)/` 掃每一行，
       * 沒有錨定行首，也不先把註解拿掉——註解裡提到條件編譯指令的名字，
       * 就會被當成真的指令，條件層數從此對不起來，
       * 游標一路跑到檔尾，後面整段著色器憑空消失。
       * 要解釋就寫在這裡，這裡的字不會進到著色器。
       *
       * 至於下面那段在做什麼：平行光以外的那幾盞，條件編譯整段會被拿掉，
       * cloudShade 就是常數 1.0，乘法會被編譯器摺掉，不花錢
       */
      '!info=computeLighting\\(viewDirectionW,normalW,([^,]+),(diffuse(\\d+)\\.rgb),([^,]+),(diffuse\\3\\.a),glossiness\\);': `
        {
          float cloudShade = 1.0;
          #ifdef DIRLIGHT$3
            cloudShade = 1.0 - cloudShadowParam.x * minespaceCloudCoverValue;
          #endif

          info = computeLighting(viewDirectionW, normalW, $1, $2 * cloudShade, $4 * cloudShade, $5, glossiness);
        }
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上雲影
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同：
 * 外掛是靠「材質被建立」這個事件自己接上去的
 */
export function registerCloudShadow(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespaceCloudShadow', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new CloudShadowPlugin(material)
  })
}

export interface CloudShadowMapParams {
  texture: BaseTexture;
  /** 俯視圖中心的世界座標 */
  centerX: number;
  centerZ: number;
  /** 一除以俯視圖涵蓋的世界寬度 */
  inverseSpan: number;
  /** 俯視圖量在哪個高度上，也就是雲底 */
  height: number;
  /** 雲此刻露出多少 */
  visibleRatio: number;
}

/**
 * 把這一幀的雲影俯視圖交過來
 *
 * 由 volumetric-cloud 每一幀呼叫，給 null 代表這一幀沒有雲
 * （還沒算好、被陰天罩蓋滿、或除錯開關關掉），地上就不該有雲影
 */
export function setCloudShadowMap(params: CloudShadowMapParams | null): void {
  if (!params) {
    shadowMapTexture = null
    cloudShadowState.visibleRatio = 0
    return
  }

  shadowMapTexture = params.texture
  cloudShadowState.centerX = params.centerX
  cloudShadowState.centerZ = params.centerZ
  cloudShadowState.inverseSpan = params.inverseSpan
  cloudShadowState.height = params.height
  cloudShadowState.visibleRatio = params.visibleRatio
}

/** 俯視圖要朝哪個方向往上穿過雲層，與地面投影用同一條光線 */
const lightTowardDirection = new Vector3(0, 1, 0)

/**
 * 地面投影用的那條光線，反過來指向光源
 *
 * 體積雲畫俯視圖時要沿著同一條線往上走，否則地上查到的
 * 與圖上量的不是同一條光路——影子會整片偏掉一截
 */
export function getCloudShadowLightDirection(): Vector3 {
  return lightTowardDirection
    .set(-cloudShadowState.slopeX, 1, -cloudShadowState.slopeZ)
    .normalize()
}

/**
 * 放掉俯視圖的參照
 *
 * 那張圖屬於體積雲、跟著場景一起釋放，這裡只是不要再指著它
 */
export function disposeCloudShadow(): void {
  shadowMapTexture = null
  cloudShadowState.strength = 0
  cloudShadowState.visibleRatio = 0
}

/**
 * 寫入這一刻的雲影
 *
 * @param sunDirection 平行光的方向，也就是光線前進的方向
 * @param clarity 直射陽光還剩幾成，陰天與洞裡要收掉
 * @param isEnabled 除錯開關
 */
export function updateCloudShadow(
  sunDirection: Vector3,
  clarity: number,
  isEnabled = true,
): void {
  /** 光線往下走，y 越負代表太陽越高 */
  const sunHeight = -sunDirection.y

  if (!isEnabled || sunHeight <= SUN_HEIGHT_FADE_START) {
    cloudShadowState.strength = 0
    return
  }

  const heightRatio = Math.min(
    1,
    (sunHeight - SUN_HEIGHT_FADE_START) / (SUN_HEIGHT_FADE_FULL - SUN_HEIGHT_FADE_START),
  )

  cloudShadowState.strength = SHADE_DEPTH
    * heightRatio
    * Math.min(1, Math.max(0, clarity))
  cloudShadowState.slopeX = sunDirection.x / sunHeight
  cloudShadowState.slopeZ = sunDirection.z / sunHeight
}
