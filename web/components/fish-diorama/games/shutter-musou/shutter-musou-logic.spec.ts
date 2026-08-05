import { describe, expect, it } from 'vitest'
import { createRandomGenerator } from '../../shared/random-generator'
import {
  advanceBattery,
  advanceInvulnerable,
  advanceMusouGauge,
  applyContactDamage,
  ARENA_RADIUS,
  BATTERY_CAPACITY,
  canFireShutter,
  capChargeRatioByBattery,
  CHARGE_FULL_SECONDS,
  COMPOSURE_MAX,
  computeFlashCone,
  dampAngle,
  ENEMY_STATS_MAP,
  evaluatePhotoGrade,
  getChargeRatio,
  getEnemyWeightList,
  getFacingHeading,
  getGroupBonusMultiplier,
  getMusouGaugeGain,
  getShutterCost,
  getSpawnBatchCount,
  getSpawnIntervalSeconds,
  INITIAL_COMPOSURE_STATE,
  isDefeated,
  isMusouReady,
  isTargetInCone,
  isVulnerable,
  MAX_CONE_HALF_ANGLE,
  MAX_CONE_RANGE,
  MAX_SHUTTER_COST,
  MIN_CONE_HALF_ANGLE,
  MIN_CONE_RANGE,
  MIN_SHUTTER_COST,
  MUSOU_GAUGE_MAX,
  MUSOU_ULTIMATE_CONE,
  normalizeAngle,
  pickEnemyKind,
  resolveAimDirection,
  resolveSpawnPosition,
  SPAWN_RING_RADIUS,
} from './shutter-musou-logic'

describe('瞄準方向', () => {
  it('指標在畫面中心時不改變朝向', () => {
    const aim = resolveAimDirection(0.5, 0.5, 1)
    expect(aim.hasDirection).toBe(false)
  })

  it('指標在右側就朝 +X', () => {
    const aim = resolveAimDirection(0.9, 0.5, 1)
    expect(aim.hasDirection).toBe(true)
    expect(aim.directionX).toBeCloseTo(1)
    expect(aim.directionZ).toBeCloseTo(0)
  })

  it('指標在下方是朝鏡頭走，對應世界的 -Z', () => {
    const aim = resolveAimDirection(0.5, 0.9, 1)
    expect(aim.directionZ).toBeCloseTo(-1)
  })

  it('指標在上方是往畫面深處，對應世界的 +Z', () => {
    const aim = resolveAimDirection(0.5, 0.1, 1)
    expect(aim.directionZ).toBeCloseTo(1)
  })

  it('回傳的一律是單位向量', () => {
    for (const [x, y] of [[0.8, 0.2], [0.1, 0.7], [0.95, 0.95]] as const) {
      const aim = resolveAimDirection(x, y, 1.7)
      expect(Math.hypot(aim.directionX, aim.directionZ)).toBeCloseTo(1)
    }
  })

  it('寬螢幕上的斜角不會被拉扁', () => {
    // 寬高比 2 時，水平偏移 0.1（寬度比例）等同垂直 0.2（高度比例），
    // 換算正確的話這個位置剛好是 45 度
    const aim = resolveAimDirection(0.5 + 0.1, 0.5 - 0.2, 2)
    expect(aim.directionX).toBeCloseTo(Math.SQRT1_2)
    expect(aim.directionZ).toBeCloseTo(Math.SQRT1_2)
  })

  it('繞畫面一圈的指標位置會掃過完整的 360 度', () => {
    const angleList = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2
      const aim = resolveAimDirection(0.5 + Math.cos(angle) * 0.4, 0.5 - Math.sin(angle) * 0.4, 1)
      return Math.atan2(aim.directionZ, aim.directionX)
    })
    // 每一格都該推進約 45 度，方向不重複也不跳號
    for (let index = 1; index < angleList.length; index++) {
      const step = normalizeAngle(angleList[index]! - angleList[index - 1]!)
      expect(step).toBeCloseTo(Math.PI / 4, 4)
    }
  })
})

