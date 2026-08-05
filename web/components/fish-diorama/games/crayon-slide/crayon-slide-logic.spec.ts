import type { CanyonHazardSpec, SegmentCollider } from './crayon-slide-logic'
import { describe, expect, it } from 'vitest'
import {
  CANYON_HALF_WIDTH,
  chainCanyonSegment,
  createCrayonInk,
  createDepthTracker,
  createNearMissWatcher,
  detectCircleContact,
  findCrossedMilestone,
  findHazardContact,
  FISH_GRAVITY_Y,
  FISH_HORIZONTAL_DAMPING,
  FISH_MAX_FALL_SPEED,
  FISH_MAX_SPEED,
  FISH_RADIUS,
  FISH_RESTITUTION,
  FISH_START_FALL_SPEED,
  FISH_TANGENT_RETENTION,
  generateCanyonSegmentShape,
  getCanyonExitPathX,
  getCanyonPathX,
  getClosestPointOnSegment,
  getFallSpeedLimit,
  getSegmentDifficulty,
  solveCircleAgainstSegmentList,
  stepFallbackFish,
} from './crayon-slide-logic'

const FRAME_SECONDS = 1 / 60

function createGroundCollider(
  startX: number,
  endX: number,
  y: number,
  isCrayon = false,
): SegmentCollider {
  return { startX, startY: y, endX, endY: y, halfThickness: 0.4, isCrayon }
}

function stepFallbackFrames(
  body: Parameters<typeof stepFallbackFish>[0],
  colliderList: SegmentCollider[],
  frameCount: number,
) {
  let lastResult = stepFallbackFish(body, colliderList, {
    deltaSeconds: FRAME_SECONDS,
    gravityY: FISH_GRAVITY_Y,
    maxFallSpeed: FISH_MAX_FALL_SPEED,
    horizontalDamping: FISH_HORIZONTAL_DAMPING,
    maxSpeed: FISH_MAX_SPEED,
    restitution: FISH_RESTITUTION,
    tangentRetention: FISH_TANGENT_RETENTION,
  })
  for (let index = 1; index < frameCount; index++) {
    lastResult = stepFallbackFish(body, colliderList, {
      deltaSeconds: FRAME_SECONDS,
      gravityY: FISH_GRAVITY_Y,
      maxFallSpeed: FISH_MAX_FALL_SPEED,
      horizontalDamping: FISH_HORIZONTAL_DAMPING,
      maxSpeed: FISH_MAX_SPEED,
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })
  }
  return lastResult
}

