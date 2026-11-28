import { describe, expect, it } from 'vitest'
import { computeCloudLight, createCloudLight } from './cloud-light'
import { createDayNightSample, sampleDayNight, smoothRange } from './day-night'

const PLANET_RADIUS = 12000

/** 加上晨昏模型之前，use-day-night 的 applyToCloud 用的式子 */
function computeLegacyCloudLight(timeOfDay: number) {
  const sample = sampleDayNight(timeOfDay, createDayNightSample())
  const isSunLit = sample.sunHeight > -0.1
  const gate = isSunLit
    ? smoothRange(sample.sunHeight, -0.1, 0.02)
    : smoothRange(-sample.sunHeight, 0.1, 0.24)
  const glowRatio = isSunLit ? 1 - smoothRange(sample.sunHeight, 0, 0.3) : 0
  const brightness = sample.cloudBrightness * gate
  const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio
  const groundBounce = sample.cloudBrightness * 0.3

  return [
    lerp(sample.lightColor.r, sample.skyGlowColor.r, glowRatio) * brightness,
    lerp(sample.lightColor.g, sample.skyGlowColor.g, glowRatio) * brightness,
    lerp(sample.lightColor.b, sample.skyGlowColor.b, glowRatio) * brightness,
    (sample.skyZenithColor.r + sample.skyMidColor.r) * 0.5,
    (sample.skyZenithColor.g + sample.skyMidColor.g) * 0.5,
    (sample.skyZenithColor.b + sample.skyMidColor.b) * 0.5,
    (sample.skyMidColor.r + sample.ambientGroundColor.r * groundBounce) * 0.5,
    (sample.skyMidColor.g + sample.ambientGroundColor.g * groundBounce) * 0.5,
    (sample.skyMidColor.b + sample.ambientGroundColor.b * groundBounce) * 0.5,
  ]
}

function computeCurrentCloudLight(timeOfDay: number, burnIntensity: number, moonLightRatio = 1) {
  const sample = sampleDayNight(timeOfDay, createDayNightSample())
  const light = computeCloudLight(
    sample,
    { burnIntensity, kind: timeOfDay < 0.5 ? 'dawn' : 'dusk', moonLightRatio, planetRadius: PLANET_RADIUS },
    createCloudLight(),
  )
  return {
    sunHeight: sample.sunHeight,
    light,
    valueList: [
      light.lightColor.r,
      light.lightColor.g,
      light.lightColor.b,
      light.ambientTop.r,
      light.ambientTop.g,
      light.ambientTop.b,
      light.ambientBottom.r,
      light.ambientBottom.g,
      light.ambientBottom.b,
    ],
  }
}

describe('雲的光', () => {
  it('正午與深夜和加上晨昏模型之前一個數字都不差', () => {
    let checkedCount = 0
    for (let step = 0; step < 4000; step++) {
      const timeOfDay = step / 4000
      const { sunHeight, light, valueList } = computeCurrentCloudLight(timeOfDay, 1)
      if (sunHeight < 0.28 && sunHeight > -0.36)
        continue

      expect(valueList).toEqual(computeLegacyCloudLight(timeOfDay))
      expect(light.twilightRatio).toBe(0)
      expect(light.hueClipRatio).toBe(0)
      expect(light.undersideRatio).toBe(0)
      checkedCount++
    }
    /** 一天裡有七成以上的時間不該受影響 */
    expect(checkedCount).toBeGreaterThan(2800)
  })

  it('日落後雲還被太陽照著，而且是暖色', () => {
    for (const timeOfDay of [0.755, 0.765, 0.772]) {
      const { light } = computeCurrentCloudLight(timeOfDay, 0.9)
      expect(light.isSunLit).toBe(true)
      expect(light.lightColor.r).toBeGreaterThan(0.6)
      expect(light.lightColor.r).toBeGreaterThan(light.lightColor.g * 1.5)
    }
  })

  it('整天連續：相鄰兩刻的光不會跳', () => {
    let previous = computeCurrentCloudLight(0, 1).valueList
    let largestStep = 0
    for (let step = 1; step <= 20000; step++) {
      const current = computeCurrentCloudLight(step / 20000, 1).valueList
      for (const [index, value] of current.entries()) {
        largestStep = Math.max(largestStep, Math.abs(value - previous[index]!))
      }
      previous = current
    }
    expect(largestStep).toBeLessThan(0.02)
  })

  it('月相只影響月光，不影響太陽照著的時候', () => {
    const fullMoon = computeCurrentCloudLight(0, 1, 1)
    const newMoon = computeCurrentCloudLight(0, 1, 0.5)
    expect(newMoon.light.lightColor.r).toBeCloseTo(fullMoon.light.lightColor.r * 0.5, 9)

    expect(computeCurrentCloudLight(0.76, 1, 0.5).valueList).toEqual(computeCurrentCloudLight(0.76, 1, 1).valueList)
  })
})
