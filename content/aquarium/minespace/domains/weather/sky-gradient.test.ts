import type { SkyGradientParams } from './sky-gradient'
import { Vector3 } from '@babylonjs/core'
import { describe, expect, it } from 'vitest'
import { createDayNightSample, sampleDayNight } from './day-night'
import { sampleSkyGradient } from './sky-gradient'

type Rgb = [number, number, number]

function createParams(timeOfDay: number): Required<SkyGradientParams> {
  const sample = sampleDayNight(timeOfDay, createDayNightSample())
  return {
    zenithColor: sample.skyZenithColor,
    midColor: sample.skyMidColor,
    horizonColor: sample.fogColor,
    glowColor: sample.skyGlowColor,
    counterColor: sample.skyCounterColor,
    glowStrength: sample.skyGlowStrength,
    sunDirection: sample.sunPosition,
  }
}

/** 加上暮光層次之前的式子：三段漸層、反霞、兩層暖光 */
function sampleLegacySkyGradient(direction: Vector3, params: Required<SkyGradientParams>): Rgb {
  const smoothstep = (from: number, to: number, value: number) => {
    const ratio = Math.min(1, Math.max(0, (value - from) / (to - from)))
    return ratio * ratio * (3 - 2 * ratio)
  }
  const upward = Math.min(1, Math.max(0, direction.y))
  const hazeBlend = 1 - (1 - upward) ** 6
  const zenithBlend = 1 - (1 - upward) ** 1.6
  const sunDot = Vector3.Dot(direction, params.sunDirection)
  const towardSun = Math.max(sunDot, 0)
  const awayFromSun = Math.max(-sunDot, 0)
  const lowSky = 1 - smoothstep(0, 0.6, upward)
  const counterMix = Math.min(1, Math.max(0, awayFromSun ** 3 * lowSky * 0.5 * params.glowStrength))
  const haloMix = Math.min(
    1,
    Math.max(0, (towardSun ** 18 * 0.55 + towardSun ** 2.5 * 0.45 * lowSky) * params.glowStrength),
  )

  return (['r', 'g', 'b'] as const).map((channel) => {
    const upper = params.midColor[channel] + (params.zenithColor[channel] - params.midColor[channel]) * zenithBlend
    let value = params.horizonColor[channel] + (upper - params.horizonColor[channel]) * hazeBlend
    value += (params.counterColor[channel] - value) * counterMix
    value += (params.glowColor[channel] - value) * haloMix
    return value
  }) as Rgb
}

/** 繞一圈、由地平線到天頂的一組方向 */
function listDirection(): Vector3[] {
  const directionList: Vector3[] = []
  for (let azimuthStep = 0; azimuthStep < 24; azimuthStep++) {
    for (const elevation of [-0.2, 0, 0.02, 0.06, 0.12, 0.25, 0.5, 0.9, 1.4]) {
      const azimuth = (azimuthStep / 24) * Math.PI * 2
      directionList.push(new Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ))
    }
  }
  return directionList
}

/** 沿著太陽的方位、指定仰角的方向；side 為 −1 時是背對太陽 */
function createSunSideDirection(params: Required<SkyGradientParams>, elevation: number, side: 1 | -1): Vector3 {
  const horizontal = new Vector3(params.sunDirection.x, 0, params.sunDirection.z).normalize().scale(side)
  return new Vector3(horizontal.x * Math.cos(elevation), Math.sin(elevation), horizontal.z * Math.cos(elevation))
}

function sampleSky(direction: Vector3, params: Required<SkyGradientParams>): Rgb {
  const output: Rgb = [0, 0, 0]
  sampleSkyGradient(direction, params, output)
  return output
}

describe('天色漸層的 CPU 鏡像', () => {
  it('太陽夠高的白天與深夜，和加上暮光層次之前一個數字都不差', () => {
    for (const timeOfDay of [0, 0.05, 0.1, 0.15, 0.3, 0.34, 0.42, 0.5, 0.6, 0.7, 0.85, 0.9, 0.95]) {
      const params = createParams(timeOfDay)
      for (const direction of listDirection()) {
        expect(sampleSky(direction, params)).toEqual(sampleLegacySkyGradient(direction, params))
      }
    }
  })

  it('地平線那一線永遠是天邊色（背日那一側也是），遠景才接得上', () => {
    for (const timeOfDay of [0.22, 0.25, 0.755, 0.765, 0.775, 0.79]) {
      const params = createParams(timeOfDay)
      const [red, green, blue] = sampleSky(createSunSideDirection(params, 0, -1), params)
      const legacy = sampleLegacySkyGradient(createSunSideDirection(params, 0, -1), params)
      expect(red).toBeCloseTo(legacy[0], 9)
      expect(green).toBeCloseTo(legacy[1], 9)
      expect(blue).toBeCloseTo(legacy[2], 9)
    }
  })

  it('日落後暖光貼著太陽那一側的天邊，比原本亮、比原本紅', () => {
    for (const timeOfDay of [0.762, 0.77, 0.78]) {
      const params = createParams(timeOfDay)
      const direction = createSunSideDirection(params, 0.1, 1)
      const current = sampleSky(direction, params)
      const legacy = sampleLegacySkyGradient(direction, params)
      /** 往霞光的顏色靠得更近：紅多於藍的差距變大 */
      expect(current[0] - current[2]).toBeGreaterThan(legacy[0] - legacy[2])
    }
  })

  it('日落後背對太陽的低空浮出地影：比原本暗', () => {
    for (const timeOfDay of [0.765, 0.775]) {
      const params = createParams(timeOfDay)
      const direction = createSunSideDirection(params, 0.07, -1)
      const current = sampleSky(direction, params)
      const legacy = sampleLegacySkyGradient(direction, params)
      expect(current[0] + current[1] + current[2]).toBeLessThan(legacy[0] + legacy[1] + legacy[2])
    }
  })

  it('地影上方壓著一道金星帶：比地影亮、偏粉', () => {
    const params = createParams(0.768)
    const shadow = sampleSky(createSunSideDirection(params, 0.06, -1), params)
    const belt = sampleSky(createSunSideDirection(params, 0.3, -1), params)
    expect(belt[0]).toBeGreaterThan(shadow[0])
    expect(belt[0]).toBeGreaterThan(belt[1])
  })

  it('每個方向的顏色都落在零到一', () => {
    const directionList = listDirection()
    let lowest = Number.POSITIVE_INFINITY
    let highest = Number.NEGATIVE_INFINITY
    for (let step = 0; step < 200; step++) {
      const params = createParams(step / 200)
      for (const direction of directionList) {
        for (const value of sampleSky(direction, params)) {
          lowest = Math.min(lowest, value)
          highest = Math.max(highest, value)
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(0)
    expect(highest).toBeLessThanOrEqual(1.001)
  })
})
