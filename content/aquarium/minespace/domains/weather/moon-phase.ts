import type { DynamicTexture } from '@babylonjs/core'

/**
 * 月相
 *
 * 月亮原本每一夜都是滿的。現在八夜一輪：新月、眉月、上弦、盈凸、滿月、虧凸、下弦、殘月。
 * 滿月那一夜與原本的夜完全相同；越接近新月，月光越淡、星星越亮。
 *
 * 這裡管「哪一夜是哪一相、亮幾成、月面貼圖上暗哪幾欄」，以及把陰影畫上月面貼圖的那支畫筆；
 * 什麼時候換相、月光與星星各乘多少，由 use-day-night 每幀套用
 */

/**
 * 月面暗的那一側蓋上去的顏色
 *
 * 月亮是相加混合疊在天上的，蓋成近乎全黑的那幾欄加到天色上幾乎等於沒加，看起來就是「缺了」；
 * 留一成多，暗面還隱約看得出整塊方月的輪廓（地照）
 */
const MOON_SHADOW_STYLE = 'rgba(6, 9, 20, 0.86)'

/** 一輪幾夜 */
export const MOON_PHASE_COUNT = 8

/** 滿月是第幾相 */
export const FULL_MOON_PHASE_INDEX = 4

/**
 * 今夜是第幾相
 *
 * 日夜循環每幀寫。跟著月亮走的招牌景象（沼澤的月暈、湖面的月光路）讀它：
 * 新月的夜掛著一圈滿月的暈、湖面一條亮晃晃的月光路，是對不起來的
 */
export const moonPhaseState = {
  phaseIndex: FULL_MOON_PHASE_INDEX,
}

/**
 * 新月時月光剩幾成（照在地上的與照在雲上的）
 *
 * 不收到零：夜裡的直射光本來就只有白天的四分之一，再砍光地面會黑成一片，
 * 燈火之外什麼都看不見。留五成五，新月的夜明顯比滿月暗，但走得了路
 */
const NEW_MOON_LIGHT_RATIO = 0.55
const NEW_MOON_CLOUD_LIGHT_RATIO = 0.4

/** 新月時月暈剩幾成、星星亮幾倍 */
const NEW_MOON_GLOW_RATIO = 0.2
const NEW_MOON_STAR_BOOST = 1.3

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/**
 * 這一刻算第幾夜
 *
 * 日序在子夜加一，但月亮整夜掛在天上，不能在子夜換相。
 * 所以夜是從正午數到下一個正午：正午時月亮在地平線下，換相看不見
 */
export function getNightIndex(dayPosition: number): number {
  return Math.floor(dayPosition - 0.5)
}

/** 第幾夜是第幾相，零是新月、四是滿月 */
export function getMoonPhaseIndex(nightIndex: number): number {
  return ((nightIndex % MOON_PHASE_COUNT) + MOON_PHASE_COUNT) % MOON_PHASE_COUNT
}

/** 月面亮的比例，新月是零、滿月是一 */
export function getMoonIllumination(phaseIndex: number): number {
  return (1 - Math.cos((phaseIndex / MOON_PHASE_COUNT) * Math.PI * 2)) / 2
}

/** 月亮是不是正在變圓（新月到滿月之間） */
export function isMoonWaxing(phaseIndex: number): boolean {
  return phaseIndex < FULL_MOON_PHASE_INDEX
}

/** 照在地上的月光乘多少，滿月是一 */
export function getMoonLightRatio(phaseIndex: number): number {
  return lerp(NEW_MOON_LIGHT_RATIO, 1, getMoonIllumination(phaseIndex))
}

/** 照在雲上的月光乘多少，滿月是一 */
export function getMoonCloudLightRatio(phaseIndex: number): number {
  return lerp(NEW_MOON_CLOUD_LIGHT_RATIO, 1, getMoonIllumination(phaseIndex))
}

/** 月暈乘多少，滿月是一 */
export function getMoonGlowRatio(phaseIndex: number): number {
  return lerp(NEW_MOON_GLOW_RATIO, 1, getMoonIllumination(phaseIndex))
}

/** 星星的亮度乘多少，滿月是一：月光越淡，星星越多越亮 */
export function getStarBoost(phaseIndex: number): number {
  return lerp(NEW_MOON_STAR_BOOST, 1, getMoonIllumination(phaseIndex))
}

/**
 * 月面貼圖上暗的那幾欄：從第幾欄起、共幾欄
 *
 * 明暗的分界是一條直線，不是弧：月亮是一塊方的，在方塊上畫弧形的陰影反而怪。
 * 變圓時亮的在右邊，變缺時亮的在左邊
 */
export function getMoonShadowColumn(phaseIndex: number, textureSize: number): { start: number; count: number } {
  const litCount = Math.round(getMoonIllumination(phaseIndex) * textureSize)
  const darkCount = textureSize - litCount

  return {
    start: isMoonWaxing(phaseIndex) ? 0 : litCount,
    count: darkCount,
  }
}

const painterMap = new WeakMap<DynamicTexture, (phaseIndex: number) => void>()

/**
 * 月面貼圖的畫筆：給它第幾相，它把暗的那幾欄蓋上去
 *
 * 貼圖是 use-babylon-scene 畫好的滿月。建立時先把滿月存一份，
 * 之後每次換相都從那一份重畫，陰影才不會一夜一夜疊上去。
 * 同一張貼圖只建一次（重複呼叫拿到同一支），否則第二次存下來的「滿月」已經是缺的。
 * 相沒變就不重畫，所以每幀呼叫也沒有成本
 */
export function createMoonPhasePainter(texture: DynamicTexture): (phaseIndex: number) => void {
  const existing = painterMap.get(texture)
  if (existing)
    return existing

  const size = texture.getSize().width
  const context = texture.getContext()
  const fullMoonImage = context.getImageData(0, 0, size, size)
  let paintedPhaseIndex = FULL_MOON_PHASE_INDEX

  const paint = (phaseIndex: number) => {
    if (phaseIndex === paintedPhaseIndex)
      return

    paintedPhaseIndex = phaseIndex
    context.putImageData(fullMoonImage, 0, 0)
    const { start, count } = getMoonShadowColumn(phaseIndex, size)
    if (count > 0) {
      context.fillStyle = MOON_SHADOW_STYLE
      context.fillRect(start, 0, count, size)
    }
    texture.update()
  }
  painterMap.set(texture, paint)
  return paint
}
