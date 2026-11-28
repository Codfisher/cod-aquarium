import { describe, expect, it } from 'vitest'
import {
  clipHighlight,
  createTwilightPalette,
  fillTwilightPalette,
  getGrazingHeight,
  getHueClipRatio,
  getMoonLightGate,
  getTwilightAmbientScale,
  getTwilightRatio,
  getTwilightWindow,
  isCloudSunLit,
  sampleTwilightLight,
  TWILIGHT_HANDOVER_HEIGHT,
  TWILIGHT_STOP_HEIGHT,
} from './twilight'

const PLANET_RADIUS = 12000

describe('晨昏的比例', () => {
  it('白天與深夜完全不作用', () => {
    for (const sunHeight of [0.28, 0.4, 0.849, -0.3, -0.36, -0.849]) {
      expect(getTwilightWindow(sunHeight)).toBe(0)
      expect(getHueClipRatio(sunHeight)).toBe(0)
      expect(getTwilightAmbientScale(sunHeight, 1)).toBe(1)
    }
  })

  it('太陽貼著地平線到沉下去一段都是滿的', () => {
    for (const sunHeight of [0.02, 0, -0.1, -0.2, -0.26]) {
      expect(getTwilightWindow(sunHeight)).toBe(1)
    }
  })

  it('太陽往下沉時比例只增不減', () => {
    let previous = 0
    for (let sunHeight = 0.3; sunHeight >= -0.2; sunHeight -= 0.005) {
      const ratio = getTwilightRatio(sunHeight)
      expect(ratio).toBeGreaterThanOrEqual(previous)
      previous = ratio
    }
  })

  it('換手給月亮的那一刻兩邊的光都是零', () => {
    expect(isCloudSunLit(TWILIGHT_HANDOVER_HEIGHT + 1e-6)).toBe(true)
    expect(isCloudSunLit(TWILIGHT_HANDOVER_HEIGHT)).toBe(false)
    expect(getTwilightWindow(TWILIGHT_HANDOVER_HEIGHT + 1e-6)).toBeLessThan(1e-6)
    expect(getMoonLightGate(TWILIGHT_HANDOVER_HEIGHT)).toBe(0)
    expect(getMoonLightGate(-0.36)).toBe(1)
  })

  it('燒得越兇，雲的天光壓得越暗', () => {
    expect(getTwilightAmbientScale(0, 1)).toBeLessThan(getTwilightAmbientScale(0, 0.3))
    expect(getTwilightAmbientScale(0, 0)).toBe(1)
  })
})

describe('掠地高度', () => {
  it('太陽在地平線上時等於那一點自己的高度，兩段相接', () => {
    for (const altitude of [115, 160, 315, 420]) {
      expect(getGrazingHeight(altitude, 0, PLANET_RADIUS)).toBeCloseTo(altitude, 6)
      const above = getGrazingHeight(altitude, 1e-5, PLANET_RADIUS)
      const below = getGrazingHeight(altitude, -1e-5, PLANET_RADIUS)
      expect(Math.abs(above - below)).toBeLessThan(0.05)
    }
  })

  it('低雲先進影子，卷雲最後', () => {
    const findShadowHeight = (altitude: number) => {
      for (let sunHeight = 0; sunHeight > -0.4; sunHeight -= 0.001) {
        if (getGrazingHeight(altitude, sunHeight, PLANET_RADIUS) < 0)
          return sunHeight
      }
      return -1
    }
    const cumulus = findShadowHeight(115)
    const altocumulus = findShadowHeight(315)
    const cirrus = findShadowHeight(420)
    expect(cumulus).toBeGreaterThan(altocumulus)
    expect(altocumulus).toBeGreaterThan(cirrus)
    /** 卷雲要在換手給月亮之前就全暗，否則最後那一絲紅會被硬切掉 */
    expect(cirrus).toBeGreaterThan(TWILIGHT_HANDOVER_HEIGHT)
  })
})

