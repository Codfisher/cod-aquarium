import { describe, expect, it } from 'vitest'
import { getBurnEmphasis, getDaySlot } from './drift-direction'

describe('神遊的時段', () => {
  it('太陽落下之後雲還燒著的那一段仍算日出日落', () => {
    /** 積雲燒到 0.778、卷雲到 0.8 前後；清晨對稱 */
    for (const timeOfDay of [0.71, 0.75, 0.778, 0.79, 0.799, 0.201, 0.22, 0.25, 0.299]) {
      expect(getDaySlot(timeOfDay)).toBe('golden')
    }
  })

  it('雲熄掉之後才是藍調與夜', () => {
    expect(getDaySlot(0.8)).toBe('blue')
    expect(getDaySlot(0.84)).toBe('blue')
    expect(getDaySlot(0.19)).toBe('blue')
    expect(getDaySlot(0.9)).toBe('night')
    expect(getDaySlot(0.05)).toBe('night')
  })

  it('白天的時段沒有變', () => {
    expect(getDaySlot(0.3)).toBe('day')
    expect(getDaySlot(0.4)).toBe('day')
    expect(getDaySlot(0.5)).toBe('noon')
    expect(getDaySlot(0.65)).toBe('day')
    expect(getDaySlot(0.705)).toBe('day')
  })

  it('時刻繞一圈也認得', () => {
    expect(getDaySlot(1.75)).toBe('golden')
    expect(getDaySlot(-0.25)).toBe('golden')
  })
})

describe('燃燒強度的加碼', () => {
  it('平淡與一般的傍晚不加碼，整片燒的傍晚加滿', () => {
    expect(getBurnEmphasis(0)).toBe(0)
    expect(getBurnEmphasis(0.5)).toBe(0)
    expect(getBurnEmphasis(0.85)).toBe(1)
    expect(getBurnEmphasis(1)).toBe(1)
  })

  it('中間平滑遞增', () => {
    let previous = 0
    for (let burnIntensity = 0.5; burnIntensity <= 0.85; burnIntensity += 0.01) {
      const emphasis = getBurnEmphasis(burnIntensity)
      expect(emphasis).toBeGreaterThanOrEqual(previous)
      previous = emphasis
    }
  })
})
