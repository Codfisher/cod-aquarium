import { describe, expect, it } from 'vitest'
import {
  advanceChargePower,
  appendPlatform,
  CHARGE_CYCLE_SPEED,
  createHopArc,
  createPlatformList,
  createSquashSpring,
  evaluateLandingGrade,
  getCrouchSquashTarget,
  getHopDistance,
  getHopDuration,
  getHopHeight,
  getLilyPadSinkDepth,
  getMossSlideOffset,
  getNextCombo,
  getPlatformCenterX,
  hasLandedOnPlatform,
  INITIAL_CHARGE_STATE,
  isLilyPadSunk,
  LILY_PAD_FATAL_DEPTH,
  LILY_PAD_SINK_DELAY,
  MAX_HOP_DISTANCE,
  MIN_HOP_DISTANCE,
  MOSS_SLIDE_DECAY,
  MOSS_SLIDE_SPEED,
  sampleHopArc,
  START_PLATFORM,
} from './stone-hop-logic'

const FRAME_SECONDS = 1 / 60

describe('石陣生成', () => {
  it('同一段序號永遠長出一模一樣的落腳點', () => {
    const firstList = createPlatformList(60)
    const secondList = createPlatformList(60)

    expect(secondList).toEqual(firstList)
  })

  it('落腳點沿 +Z 單調前進，間距隨進度變大', () => {
    const platformList = createPlatformList(80)

    for (let index = 1; index < platformList.length; index++) {
      expect(platformList[index]!.centerZ).toBeGreaterThan(platformList[index - 1]!.centerZ)
    }

    const earlyGap = platformList[3]!.centerZ - platformList[2]!.centerZ
    const lateGap = platformList[70]!.centerZ - platformList[69]!.centerZ
    expect(lateGap).toBeGreaterThan(earlyGap)
  })

  it('前四顆固定是普通石頭，特殊落腳點不會連續出現', () => {
    const platformList = createPlatformList(300)

    for (const platform of platformList.slice(0, 4)) {
      expect(platform.kind).toBe('stone')
    }

    for (let index = 1; index < platformList.length; index++) {
      if (platformList[index - 1]!.kind !== 'stone') {
        expect(platformList[index]!.kind).toBe('stone')
      }
    }
  })

  it('走得夠遠時荷葉、浮木、苔石都會登場', () => {
    const kindSet = new Set(createPlatformList(300).map((platform) => platform.kind))

    expect(kindSet.has('lilyPad')).toBe(true)
    expect(kindSet.has('driftwood')).toBe(true)
    expect(kindSet.has('mossStone')).toBe(true)
  })

  it('任何相鄰兩顆的最壞落點距離都跳得到，不會生出死局', () => {
    const platformList = createPlatformList(300)

    for (let index = 1; index < platformList.length; index++) {
      const previous = platformList[index - 1]!
      const current = platformList[index]!
      // 最壞情況：站在上一顆邊緣、目標浮木漂到最遠側
      const lateralGap = Math.abs(current.centerX - previous.centerX)
        + current.driftAmplitude
        + previous.driftAmplitude
      const worstDistance = Math.hypot(current.centerZ - previous.centerZ, lateralGap)
        + previous.radius

      expect(worstDistance).toBeLessThanOrEqual(MAX_HOP_DISTANCE)
    }
  })

  it('半徑隨進度縮小但不低於下限', () => {
    const platformList = createPlatformList(300)

    for (const platform of platformList) {
      expect(platform.radius).toBeGreaterThan(0.6)
      expect(platform.radius).toBeLessThanOrEqual(START_PLATFORM.radius)
    }
    expect(platformList[280]!.radius).toBeLessThan(platformList[5]!.radius)
  })

  it('只有浮木會橫向漂移，其餘落腳點恆定不動', () => {
    const platformList = createPlatformList(200)
    const driftwood = platformList.find((platform) => platform.kind === 'driftwood')!
    const stone = platformList.find((platform) => platform.index > 0 && platform.kind === 'stone')!

    const driftSampleList = [0, 0.9, 1.8, 2.7].map(
      (time) => getPlatformCenterX(driftwood, time),
    )
    expect(new Set(driftSampleList).size).toBeGreaterThan(1)
    for (const sample of driftSampleList) {
      expect(Math.abs(sample - driftwood.centerX)).toBeLessThanOrEqual(driftwood.driftAmplitude + 1e-9)
    }

    expect(getPlatformCenterX(stone, 3.7)).toBe(stone.centerX)
  })

  it('appendPlatform 只依賴上一顆，可從任意處續接出相同結果', () => {
    const platformList = createPlatformList(20)
    const continued = appendPlatform(platformList[19]!)

    expect(continued).toEqual(platformList[20]!)
  })
})

