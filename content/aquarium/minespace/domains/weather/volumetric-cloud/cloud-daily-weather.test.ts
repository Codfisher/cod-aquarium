import type { TwilightKind } from '../twilight'
import { describe, expect, it } from 'vitest'
import {
  createCloudWeather,
  createDailyWeather,
  deriveBurnIntensity,
  deriveCloudWeather,
  drawTwilight,
  getTwilightKind,
  sampleDailyWeather,
} from './cloud-daily-weather'

const START_DAY = 20785
const DAY_COUNT = 400

function computeBurn(dayIndex: number, kind: TwilightKind, rainRatio = 0): number {
  const dayPosition = dayIndex + (kind === 'dawn' ? 0.24 : 0.76)
  const cloudWeather = deriveCloudWeather(
    sampleDailyWeather(dayPosition, createDailyWeather()),
    dayIndex,
    createCloudWeather(),
  )
  return deriveBurnIntensity(cloudWeather, drawTwilight(dayIndex, kind), rainRatio)
}

function listBurn(kind: TwilightKind): number[] {
  return Array.from({ length: DAY_COUNT }, (_, index) => computeBurn(START_DAY + index, kind))
}

function measureShare(list: number[], from: number, to: number): number {
  return list.filter((value) => value >= from && value < to).length / list.length
}

describe('燃燒強度', () => {
  it('同一天永遠是同一個強度', () => {
    for (const dayIndex of [0, 15, START_DAY, START_DAY + 123]) {
      expect(computeBurn(dayIndex, 'dusk')).toBe(computeBurn(dayIndex, 'dusk'))
      expect(drawTwilight(dayIndex, 'dawn')).toEqual(drawTwilight(dayIndex, 'dawn'))
    }
  })

  it('晨與昏各抽各的', () => {
    const differentCount = Array.from({ length: 50 }, (_, index) => START_DAY + index)
      .filter((dayIndex) => drawTwilight(dayIndex, 'dawn').clarity !== drawTwilight(dayIndex, 'dusk').clarity)
      .length
    expect(differentCount).toBe(50)
  })

  it('多抽晨昏的籤不會改到當天的雲', () => {
    const deriveToday = () => deriveCloudWeather(
      sampleDailyWeather(START_DAY + 0.76, createDailyWeather()),
      START_DAY,
      createCloudWeather(),
    )
    const before = deriveToday()
    drawTwilight(START_DAY, 'dusk')
    drawTwilight(START_DAY, 'dawn')
    expect(deriveToday()).toEqual(before)
  })

  it('落在零到一，下雨時歸零', () => {
    for (const kind of ['dawn', 'dusk'] as const) {
      for (const burn of listBurn(kind)) {
        expect(burn).toBeGreaterThanOrEqual(0)
        expect(burn).toBeLessThanOrEqual(1)
      }
    }
    expect(computeBurn(START_DAY, 'dusk', 1)).toBe(0)
  })

  it('四百天的分布：平淡約三成、一般約四成、整片燒約一成多', () => {
    for (const kind of ['dawn', 'dusk'] as const) {
      const list = listBurn(kind)
      const plain = measureShare(list, 0, 0.35)
      const ordinary = measureShare(list, 0.35, 0.65)
      const good = measureShare(list, 0.65, 0.85)
      const full = measureShare(list, 0.85, 1.01)

      expect(plain).toBeGreaterThan(0.24)
      expect(plain).toBeLessThan(0.4)
      expect(ordinary).toBeGreaterThan(0.3)
      expect(ordinary).toBeLessThan(0.46)
      expect(good).toBeGreaterThan(0.1)
      expect(good).toBeLessThan(0.24)
      expect(full).toBeGreaterThan(0.08)
      expect(full).toBeLessThan(0.2)
    }
  })

  it('平淡的黃昏不會連續超過六天', () => {
    let streak = 0
    let longest = 0
    for (const burn of listBurn('dusk')) {
      streak = burn < 0.35 ? streak + 1 : 0
      longest = Math.max(longest, streak)
    }
    expect(longest).toBeLessThanOrEqual(6)
  })

  it('層雲蓋滿的天燒不起來', () => {
    const cloudWeather = { ...createCloudWeather(), altocumulusCoverage: 0.6, stratusBlend: 1 }
    const clearDraw = { clarity: 1, horizonGap: 1 }
    const overcast = deriveBurnIntensity(cloudWeather, clearDraw, 0)
    const open = deriveBurnIntensity({ ...cloudWeather, stratusBlend: 0 }, clearDraw, 0)
    expect(overcast).toBeLessThan(0.3)
    expect(open).toBeGreaterThan(0.85)
  })
})

describe('晨昏的籤換在正午與子夜', () => {
  it('上半天算清晨、下半天算黃昏', () => {
    expect(getTwilightKind(START_DAY + 0.01)).toBe('dawn')
    expect(getTwilightKind(START_DAY + 0.49)).toBe('dawn')
    expect(getTwilightKind(START_DAY + 0.5)).toBe('dusk')
    expect(getTwilightKind(START_DAY + 0.99)).toBe('dusk')
  })
})
