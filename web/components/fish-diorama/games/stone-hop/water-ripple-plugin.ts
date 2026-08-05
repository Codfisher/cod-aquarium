/** 水面的波紋擾動外掛：倒影與水下陰影共用同一片波場。
 *
 * 為什麼非得動著色器不可：`MirrorTexture` 走 Babylon 的 PROJECTION 取樣，
 * 倒影座標是 `投影矩陣 × 視圖矩陣 × 該片元的世界座標`——換句話說，每個像素
 * 取的就是「自己在畫面上的位置」。水面頂點無論怎麼起伏，片元與它的取樣點
 * 都一起移動，倒影因此永遠是一面貼在螢幕上的完美鏡子，波形再大也擰不動它。
 * 水下陰影同理：陰影貼圖以世界座標查表，溪床頂點怎麼動，陰影都釘在原地。
 * 兩者都只能在取樣前直接把座標推開。
 *
 * 位移用世界座標 xz 取樣的多頻正弦，波長刻意壓在水面網格（一格 2.2 單位）
 * 之下——抖動的顆粒尺度一旦跟著網格走，讀出來就是一格一格的方塊在晃，
 * 那是「網格在抖」不是「水在抖」。
 *
 * 調性是「平靜的湖面」：主頻波長 0.4 世界單位、振幅小、時間跑得慢，
 * 讀起來是水面細細地泛著光，不是激流。
 *
 * 以世界座標為準，水面跟著魚捲動時波紋不會跟著滑走。
 */
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines'
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer'
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase'

/** 倒影的擾動強度（螢幕 UV 單位）。0.0018 在 1080p 寬約等於 3 px——
 * 波長只有 0.4 世界單位，位移再大就不是水面泛光而是倒影被撕開
 */
const REFLECTION_RIPPLE_STRENGTH = 0.0018
/** 水下陰影的擾動強度（光源裁切空間單位）。陰影邊緣被推開的世界距離約等於
 * 此值 × 陰影範圍的一半，太大會讓影子整個游走、看起來像影子在漂而不是水在動
 */
const SHADOW_RIPPLE_STRENGTH = 0.0015

/** 共用的波場函式：兩個外掛注入同一份 GLSL，倒影與水下陰影才是被同一片水擾動 */
const RIPPLE_FIELD_GLSL = `
  vec2 computeWaterRippleOffset(vec2 worldXZ, float rippleTime) {
    // 主頻波長 0.4 世界單位（2π/15.7；水面一格 2.2，一格裡起伏五次半），
    // 顆粒細到與網格完全無關；第二層斜向、波長約 0.25，兩個波長不成整數倍，
    // 才不會疊出看得出來的重複格紋。
    // 只疊兩層：主頻降到 0.4 之後，原本的第三層會落到 0.15 單位上下，
    // 遠處水面早就壓在像素以下，只會貢獻沸騰的雜訊而不是細節。
    // 時間係數全部壓在 1 上下——湖面的波是慢慢盪過去的
    float rippleX = sin(worldXZ.x * 15.7 + rippleTime * 0.9)
      + 0.5 * sin((worldXZ.x - worldXZ.y) * 25.2 - rippleTime * 1.25);
    float rippleY = sin(worldXZ.y * 15.7 - rippleTime * 1.1)
      + 0.5 * sin((worldXZ.x + worldXZ.y) * 26.4 + rippleTime * 0.85);
    return vec2(rippleX, rippleY);
  }`

/** 波場時間。倒影與水下陰影同源，由 game 每幀餵一次即可 */
let sharedTimeSeconds = 0

/** 每幀更新波場時間（秒） */
export function setWaterRippleTime(timeSeconds: number): void {
  sharedTimeSeconds = timeSeconds
}