describe('蓄力曲線與跳躍距離', () => {
  it('力道在 0 到 1 之間往復，到頂會回彈', () => {
    let state = INITIAL_CHARGE_STATE
    let maxPower = 0
    let hasFallenBack = false

    for (let frame = 0; frame < 300; frame++) {
      state = advanceChargePower(state, FRAME_SECONDS)
      maxPower = Math.max(maxPower, state.power)
      expect(state.power).toBeGreaterThanOrEqual(0)
      expect(state.power).toBeLessThanOrEqual(1)
      if (!state.isRising) {
        hasFallenBack = true
      }
    }

    expect(maxPower).toBeGreaterThan(0.99)
    expect(hasFallenBack).toBe(true)
  })

  it('單幀 delta 跨越多個折返點也不會超出範圍', () => {
    const state = advanceChargePower(INITIAL_CHARGE_STATE, 7.3)

    expect(state.power).toBeGreaterThanOrEqual(0)
    expect(state.power).toBeLessThanOrEqual(1)
  })

  it('走完半個週期後力道回到起點', () => {
    const halfCycleSeconds = 2 / CHARGE_CYCLE_SPEED
    const state = advanceChargePower({ power: 0.3, isRising: true }, halfCycleSeconds)

    expect(state.power).toBeCloseTo(0.3, 6)
    expect(state.isRising).toBe(true)
  })

  it('力道映射到距離為單調遞增，且端點對上距離區間', () => {
    expect(getHopDistance(0)).toBeCloseTo(MIN_HOP_DISTANCE)
    expect(getHopDistance(1)).toBeCloseTo(MAX_HOP_DISTANCE)
    expect(getHopDistance(1.4)).toBeCloseTo(MAX_HOP_DISTANCE)
    expect(getHopDistance(-0.2)).toBeCloseTo(MIN_HOP_DISTANCE)

    let previous = Number.NEGATIVE_INFINITY
    for (let power = 0; power <= 1; power += 0.05) {
      const distance = getHopDistance(power)
      expect(distance).toBeGreaterThan(previous)
      previous = distance
    }
  })

  it('跳越遠飛越久、拋越高', () => {
    expect(getHopDuration(MAX_HOP_DISTANCE)).toBeGreaterThan(getHopDuration(MIN_HOP_DISTANCE))
    expect(getHopHeight(MAX_HOP_DISTANCE)).toBeGreaterThan(getHopHeight(MIN_HOP_DISTANCE))
  })
})

describe('跳躍弧線', () => {
  it('朝目標方向跳出指定距離，方向由目標決定、距離由力道決定', () => {
    const arc = createHopArc(0, 0, 3, 4, 5)

    expect(Math.hypot(arc.endX, arc.endZ)).toBeCloseTo(5)
    expect(arc.endX).toBeCloseTo(3)
    expect(arc.endZ).toBeCloseTo(4)

    const shortArc = createHopArc(0, 0, 3, 4, 2.5)
    expect(Math.hypot(shortArc.endX, shortArc.endZ)).toBeCloseTo(2.5)
    expect(shortArc.heading).toBeCloseTo(arc.heading)
  })

  it('目標與起點重合時退化為正前方，不會產生 NaN', () => {
    const arc = createHopArc(2, 5, 2, 5, 4)

    expect(arc.endX).toBeCloseTo(2)
    expect(arc.endZ).toBeCloseTo(9)
  })

  it('弧線兩端貼地、中點最高，俯仰起跳抬頭下落低頭', () => {
    const arc = createHopArc(0, 0, 0, 6, 6)

    expect(sampleHopArc(arc, 0, 1).y).toBeCloseTo(0)
    expect(sampleHopArc(arc, 1, 1).y).toBeCloseTo(0)
    expect(sampleHopArc(arc, 0.5, 1).y).toBeCloseTo(arc.height)
    expect(sampleHopArc(arc, 0.25, 1).pitch).toBeGreaterThan(0)
    expect(sampleHopArc(arc, 0.75, 1).pitch).toBeLessThan(0)
  })

  it('翻滾方向由 rollSign 決定，落地時歸零不跳變', () => {
    const arc = createHopArc(0, 0, 0, 5, 5)

    expect(sampleHopArc(arc, 0.5, 1).roll).toBeGreaterThan(0)
    expect(sampleHopArc(arc, 0.5, -1).roll).toBeLessThan(0)
    expect(sampleHopArc(arc, 0, 1).roll).toBeCloseTo(0)
    expect(sampleHopArc(arc, 1, 1).roll).toBeCloseTo(0)
  })
})

