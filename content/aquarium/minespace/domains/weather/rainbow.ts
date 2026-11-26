/**
 * 彩虹何時出現
 *
 * 彩虹本身是天空著色器畫的（見 sky-gradient），這裡只決定「這一刻有多濃」。
 * 它需要三個條件同時成立：剛下過雨（或正下著細雨）、太陽露了出來、
 * 太陽夠低——虹的圓弧中心在太陽的正對面，太陽高過四十二度，整道弧都沉到地平線以下。
 *
 * ── 為什麼靠記憶，而不是直接看雨勢 ──
 *
 * 雨只下在聽雨亭與雨聽堂那兩座箱庭上，走出雨區的那一步雨就停了。
 * 真正的虹出現在雨剛停、太陽還在的時候，所以要記得「剛才淋過雨」，
 * 雨停之後慢慢淡出。直接看當下雨勢的話，彩虹只會出現在細雨的過渡帶那幾步裡，
 * 而且一踏出去就消失
 */

/** 淋過雨之後，彩虹要多久才完全淡掉（秒） */
const RAINBOW_LINGER_SECOND = 90

/**
 * 太陽仰角（太陽方向的 y 分量，即仰角的正弦）的有效範圍
 *
 * 低於 0.03 太陽還貼著地平線，天邊的濁氣會吃掉所有顏色；
 * 高過 0.5（三十度）開始淡出，0.67（四十二度）完全消失
 */
const SUN_RISE_START = 0.03
const SUN_RISE_FULL = 0.14
const SUN_HIGH_FADE_START = 0.5
const SUN_HIGH_FADE_END = 0.67

/** 雨勢超過這個範圍就整片被灰罩蓋住，彩虹跟著收掉，不要在灰罩邊緣突然冒出來 */
const HEAVY_RAIN_FADE_START = 0.3
const HEAVY_RAIN_FADE_END = 0.6

/** 記憶要累積到多少才開始看得見，低於它只是擦邊淋到一點雨 */
const MEMORY_VISIBLE_START = 0.15
const MEMORY_VISIBLE_FULL = 0.7

function smoothRange(value: number, from: number, to: number): number {
  const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))

  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 更新「剛淋過雨」的記憶
 *
 * 淋雨的當下立刻跟上雨勢，雨停之後線性淡去。
 * 回傳新的記憶值，由呼叫端自己存
 */
export function advanceRainbowMemory(memory: number, rainRatio: number, deltaSecond: number): number {
  return Math.max(rainRatio, memory - deltaSecond / RAINBOW_LINGER_SECOND)
}

export interface RainbowCondition {
  /** 剛淋過雨的記憶，0 ~ 1 */
  memory: number;
  /** 此刻的雨勢 */
  rainRatio: number;
  /** 太陽的仰角正弦，負的是在地平線下 */
  sunHeight: number;
  /** 還看得見多少天空，洞裡、水下與貼近邊界時為零 */
  openSkyRatio: number;
}

/** 算出這一刻彩虹的濃度，0 ~ 1 */
export function computeRainbowStrength(condition: RainbowCondition): number {
  const sunGate = smoothRange(condition.sunHeight, SUN_RISE_START, SUN_RISE_FULL)
    * (1 - smoothRange(condition.sunHeight, SUN_HIGH_FADE_START, SUN_HIGH_FADE_END))
  const rainGate = 1 - smoothRange(condition.rainRatio, HEAVY_RAIN_FADE_START, HEAVY_RAIN_FADE_END)
  const memoryGate = smoothRange(condition.memory, MEMORY_VISIBLE_START, MEMORY_VISIBLE_FULL)

  return sunGate * rainGate * memoryGate * condition.openSkyRatio
}
