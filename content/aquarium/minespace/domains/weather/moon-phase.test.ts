import { describe, expect, it } from 'vitest'
import {
  FULL_MOON_PHASE_INDEX,
  getMoonCloudLightRatio,
  getMoonGlowRatio,
  getMoonIllumination,
  getMoonLightRatio,
  getMoonPhaseIndex,
  getMoonShadowColumn,
  getNightIndex,
  getStarBoost,
  isMoonWaxing,
  MOON_PHASE_COUNT,
} from './moon-phase'

describe('月相', () => {
  it('八夜一輪，負的日序也繞得回來', () => {
    for (let nightIndex = -20; nightIndex < 40; nightIndex++) {
      const phaseIndex = getMoonPhaseIndex(nightIndex)
      expect(phaseIndex).toBeGreaterThanOrEqual(0)
      expect(phaseIndex).toBeLessThan(MOON_PHASE_COUNT)
      expect(getMoonPhaseIndex(nightIndex + MOON_PHASE_COUNT)).toBe(phaseIndex)
    }
    expect(getMoonPhaseIndex(-1)).toBe(7)
  })

  it('一整夜是同一相：正午才換，子夜不換', () => {
    const dayIndex = 20785
    /** 當天傍晚到隔天清晨是同一夜 */
    expect(getNightIndex(dayIndex + 0.76)).toBe(getNightIndex(dayIndex + 0.99))
    expect(getNightIndex(dayIndex + 0.99)).toBe(getNightIndex(dayIndex + 1.01))
    expect(getNightIndex(dayIndex + 1.01)).toBe(getNightIndex(dayIndex + 1.24))
    /** 過了正午就是下一夜 */
    expect(getNightIndex(dayIndex + 1.51)).toBe(getNightIndex(dayIndex + 0.76) + 1)
  })

  it('滿月的夜與原本相同：月光、月暈、星星都是一倍', () => {
    expect(getMoonIllumination(FULL_MOON_PHASE_INDEX)).toBe(1)
    expect(getMoonLightRatio(FULL_MOON_PHASE_INDEX)).toBe(1)
    expect(getMoonCloudLightRatio(FULL_MOON_PHASE_INDEX)).toBe(1)
    expect(getMoonGlowRatio(FULL_MOON_PHASE_INDEX)).toBe(1)
    expect(getStarBoost(FULL_MOON_PHASE_INDEX)).toBe(1)
    expect(getMoonShadowColumn(FULL_MOON_PHASE_INDEX, 16).count).toBe(0)
  })

  it('新月最暗，但地上的月光不歸零；星星最亮', () => {
    expect(getMoonIllumination(0)).toBe(0)
    expect(getMoonLightRatio(0)).toBeGreaterThan(0.4)
    expect(getMoonLightRatio(0)).toBeLessThan(0.7)
    expect(getStarBoost(0)).toBeGreaterThan(1.1)
    expect(getMoonShadowColumn(0, 16)).toEqual({ start: 0, count: 16 })
  })

  it('由新月到滿月越來越亮，之後對稱地暗回去', () => {
    for (let phaseIndex = 0; phaseIndex < FULL_MOON_PHASE_INDEX; phaseIndex++) {
      expect(getMoonIllumination(phaseIndex + 1)).toBeGreaterThan(getMoonIllumination(phaseIndex))
      expect(getMoonIllumination(MOON_PHASE_COUNT - phaseIndex)).toBeCloseTo(getMoonIllumination(phaseIndex), 9)
    }
  })

  it('變圓時暗在左邊、變缺時暗在右邊，暗的欄數兩邊相同', () => {
    for (const phaseIndex of [1, 2, 3]) {
      const waxing = getMoonShadowColumn(phaseIndex, 16)
      const waning = getMoonShadowColumn(MOON_PHASE_COUNT - phaseIndex, 16)
      expect(isMoonWaxing(phaseIndex)).toBe(true)
      expect(isMoonWaxing(MOON_PHASE_COUNT - phaseIndex)).toBe(false)
      expect(waxing.start).toBe(0)
      expect(waning.start + waning.count).toBe(16)
      expect(waxing.count).toBe(waning.count)
      expect(waxing.count).toBeGreaterThan(0)
      expect(waxing.count).toBeLessThan(16)
    }
    /** 上弦剛好一半 */
    expect(getMoonShadowColumn(2, 16).count).toBe(8)
  })
})
