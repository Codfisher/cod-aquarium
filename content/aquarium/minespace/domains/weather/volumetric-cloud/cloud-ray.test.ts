import type { NoiseMap } from './cloud-ray'
import { describe, expect, it } from 'vitest'
import {
  CLOUD_RAY_FRAGMENT,
  computeCloudGapRatio,
  computeRayScreenWindow,
  computeRaySunWindow,
  estimateLocalCoverage,
  sampleNoiseRed,
} from './cloud-ray'

/** 一張紅色通道全是同一個值的圖 */
function createFlatMap(value: number, size = 4): NoiseMap {
  const data = new Uint8Array(size * size * 4)
  for (let index = 0; index < size * size; index++) {
    data[index * 4] = Math.round(value * 255)
  }
  return { size, data }
}

describe('雲縫光的時機', () => {
  it('正午與深夜都沒有', () => {
    expect(computeRaySunWindow(0.849)).toBe(0)
    expect(computeRaySunWindow(0.62)).toBe(0)
    expect(computeRaySunWindow(-0.16)).toBe(0)
    expect(computeRaySunWindow(-0.6)).toBe(0)
  })

  it('太陽貼著地平線到斜陽都是滿的', () => {
    for (const sunHeight of [-0.05, 0, 0.1, 0.3]) {
      expect(computeRaySunWindow(sunHeight)).toBe(1)
    }
  })

  it('太陽在畫面內是滿的，離畫面太遠就收掉', () => {
    expect(computeRayScreenWindow(0.5, 0.5)).toBe(1)
    expect(computeRayScreenWindow(0.9, 0.2)).toBe(1)
    expect(computeRayScreenWindow(0.5, -0.4)).toBeLessThan(1)
    expect(computeRayScreenWindow(0.5, -0.4)).toBeGreaterThan(0)
    expect(computeRayScreenWindow(2, 0.5)).toBe(0)
  })
})

describe('太陽那一側的雲適不適合出光柱', () => {
  it('晴空沒東西切光', () => {
    expect(computeCloudGapRatio([0.05, 0.1, 0.08, 0.12])).toBe(0)
  })

  it('整片雲牆光透不過來', () => {
    expect(computeCloudGapRatio([0.9, 0.85, 0.95, 0.88])).toBe(0)
  })

  it('有雲又有縫才是滿的', () => {
    expect(computeCloudGapRatio([0.45, 0.2, 0.5, 0.1, 0.42])).toBeGreaterThan(0.9)
  })

  it('沒有取樣就當沒有', () => {
    expect(computeCloudGapRatio([])).toBe(0)
  })
})

describe('cPU 這一側的區域雲量', () => {
  it('雙線性取樣會繞回，平的圖到處都是同一個值', () => {
    const map = createFlatMap(0.6)
    for (const [u, v] of [[0, 0], [0.37, 0.91], [-2.3, 5.8], [1, 1]] as const) {
      expect(sampleNoiseRed(map, u, v)).toBeCloseTo(0.6, 2)
    }
  })

  it('與著色器同一條式子：天氣圖與宏觀圖都是零點五時，局部覆蓋率落在中段', () => {
    const input = {
      weatherMap: createFlatMap(0.5),
      macroMap: createFlatMap(0.5),
      weatherFrequency: 1 / 3200,
      coverage: 0.38,
      stratusBlend: 0,
    }
    /** regional = smoothstep 過的 0.5 = 0.5，覆蓋率 = 0.38 × mix(0.2, 1.7, 0.5) = 0.361 */
    expect(estimateLocalCoverage(1234, -567, input)).toBeCloseTo(0.38 * 0.95, 2)
  })

  it('天氣圖數值高的地方雲多；層雲把各地拉平', () => {
    const base = { weatherFrequency: 1 / 3200, coverage: 0.38, stratusBlend: 0 }
    const sparse = estimateLocalCoverage(0, 0, { ...base, weatherMap: createFlatMap(0.1), macroMap: createFlatMap(0.2) })
    const dense = estimateLocalCoverage(0, 0, { ...base, weatherMap: createFlatMap(0.9), macroMap: createFlatMap(0.9) })
    expect(dense).toBeGreaterThan(sparse * 3)

    const stratus = { ...base, stratusBlend: 1 }
    const sparseStratus = estimateLocalCoverage(0, 0, { ...stratus, weatherMap: createFlatMap(0.1), macroMap: createFlatMap(0.2) })
    const denseStratus = estimateLocalCoverage(0, 0, { ...stratus, weatherMap: createFlatMap(0.9), macroMap: createFlatMap(0.9) })
    expect(denseStratus - sparseStratus).toBeLessThan(dense - sparse)
  })
})

describe('放射狀模糊的著色器', () => {
  it('字串裡的數字都換好了，括號成對', () => {
    expect(CLOUD_RAY_FRAGMENT).not.toContain('$')
    expect(CLOUD_RAY_FRAGMENT).not.toContain('NaN')
    expect(CLOUD_RAY_FRAGMENT.split('{').length).toBe(CLOUD_RAY_FRAGMENT.split('}').length)
    expect(CLOUD_RAY_FRAGMENT.split('(').length).toBe(CLOUD_RAY_FRAGMENT.split(')').length)
  })
})