describe('色階', () => {
  const palette = fillTwilightPalette('dusk', 1, 0, createTwilightPalette())
  const color: [number, number, number] = [0, 0, 0]

  it('影子裡全暗，由低到高是玫瑰、緋紅、橘、金', () => {
    expect(sampleTwilightLight(TWILIGHT_STOP_HEIGHT.shadow - 1, palette, color)).toEqual([0, 0, 0])

    const crimson = [...sampleTwilightLight(TWILIGHT_STOP_HEIGHT.crimson, palette, color)]
    const orange = [...sampleTwilightLight(TWILIGHT_STOP_HEIGHT.orange, palette, color)]
    const gold = [...sampleTwilightLight(TWILIGHT_STOP_HEIGHT.gold + 50, palette, color)]
    /** 綠色通道一路升高：越高越黃 */
    expect(crimson[1]!).toBeLessThan(orange[1]!)
    expect(orange[1]!).toBeLessThan(gold[1]!)
    /** 每一格都是紅最多 */
    for (const stop of [crimson, orange, gold]) {
      expect(stop[0]!).toBeGreaterThan(stop[1]!)
      expect(stop[1]!).toBeGreaterThan(stop[2]!)
    }
  })

  it('沿著高度是連續的，沒有跳一格', () => {
    let previous = [...sampleTwilightLight(-40, palette, color)]
    for (let height = -40; height <= 400; height += 1) {
      const current = [...sampleTwilightLight(height, palette, color)]
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(current[channel]! - previous[channel]!)).toBeLessThan(0.06)
      }
      previous = current
    }
  })

  it('燃燒強度低的日子比較灰、比較暗', () => {
    const plain = fillTwilightPalette('dusk', 0.1, 0, createTwilightPalette())
    const measureSaturation = (list: number[], offset: number) =>
      (list[offset]! - list[offset + 2]!) / list[offset]!
    /** 緋紅那一格 */
    expect(measureSaturation(plain, 3)).toBeLessThan(measureSaturation(palette, 3))
    expect(plain[3]!).toBeLessThan(palette[3]!)
  })

  it('清晨比黃昏粉：同一格的藍比較多', () => {
    const dawn = fillTwilightPalette('dawn', 1, 0, createTwilightPalette())
    for (const offset of [0, 3, 6, 9]) {
      expect(dawn[offset + 2]! / dawn[offset]!).toBeGreaterThan(palette[offset + 2]! / palette[offset]!)
    }
  })

  it('入夜之後整組淡到零', () => {
    const faded = fillTwilightPalette('dusk', 1, TWILIGHT_HANDOVER_HEIGHT, createTwilightPalette())
    expect(faded.every((value) => value === 0)).toBe(true)
  })
})

describe('高光壓縮', () => {
  const out: [number, number, number] = [0, 0, 0]

  it('比例為零就是原本的逐通道壓縮：逆光的橘色雲邊變白', () => {
    const [red, green, blue] = clipHighlight([8.8, 3.5, 1.5], 0, out)
    expect(red).toBeGreaterThan(0.99)
    expect(green).toBeGreaterThan(0.99)
    expect(blue).toBeGreaterThan(0.98)
  })

  it('比例為一時色相不變，最亮的通道收在一以內', () => {
    const [red, green, blue] = clipHighlight([8.8, 3.5, 1.5], 1, out)
    expect(red).toBeLessThanOrEqual(1)
    expect(green / red).toBeCloseTo(3.5 / 8.8, 6)
    expect(blue / red).toBeCloseTo(1.5 / 8.8, 6)
  })

  it('沒超過門檻的顏色不動', () => {
    expect(clipHighlight([0.6, 0.4, 0.2], 1, out)).toEqual([0.6, 0.4, 0.2])
    expect(clipHighlight([0.6, 0.4, 0.2], 0, out)).toEqual([0.6, 0.4, 0.2])
  })
})