describe('峽谷段落生成', () => {
  it('同一段落序號永遠生成一模一樣的地形', () => {
    const first = generateCanyonSegmentShape(7)
    const second = generateCanyonSegmentShape(7)

    expect(second).toEqual(first)
  })

  it('不同段落序號生成不同地形', () => {
    const first = generateCanyonSegmentShape(3)
    const second = generateCanyonSegmentShape(4)

    expect(second.height).not.toBe(first.height)
  })

  it('教學段沒有任何障礙與層架', () => {
    for (const index of [0, 1]) {
      const shape = generateCanyonSegmentShape(index)
      expect(shape.hazardList).toHaveLength(0)
      expect(shape.shelfList).toHaveLength(0)
    }
  })

  it('教學段之後每段至少有一個障礙', () => {
    let totalHazardCount = 0
    for (let index = 2; index < 30; index++) {
      totalHazardCount += generateCanyonSegmentShape(index).hazardList.length
    }
    expect(totalHazardCount).toBeGreaterThan(20)
  })

  it('難度隨段落序號遞增並在上限飽和', () => {
    expect(getSegmentDifficulty(0)).toBe(0)
    expect(getSegmentDifficulty(13)).toBeCloseTo(0.5)
    expect(getSegmentDifficulty(26)).toBe(1)
    expect(getSegmentDifficulty(999)).toBe(1)
  })

  it('終端速度從開場緩速隨深度爬升到上限', () => {
    expect(getFallSpeedLimit(0)).toBe(FISH_START_FALL_SPEED)
    expect(getFallSpeedLimit(70)).toBeCloseTo((FISH_START_FALL_SPEED + FISH_MAX_FALL_SPEED) / 2)
    expect(getFallSpeedLimit(140)).toBe(FISH_MAX_FALL_SPEED)
    expect(getFallSpeedLimit(9999)).toBe(FISH_MAX_FALL_SPEED)
  })

  it('後段的安全通道比前段窄、障礙比前段多', () => {
    function measureAverage(fromIndex: number, count: number) {
      let totalCorridor = 0
      let totalHazard = 0
      for (let offset = 0; offset < count; offset++) {
        const shape = generateCanyonSegmentShape(fromIndex + offset)
        totalCorridor += shape.corridorHalfWidth
        totalHazard += shape.hazardList.length
      }
      return { corridorHalfWidth: totalCorridor / count, hazardCount: totalHazard / count }
    }

    const early = measureAverage(2, 6)
    const late = measureAverage(24, 6)

    expect(late.corridorHalfWidth).toBeLessThan(early.corridorHalfWidth)
    expect(late.hazardCount).toBeGreaterThan(early.hazardCount)
  })

  it('安全通道跨段連續：本段入口等於上一段出口', () => {
    for (let index = 1; index < 20; index++) {
      const previous = generateCanyonSegmentShape(index - 1)
      const current = generateCanyonSegmentShape(index)
      expect(current.entryPathX).toBeCloseTo(previous.exitPathX)
      expect(current.entryPathX).toBeCloseTo(getCanyonExitPathX(index - 1))
    }
  })

  it('沿中線直直下落不是安全路線：夠多段落的中央有障礙', () => {
    // 通道甩離中線時，海膽要跟著佔住中央；否則玩家掛機直落就能無傷
    let blockedSegmentCount = 0
    for (let index = 2; index < 40; index++) {
      const shape = generateCanyonSegmentShape(index)
      const hasCenterHazard = shape.hazardList.some(
        (hazard) => Math.abs(hazard.x) < hazard.radius + FISH_RADIUS,
      )
      if (hasCenterHazard) {
        blockedSegmentCount += 1
      }
    }
    expect(blockedSegmentCount).toBeGreaterThanOrEqual(10)
  })

  it('公平性保證：致命圓永遠不侵入安全通道', () => {
    for (let index = 0; index < 40; index++) {
      const shape = generateCanyonSegmentShape(index)
      for (const hazard of shape.hazardList) {
        const pathX = getCanyonPathX(shape, -hazard.y)
        const clearance = Math.abs(hazard.x - pathX) - hazard.radius
        expect(clearance).toBeGreaterThanOrEqual(shape.corridorHalfWidth - 1e-6)
      }
    }
  })

  it('障礙全部落在峽谷內側', () => {
    for (let index = 0; index < 40; index++) {
      const shape = generateCanyonSegmentShape(index)
      for (const hazard of shape.hazardList) {
        expect(Math.abs(hazard.x)).toBeLessThanOrEqual(CANYON_HALF_WIDTH)
        expect(hazard.y).toBeLessThan(0)
        expect(hazard.y).toBeGreaterThan(-shape.height)
      }
    }
  })

  it('層架自牆面往內伸且尾端下垂', () => {
    for (let index = 2; index < 40; index++) {
      for (const shelf of generateCanyonSegmentShape(index).shelfList) {
        expect(Math.abs(shelf.startX)).toBeCloseTo(CANYON_HALF_WIDTH)
        expect(Math.abs(shelf.endX)).toBeLessThan(CANYON_HALF_WIDTH)
        expect(shelf.endY).toBeLessThan(shelf.startY)
      }
    }
  })

  it('段落串接後 y 整體平移，底端即下一段頂端', () => {
    const chained = chainCanyonSegment(5, -100)
    const shape = generateCanyonSegmentShape(5)

    expect(chained.topY).toBe(-100)
    expect(chained.bottomY).toBeCloseTo(-100 - shape.height)
    for (const [hazardIndex, hazard] of chained.hazardList.entries()) {
      expect(hazard.y).toBeCloseTo(shape.hazardList[hazardIndex]!.y - 100)
      expect(hazard.x).toBeCloseTo(shape.hazardList[hazardIndex]!.x)
    }
  })

  it('通道中心在段落內平滑過渡，端點吻合入出口', () => {
    const shape = generateCanyonSegmentShape(9)

    expect(getCanyonPathX(shape, 0)).toBeCloseTo(shape.entryPathX)
    expect(getCanyonPathX(shape, shape.height)).toBeCloseTo(shape.exitPathX)
    const middle = getCanyonPathX(shape, shape.height / 2)
    expect(middle).toBeCloseTo((shape.entryPathX + shape.exitPathX) / 2)
  })
})

