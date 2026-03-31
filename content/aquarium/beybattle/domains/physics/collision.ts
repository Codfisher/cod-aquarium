import type { BeybladeState, BeybladeStats } from '../../types'
import { MAX_SPIN_RATE } from './spin-physics'

/** 最小擊退力 */
const MIN_KNOCKBACK = 0.5

/** 每點 critical = 3% 爆擊率 */
const CRITICAL_CHANCE_PER_POINT = 0.03
/** 爆擊倍率 */
const CRITICAL_MULTIPLIER = 2.0

/** 防禦每點減傷 */
const DEFENSE_REDUCTION_PER_POINT = 0.015
/** 減傷上限 */
const MAX_DEFENSE_REDUCTION = 0.35

/** 固定傷害換算（每點碰撞傷害 = N RPM） */
const DAMAGE_TO_RPM = 12
/** 百分比傷害 */
const PERCENT_DAMAGE = 0.04

/** 攻擊方基礎自損 */
const ATTACKER_BASE_SELF_DAMAGE = 20
/** 攻擊方每點 speed 額外自損 */
const ATTACKER_SPEED_SELF_DAMAGE = 3

/** 低轉速時 stamina 額外減傷（每點） */
const LOW_SPIN_STAMINA_REDUCTION_PER_POINT = 0.005
/** 低轉速門檻 */
const LOW_SPIN_THRESHOLD = 0.2

export interface CollisionResult {
  normalX: number;
  normalY: number;
  overlap: number;
}

export function detectCollision(
  stateA: BeybladeState,
  stateB: BeybladeState,
  radiusA: number,
  radiusB: number,
): CollisionResult | null {
  const deltaX = stateB.position.x - stateA.position.x
  const deltaY = stateB.position.y - stateA.position.y
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2)

  const minDistance = radiusA + radiusB

  if (distance >= minDistance || distance < 0.001) {
    return null
  }

  return {
    normalX: deltaX / distance,
    normalY: deltaY / distance,
    overlap: minDistance - distance,
  }
}

export interface CollisionResponse {
  stateA: BeybladeState;
  stateB: BeybladeState;
  criticalA: boolean;
  criticalB: boolean;
}

function rollCritical(criticalStat: number): boolean {
  return Math.random() < criticalStat * CRITICAL_CHANCE_PER_POINT
}

function getMovementSpeed(state: BeybladeState): number {
  return Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2)
}

export function resolveCollision(
  stateA: BeybladeState,
  stateB: BeybladeState,
  statsA: BeybladeStats,
  statsB: BeybladeStats,
  collision: CollisionResult,
): CollisionResponse {
  const newStateA: BeybladeState = {
    position: { ...stateA.position },
    velocity: { ...stateA.velocity },
    spinRate: stateA.spinRate,
    rotationAngle: stateA.rotationAngle,
  }
  const newStateB: BeybladeState = {
    position: { ...stateB.position },
    velocity: { ...stateB.velocity },
    spinRate: stateB.spinRate,
    rotationAngle: stateB.rotationAngle,
  }

  const criticalA = rollCritical(statsA.critical)
  const criticalB = rollCritical(statsB.critical)

  // --- 分離重疊 ---
  const separationHalf = collision.overlap / 2 + 0.01
  newStateA.position.x -= collision.normalX * separationHalf
  newStateA.position.y -= collision.normalY * separationHalf
  newStateB.position.x += collision.normalX * separationHalf
  newStateB.position.y += collision.normalY * separationHalf

  // --- 碰撞傷害計算 ---
  const spinRatioA = stateA.spinRate / MAX_SPIN_RATE
  const spinRatioB = stateB.spinRate / MAX_SPIN_RATE
  const speedA = getMovementSpeed(stateA)
  const speedB = getMovementSpeed(stateB)

  // 基礎傷害 = ATK × 轉速比
  // 動能加成 = 碰撞速度 × SPD × 0.5
  let rawDamageAtoB = statsA.attack * spinRatioA + speedA * statsA.speed * 0.5
  let rawDamageBtoA = statsB.attack * spinRatioB + speedB * statsB.speed * 0.5

  // 爆擊
  if (criticalA) rawDamageAtoB *= CRITICAL_MULTIPLIER
  if (criticalB) rawDamageBtoA *= CRITICAL_MULTIPLIER

  // 擊退力（用於物理推動）
  const knockbackAtoB = Math.max(rawDamageAtoB * 0.4, MIN_KNOCKBACK)
  const knockbackBtoA = Math.max(rawDamageBtoA * 0.4, MIN_KNOCKBACK)

  // --- 施加擊退速度 ---
  newStateB.velocity.x += collision.normalX * knockbackAtoB
  newStateB.velocity.y += collision.normalY * knockbackAtoB
  newStateA.velocity.x -= collision.normalX * knockbackBtoA
  newStateA.velocity.y -= collision.normalY * knockbackBtoA

  // --- 轉速損失 ---
  // 防禦減傷
  let defReductionA = Math.min(statsA.defense * DEFENSE_REDUCTION_PER_POINT, MAX_DEFENSE_REDUCTION)
  let defReductionB = Math.min(statsB.defense * DEFENSE_REDUCTION_PER_POINT, MAX_DEFENSE_REDUCTION)

  // 低轉速時 stamina 額外減傷
  if (spinRatioA < LOW_SPIN_THRESHOLD) {
    defReductionA += statsA.stamina * LOW_SPIN_STAMINA_REDUCTION_PER_POINT
  }
  if (spinRatioB < LOW_SPIN_THRESHOLD) {
    defReductionB += statsB.stamina * LOW_SPIN_STAMINA_REDUCTION_PER_POINT
  }

  // 被擊方損失 = 固定值 + 百分比
  const damageToA = rawDamageBtoA * (1 - defReductionA)
  const damageToB = rawDamageAtoB * (1 - defReductionB)

  const spinLossA = damageToA * DAMAGE_TO_RPM + newStateA.spinRate * PERCENT_DAMAGE
  const spinLossB = damageToB * DAMAGE_TO_RPM + newStateB.spinRate * PERCENT_DAMAGE

  newStateA.spinRate = Math.max(0, newStateA.spinRate - spinLossA)
  newStateB.spinRate = Math.max(0, newStateB.spinRate - spinLossB)

  // 攻擊方自損（高速型更痛）
  const selfDamageA = ATTACKER_BASE_SELF_DAMAGE + statsA.speed * ATTACKER_SPEED_SELF_DAMAGE
  const selfDamageB = ATTACKER_BASE_SELF_DAMAGE + statsB.speed * ATTACKER_SPEED_SELF_DAMAGE

  newStateA.spinRate = Math.max(0, newStateA.spinRate - selfDamageA)
  newStateB.spinRate = Math.max(0, newStateB.spinRate - selfDamageB)

  return {
    stateA: newStateA,
    stateB: newStateB,
    criticalA,
    criticalB,
  }
}
