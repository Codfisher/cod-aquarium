import type { BeybladeState, BeybladeStats } from '../../types'
import type { TerrainProfile } from '../arena/terrain-profile'
import { ARENA_RADIUS } from '../arena/arena-constants'

/** 碗面向心力基礎強度 */
const BOWL_GRAVITY = 3.0
/** 基礎轉速衰減（RPM/秒） */
const BASE_SPIN_DECAY = 15
/** 最大轉速 */
export const MAX_SPIN_RATE = 3000
/** 最大 stamina 值（用於正規化） */
const MAX_STAMINA = 30

export function createInitialState(
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  spinRate: number,
): BeybladeState {
  return {
    position: { ...position },
    velocity: { ...velocity },
    spinRate,
    rotationAngle: 0,
  }
}

export interface PhysicsResult {
  state: BeybladeState;
  isOutOfBounds: boolean;
  isStopped: boolean;
}

export function updateBeybladePhysics(
  state: BeybladeState,
  stats: BeybladeStats,
  frictionCoefficient: number,
  deltaTime: number,
  terrain?: TerrainProfile,
): PhysicsResult {
  const newState: BeybladeState = {
    position: { ...state.position },
    velocity: { ...state.velocity },
    spinRate: state.spinRate,
    rotationAngle: state.rotationAngle,
  }

  const terrainFrictionMultiplier = terrain?.frictionMultiplier ?? 1.0
  const terrainSpinDecayMultiplier = terrain?.spinDecayMultiplier ?? 1.0

  // --- 碗面向心力 ---
  const distanceFromCenter = Math.sqrt(
    newState.position.x ** 2 + newState.position.y ** 2,
  )

  if (distanceFromCenter > 0.01) {
    const normalizedX = newState.position.x / distanceFromCenter
    const normalizedY = newState.position.y / distanceFromCenter

    const gravityMultiplier = terrain
      ? terrain.getGravityMultiplier(distanceFromCenter)
      : distanceFromCenter / ARENA_RADIUS

    const gravityForce = BOWL_GRAVITY * gravityMultiplier

    newState.velocity.x -= normalizedX * gravityForce * deltaTime
    newState.velocity.y -= normalizedY * gravityForce * deltaTime
  }

  // --- 摩擦力 ---
  const effectiveFriction = frictionCoefficient * terrainFrictionMultiplier
  const frictionDamping = 1 - effectiveFriction * deltaTime
  newState.velocity.x *= Math.max(frictionDamping, 0)
  newState.velocity.y *= Math.max(frictionDamping, 0)

  // --- 速度上限（防禦壓制移動速度） ---
  const spinRatio = newState.spinRate / MAX_SPIN_RATE
  const defenseSpeedPenalty = 1 - stats.defense * 0.015
  const maxSpeed = (stats.speed / 10) * 4 * spinRatio * Math.max(defenseSpeedPenalty, 0.5)
  const currentSpeed = Math.sqrt(
    newState.velocity.x ** 2 + newState.velocity.y ** 2,
  )

  if (currentSpeed > maxSpeed && currentSpeed > 0) {
    const scale = maxSpeed / currentSpeed
    newState.velocity.x *= scale
    newState.velocity.y *= scale
  }

  // --- 更新位置 ---
  newState.position.x += newState.velocity.x * deltaTime
  newState.position.y += newState.velocity.y * deltaTime

  // --- 邊緣碰壁（軟反彈，有出界可能） ---
  const newDistance = Math.sqrt(
    newState.position.x ** 2 + newState.position.y ** 2,
  )
  const edgeLimit = ARENA_RADIUS * 0.88
  if (newDistance > edgeLimit) {
    const normalX = newState.position.x / newDistance
    const normalY = newState.position.y / newDistance
    const radialSpeed = newState.velocity.x * normalX + newState.velocity.y * normalY

    if (radialSpeed > 0) {
      // 穿透深度：越深反彈越弱（高速碰撞可能穿牆出界）
      const penetration = (newDistance - edgeLimit) / (ARENA_RADIUS - edgeLimit)
      // 反彈強度隨穿透深度遞減（0~1 → 1.2~0.3）
      const bounceStrength = Math.max(0.3, 1.2 - penetration * 0.9)

      newState.velocity.x -= normalX * radialSpeed * bounceStrength
      newState.velocity.y -= normalY * radialSpeed * bounceStrength

      // 碰壁轉速損失（越深損失越多，高速型更痛）
      const speedWallPenalty = 1 + stats.speed * 0.08
      newState.spinRate *= (0.92 - penetration * 0.1) / speedWallPenalty
    }

    // 輕微推回（不硬鎖位置，允許滑出）
    if (newDistance > edgeLimit && newDistance < ARENA_RADIUS) {
      const pushForce = 0.3
      newState.position.x -= normalX * pushForce * deltaTime
      newState.position.y -= normalY * pushForce * deltaTime
    }
  }

  // --- 轉速衰減 ---
  const staminaFactor = 1 - (stats.stamina / MAX_STAMINA)
  const spinDecay = BASE_SPIN_DECAY * (0.5 + staminaFactor) * terrainSpinDecayMultiplier
  newState.spinRate = Math.max(0, newState.spinRate - spinDecay * deltaTime)

  // --- 旋轉角度（視覺用） ---
  newState.rotationAngle += (newState.spinRate / 60) * Math.PI * 2 * deltaTime

  // --- 判定 ---
  const finalDistance = Math.sqrt(
    newState.position.x ** 2 + newState.position.y ** 2,
  )
  const isOutOfBounds = finalDistance > ARENA_RADIUS
  const isStopped = newState.spinRate <= 0

  return {
    state: newState,
    isOutOfBounds,
    isStopped,
  }
}