describe('致命判定', () => {
  const urchin: CanyonHazardSpec = { kind: 'urchin', x: 2, y: -10, radius: 0.85, wallSide: 0 }

  it('圓心距離小於半徑和（扣除緩衝）才算碰到', () => {
    const touching = findHazardContact({ x: 2, y: -10.9, radius: FISH_RADIUS }, [urchin])
    const missing = findHazardContact({ x: 2, y: -11.4, radius: FISH_RADIUS }, [urchin])

    expect(touching).toBe(urchin)
    expect(missing).toBe(null)
  })

  it('緩衝讓貼著刺尖擦過不算死', () => {
    // 距離正好等於半徑和：無緩衝時算碰撞，有緩衝時不算
    const body = { x: 2, y: -10 + FISH_RADIUS + 0.85 - 0.05, radius: FISH_RADIUS }

    expect(findHazardContact(body, [urchin], 0)).toBe(urchin)
    expect(findHazardContact(body, [urchin], 0.12)).toBe(null)
  })

  describe('牆刺的膠囊判定', () => {
    // 刺尖在 x = 3.5、根部在牆面：撐著刺的岩瘤佔掉中間那一段
    const spike: CanyonHazardSpec = {
      kind: 'wallSpike',
      x: 3.5,
      y: -10,
      radius: 0.5,
      baseX: CANYON_HALF_WIDTH,
      wallSide: 1,
    }

    it('撞在刺尖與岩瘤之間都算死', () => {
      const atTip = findHazardContact({ x: 3.5, y: -10, radius: FISH_RADIUS }, [spike])
      const atBase = findHazardContact({ x: 4.6, y: -10, radius: FISH_RADIUS }, [spike])
      const atWall = findHazardContact({ x: CANYON_HALF_WIDTH, y: -10, radius: FISH_RADIUS }, [spike])

      expect(atTip).toBe(spike)
      expect(atBase).toBe(spike)
      expect(atWall).toBe(spike)
    })

    it('通道那一側的邊界仍是刺尖，膠囊不會往通道多長一截', () => {
      const beyondTip = findHazardContact({ x: 2.4, y: -10, radius: FISH_RADIUS }, [spike])

      expect(beyondTip).toBe(null)
    })

    it('沒有 baseX 的障礙維持原本的圓對圓', () => {
      const besideUrchin = findHazardContact({ x: 3.5, y: -10, radius: FISH_RADIUS }, [urchin])

      expect(besideUrchin).toBe(null)
    })
  })
})

describe('蠟筆存量', () => {
  function createInk() {
    return createCrayonInk({ capacity: 18, refillPerSecond: 3, minimumDrawLength: 0.3 })
  }

  it('消耗會等量扣除存量', () => {
    const ink = createInk()

    expect(ink.consume(5)).toBe(5)
    expect(ink.getRemaining()).toBe(13)
    expect(ink.getRatio()).toBeCloseTo(13 / 18)
  })

  it('要求超過存量時截短為剩餘量，且存量不會變負', () => {
    const ink = createInk()
    ink.consume(17.9)

    expect(ink.consume(5)).toBeCloseTo(0.1)
    expect(ink.getRemaining()).toBeCloseTo(0)
  })

  it('存量低於最低畫線長度時不能再畫', () => {
    const ink = createInk()
    ink.consume(17.8)

    expect(ink.canDraw()).toBe(false)
  })

  it('存量以固定速率回充且不超過上限', () => {
    const ink = createInk()
    ink.consume(18)

    ink.refill(2)
    expect(ink.getRemaining()).toBeCloseTo(6)

    ink.refill(100)
    expect(ink.getRemaining()).toBe(18)
    expect(ink.getRatio()).toBe(1)
  })

  it('擦線退還的存量會補回但不超過上限', () => {
    const ink = createInk()
    ink.consume(10)

    ink.restore(4)
    expect(ink.getRemaining()).toBeCloseTo(12)

    ink.restore(100)
    expect(ink.getRemaining()).toBe(18)
  })
})

