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

/** 經典：標準拋物線碗 */
const classicProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    return 1.2 * (ratio * ratio) - 1.2
  },
  getGravityMultiplier(distance) {
    return distance / ARENA_RADIUS
  },
  frictionMultiplier: 1.0,
  spinDecayMultiplier: 1.0,
  depth: 1.2,
}

/** 熔岩：深碗 + 中心凸起小丘，被撞到中心會彈開 */
const volcanoProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    // 深碗基底
    const bowl = 1.8 * (ratio * ratio) - 1.8
    // 中心火山丘（半徑 0.3 內凸起）
    const volcanoRadius = 0.3
    if (ratio < volcanoRadius) {
      const volcanoRatio = 1 - (ratio / volcanoRadius)
      return bowl + volcanoRatio * volcanoRatio * 0.4
    }
    return bowl
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    // 中心附近反推力（火山丘斜面）
    if (ratio < 0.3) {
      return -1.5 * (1 - ratio / 0.3)
    }
    // 外圍更強的向心力（深碗）
    return ratio * 1.4
  },
  frictionMultiplier: 0.8,
  spinDecayMultiplier: 1.2,
  depth: 1.8,
}

/** 冰原：淺碗、極低摩擦，陀螺滑很遠 */
const iceProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    return 0.6 * (ratio * ratio) - 0.6
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    return ratio * 0.6
  },
  frictionMultiplier: 0.3,
  spinDecayMultiplier: 0.8,
  depth: 0.6,
}

/** 虛空：中心凹陷黑洞 + 外環微凸脊 */
const voidProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    // 中心深坑
    const pit = 2.0 * (ratio * ratio) - 2.0
    // 外環凸脊（0.6~0.8 之間）
    const ridgeCenter = 0.7
    const ridgeWidth = 0.1
    const ridgeDelta = Math.abs(ratio - ridgeCenter)
    const ridge = ridgeDelta < ridgeWidth
      ? Math.cos((ridgeDelta / ridgeWidth) * Math.PI * 0.5) * 0.25
      : 0
    return pit + ridge
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    // 中心強吸力
    if (ratio < 0.3) {
      return ratio * 3.0
    }
    // 凸脊區域有反彈力
    if (ratio > 0.6 && ratio < 0.8) {
      const ridgeRatio = (ratio - 0.6) / 0.2
      return ridgeRatio < 0.5 ? -0.5 : 1.0
    }
    return ratio * 1.2
  },
  frictionMultiplier: 1.0,
  spinDecayMultiplier: 1.3,
  depth: 2.0,
}

/** 櫻花：平坦中心 + 緩斜邊緣，比較溫和的場地 */
const sakuraProfile: TerrainProfile = {
  getHeightAtDistance(distance) {
    const ratio = distance / ARENA_RADIUS
    // 平坦中心（ratio < 0.4 幾乎是平的）
    if (ratio < 0.4) {
      return ratio * ratio * 0.3 - 0.8
    }
    // 之後快速爬升
    const outerRatio = (ratio - 0.4) / 0.6
    return -0.8 + outerRatio * outerRatio * 1.2
  },
  getGravityMultiplier(distance) {
    const ratio = distance / ARENA_RADIUS
    if (ratio < 0.4) {
      // 平坦區域幾乎沒有向心力
      return ratio * 0.3
    }
    // 邊緣區域較強
    return ((ratio - 0.4) / 0.6) * 1.5
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
