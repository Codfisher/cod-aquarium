import type { Color3, Material } from '@babylonjs/core'
import { MaterialPluginBase, RegisterMaterialPlugin, StandardMaterial } from '@babylonjs/core'
import { SAND_LEVEL } from '../garden/garden-constants'

/**
 * 貼地那一層空氣的頂
 *
 * 高過這個高度就沒有額外的濁氣。抓在沙面上十格：
 * 木座、鳥居與矮松都泡在裡面，樹冠與山頭則露在上面——
 * 那正是清晨從高處往下看時，整片庭園浮在一層薄濁上的樣子
 */
const GROUND_HAZE_TOP = SAND_LEVEL + 10

/**
 * 濁氣往下加厚的速度
 *
 * 倒數是「幾格內從沒有變成滿」。給十二格：
 * 從樹冠到地面是一段連續的漸變，不會出現一條水平的界線
 */
const GROUND_HAZE_FALLOFF = 1 / 12

/**
 * 貼著地面時霧要濃多少（平常時段的基準值）
 *
 * 這是倍率不是加法：近處的東西完全不受影響（乘上零還是零），
 * 只有本來就有點遠的東西會再糊一點。
 * 直接相加的話，腳邊的方塊會憑空罩上一層灰
 */
const GROUND_HAZE_BOOST_BASE = 0.6

/**
 * 清晨與黃昏時，貼地水氣要濃到多少
 *
 * 太陽貼著地平線的那段時間，貼地的水氣最看得出來——
 * 逆光穿過一層薄霧，是晨昏辨識度最高的畫面之一。
 * 比平常濃將近一倍，正午再收回基準值
 */
const GROUND_HAZE_BOOST_DAWN_DUSK = 1.15

/**
 * 太陽多低算「貼著地平線」
 *
 * 用 -sunLight.direction.y 當太陽仰角：這個值以下濃度給滿，
 * 與 cloud-shadow.ts 判斷太陽高度的做法是同一套量法
 */
const GROUND_HAZE_LOW_SUN_HEIGHT = 0.12

/** 太陽多高之後，濃度收回平常的基準值 */
const GROUND_HAZE_HIGH_SUN_HEIGHT = 0.55

/**
 * 依太陽仰角算這一刻的貼地水氣該有多濃
 *
 * 仰角低（晨昏）給到頂，仰角高（正午）收回基準值，
 * 中間用平滑曲線接起來，太陽爬升的過程才不會看出一道分界
 */
function computeGroundHazeBoost(sunHeight: number): number {
  const ratio = (sunHeight - GROUND_HAZE_LOW_SUN_HEIGHT)
    / (GROUND_HAZE_HIGH_SUN_HEIGHT - GROUND_HAZE_LOW_SUN_HEIGHT)
  const clamped = Math.min(1, Math.max(0, ratio))
  const smooth = clamped * clamped * (3 - 2 * clamped)

  return GROUND_HAZE_BOOST_DAWN_DUSK + (GROUND_HAZE_BOOST_BASE - GROUND_HAZE_BOOST_DAWN_DUSK) * smooth
}

/**
 * 中距離那層空氣往天色偏多少
 *
 * 一往上就是「遠山比它背後的天空還白」那種假。
 * 七成五剛好：內圈的箱庭明顯帶藍，外圈的還是收在霧色裡
 */
const MID_AIR_STRENGTH = 0.75

/**
 * 這一刻的空氣
 *
 * 所有材質共用這一份。每一份材質各存一套的話，
 * 改天色時得走過兩百多份材質；這裡改一次，
 * 下一幀每一份材質綁定時自己來讀
 */
const airState = {
  /** 近中距離那層空氣的顏色，由天色與霧色混出來，每幀覆寫 */
  red: 0.95,
  green: 0.95,
  blue: 0.94,
  /**
   * 除錯開關關掉時退回單色霧
   *
   * 著色器那段程式碼已經編進材質裡了，拆不掉。
   * 但把中距離的空氣色設成與霧色相同、高度加厚設成零之後，
   * 兩層混色的結果就與原本那一行 mix(vFogColor, color, fog) 完全相同——
   * 等於這個效果不存在
   */
  groundBoost: GROUND_HAZE_BOOST_BASE,
}

/**
 * 大氣透視
 *
 * 場景內建的霧只有一個顏色：不管多遠，一律往那個顏色收。
 * 那條路走到底會出現一種現實裡不存在的畫面——遠處的東西
 * 比它背後的天空還要淡。天不可能比空氣本身更暗。
 *
 * 真正的空氣是分段的：看穿一小段是透明的、一段是藍的、
 * 再遠才近乎白。藍色來自大氣的散射，白色是散射早已飽和之後的結果。
 * 所以這裡把霧拆成兩層：中距離往當下的天色偏，遠距離才收進霧色。
 * 中午是藍、清晨是丁香紫、黃昏是橘——顏色不必另外調，
 * 直接拿日夜循環已經算好的中空天色來用就對了。
 *
 * 順便做高度霧。空氣是有重量的，濁的那一層積在低處；
 * 這是為什麼從山上往下看，山谷總是比山脊模糊
 */