describe('線段最近點', () => {
  it('投影落在線段內時取垂足', () => {
    const point = getClosestPointOnSegment(0, 0, 10, 0, 3, 5)

    expect(point.x).toBeCloseTo(3)
    expect(point.y).toBeCloseTo(0)
  })

  it('投影落在線段外時夾到端點', () => {
    expect(getClosestPointOnSegment(0, 0, 10, 0, -4, 1).x).toBeCloseTo(0)
    expect(getClosestPointOnSegment(0, 0, 10, 0, 40, 1).x).toBeCloseTo(10)
  })

  it('退化成一點的線段回傳該點', () => {
    const point = getClosestPointOnSegment(2, 3, 2, 3, 9, 9)

    expect(point.x).toBe(2)
    expect(point.y).toBe(3)
  })
})

describe('圓對線段碰撞解算', () => {
  it('沒有重疊時不動位置也不動速度', () => {
    const body = { x: 0, y: 10, velocityX: 4, velocityY: -3, radius: FISH_RADIUS }
    const result = solveCircleAgainstSegmentList(body, [createGroundCollider(-10, 10, 0)], {
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })

    expect(result.contactCount).toBe(0)
    expect(result.isGrounded).toBe(false)
    expect(body.y).toBe(10)
    expect(body.velocityY).toBe(-3)
  })

  it('陷入水平線段時被推到表面上並停止下墜', () => {
    const collider = createGroundCollider(-10, 10, 0)
    const body = { x: 0, y: 0.6, velocityX: 5, velocityY: -8, radius: FISH_RADIUS }

    const result = solveCircleAgainstSegmentList(body, [collider], {
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })

    expect(result.isGrounded).toBe(true)
    expect(body.y).toBeCloseTo(FISH_RADIUS + collider.halfThickness)
    expect(body.velocityY).toBeGreaterThanOrEqual(0)
    // 切向速度幾乎完整保留，滑道才滑得動
    expect(body.velocityX).toBeGreaterThan(4.9)
  })

  it('踩在蠟筆線上時回報 isOnCrayon', () => {
    const body = { x: 0, y: 0.6, velocityX: 3, velocityY: -4, radius: FISH_RADIUS }
    const result = solveCircleAgainstSegmentList(body, [createGroundCollider(-5, 5, 0, true)], {
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })

    expect(result.isGrounded).toBe(true)
    expect(result.isOnCrayon).toBe(true)
  })

  it('撞上垂直牆面時只反彈水平速度，不算著地', () => {
    const wall: SegmentCollider = {
      startX: 0,
      startY: -5,
      endX: 0,
      endY: 5,
      halfThickness: 0.2,
      isCrayon: false,
    }
    const body = { x: -0.6, y: 0, velocityX: 10, velocityY: 0, radius: FISH_RADIUS }

    const result = solveCircleAgainstSegmentList(body, [wall], {
      restitution: FISH_RESTITUTION,
      tangentRetention: FISH_TANGENT_RETENTION,
    })

    expect(result.contactCount).toBeGreaterThan(0)
    expect(result.isGrounded).toBe(false)
    expect(body.velocityX).toBeLessThanOrEqual(0)
  })
})

