import type { SoundActivePeriod, SoundWeatherGain } from './type'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERVAL_PITCH_RANGE_CENT,
  DEFAULT_INTERVAL_VOLUME_DROP_RATIO,
  DEFAULT_LOOP_PITCH_RANGE_CENT,
  DRIFT_LISTENER_HEIGHT_MAX,
  measureDriftListenerY,
  measureIdUnit,
  measureSunHeight,
  measureTimeGate,
  measureWeatherGain,
  pickPlayVariation,
  pickThunderPosition,
} from './sound-shaping'

/**
 * 音景的純算式：時段、每次播放的變化、雨勢換音量、神遊時耳朵的高度
 *
 * 這些都聽不到、只能算，所以每一條都把「該落在哪個範圍」釘死
 */

/** 一天取樣幾個時刻 */
const TIME_SAMPLE_COUNT = 480
const timeList = Array.from({ length: TIME_SAMPLE_COUNT }, (_, index) => index / TIME_SAMPLE_COUNT)

/** 日夜循環的白晝程度（照抄 day-night 的門檻），測試用它餵 day／night */
function measureDayRatio(timeOfDay: number): number {
  const ratio = Math.min(1, Math.max(0, (measureSunHeight(timeOfDay) + 0.12) / 0.27))
  return ratio * ratio * (3 - 2 * ratio)
}

function sampleGate(activeAt: SoundActivePeriod | undefined, timeOfDay: number): number {
  return measureTimeGate(activeAt, measureDayRatio(timeOfDay), timeOfDay)
}

describe('時段', () => {
  it('沒指定時段的整天都是滿的', () => {
    for (const time of timeList) {
      expect(sampleGate(undefined, time)).toBe(1)
    }
  })

  it('白天與夜裡互補，照白晝程度走', () => {
    expect(measureTimeGate('day', 0.3, 0.5)).toBeCloseTo(0.3)
    expect(measureTimeGate('night', 0.3, 0.5)).toBeCloseTo(0.7)
    expect(sampleGate('day', 0.5)).toBe(1)
    expect(sampleGate('night', 0)).toBe(1)
  })

  it('每一種時段都落在 0 到 1 之間，而且隨時刻連續（不會一格跳一大截）', () => {
    const periodList: SoundActivePeriod[] = ['day', 'night', 'dawn', 'dusk', 'twilight']
    for (const period of periodList) {
      let previous = sampleGate(period, timeList.at(-1)!)
      for (const time of timeList) {
        const gate = sampleGate(period, time)
        expect(gate).toBeGreaterThanOrEqual(0)
        expect(gate).toBeLessThanOrEqual(1)
        /** 一格是三分鐘，最陡的斜坡一格也不該超過兩成 */
        expect(Math.abs(gate - previous)).toBeLessThan(0.2)
        previous = gate
      }
    }
  })

  it('拂曉只在早上：日出前後是滿的，正午、傍晚、半夜都是零', () => {
    expect(sampleGate('dawn', 0.25)).toBe(1)
    expect(sampleGate('dawn', 0.28)).toBe(1)
    /** 天還沒亮就起頭（清晨五點多） */
    expect(sampleGate('dawn', 0.22)).toBeGreaterThan(0.3)
    expect(sampleGate('dawn', 0.5)).toBe(0)
    expect(sampleGate('dawn', 0.75)).toBe(0)
    expect(sampleGate('dawn', 0)).toBe(0)
    expect(sampleGate('dawn', 0.4)).toBe(0)
  })

  it('薄暮只在傍晚：日落前後是滿的，而且天黑透之後還留一陣子', () => {
    expect(sampleGate('dusk', 0.75)).toBe(1)
    expect(sampleGate('dusk', 0.78)).toBe(1)
    /** 太陽還掛著（下午五點多）就起頭 */
    expect(sampleGate('dusk', 0.72)).toBeGreaterThan(0.3)
    expect(sampleGate('dusk', 0.72)).toBeLessThan(0.9)
    /** 日落後一個多小時（白晝程度已經是零）還聽得到 */
    expect(measureDayRatio(0.8)).toBe(0)
    expect(sampleGate('dusk', 0.8)).toBeGreaterThan(0.5)
    expect(sampleGate('dusk', 0.5)).toBe(0)
    expect(sampleGate('dusk', 0.25)).toBe(0)
    expect(sampleGate('dusk', 0.95)).toBe(0)
  })

  it('拂曉與薄暮各佔一天的一成到兩成，不會整天都在', () => {
    for (const period of ['dawn', 'dusk'] as const) {
      const activeRatio = timeList.filter((time) => sampleGate(period, time) > 0.05).length / TIME_SAMPLE_COUNT
      expect(activeRatio).toBeGreaterThan(0.1)
      expect(activeRatio).toBeLessThan(0.2)
    }
  })

  it('晨昏早晚各一次，與天上晨昏才出現的東西同一組門檻', () => {
    /** 太陽剛過地平線：滿的 */
    expect(sampleGate('twilight', 0.26)).toBeCloseTo(1, 1)
    expect(sampleGate('twilight', 0.74)).toBeCloseTo(1, 1)
    expect(sampleGate('twilight', 0.5)).toBe(0)
    expect(sampleGate('twilight', 0)).toBe(0)
    /** 太陽在地平線下一點就沒有了（雁行在天黑前就飛走） */
    expect(sampleGate('twilight', 0.22)).toBe(0)
    expect(sampleGate('twilight', 0.78)).toBe(0)
  })
})

