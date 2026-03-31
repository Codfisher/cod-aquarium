import { Vector3 } from '@babylonjs/core'
import type { ArenaType } from '../../types'
import { ARENA_RADIUS } from './arena-constants'

/**
 * 地形設定檔
 *
 * 每種場地有不同的碗面形狀，影響視覺和物理行為
 */
export interface TerrainProfile {
  /** 碗面高度函式：輸入離中心距離（0~ARENA_RADIUS），輸出 Y 座標 */
  getHeightAtDistance: (distance: number) => number;
  /**
   * 碗面坡度力場：輸入離中心距離，輸出向心力倍率
   * 正值 = 推向中心，負值 = 推離中心
   */
  getGravityMultiplier: (distance: number) => number;
  /** 額外摩擦倍率（場地特性） */
  frictionMultiplier: number;
  /** 額外轉速衰減倍率 */
  spinDecayMultiplier: number;
  /** 碗面深度（用於 Lathe 建模） */
  depth: number;
}

/**
 * 邊緣護牆：ratio > 0.75 時急遽提升高度
 * 所有場地共用，讓陀螺不容易飛出場地
 */
const WALL_START = 0.8
/** 視覺高度（低，不擋視野） */
const WALL_HEIGHT = 0.5

function addEdgeWallHeight(baseHeight: number, ratio: number): number {
  if (ratio <= WALL_START) return baseHeight
  const wallRatio = (ratio - WALL_START) / (1 - WALL_START)
  return baseHeight + wallRatio * wallRatio * WALL_HEIGHT
}

/** 物理推力仍然很強（反彈靠 spin-physics 的硬反彈處理） */
function addEdgeWallGravity(baseGravity: number, ratio: number): number {
  if (ratio <= WALL_START) return baseGravity
  const wallRatio = (ratio - WALL_START) / (1 - WALL_START)
  return baseGravity + wallRatio * 3.0
}

/** 經典：標準拋物線碗 */
const classicProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    const base = 1.2 * (ratio * ratio) - 1.2
    return addEdgeWallHeight(base, ratio)
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    return addEdgeWallGravity(ratio, ratio)
  },
  frictionMultiplier: 1.0,
  spinDecayMultiplier: 1.0,
  depth: 1.2,
}

/** 熔岩：深碗 + 中心凸起小丘 */
const volcanoProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    const bowl = 1.8 * (ratio * ratio) - 1.8
    const volcanoRadius = 0.3
    let base = bowl
    if (ratio < volcanoRadius) {
      const volcanoRatio = 1 - (ratio / volcanoRadius)
      base = bowl + volcanoRatio * volcanoRatio * 0.4
    }
    return addEdgeWallHeight(base, ratio)
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    if (ratio < 0.3) {
      return -1.5 * (1 - ratio / 0.3)
    }
    return addEdgeWallGravity(ratio * 1.4, ratio)
  },
  frictionMultiplier: 0.8,
  spinDecayMultiplier: 1.2,
  depth: 1.8,
}

/** 冰原：淺碗、極低摩擦 */
const iceProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    const base = 0.6 * (ratio * ratio) - 0.6
    return addEdgeWallHeight(base, ratio)
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    return addEdgeWallGravity(ratio * 0.6, ratio)
  },
  frictionMultiplier: 0.3,
  spinDecayMultiplier: 0.8,
  depth: 0.6,
}

/** 虛空：中心凹陷黑洞 + 外環微凸脊 */
const voidProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    const pit = 2.0 * (ratio * ratio) - 2.0
    const ridgeCenter = 0.7
    const ridgeWidth = 0.1
    const ridgeDelta = Math.abs(ratio - ridgeCenter)
    const ridge = ridgeDelta < ridgeWidth
      ? Math.cos((ridgeDelta / ridgeWidth) * Math.PI * 0.5) * 0.25
      : 0
    return addEdgeWallHeight(pit + ridge, ratio)
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    if (ratio < 0.3) {
      return ratio * 3.0
    }
    if (ratio > 0.6 && ratio < 0.8) {
      const ridgeRatio = (ratio - 0.6) / 0.2
      return addEdgeWallGravity(ridgeRatio < 0.5 ? -0.5 : 1.0, ratio)
    }
    return addEdgeWallGravity(ratio * 1.2, ratio)
  },
  frictionMultiplier: 1.0,
  spinDecayMultiplier: 1.3,
  depth: 2.0,
}

/** 櫻花：平坦中心 + 緩斜邊緣 */
const sakuraProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    let base: number
    if (ratio < 0.4) {
      base = ratio * ratio * 0.3 - 0.8
    }
    else {
      const outerRatio = (ratio - 0.4) / 0.6
      base = -0.8 + outerRatio * outerRatio * 1.2
    }
    return addEdgeWallHeight(base, ratio)
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    if (ratio < 0.4) {
      return addEdgeWallGravity(ratio * 0.3, ratio)
    }
    return addEdgeWallGravity(((ratio - 0.4) / 0.6) * 1.5, ratio)
  },
  frictionMultiplier: 1.1,
  spinDecayMultiplier: 0.9,
  depth: 0.8,
}

const terrainProfileMap: Record<ArenaType, TerrainProfile> = {
  classic: classicProfile,
  volcano: volcanoProfile,
  ice: iceProfile,
  void: voidProfile,
  sakura: sakuraProfile,
}

export function getTerrainProfile(arenaType: ArenaType): TerrainProfile {
  return terrainProfileMap[arenaType]
}

/** 根據地形設定檔產生 Lathe 用的碗面輪廓點 */
export function createBowlProfileFromTerrain(profile: TerrainProfile): Vector3[] {
  const pointList: Vector3[] = []
  const segmentCount = 30

  for (let i = 0; i <= segmentCount; i++) {
    const ratio = i / segmentCount
    const x = ratio * ARENA_RADIUS
    const y = profile.getHeightAtDistance(x)
    pointList.push(new Vector3(x, y, 0))
  }

  return pointList
}