describe('朝向與角度插值', () => {
  it('鱈魚是 +Z 朝前，朝向角用 atan2(x, z)', () => {
    expect(getFacingHeading(0, 1)).toBeCloseTo(0)
    expect(getFacingHeading(1, 0)).toBeCloseTo(Math.PI / 2)
    expect(getFacingHeading(0, -1)).toBeCloseTo(Math.PI)
  })

  it('過 ±π 交界走最短路徑，不會整圈亂轉', () => {
    // 從 +170 度轉到 -170 度，最短路徑只有 20 度
    const current = Math.PI * 0.944
    const target = -Math.PI * 0.944
    const next = dampAngle(current, target, 14, 1 / 60)
    // 走短路的話角度會繼續變大（越過 π 再從負值那側回來），絕不會往回掉
    expect(normalizeAngle(next - current)).toBeGreaterThan(0)
    expect(Math.abs(normalizeAngle(next - current))).toBeLessThan(0.2)
  })

  it('角度插值會逐步收斂到目標', () => {
    let heading = 0
    for (let step = 0; step < 200; step++) {
      heading = dampAngle(heading, 2, 14, 1 / 60)
    }
    expect(normalizeAngle(heading - 2)).toBeCloseTo(0, 3)
  })

  it('已經在目標角度時不會抖動', () => {
    expect(dampAngle(1.2, 1.2, 14, 1 / 60)).toBeCloseTo(1.2)
  })
})

describe('蓄力與扇形', () => {
  it('蓄力比例隨時間增加並在滿值封頂', () => {
    expect(getChargeRatio(0)).toBe(0)
    expect(getChargeRatio(CHARGE_FULL_SECONDS / 2)).toBeCloseTo(0.5)
    expect(getChargeRatio(CHARGE_FULL_SECONDS * 5)).toBe(1)
  })

  it('輕點是窄而近的扇形', () => {
    const cone = computeFlashCone(0)
    expect(cone.halfAngleRadians).toBeCloseTo(MIN_CONE_HALF_ANGLE)
    expect(cone.range).toBeCloseTo(MIN_CONE_RANGE)
  })

  it('蓄滿同時放大角度與射程', () => {
    const cone = computeFlashCone(1)
    expect(cone.halfAngleRadians).toBeCloseTo(MAX_CONE_HALF_ANGLE)
    expect(cone.range).toBeCloseTo(MAX_CONE_RANGE)
  })

  it('角度與射程都隨蓄力單調變大', () => {
    let previousAngle = -1
    let previousRange = -1
    for (let step = 0; step <= 10; step++) {
      const cone = computeFlashCone(step / 10)
      expect(cone.halfAngleRadians).toBeGreaterThan(previousAngle)
      expect(cone.range).toBeGreaterThan(previousRange)
      previousAngle = cone.halfAngleRadians
      previousRange = cone.range
    }
  })
})

describe('角度正規化', () => {
  it('超過一圈的角度收斂回 -π ~ π', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI)
    expect(normalizeAngle(0.5)).toBeCloseTo(0.5)
  })
})

describe('入鏡判定', () => {
  const cone = computeFlashCone(0.5)

  it('正前方射程內的目標會被拍到', () => {
    expect(isTargetInCone(0, 0, 0, cone, cone.range * 0.6, 0, 0.3)).toBe(true)
  })

  it('正前方但超出射程的目標拍不到', () => {
    expect(isTargetInCone(0, 0, 0, cone, cone.range + 2, 0, 0.3)).toBe(false)
  })

  it('背後的目標拍不到', () => {
    expect(isTargetInCone(0, 0, 0, cone, -3, 0, 0.3)).toBe(false)
  })

  it('貼在臉上的目標一律算中，不會因為距離趨近零而漏判', () => {
    expect(isTargetInCone(0, 0, 0, cone, 0.01, 0.01, 0.4)).toBe(true)
  })

  it('身體半徑讓擦到扇形邊緣的大目標也算拍到', () => {
    // 角度剛好落在扇形外一點點，中心點判定會漏掉
    const distance = 4
    const justOutsideAngle = cone.halfAngleRadians + 0.05
    const targetX = Math.cos(justOutsideAngle) * distance
    const targetZ = Math.sin(justOutsideAngle) * distance
    expect(isTargetInCone(0, 0, 0, cone, targetX, targetZ, 0.05)).toBe(false)
    expect(isTargetInCone(0, 0, 0, cone, targetX, targetZ, 1.2)).toBe(true)
  })

  it('判定跟著瞄準方向轉，不是永遠朝 +X', () => {
    const behindOrigin = { x: -4, z: 0 }
    expect(isTargetInCone(0, 0, 0, cone, behindOrigin.x, behindOrigin.z, 0.3)).toBe(false)
    expect(isTargetInCone(0, 0, Math.PI, cone, behindOrigin.x, behindOrigin.z, 0.3)).toBe(true)
  })

  it('起點不在原點時判定仍正確', () => {
    expect(isTargetInCone(5, 5, 0, cone, 5 + cone.range * 0.5, 5, 0.3)).toBe(true)
    expect(isTargetInCone(5, 5, 0, cone, 5 - cone.range * 0.5, 5, 0.3)).toBe(false)
  })
})

