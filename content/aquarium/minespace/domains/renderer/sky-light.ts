import type { Color3, Material, UniformBuffer, Vector3 } from '@babylonjs/core'
import { MaterialPluginBase, RegisterMaterialPlugin, StandardMaterial } from '@babylonjs/core'
import { sampleSkyGradient } from '../weather/sky-gradient'

/**
 * 球諧天光
 *
 * 場景的天光原本只有一盞半球光：天空色往下、地面色往上，
 * 整個世界的環境光只有「上下」一條軸。正對落日的牆與背對落日的牆，
 * 吃到的天光一模一樣——但真實的黃昏裡，前者被橘紅的天邊照著，
 * 後者吃的是天頂那一片冷藍。
 *
 * ── 做法：一階球諧的水平分量，加在半球光上面 ──
 *
 * 把整片天空（與天色著色器同一組顏色）對一個法線朝向的漫射照度，
 * 用球諧展開，零階就是平均亮度，一階是「哪一側比較亮、亮多少」。
 * 對朝向 n 的表面，一階的貢獻是 v · n：
 *
 *   v = (2 / N) Σ 天色(方向i) × 方向i
 *
 * （N 是取樣方向數，係數 2 來自餘弦疊瓣的一階捲積，積分常數整理過了。）
 * 這就是「天空的偶極」：每個顏色通道一個三維向量，朝著比較亮的那一側。
 *
 * 只取水平的兩個分量（x、z），不要垂直的那個：
 *
 * 一，垂直軸本來就是半球光在做的事，而且那一軸帶著洞穴、地面染色、
 * 夜間補光等一堆其他系統的調整（見 use-fps-controller），再疊一份會互相打架。
 *
 * 二，零階與垂直分量不加，平均亮度就不會動——
 * 白沙落在 ACES 膝點上的那一整套曝光調校（見 cloud-shadow 的說明）原封不動，
 * 水平分量對整個球面積分為零，只是把亮度「從一邊挪到另一邊」。
 *
 * ── 為什麼是材質外掛，而不是再加幾盞光 ──
 *
 * 加一盞平行光會多一次光照迴圈（每個畫素），還會被陰影、雲影的外掛各自改一遍；
 * 外掛只是在霧之前多一次乘加，與體素全局光掛在同一個位置，
 * 乘上表面自己的反照率，不碰任何現有外掛的正規式替換。
 *
 * 更新不必每幀：天色以分鐘計地變。向量每 0.4 秒重算一次（約六十個方向、
 * 各幾次乘法），每幀只做一次趨近
 */

/** 取樣方向數，費波那契球面分佈。水平偶極對這個數字不敏感，四十八個就收斂 */
const DIRECTION_COUNT = 48

/** 重算目標向量的間隔（秒） */
const RECOMPUTE_INTERVAL_SECOND = 0.4

/**
 * 整體增益
 *
 * 天空色的偶極換算成加在表面上的亮度，一比一太弱：
 * 天色是壓進 [0, 1] 的低動態範圍漸層，落日那一側的天邊在現實裡
 * 比天頂亮上幾十倍，這裡只亮了一點點，偶極算出來連肉眼都分不出暖冷。
 * 實測以三倍為度：日落時朝向太陽的牆面約暖上八個色階、背面冷上八個，
 * 並排比較看得出來，單獨看不覺得突兀；正午天色對稱，偶極趨近於零，畫面不動
 */
const SKY_LIGHT_GAIN = 3

/** 趨近目標的速度（每秒），日夜轉換時向量不要跳 */
const FOLLOW_SPEED = 1.5

/**
 * 這一刻的天光向量
 *
 * 與 aerial-perspective 的 airState 同一種寫法：所有材質共用一份，
 * 每幀由漫遊控制器寫一次，下一幀各材質綁定時自己來讀。
 * 紅綠藍三個通道各一組（x 分量、z 分量）
 */
const skyLightState = {
  /** 目標，每 0.4 秒重算 */
  targetXRed: 0,
  targetXGreen: 0,
  targetXBlue: 0,
  targetZRed: 0,
  targetZGreen: 0,
  targetZBlue: 0,
  /** 目前實際送進著色器的值 */
  xRed: 0,
  xGreen: 0,
  xBlue: 0,
  zRed: 0,
  zGreen: 0,
  zBlue: 0,
  elapsed: RECOMPUTE_INTERVAL_SECOND,
}

/** 單位球面上的取樣方向，只算一次 */
const sampleDirectionList = buildSampleDirectionList()

function buildSampleDirectionList(): Array<{ x: number; y: number; z: number }> {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  return Array.from({ length: DIRECTION_COUNT }, (_, index) => {
    const y = 1 - ((index + 0.5) / DIRECTION_COUNT) * 2
    const radius = Math.sqrt(1 - y * y)
    const angle = goldenAngle * index

    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius }
  })
}

class SkyLightPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /** 第六個參數是「一律啟用」，理由與 aerial-perspective 相同 */
    super(material, 'MinespaceSkyLight', 220, {}, true, true)
  }

  getClassName(): string {
    return 'SkyLightPlugin'
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'skyLightX', size: 3, type: 'vec3' },
        { name: 'skyLightZ', size: 3, type: 'vec3' },
      ],
      /** 不支援統一緩衝區時的退路，理由見 cloud-shadow */
      fragment: `
        uniform vec3 skyLightX;
        uniform vec3 skyLightZ;
      `,
    }
  }

  bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const state = skyLightState

    uniformBuffer.updateFloat3('skyLightX', state.xRed, state.xGreen, state.xBlue)
    uniformBuffer.updateFloat3('skyLightZ', state.zRed, state.zGreen, state.zBlue)
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    return {
      /**
       * 加在霧之前，與體素全局光、葉片透光同一個位置
       *
       * 乘上 baseColor 讓這道光帶著表面自己的顏色。
       * 偶極有正有負（背對落日的那一側是被扣掉一點），
       * 所以加完要夾回零，不然已經很暗的背光面會被扣成負值
       */
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        color.rgb = max(color.rgb + (skyLightX * normalW.x + skyLightZ * normalW.z) * baseColor.rgb, vec3(0.0));
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上球諧天光
 *
 * 必須在任何材質建立之前呼叫，理由與 registerAerialPerspective 相同
 */
export function registerSkyLight(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespaceSkyLight', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new SkyLightPlugin(material)
  })
}

export interface SkyLightParam {
  zenithColor: Color3;
  midColor: Color3;
  horizonColor: Color3;
  glowColor: Color3;
  counterColor: Color3;
  glowStrength: number;
  /** 由世界中心指向太陽 */
  sunDirection: Vector3;
  /**
   * 這一刻天光有多少「方向性」，0 為沒有、1 為全開
   *
   * 洞裡、陰雨與水下沒有一片看得見的天，偶極自然該收掉。
   * 呼叫端把這些條件乘好再給
   */
  strength: number;
}

const skyColor: [number, number, number] = [0, 0, 0]

/**
 * 每幀呼叫，內部自己節流
 *
 * 多數幀只是把目前值往目標靠一步。強度為零時目標歸零，
 * 向量慢慢收回去而不是一刀切——切換天氣與走進洞裡時才不會跳
 */
export function updateSkyLight(param: SkyLightParam, deltaTime: number): void {
  const state = skyLightState

  state.elapsed += deltaTime
  if (state.elapsed >= RECOMPUTE_INTERVAL_SECOND) {
    state.elapsed = 0
    recomputeTarget(param)
  }

  const follow = Math.min(1, deltaTime * FOLLOW_SPEED)
  state.xRed += (state.targetXRed - state.xRed) * follow
  state.xGreen += (state.targetXGreen - state.xGreen) * follow
  state.xBlue += (state.targetXBlue - state.xBlue) * follow
  state.zRed += (state.targetZRed - state.zRed) * follow
  state.zGreen += (state.targetZGreen - state.zGreen) * follow
  state.zBlue += (state.targetZBlue - state.zBlue) * follow
}

function recomputeTarget(param: SkyLightParam): void {
  const state = skyLightState
  const strength = Math.min(1, Math.max(0, param.strength))

  if (strength <= 0) {
    state.targetXRed = 0
    state.targetXGreen = 0
    state.targetXBlue = 0
    state.targetZRed = 0
    state.targetZGreen = 0
    state.targetZBlue = 0
    return
  }

  let xRed = 0
  let xGreen = 0
  let xBlue = 0
  let zRed = 0
  let zGreen = 0
  let zBlue = 0

  for (const direction of sampleDirectionList) {
    sampleSkyGradient(direction, param, skyColor)
    xRed += skyColor[0] * direction.x
    xGreen += skyColor[1] * direction.x
    xBlue += skyColor[2] * direction.x
    zRed += skyColor[0] * direction.z
    zGreen += skyColor[1] * direction.z
    zBlue += skyColor[2] * direction.z
  }

  const scale = (2 / DIRECTION_COUNT) * SKY_LIGHT_GAIN * strength
  state.targetXRed = xRed * scale
  state.targetXGreen = xGreen * scale
  state.targetXBlue = xBlue * scale
  state.targetZRed = zRed * scale
  state.targetZGreen = zGreen * scale
  state.targetZBlue = zBlue * scale
}

/** 把天光向量清零，場景收掉時用 */
export function resetSkyLight(): void {
  Object.assign(skyLightState, {
    targetXRed: 0,
    targetXGreen: 0,
    targetXBlue: 0,
    targetZRed: 0,
    targetZGreen: 0,
    targetZBlue: 0,
    xRed: 0,
    xGreen: 0,
    xBlue: 0,
    zRed: 0,
    zGreen: 0,
    zBlue: 0,
    elapsed: RECOMPUTE_INTERVAL_SECOND,
  })
}