describe('無物理降級的運動步進', () => {
  it('自由下落收斂在終端速度，不會無限加速', () => {
    const body = { x: 0, y: 0, velocityX: 0, velocityY: 0, radius: FISH_RADIUS }

    stepFallbackFrames(body, [], 180)

    expect(body.velocityY).toBeCloseTo(-FISH_MAX_FALL_SPEED, 5)
    expect(body.y).toBeLessThan(-20)
  })

  it('斜的蠟筆線會把下落的魚導向側邊', () => {
    // 一條往右下斜的線接住正下方落下的魚
    const slope: SegmentCollider = {
      startX: -3,
      startY: -2,
      endX: 6,
      endY: -6,
      halfThickness: 0.13,
      isCrayon: true,
    }
    const body = { x: 0, y: 2, velocityX: 0, velocityY: 0, radius: FISH_RADIUS }

    const result = stepFallbackFrames(body, [slope], 90)

    expect(result.isOnCrayon).toBe(true)
    expect(body.velocityX).toBeGreaterThan(2)
    expect(body.x).toBeGreaterThan(1)
  })

  it('橫向速度會被阻尼收斂，不會永遠飄移', () => {
    const body = { x: 0, y: 0, velocityX: 8, velocityY: 0, radius: FISH_RADIUS }

    // 300 幀 = 5 秒，理論衰減到 8 × e^(-0.55×5) ≈ 0.5
    stepFallbackFrames(body, [], 300)

    expect(Math.abs(body.velocityX)).toBeLessThan(8 * Math.exp(-FISH_HORIZONTAL_DAMPING * 4.5))
  })

  it('峽谷牆擋住橫向衝出去的魚', () => {
    const wall: SegmentCollider = {
      startX: 6.35,
      startY: -50,
      endX: 6.35,
      endY: 10,
      halfThickness: 0.85,
      isCrayon: false,
    }
    const body = { x: 0, y: 0, velocityX: 20, velocityY: 0, radius: FISH_RADIUS }

    stepFallbackFrames(body, [wall], 120)

    expect(body.x).toBeLessThanOrEqual(6.35 - 0.85 - FISH_RADIUS + 1e-6)
  })

  it('長斜坡不會把速度加到超過上限', () => {
    const slope: SegmentCollider = {
      startX: -5,
      startY: 0,
      endX: 400,
      endY: -300,
      halfThickness: 0.4,
      isCrayon: false,
    }
    const body = { x: 0, y: 1, velocityX: 0, velocityY: 0, radius: FISH_RADIUS }

    stepFallbackFrames(body, [slope], 600)

    expect(Math.abs(body.velocityX)).toBeLessThanOrEqual(FISH_MAX_SPEED + 1e-6)
    expect(Math.abs(body.velocityY)).toBeLessThanOrEqual(FISH_MAX_SPEED + 1e-6)
  })
})

describe('接觸偵測', () => {
  it('容差內視為接觸，容差外不算', () => {
    const colliderList = [createGroundCollider(-5, 5, 0, true)]
    const near = detectCircleContact({ x: 0, y: 1, radius: FISH_RADIUS }, colliderList, 0.1)
    const far = detectCircleContact({ x: 0, y: 3, radius: FISH_RADIUS }, colliderList, 0.1)

    expect(near.isGrounded).toBe(true)
    expect(near.isOnCrayon).toBe(true)
    expect(far.isGrounded).toBe(false)
    expect(far.isOnCrayon).toBe(false)
  })
})

describe('深度計分與結束判定', () => {
  function createTracker() {
    return createDepthTracker({ startY: 0, stallLimitSeconds: 6, stallProgressThreshold: 0.5 })
  }

  it('分數為最深下潛深度取整，且只在整數變動時回報', () => {
    const tracker = createTracker()

    const first = tracker.update({ deltaSeconds: FRAME_SECONDS, fishY: -0.4 })
    expect(first.score).toBe(0)
    expect(first.hasScoreChanged).toBe(false)

    const second = tracker.update({ deltaSeconds: FRAME_SECONDS, fishY: -9.7 })
    expect(second.score).toBe(9)
    expect(second.hasScoreChanged).toBe(true)

    const third = tracker.update({ deltaSeconds: FRAME_SECONDS, fishY: -9.8 })
    expect(third.hasScoreChanged).toBe(false)
  })

  it('被彈回上方不會扣分，分數採最深紀錄', () => {
    const tracker = createTracker()
    tracker.update({ deltaSeconds: FRAME_SECONDS, fishY: -40 })
    const frame = tracker.update({ deltaSeconds: FRAME_SECONDS, fishY: -20 })

    expect(frame.score).toBe(40)
  })

  it('停滯超過時限判定為卡住', () => {
    const tracker = createTracker()
    tracker.update({ deltaSeconds: 1, fishY: -10 })

    // 之後只在原地微幅晃動，累積時間超過 6 秒才判定
    let frame = tracker.update({ deltaSeconds: 5.5, fishY: -10.2 })
    expect(frame.endReason).toBe(null)

    frame = tracker.update({ deltaSeconds: 1, fishY: -10.3 })
    expect(frame.endReason).toBe('stalled')
  })

  it('持續下潛時停滯計時歸零，不會誤判', () => {
    const tracker = createTracker()
    let frame = { stallSeconds: 0, endReason: null as string | null }
    for (let index = 0; index < 20; index++) {
      frame = tracker.update({ deltaSeconds: 0.5, fishY: -index * 5 })
    }

    expect(frame.endReason).toBe(null)
    expect(frame.stallSeconds).toBe(0)
  })

  it('被彈回上方後重新下落，即使未破最深紀錄也不算卡住', () => {
    const tracker = createTracker()
    // 先潛到 -50，被彈回 -30
    tracker.update({ deltaSeconds: 1, fishY: -50 })
    tracker.update({ deltaSeconds: 1, fishY: -30 })

    // 從 -30 慢慢重新下落：一直沒破 -50 的紀錄，但明明在動
    let frame = { stallSeconds: 0, endReason: null as string | null, score: 0 }
    for (let index = 0; index < 14; index++) {
      frame = tracker.update({ deltaSeconds: 1, fishY: -30 - index * 1.2 })
    }

    expect(frame.endReason).toBe(null)
    expect(frame.stallSeconds).toBe(0)
    // 分數仍照最深紀錄算
    expect(frame.score).toBe(50)
  })

  it('玩家持續輸入時原地不動也不算卡住', () => {
    const tracker = createTracker()
    let frame = { stallSeconds: 0, endReason: null as string | null }
    for (let index = 0; index < 20; index++) {
      frame = tracker.update({ deltaSeconds: 1, fishY: -10, hasRecentInput: true })
    }

    expect(frame.endReason).toBe(null)
    expect(frame.stallSeconds).toBe(0)
  })
})