describe('電量', () => {
  it('蓄得越滿越耗電', () => {
    expect(getShutterCost(0)).toBeCloseTo(MIN_SHUTTER_COST)
    expect(getShutterCost(1)).toBeCloseTo(MAX_SHUTTER_COST)
    expect(getShutterCost(0.5)).toBeGreaterThan(getShutterCost(0.2))
  })

  it('電量不足時把蓄力壓到付得起的程度，而不是完全按不出來', () => {
    const affordable = capChargeRatioByBattery(1, (MIN_SHUTTER_COST + MAX_SHUTTER_COST) / 2)
    expect(affordable).toBeGreaterThan(0)
    expect(affordable).toBeLessThan(1)
    expect(getShutterCost(affordable)).toBeLessThanOrEqual((MIN_SHUTTER_COST + MAX_SHUTTER_COST) / 2 + 1e-6)
  })

  it('電量足夠時不壓縮蓄力', () => {
    expect(capChargeRatioByBattery(1, BATTERY_CAPACITY)).toBe(1)
  })

  it('電量低於最低消耗就按不出閃光', () => {
    expect(canFireShutter(MIN_SHUTTER_COST - 1)).toBe(false)
    expect(canFireShutter(MIN_SHUTTER_COST)).toBe(true)
    expect(capChargeRatioByBattery(1, MIN_SHUTTER_COST - 1)).toBe(0)
  })

  it('回充不會超過容量', () => {
    expect(advanceBattery(BATTERY_CAPACITY, 10)).toBe(BATTERY_CAPACITY)
    expect(advanceBattery(0, 1)).toBeGreaterThan(0)
  })
})

describe('團體照', () => {
  it('拍到一隻沒有加成', () => {
    expect(getGroupBonusMultiplier(1)).toBe(1)
    expect(getGroupBonusMultiplier(0)).toBe(1)
  })

  it('一張拍到越多倍率越高', () => {
    expect(getGroupBonusMultiplier(4)).toBeGreaterThan(getGroupBonusMultiplier(2))
  })

  it('一次拍六隻比分兩次各拍三隻更划算，玩家才有理由放敵人靠近', () => {
    const together = 6 * getGroupBonusMultiplier(6)
    const separately = 3 * getGroupBonusMultiplier(3) * 2
    expect(together).toBeGreaterThan(separately)
  })
})

describe('無雙必殺', () => {
  it('收服數決定無雙槽累積量，拍越多灌越快', () => {
    expect(getMusouGaugeGain(6)).toBeGreaterThan(getMusouGaugeGain(2))
  })

  it('槽不會溢出上限', () => {
    expect(advanceMusouGauge(MUSOU_GAUGE_MAX, 999)).toBe(MUSOU_GAUGE_MAX)
  })

  it('滿槽才判定必殺就緒', () => {
    expect(isMusouReady(MUSOU_GAUGE_MAX - 1)).toBe(false)
    expect(isMusouReady(MUSOU_GAUGE_MAX)).toBe(true)
  })

  it('必殺範圍是整圈，蓋過擂台加緩衝', () => {
    expect(MUSOU_ULTIMATE_CONE.halfAngleRadians).toBeCloseTo(Math.PI)
    expect(MUSOU_ULTIMATE_CONE.range).toBeGreaterThan(ARENA_RADIUS)
  })
})

describe('鎮定', () => {
  it('開場是滿的且可被撞到', () => {
    expect(INITIAL_COMPOSURE_STATE.composure).toBe(COMPOSURE_MAX)
    expect(isVulnerable(INITIAL_COMPOSURE_STATE)).toBe(true)
  })

  it('被撞到扣一格並進入無敵', () => {
    const damaged = applyContactDamage(INITIAL_COMPOSURE_STATE)
    expect(damaged.composure).toBe(COMPOSURE_MAX - 1)
    expect(isVulnerable(damaged)).toBe(false)
  })

  it('無敵期間再被撞完全不受影響，不會被一群雜兵瞬間清空', () => {
    const damaged = applyContactDamage(INITIAL_COMPOSURE_STATE)
    const again = applyContactDamage(damaged)
    expect(again.composure).toBe(damaged.composure)
  })

  it('無敵時間走完後恢復可被撞到', () => {
    const damaged = applyContactDamage(INITIAL_COMPOSURE_STATE)
    const recovered = advanceInvulnerable(damaged, 99)
    expect(recovered.invulnerableRemainSeconds).toBe(0)
    expect(isVulnerable(recovered)).toBe(true)
  })

  it('鎮定歸零就結束', () => {
    let state = INITIAL_COMPOSURE_STATE
    for (let index = 0; index < COMPOSURE_MAX; index++) {
      state = applyContactDamage({ ...state, invulnerableRemainSeconds: 0 })
    }
    expect(isDefeated(state)).toBe(true)
  })
})