describe('每次播放的變化', () => {
  it('同一個 id 的定值每次都一樣，落在正負一之間，不同 id 彼此錯開', () => {
    const unitList = Array.from({ length: 40 }, (_, index) => measureIdUnit(`cicada-realm-chorus-${index}`))
    for (const unit of unitList) {
      expect(unit).toBeGreaterThanOrEqual(-1)
      expect(unit).toBeLessThanOrEqual(1)
    }
    expect(measureIdUnit('cicada-realm-chorus-3')).toBe(unitList[3])
    /** 四十顆裡至少有三十種不同的值，正負兩邊都有 */
    expect(new Set(unitList.map((unit) => unit.toFixed(3))).size).toBeGreaterThan(30)
    expect(Math.min(...unitList)).toBeLessThan(-0.5)
    expect(Math.max(...unitList)).toBeGreaterThan(0.5)
  })

  it('循環音的音高照 id 固定，不吃亂數，音量不變', () => {
    const first = pickPlayVariation(undefined, 'loop', 'meadow-wind-4', () => 0.1)
    const second = pickPlayVariation(undefined, 'loop', 'meadow-wind-4', () => 0.9)
    expect(first).toEqual(second)
    expect(Math.abs(first.pitchCent)).toBeLessThanOrEqual(DEFAULT_LOOP_PITCH_RANGE_CENT)
    expect(first.volumeRatio).toBe(1)
  })

  it('間歇音每次播放的音高與音量都在預設範圍裡', () => {
    for (let step = 0; step <= 10; step++) {
      const value = step / 10
      const variation = pickPlayVariation(undefined, 'interval', 'forest-owl-0', () => value)
      expect(Math.abs(variation.pitchCent)).toBeLessThanOrEqual(DEFAULT_INTERVAL_PITCH_RANGE_CENT)
      expect(variation.volumeRatio).toBeLessThanOrEqual(1)
      expect(variation.volumeRatio).toBeGreaterThanOrEqual(1 - DEFAULT_INTERVAL_VOLUME_DROP_RATIO)
    }
    /** 亂數的兩頭正好是範圍的兩頭 */
    expect(pickPlayVariation(undefined, 'interval', 'a', () => 0).pitchCent).toBe(-DEFAULT_INTERVAL_PITCH_RANGE_CENT)
    expect(pickPlayVariation(undefined, 'interval', 'a', () => 1).pitchCent).toBe(DEFAULT_INTERVAL_PITCH_RANGE_CENT)
  })

  it('固定偏移加在隨機範圍的中心：借來的狼調高之後仍然每次差一點', () => {
    const variation = { pitchOffsetCent: 380, pitchRangeCent: 50 }
    expect(pickPlayVariation(variation, 'interval', 'coyote', () => 0.5).pitchCent).toBeCloseTo(380)
    expect(pickPlayVariation(variation, 'interval', 'coyote', () => 0).pitchCent).toBeCloseTo(330)
    expect(pickPlayVariation(variation, 'interval', 'coyote', () => 1).pitchCent).toBeCloseTo(430)
  })

  it('範圍寫成零就完全不變：鐘每一下都是同一口鐘', () => {
    const variation = { pitchRangeCent: 0, volumeDropRatio: 0 }
    for (const value of [0, 0.3, 1]) {
      expect(pickPlayVariation(variation, 'interval', 'village-bell', () => value)).toEqual({ pitchCent: 0, volumeRatio: 1 })
    }
    expect(pickPlayVariation({ pitchRangeCent: 0 }, 'loop', 'village-bell', () => 0.5).pitchCent).toBe(0)
  })

  it('觸發音與間歇音同一套（雷每一道差一點）', () => {
    expect(pickPlayVariation(undefined, 'trigger', 'rainvale-thunder', () => 1).pitchCent).toBe(DEFAULT_INTERVAL_PITCH_RANGE_CENT)
  })
})

