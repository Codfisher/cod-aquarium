import type { ArenaType, BeybladeState } from '../../types'
import { ARENA_RADIUS } from './arena-constants'

/** 障礙物類型 */
export type ObstacleShape = 'pillar' | 'wall' | 'bumper'

export interface Obstacle {
  /** 唯一識別 */
  id: string;
  shape: ObstacleShape;
  /** 2D 位置 */
  positionX: number;
  positionY: number;
  /** 碰撞半徑（pillar/bumper）或半長度（wall） */
  radius: number;
  /** wall 的方向角度（弧度） */
  angle?: number;
  /** wall 的厚度 */
  thickness?: number;
  /** bumper 的彈射力倍率 */
  bounceMultiplier?: number;
  /** 區域效果：進入範圍內的加速/減速 */
  zoneEffect?: {
    /** 效果範圍半徑 */
    effectRadius: number;
    /** 轉速衰減倍率（< 1 = 加速衰減，> 1 = 減緩衰減） */
    spinDecayFactor: number;
    /** 速度倍率 */
    speedFactor: number;
  };
}

export interface ObstacleCollisionResult {
  /** 碰撞法線 */
  normalX: number;
  normalY: number;
  /** 反彈力 */
  bounceForce: number;
}

/** 偵測陀螺是否撞到障礙物 */
export function detectObstacleCollision(
  state: BeybladeState,
  beybladeRadius: number,
  obstacle: Obstacle,
): ObstacleCollisionResult | null {
  if (obstacle.shape === 'wall') {
    return detectWallCollision(state, beybladeRadius, obstacle)
  }

  // pillar / bumper：圓形碰撞
  const deltaX = state.position.x - obstacle.positionX
  const deltaY = state.position.y - obstacle.positionY
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2)
  const minDistance = beybladeRadius + obstacle.radius

  if (distance >= minDistance || distance < 0.001) return null

  const bounceMultiplier = obstacle.shape === 'bumper'
    ? (obstacle.bounceMultiplier ?? 2.0)
    : 1.0

  return {
    normalX: deltaX / distance,
    normalY: deltaY / distance,
    bounceForce: bounceMultiplier,
  }
}

function detectWallCollision(
  state: BeybladeState,
  beybladeRadius: number,
  obstacle: Obstacle,
): ObstacleCollisionResult | null {
  const wallAngle = obstacle.angle ?? 0
  const wallLength = obstacle.radius
  const wallThickness = obstacle.thickness ?? 0.15

  // 把陀螺位置轉到牆壁的局部座標
  const relativeX = state.position.x - obstacle.positionX
  const relativeY = state.position.y - obstacle.positionY

  const cosAngle = Math.cos(wallAngle)
  const sinAngle = Math.sin(wallAngle)

  // 沿牆方向的分量（平行）和垂直牆的分量
  const parallel = relativeX * cosAngle + relativeY * sinAngle
  const perpendicular = -relativeX * sinAngle + relativeY * cosAngle

  // 在牆的範圍內？
  if (Math.abs(parallel) > wallLength + beybladeRadius) return null
  if (Math.abs(perpendicular) > wallThickness / 2 + beybladeRadius) return null

  // 碰撞法線
  const sign = perpendicular > 0 ? 1 : -1
  return {
    normalX: -sinAngle * sign,
    normalY: cosAngle * sign,
    bounceForce: 1.2,
  }
}

/** 應用障礙物碰撞結果到陀螺狀態 */
export function applyObstacleCollision(
  state: BeybladeState,
  collision: ObstacleCollisionResult,
): BeybladeState {
  const newState = {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
  }

  // 反彈速度
  const dotProduct = newState.velocity.x * collision.normalX + newState.velocity.y * collision.normalY
  if (dotProduct < 0) {
    // 只有朝向障礙物才反彈
    newState.velocity.x -= 2 * dotProduct * collision.normalX * collision.bounceForce
    newState.velocity.y -= 2 * dotProduct * collision.normalY * collision.bounceForce
  }

  // 推離障礙物
  newState.position.x += collision.normalX * 0.05
  newState.position.y += collision.normalY * 0.05

  // 碰撞損失少量轉速
  newState.spinRate *= 0.98

  return newState
}

