import type { Color3 } from '@babylonjs/core'
import { describe, expect, it } from 'vitest'
import { createDayNightSample, sampleDayNight } from './day-night'

function sampleAt(timeOfDay: number) {
  return sampleDayNight(timeOfDay, createDayNightSample())
}

function expectColorBetween(actual: Color3, from: Color3, to: Color3, ratio: number): void {
  for (const channel of ['r', 'g', 'b'] as const) {
    expect(actual[channel]).toBeCloseTo(from[channel] + (to[channel] - from[channel]) * ratio, 9)
  }
}

describe('晨昏多出來的天色關鍵時刻', () => {
  it('只動天色：地面用的欄位仍是原本兩個關鍵時刻之間的直線', () => {
    const windowList: [number, number][] = [[0.2, 0.26], [0.74, 0.8]]
    for (const [fromTime, toTime] of windowList) {
      const from = sampleAt(fromTime)
      const to = sampleAt(toTime)
      for (const ratio of [0.1, 0.25, 0.4167, 0.5833, 0.75, 0.9]) {
        const sample = sampleAt(fromTime + (toTime - fromTime) * ratio)
        expectColorBetween(sample.fogColor, from.fogColor, to.fogColor, ratio)
        expectColorBetween(sample.lightColor, from.lightColor, to.lightColor, ratio)
        expectColorBetween(sample.ambientSkyColor, from.ambientSkyColor, to.ambientSkyColor, ratio)
        expectColorBetween(sample.ambientGroundColor, from.ambientGroundColor, to.ambientGroundColor, ratio)
        expect(sample.ambientIntensity).toBeCloseTo(from.ambientIntensity + (to.ambientIntensity - from.ambientIntensity) * ratio, 9)
        expect(sample.cloudBrightness).toBeCloseTo(from.cloudBrightness + (to.cloudBrightness - from.cloudBrightness) * ratio, 9)
        expect(sample.exposure).toBeCloseTo(from.exposure + (to.exposure - from.exposure) * ratio, 9)
        expect(sample.gradeDensity).toBeCloseTo(from.gradeDensity + (to.gradeDensity - from.gradeDensity) * ratio, 9)
      }
    }
  })

  it('原本的關鍵時刻上，天色還是原本那一組', () => {
    const noon = sampleAt(0.5)
    expect(noon.skyZenithColor.asArray()).toEqual([0.26, 0.52, 0.98])
    expect(noon.skyGlowStrength).toBe(0.12)

    const sunset = sampleAt(0.74)
    expect(sunset.skyMidColor.asArray()).toEqual([0.73, 0.46, 0.62])
    expect(sunset.skyGlowStrength).toBe(1.05)

    const midnight = sampleAt(0)
    expect(midnight.skyZenithColor.asArray()).toEqual([0.01, 0.016, 0.048])
    expect(midnight.skyGlowStrength).toBe(0)
  })

  it('日落後霞光先變濃變紅，再退', () => {
    expect(sampleAt(0.755).skyGlowStrength).toBeGreaterThan(sampleAt(0.74).skyGlowStrength)
    expect(sampleAt(0.775).skyGlowStrength).toBeLessThan(sampleAt(0.755).skyGlowStrength)
    expect(sampleAt(0.755).skyGlowColor.g).toBeLessThan(sampleAt(0.74).skyGlowColor.g)
  })

  it('藍調時刻的中空是藍的，不是藕紫', () => {
    for (const timeOfDay of [0.225, 0.775]) {
      const { skyMidColor, skyZenithColor } = sampleAt(timeOfDay)
      expect(skyMidColor.b).toBeGreaterThan(skyMidColor.r * 2)
      expect(skyMidColor.b).toBeGreaterThan(skyMidColor.g * 1.8)
      expect(skyZenithColor.b).toBeGreaterThan(skyZenithColor.r * 4)
    }
  })

  it('天色整天連續', () => {
    let previous = sampleAt(0)
    let largestStep = 0
    for (let step = 1; step <= 4000; step++) {
      const current = sampleAt(step / 4000)
      for (const key of ['skyZenithColor', 'skyMidColor', 'skyGlowColor', 'skyCounterColor'] as const) {
        for (const channel of ['r', 'g', 'b'] as const) {
          largestStep = Math.max(largestStep, Math.abs(current[key][channel] - previous[key][channel]))
        }
      }
      largestStep = Math.max(largestStep, Math.abs(current.skyGlowStrength - previous.skyGlowStrength))
      previous = current
    }
    expect(largestStep).toBeLessThan(0.02)
  })
})