describe('擦身判定', () => {
  const urchin: CanyonHazardSpec = { kind: 'urchin', x: 1, y: -10, radius: 0.85, wallSide: 0 }

  function createWatcher() {
    return createNearMissWatcher({ triggerClearance: 0.8, passMargin: 1.2 })
  }

  it('貼著海膽通過後，在潛過它下方時觸發一次', () => {
    const watcher = createWatcher()
    const hazardList = [urchin]

    // 貼著邊緣（淨空約 0.1）經過
    expect(watcher.update({ fishX: 1, fishY: -8.5, fishRadius: FISH_RADIUS, hazardList })).toBe(false)
    expect(watcher.update({ fishX: 2.5, fishY: -10, fishRadius: FISH_RADIUS, hazardList })).toBe(false)
    expect(watcher.update({ fishX: 1, fishY: -11.5, fishRadius: FISH_RADIUS, hazardList })).toBe(true)
    // 同一顆不會重複觸發
    expect(watcher.update({ fishX: 1, fishY: -12, fishRadius: FISH_RADIUS, hazardList })).toBe(false)
  })

  it('離得遠遠通過不觸發', () => {
    const watcher = createWatcher()
    const hazardList = [urchin]

    watcher.update({ fishX: -4, fishY: -9, fishRadius: FISH_RADIUS, hazardList })
    watcher.update({ fishX: -4, fishY: -10, fishRadius: FISH_RADIUS, hazardList })
    expect(watcher.update({ fishX: -4, fishY: -12, fishRadius: FISH_RADIUS, hazardList })).toBe(false)
  })

  it('真的撞上（淨空為負）不算擦身', () => {
    const watcher = createWatcher()
    const hazardList = [urchin]

    watcher.update({ fishX: 1, fishY: -10.5, fishRadius: FISH_RADIUS, hazardList })
    expect(watcher.update({ fishX: 1, fishY: -12, fishRadius: FISH_RADIUS, hazardList })).toBe(false)
  })
})

describe('里程碑判定', () => {
  it('跨過整數倍門檻時回傳該里程碑', () => {
    expect(findCrossedMilestone(49, 50, 50)).toBe(50)
    expect(findCrossedMilestone(99, 102, 50)).toBe(100)
  })

  it('未跨過或原地不動時回傳 null', () => {
    expect(findCrossedMilestone(50, 60, 50)).toBe(null)
    expect(findCrossedMilestone(0, 10, 50)).toBe(null)
    expect(findCrossedMilestone(0, 0, 50)).toBe(null)
  })
})