/** 檢查是否在區域效果範圍內 */
export function getZoneEffectAtPosition(
  positionX: number,
  positionY: number,
  obstacleList: Obstacle[],
): { spinDecayFactor: number; speedFactor: number } {
  let spinDecayFactor = 1.0
  let speedFactor = 1.0

  for (const obstacle of obstacleList) {
    if (!obstacle.zoneEffect) continue

    const deltaX = positionX - obstacle.positionX
    const deltaY = positionY - obstacle.positionY
    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2)

    if (distance < obstacle.zoneEffect.effectRadius) {
      const intensity = 1 - (distance / obstacle.zoneEffect.effectRadius)
      spinDecayFactor *= 1 + (obstacle.zoneEffect.spinDecayFactor - 1) * intensity
      speedFactor *= 1 + (obstacle.zoneEffect.speedFactor - 1) * intensity
    }
  }

  return { spinDecayFactor, speedFactor }
}

// --- 每個場地的障礙物配置 ---

const R = ARENA_RADIUS

const classicObstacleList: Obstacle[] = []

const volcanoObstacleList: Obstacle[] = [
  // 中心火山口：bumper，碰到會彈飛
  {
    id: 'volcano-core',
    shape: 'bumper',
    positionX: 0,
    positionY: 0,
    radius: 0.5,
    bounceMultiplier: 3.0,
    zoneEffect: {
      effectRadius: 1.5,
      spinDecayFactor: 1.5,
      speedFactor: 1.3,
    },
  },
  // 三根岩石柱
  ...Array.from({ length: 3 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 3 + Math.PI / 6
    return {
      id: `volcano-pillar-${i}`,
      shape: 'pillar' as ObstacleShape,
      positionX: Math.cos(angle) * R * 0.55,
      positionY: Math.sin(angle) * R * 0.55,
      radius: 0.25,
    }
  }),
]

const iceObstacleList: Obstacle[] = [
  // 四道冰牆（十字形）
  ...Array.from({ length: 4 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 4
    return {
      id: `ice-wall-${i}`,
      shape: 'wall' as ObstacleShape,
      positionX: Math.cos(angle) * R * 0.45,
      positionY: Math.sin(angle) * R * 0.45,
      radius: 0.6,
      angle,
      thickness: 0.12,
    }
  }),
  // 中心滑冰加速區
  {
    id: 'ice-center-boost',
    shape: 'bumper',
    positionX: 0,
    positionY: 0,
    radius: 0.1,
    bounceMultiplier: 0.5,
    zoneEffect: {
      effectRadius: 1.2,
      spinDecayFactor: 0.5,
      speedFactor: 1.5,
    },
  },
]

const voidObstacleList: Obstacle[] = [
  // 中心黑洞：強力吸引 + 快速消耗轉速
  {
    id: 'void-blackhole',
    shape: 'bumper',
    positionX: 0,
    positionY: 0,
    radius: 0.3,
    bounceMultiplier: 0.2,
    zoneEffect: {
      effectRadius: 2.0,
      spinDecayFactor: 2.5,
      speedFactor: 0.6,
    },
  },
  // 外環六個 bumper（彈射器）
  ...Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 6
    return {
      id: `void-bumper-${i}`,
      shape: 'bumper' as ObstacleShape,
      positionX: Math.cos(angle) * R * 0.65,
      positionY: Math.sin(angle) * R * 0.65,
      radius: 0.2,
      bounceMultiplier: 2.5,
    }
  }),
]

const sakuraObstacleList: Obstacle[] = [
  // 三顆庭園石（大小不一）
  {
    id: 'sakura-stone-1',
    shape: 'pillar',
    positionX: R * 0.3,
    positionY: R * 0.1,
    radius: 0.35,
  },
  {
    id: 'sakura-stone-2',
    shape: 'pillar',
    positionX: -R * 0.2,
    positionY: -R * 0.35,
    radius: 0.25,
  },
  {
    id: 'sakura-stone-3',
    shape: 'pillar',
    positionX: -R * 0.15,
    positionY: R * 0.4,
    radius: 0.2,
  },
  // 中心回復區（減緩轉速衰減）
  {
    id: 'sakura-heal-zone',
    shape: 'bumper',
    positionX: 0,
    positionY: 0,
    radius: 0.1,
    bounceMultiplier: 0.3,
    zoneEffect: {
      effectRadius: 1.0,
      spinDecayFactor: 0.4,
      speedFactor: 0.9,
    },
  },
]

const obstacleMap: Record<ArenaType, Obstacle[]> = {
  classic: classicObstacleList,
  volcano: volcanoObstacleList,
  ice: iceObstacleList,
  void: voidObstacleList,
  sakura: sakuraObstacleList,
}

export function getObstacleList(arenaType: ArenaType): Obstacle[] {
  return obstacleMap[arenaType]
}
