import { describe, expect, it } from 'vitest'
import { createStarList } from './star-field'

describe('像素星空', () => {
  const starList = createStarList(1300)

  it('每次撒出來都是同一片星', () => {
    expect(createStarList(1300)).toEqual(starList)
    expect(starList).toHaveLength(1300)
  })

  it('方向是單位向量，沒有落在地平線下太深的', () => {
    for (const star of starList) {
      const [x, y, z] = star.direction
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
      expect(y).toBeGreaterThanOrEqual(-0.05)
    }
  })

  it('暗星多、亮星少，大顆的只有幾十顆', () => {
    const dimCount = starList.filter((star) => star.brightness < 0.35).length
    const brightCount = starList.filter((star) => star.brightness > 0.85).length
    const largeCount = starList.filter((star) => star.pixelSize >= 2).length
    const largestCount = starList.filter((star) => star.pixelSize === 3).length

    expect(dimCount / starList.length).toBeGreaterThan(0.5)
    expect(brightCount / starList.length).toBeLessThan(0.08)
    expect(largeCount).toBeGreaterThan(20)
    expect(largeCount).toBeLessThan(110)
    expect(largestCount).toBeLessThan(30)
    for (const star of starList) {
      expect(Number.isInteger(star.pixelSize)).toBe(true)
      expect(star.brightness).toBeGreaterThan(0.2)
      expect(star.brightness).toBeLessThanOrEqual(1)
    }
  })

  it('顏色有冷有暖，白的最多', () => {
    const whiteCount = starList.filter((star) => star.color[0] === 1 && star.color[2] === 1).length
    const coolCount = starList.filter((star) => star.color[2] > star.color[0]).length
    const warmCount = starList.filter((star) => star.color[0] > star.color[2]).length

    expect(coolCount).toBeGreaterThan(100)
    expect(warmCount).toBeGreaterThan(200)
    expect(whiteCount).toBeGreaterThan(coolCount)
    expect(whiteCount).toBeGreaterThan(400)
  })

  it('各自有不同的閃爍節奏', () => {
    const speedSet = new Set(starList.map((star) => star.twinkleSpeed.toFixed(3)))
    expect(speedSet.size).toBeGreaterThan(600)
  })
})