/** 水面倒影：把 MirrorTexture 的螢幕取樣座標依波場推開 */
class WaterRipplePlugin extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, 'WaterRipple', 210, { WATER_RIPPLE: true })
    this._enable(true)
  }

  override getClassName(): string {
    return 'WaterRipplePlugin'
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.WATER_RIPPLE = true
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'waterRippleTime', size: 1, type: 'float' },
        { name: 'waterRippleStrength', size: 1, type: 'float' },
      ],
      fragment: `#ifdef WATER_RIPPLE
        uniform float waterRippleTime;
        uniform float waterRippleStrength;
        #endif`,
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('waterRippleTime', sharedTimeSeconds)
    uniformBuffer.updateFloat('waterRippleStrength', REFLECTION_RIPPLE_STRENGTH)
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') {
      return null
    }
    return {
      'CUSTOM_FRAGMENT_DEFINITIONS': `#ifdef WATER_RIPPLE${RIPPLE_FIELD_GLSL}
        #endif`,
      // 注入點釘在 Babylon 內建 default.fragment 的倒影取樣那一行（$0 = 原本那行）。
      // 這行的寫法若隨 Babylon 改版變動，波紋會安靜地失效而不是報錯，升版時要順手確認
      '!reflectionColor=texture2D\\(reflection2DSampler,coords\\);': `#ifdef WATER_RIPPLE
        coords += computeWaterRippleOffset(vPositionW.xz, waterRippleTime) * waterRippleStrength;
        #endif
        $0`,
    }
  }
}

/** 水下陰影：把陰影貼圖的查表座標依同一片波場推開。
 *
 * 掛在溪床材質上——落在溪床的影子是隔著半透明水面看到的，
 * 水面在動、影子卻邊緣銳利地釘在沙上，是最容易讓水看起來像玻璃的破綻。
 */
class UnderwaterShadowRipplePlugin extends MaterialPluginBase {
  constructor(material: StandardMaterial) {
    super(material, 'UnderwaterShadowRipple', 211, { UNDERWATER_SHADOW_RIPPLE: true })
    this._enable(true)
  }

  override getClassName(): string {
    return 'UnderwaterShadowRipplePlugin'
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.UNDERWATER_SHADOW_RIPPLE = true
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'underwaterRippleTime', size: 1, type: 'float' },
        { name: 'underwaterRippleStrength', size: 1, type: 'float' },
      ],
      fragment: `#ifdef UNDERWATER_SHADOW_RIPPLE
        uniform float underwaterRippleTime;
        uniform float underwaterRippleStrength;
        #endif`,
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat('underwaterRippleTime', sharedTimeSeconds)
    uniformBuffer.updateFloat('underwaterRippleStrength', SHADOW_RIPPLE_STRENGTH)
  }

  override getCustomCode(shaderType: string): Record<string, string> | null {
    if (shaderType !== 'fragment') {
      return null
    }
    // 陰影查表座標是投影前的 vec4，位移要乘上 w 才在透視除法後保持同樣的偏移量
    // （平行光是正投影、w 為 1，這裡乘 w 只是為了對其他光型也成立）
    const rippleFunction = `#ifdef UNDERWATER_SHADOW_RIPPLE${RIPPLE_FIELD_GLSL}
        vec4 applyUnderwaterShadowRipple(vec4 positionFromLight, vec2 worldXZ, float rippleTime) {
          vec2 rippleOffset = computeWaterRippleOffset(worldXZ, rippleTime)
            * underwaterRippleStrength * positionFromLight.w;
          return vec4(positionFromLight.xy + rippleOffset, positionFromLight.zw);
        }
        #endif`
    /** 把 `computeShadowXxx(vPositionFromLightN,` 換成套過波場的版本。
     * PCF 三種品質與無濾波版都列上：陰影濾波設定（見 diorama-lighting）改了，
     * 或裝置退回 WebGL1 走不同分支時，至少還有一條打得中；全都沒中就只是沒有波紋，不會壞
     */
    const shadowFunctionNameList = [
      'computeShadowWithPCF5',
      'computeShadowWithPCF3',
      'computeShadowWithPCF1',
      'computeShadow',
    ]
    const customCode: Record<string, string> = { CUSTOM_FRAGMENT_DEFINITIONS: rippleFunction }
    for (const functionName of shadowFunctionNameList) {
      customCode[`!${functionName}\\(vPositionFromLight(\\d),`]
        = `${functionName}(applyUnderwaterShadowRipple(vPositionFromLight$1, vPositionW.xz, underwaterRippleTime),`
    }
    return customCode
  }
}

/** 把倒影波紋掛到水面材質上。必須在材質首次編譯前呼叫（Babylon 的外掛限制） */
export function attachWaterRipple(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new WaterRipplePlugin(material)
}

/** 把水下陰影波紋掛到溪床材質上。同樣必須在材質首次編譯前呼叫 */
export function attachUnderwaterShadowRipple(material: StandardMaterial): void {
  // eslint-disable-next-line no-new
  new UnderwaterShadowRipplePlugin(material)
}