describe('出怪排程', () => {
  it('間隔隨時間縮短並收斂，不會短到無限', () => {
    const early = getSpawnIntervalSeconds(0)
    const middle = getSpawnIntervalSeconds(45)
    const late = getSpawnIntervalSeconds(300)
    expect(middle).toBeLessThan(early)
    expect(late).toBeLessThan(middle)
    expect(late).toBeGreaterThan(0.15)
  })

  it('後期一次生成更多隻', () => {
    expect(getSpawnBatchCount(0)).toBe(1)
    expect(getSpawnBatchCount(120)).toBeGreaterThan(getSpawnBatchCount(10))
  })

  it('開場幾乎只有快跑魚，擋路魚要到後期才登場', () => {
    const earlyWeightMap = new Map(getEnemyWeightList(0).map((entry) => [entry.kind, entry.weight]))
    expect(earlyWeightMap.get('blocker')).toBe(0)
    expect(earlyWeightMap.get('runner')).toBeGreaterThan(earlyWeightMap.get('dasher')!)

    const lateWeightMap = new Map(getEnemyWeightList(200).map((entry) => [entry.kind, entry.weight]))
    expect(lateWeightMap.get('blocker')).toBeGreaterThan(0)
    expect(lateWeightMap.get('runner')).toBeLessThan(earlyWeightMap.get('runner')!)
  })

  it('抽出的種類一定在權重表內', () => {
    const random = createRandomGenerator(1234)
    for (let index = 0; index < 200; index++) {
      const kind = pickEnemyKind(index, random)
      expect(ENEMY_STATS_MAP[kind]).toBeDefined()
    }
  })

  it('同一組種子抽出的序列可重現', () => {
    const firstList = Array.from({ length: 30 }, (_, index) => pickEnemyKind(index, createRandomGenerator(77)))
    const secondList = Array.from({ length: 30 }, (_, index) => pickEnemyKind(index, createRandomGenerator(77)))
    expect(firstList).toEqual(secondList)
  })

  it('生成點落在擂台外，敵人是走進畫面而不是憑空出現在腳邊', () => {
    for (let step = 0; step < 8; step++) {
      const position = resolveSpawnPosition((step / 8) * Math.PI * 2)
      expect(Math.hypot(position.x, position.z)).toBeCloseTo(SPAWN_RING_RADIUS)
      expect(Math.hypot(position.x, position.z)).toBeGreaterThan(ARENA_RADIUS)
    }
  })
})

describe('敵人數值', () => {
  it('判定從寬：撞擊半徑不會明顯超出入鏡半徑，玩家不會被看不見的邊界陰到', () => {
    for (const stats of Object.values(ENEMY_STATS_MAP)) {
      expect(stats.contactRadius).toBeLessThanOrEqual(stats.bodyRadius + 0.15)
    }
  })

  it('頭目最耐拍也最值錢', () => {
    const boss = ENEMY_STATS_MAP.boss
    for (const stats of Object.values(ENEMY_STATS_MAP)) {
      if (stats.kind === 'boss') {
        continue
      }
      expect(boss.captureHitCount).toBeGreaterThan(stats.captureHitCount)
      expect(boss.captureValue).toBeGreaterThan(stats.captureValue)
    }
  })

  it('快跑魚跑最快，補償牠最脆', () => {
    const runner = ENEMY_STATS_MAP.runner
    for (const stats of Object.values(ENEMY_STATS_MAP)) {
      expect(runner.moveSpeed).toBeGreaterThanOrEqual(stats.moveSpeed)
    }
  })
})

describe('照片評價', () => {
  it('空拍是最差、拍到就合格、拍成團體照是優秀', () => {
    expect(evaluatePhotoGrade(0)).toBe('poor')
    expect(evaluatePhotoGrade(1)).toBe('fine')
    expect(evaluatePhotoGrade(8)).toBe('excellent')
  })
})