describe('雨勢換音量', () => {
  const rainGain: SoundWeatherGain = { source: 'rain', levelRange: [0.78, 1], floor: 0.5 }
  const snowGain: SoundWeatherGain = { source: 'snow', levelRange: [0.72, 1], floor: 0.6 }

  it('沒設的音源不受天氣強弱影響', () => {
    expect(measureWeatherGain(undefined, 0, 0)).toBe(1)
    expect(measureWeatherGain(undefined, 1, 1)).toBe(1)
  })

  it('場景的雨勢範圍攤開成 floor 到一', () => {
    expect(measureWeatherGain(rainGain, 0.78, 0)).toBeCloseTo(0.5)
    expect(measureWeatherGain(rainGain, 0.89, 0)).toBeCloseTo(0.75)
    expect(measureWeatherGain(rainGain, 1, 0)).toBeCloseTo(1)
  })

  it('雨只看雨、雪只看雪', () => {
    expect(measureWeatherGain(rainGain, 1, 0)).toBeCloseTo(1)
    expect(measureWeatherGain(snowGain, 1, 0.72)).toBeCloseTo(0.6)
    expect(measureWeatherGain(snowGain, 0, 1)).toBeCloseTo(1)
  })

  it('讀數還沒送到（零）時停在 floor，不會整片歸零；超過上限也不會破一', () => {
    expect(measureWeatherGain(rainGain, 0, 0)).toBeCloseTo(0.5)
    expect(measureWeatherGain(rainGain, 1.4, 0)).toBe(1)
  })

  it('雨勢越大越響，沒有倒退', () => {
    let previous = 0
    for (let level = 0; level <= 1.001; level += 0.02) {
      const gain = measureWeatherGain(rainGain, level, 0)
      expect(gain).toBeGreaterThanOrEqual(previous)
      previous = gain
    }
  })
})

describe('神遊時耳朵的高度', () => {
  /** 人站在地上時耳朵的高度 */
  const groundEarY = 12

  it('鏡頭貼地（散步、停留）時耳朵就是鏡頭', () => {
    expect(measureDriftListenerY(groundEarY, groundEarY, 1)).toBe(groundEarY)
    /** 鏡頭比地面的耳朵還低（鑽進低處）也不往上拉 */
    expect(measureDriftListenerY(groundEarY - 3, groundEarY, 1)).toBe(groundEarY - 3)
  })

  it('升空時耳朵落在地面與鏡頭之間，而且最多高出地上的人六格', () => {
    for (const cameraY of [14, 18, 24, 32, 60]) {
      const listenerY = measureDriftListenerY(cameraY, groundEarY, 1)
      expect(listenerY).toBeGreaterThan(groundEarY)
      expect(listenerY).toBeLessThan(cameraY)
      expect(listenerY - groundEarY).toBeLessThanOrEqual(DRIFT_LISTENER_HEIGHT_MAX)
    }
  })

  it('鏡頭越高耳朵不會反而變低（上升時聲音不會忽大忽小）', () => {
    let previous = 0
    for (let cameraY = groundEarY; cameraY < 60; cameraY += 0.5) {
      const listenerY = measureDriftListenerY(cameraY, groundEarY, 1)
      expect(listenerY).toBeGreaterThanOrEqual(previous)
      previous = listenerY
    }
  })

  it('沒在神遊（拉的程度為零）完全不動，進出時在兩者之間', () => {
    expect(measureDriftListenerY(30, groundEarY, 0)).toBe(30)
    const half = measureDriftListenerY(30, groundEarY, 0.5)
    const full = measureDriftListenerY(30, groundEarY, 1)
    expect(half).toBeCloseTo((30 + full) / 2)
  })

  it('樹梢上方巡航時，貼地一格、可聽十五格的音源回到範圍裡', () => {
    /** 金葉林：樹高約九格，巡航在樹梢上方七格，落葉的音源在地面上一格 */
    const cameraY = groundEarY - 1.62 + 9 + 7
    const emitterY = groundEarY - 1.62 + 1.5
    expect(cameraY - emitterY).toBeGreaterThan(14)
    expect(measureDriftListenerY(cameraY, groundEarY, 1) - emitterY).toBeLessThan(6)
  })
})

describe('雷的方位', () => {
  const listener = { x: 140, y: 14, z: 140 }

  it('遠的雷擺得遠而低，近的在頭頂附近', () => {
    const near = pickThunderPosition(listener, 0, () => 0.25)
    const far = pickThunderPosition(listener, 1, () => 0.25)
    const measureFlat = (position: { x: number; z: number }) => Math.hypot(position.x - listener.x, position.z - listener.z)

    expect(measureFlat(near)).toBeLessThan(measureFlat(far))
    expect(near.y).toBeGreaterThan(far.y)
    /** 都在聽者上方，水平距離壓在雷的滿音量半徑（三十格）裡 */
    expect(far.y).toBeGreaterThan(listener.y + 8)
    expect(measureFlat(far)).toBeLessThan(30)
  })

  it('方位跟著亂數繞一圈', () => {
    const east = pickThunderPosition(listener, 0.5, () => 0)
    const west = pickThunderPosition(listener, 0.5, () => 0.5)
    expect(east.x).toBeGreaterThan(listener.x)
    expect(west.x).toBeLessThan(listener.x)
  })
})
