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

  // --- 速度上限 ---
  const spinRatio = newState.spinRate / MAX_SPIN_RATE
  const maxSpeed = (stats.speed / 10) * 4 * spinRatio
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

  // --- 轉速衰減 ---
  const staminaFactor = 1 - (stats.stamina / MAX_STAMINA)
  const spinDecay = BASE_SPIN_DECAY * (0.5 + staminaFactor) * terrainSpinDecayMultiplier
  newState.spinRate = Math.max(0, newState.spinRate - spinDecay * deltaTime)

  // --- 旋轉角度（視覺用） ---
  newState.rotationAngle += (newState.spinRate / 60) * Math.PI * 2 * deltaTime

  // --- 判定 ---
  const newDistance = Math.sqrt(
    newState.position.x ** 2 + newState.position.y ** 2,
  )
  const isOutOfBounds = newDistance > ARENA_RADIUS
  const isStopped = newState.spinRate <= 0

  return {
    state: newState,
    isOutOfBounds,
    isStopped,
  }
}
