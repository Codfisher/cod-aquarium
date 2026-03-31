import type { BeybladeState, BeybladeStats } from '../../types'
import { MAX_SPIN_RATE } from './spin-physics'

/** 碰撞時雙方轉速損失百分比 */
const SPIN_LOSS_ON_COLLISION = 0.03
/** 最小擊退力 */
const MIN_KNOCKBACK = 0.5
/** 最大防禦屬性值（用於正規化） */
const MAX_DEFENSE = 30

export interface CollisionResult {
  /** 碰撞法線（A 到 B 的方向） */
  normalX: number;
  normalY: number;
  /** 重疊深度 */
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

  // --- 分離重疊 ---
  const separationHalf = collision.overlap / 2 + 0.01
  newStateA.position.x -= collision.normalX * separationHalf
  newStateA.position.y -= collision.normalY * separationHalf
  newStateB.position.x += collision.normalX * separationHalf
  newStateB.position.y += collision.normalY * separationHalf

  // --- 計算擊退力 ---
  const knockbackAtoB = Math.max(
    statsA.attack * (stateA.spinRate / MAX_SPIN_RATE)
    - statsB.defense * (statsB.defense / MAX_DEFENSE),
    MIN_KNOCKBACK,
  )
  const knockbackBtoA = Math.max(
    statsB.attack * (stateB.spinRate / MAX_SPIN_RATE)
    - statsA.defense * (statsA.defense / MAX_DEFENSE),
    MIN_KNOCKBACK,
  )

  // --- 施加擊退速度 ---
  newStateB.velocity.x += collision.normalX * knockbackAtoB
  newStateB.velocity.y += collision.normalY * knockbackAtoB
  newStateA.velocity.x -= collision.normalX * knockbackBtoA
  newStateA.velocity.y -= collision.normalY * knockbackBtoA

  // --- 碰撞轉速損失 ---
  newStateA.spinRate *= (1 - SPIN_LOSS_ON_COLLISION)
  newStateB.spinRate *= (1 - SPIN_LOSS_ON_COLLISION)

  return {
    stateA: newStateA,
    stateB: newStateB,
  }
}