describe('落點評價與連段', () => {
  it('距心比例決定評價', () => {
    expect(evaluateLandingGrade(0, 1)).toBe('perfect')
    expect(evaluateLandingGrade(0.2, 1)).toBe('perfect')
    expect(evaluateLandingGrade(0.5, 1)).toBe('good')
    expect(evaluateLandingGrade(0.9, 1)).toBe('edge')
    expect(evaluateLandingGrade(1.2, 1)).toBe('miss')
  })

  it('半徑縮小時同樣的偏心會被降級', () => {
    expect(evaluateLandingGrade(0.2, 1)).toBe('perfect')
    expect(evaluateLandingGrade(0.2, 0.7)).toBe('good')
  })

  it('只有落水不算踩到落腳點', () => {
    expect(hasLandedOnPlatform('perfect')).toBe(true)
    expect(hasLandedOnPlatform('good')).toBe(true)
    expect(hasLandedOnPlatform('edge')).toBe(true)
    expect(hasLandedOnPlatform('miss')).toBe(false)
  })

  it('完美與良好續段，邊緣與落水歸零', () => {
    expect(getNextCombo(3, 'perfect')).toBe(4)
    expect(getNextCombo(3, 'good')).toBe(4)
    expect(getNextCombo(3, 'edge')).toBe(0)
    expect(getNextCombo(3, 'miss')).toBe(0)
  })
})

describe('荷葉下沉', () => {
  it('緩衝時間內完全不沉', () => {
    expect(getLilyPadSinkDepth(0)).toBe(0)
    expect(getLilyPadSinkDepth(LILY_PAD_SINK_DELAY)).toBe(0)
  })

  it('緩衝結束後等速下沉，到致命深度才算落水', () => {
    const justAfterDelay = getLilyPadSinkDepth(LILY_PAD_SINK_DELAY + 0.1)
    expect(justAfterDelay).toBeGreaterThan(0)
    expect(isLilyPadSunk(justAfterDelay)).toBe(false)

    const deepDepth = getLilyPadSinkDepth(LILY_PAD_SINK_DELAY + 5)
    expect(deepDepth).toBeGreaterThanOrEqual(LILY_PAD_FATAL_DEPTH)
    expect(isLilyPadSunk(deepDepth)).toBe(true)
  })

  it('沉沒時間有限，站著不動一定會落水', () => {
    let elapsed = 0
    while (elapsed < 20 && !isLilyPadSunk(getLilyPadSinkDepth(elapsed))) {
      elapsed += FRAME_SECONDS
    }

    expect(elapsed).toBeLessThan(LILY_PAD_SINK_DELAY + 3)
  })
})

describe('苔石打滑', () => {
  it('打滑距離隨時間單調增加並收斂到定值', () => {
    expect(getMossSlideOffset(0)).toBeCloseTo(0)

    let previous = 0
    for (let elapsed = 0.05; elapsed <= 2; elapsed += 0.05) {
      const offset = getMossSlideOffset(elapsed)
      expect(offset).toBeGreaterThan(previous)
      previous = offset
    }

    expect(getMossSlideOffset(10)).toBeCloseTo(MOSS_SLIDE_SPEED / MOSS_SLIDE_DECAY, 4)
  })

  it('解析解與幀率無關，粗細幀切分結果一致', () => {
    expect(getMossSlideOffset(0.5)).toBeCloseTo(getMossSlideOffset(0.5), 10)
    expect(getMossSlideOffset(0.25) + (getMossSlideOffset(0.5) - getMossSlideOffset(0.25)))
      .toBeCloseTo(getMossSlideOffset(0.5), 10)
  })
})

describe('擠壓彈簧', () => {
  it('蓄力力道越滿蹲得越低', () => {
    expect(getCrouchSquashTarget(0)).toBeCloseTo(1)
    expect(getCrouchSquashTarget(1)).toBeLessThan(getCrouchSquashTarget(0.5))
    expect(getCrouchSquashTarget(0.5)).toBeLessThan(1)
  })

  it('目標壓低後彈簧會趨近該目標', () => {
    const spring = createSquashSpring()
    spring.setTarget(0.8)
    for (let frame = 0; frame < 120; frame++) {
      spring.advance(FRAME_SECONDS)
    }

    expect(spring.getValue()).toBeCloseTo(0.8, 2)
  })

  it('落地衝擊會先壓扁再過衝回彈，最後收斂回原形', () => {
    const spring = createSquashSpring()
    spring.applyImpulse(-0.18)

    let minValue = 1
    let maxValue = 1
    for (let frame = 0; frame < 240; frame++) {
      const value = spring.advance(FRAME_SECONDS)
      minValue = Math.min(minValue, value)
      maxValue = Math.max(maxValue, value)
    }

    expect(minValue).toBeLessThan(0.92)
    expect(maxValue).toBeGreaterThan(1.01)
    expect(spring.getValue()).toBeCloseTo(1, 2)
  })

  it('大 delta 分段積分不會發散', () => {
    const spring = createSquashSpring()
    spring.applyImpulse(-0.2)
    for (let step = 0; step < 20; step++) {
      spring.advance(0.5)
    }

    expect(Number.isFinite(spring.getValue())).toBe(true)
    expect(spring.getValue()).toBeCloseTo(1, 3)
  })

  it('reset 會清掉殘餘的擠壓與速度', () => {
    const spring = createSquashSpring()
    spring.applyImpulse(-0.3)
    spring.advance(0.02)
    spring.reset()

    expect(spring.getValue()).toBe(1)
    expect(spring.advance(FRAME_SECONDS)).toBeCloseTo(1, 6)
  })
})