class AerialPerspectivePlugin extends MaterialPluginBase {
  constructor(material: Material) {
    /**
     * 第六個參數是「一律啟用」
     *
     * 這個外掛沒有任何開關屬性，不主動啟用的話它永遠不會生效。
     *
     * 替換是在 include 都展開之後才跑的（Babylon 走的是
     * processCodeAfterIncludes 那條路），所以下面那條正規式
     * 找得到霧那一行——雖然霧的原始碼是 include 進來的
     */
    super(material, 'MinespaceAerialPerspective', 200, {}, true, true)
  }

  getClassName(): string {
    return 'AerialPerspectivePlugin'
  }

  getUniforms() {
    return {
      ubo: [
        { name: 'aerialMidColor', size: 3, type: 'vec3' },
        { name: 'aerialGround', size: 3, type: 'vec3' },
      ],
    }
  }

  bindForSubMesh(uniformBuffer: { updateFloat3: (name: string, x: number, y: number, z: number) => void }): void {
    uniformBuffer.updateFloat3('aerialMidColor', airState.red, airState.green, airState.blue)
    uniformBuffer.updateFloat3(
      'aerialGround',
      GROUND_HAZE_TOP,
      GROUND_HAZE_FALLOFF,
      airState.groundBoost,
    )
  }

  getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType !== 'fragment')
      return null

    /**
     * 換掉霧的那一行
     *
     * 原本是 color.rgb = mix(vFogColor, color.rgb, fog)，
     * 也就是「越遠越靠近那一個顏色」。這裡改成兩段：
     * 先依距離調出這一段空氣該是什麼顏色，再依距離決定蓋多濃。
     *
     * 整段都在 #ifdef FOG 裡面，所以不吃霧的材質——天空、雲、
     * 太陽月亮、水面倒影——一個字都不會被動到。
     * 若哪天 Babylon 改了那一行的寫法，正規式會找不到而靜靜地不做事，
     * 畫面退回原本的單色霧，不會壞掉
     */
    return {
      '!color\\.rgb\\s*=\\s*mix\\(\\s*vFogColor\\s*,\\s*color\\.rgb\\s*,\\s*fog\\s*\\);': `
        float aerialAmount = clamp(1.0 - fog, 0.0, 1.0);
        float aerialLow = clamp((aerialGround.x - vPositionW.y) * aerialGround.y, 0.0, 1.0);
        aerialAmount = clamp(aerialAmount * (1.0 + aerialLow * aerialGround.z), 0.0, 1.0);
        color.rgb = mix(color.rgb, mix(aerialMidColor, vFogColor, aerialAmount), aerialAmount);
      `,
    }
  }
}

let isRegistered = false

/**
 * 掛上大氣透視
 *
 * 必須在任何材質建立之前呼叫：外掛是靠「材質被建立」這個事件
 * 自己接上去的，晚了的話先建好的那些材質收不到。
 *
 * 只認 StandardMaterial。天空與雲用的是自己寫的著色器材質，
 * 沒有那條霧的程式碼可以換，也本來就不該有霧
 */
export function registerAerialPerspective(): void {
  if (isRegistered)
    return

  isRegistered = true
  RegisterMaterialPlugin('MinespaceAerialPerspective', (material) => {
    if (!(material instanceof StandardMaterial))
      return null

    return new AerialPerspectivePlugin(material)
  })
}

/**
 * 寫入這一刻近中距離的空氣顏色
 *
 * 由霧色往當下的中空天色偏過去。洞裡與雨中要收回純霧色：
 * 岩壁之間沒有天空可以散射，下雨時天本來就已經是一片鉛灰。
 * sunHeight 是太陽仰角（-sunLight.direction.y），決定貼地水氣此刻該有多濃
 */
export function updateAerialAir(
  fogColor: Color3,
  skyMidColor: Color3,
  clearRatio: number,
  sunHeight: number,
  isEnabled = true,
): void {
  airState.groundBoost = isEnabled ? computeGroundHazeBoost(sunHeight) : 0

  const strength = isEnabled
    ? MID_AIR_STRENGTH * Math.min(1, Math.max(0, clearRatio))
    : 0

  airState.red = fogColor.r + (skyMidColor.r - fogColor.r) * strength
  airState.green = fogColor.g + (skyMidColor.g - fogColor.g) * strength
  airState.blue = fogColor.b + (skyMidColor.b - fogColor.b) * strength
}
