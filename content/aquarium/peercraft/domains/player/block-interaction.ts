import type { UniversalCamera } from '@babylonjs/core'
import { Vector3 } from '@babylonjs/core'
import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_SIZE } from '../world/world-constants'
/** 射線命中結果 */
export interface RaycastHit {
  /** 命中方塊的網格座標 */
  blockX: number;
  blockY: number;
  blockZ: number;
  /** 命中方塊的 ID */
  blockId: BlockId;
  /** 命中面的鄰接空格座標（用於放置方塊） */
  adjacentX: number;
  adjacentY: number;
  adjacentZ: number;
}

/** 最大射線距離 */
const MAX_RAY_DISTANCE = 8

/**
 * DDA 逐格射線步進演算法
 *
 * 從攝影機位置沿觀察方向逐格檢測，
 * 找到第一個實體方塊後回傳命中資訊。
 */
export function castBlockRay(
  camera: UniversalCamera,
  worldState: Uint8Array,
  maxDistance: number = MAX_RAY_DISTANCE,
): RaycastHit | null {
  const origin = camera.position.clone()
  /**
   * 為了讓 DDA 的整數網格對齊實際渲染方塊（中心點為整數，邊界在整數 ± 0.5），
   * 將出發點偏移 +0.5，即可在 DDA 中使用標準的 Math.floor
   */
  origin.x += 0.5
  origin.y += 0.5
  origin.z += 0.5

  const direction = camera.getDirection(Vector3.Forward()).normalize()

  /** 目前所在網格 */
  let gridX = Math.floor(origin.x)
  let gridY = Math.floor(origin.y)
  let gridZ = Math.floor(origin.z)

  /** 步進方向 (+1 or -1) */
  const stepX = direction.x >= 0 ? 1 : -1
  const stepY = direction.y >= 0 ? 1 : -1
  const stepZ = direction.z >= 0 ? 1 : -1

  /**
   * tDelta：沿射線方向 traversal 一個完整網格所需的 t 值
   * tMax：到達下一個網格邊界的 t 值
   */
  const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity
  const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity
  const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity

  let tMaxX = direction.x !== 0
    ? ((stepX > 0 ? gridX + 1 : gridX) - origin.x) / direction.x
    : Infinity
  let tMaxY = direction.y !== 0
    ? ((stepY > 0 ? gridY + 1 : gridY) - origin.y) / direction.y
    : Infinity
  let tMaxZ = direction.z !== 0
    ? ((stepZ > 0 ? gridZ + 1 : gridZ) - origin.z) / direction.z
    : Infinity

  /** 前一格座標（用於計算鄰接位置） */
  let previousX = gridX
  let previousY = gridY
  let previousZ = gridZ

  let distance = 0

  while (distance < maxDistance) {
    /** 檢測目前格子 */
    if (
      gridX >= 0 && gridX < WORLD_SIZE
      && gridY >= 0 && gridY < WORLD_SIZE
      && gridZ >= 0 && gridZ < WORLD_SIZE
    ) {
      const index = coordinateToIndex(gridX, gridY, gridZ)
      const blockId = worldState[index] as BlockId

      if (blockId !== BlockId.AIR) {
        return {
          blockX: gridX,
          blockY: gridY,
          blockZ: gridZ,
          blockId,
          adjacentX: previousX,
          adjacentY: previousY,
          adjacentZ: previousZ,
        }
      }
    }

    /** 前進到下一個網格 */
    previousX = gridX
    previousY = gridY
    previousZ = gridZ

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        distance = tMaxX
        gridX += stepX
        tMaxX += tDeltaX
      }
      else {
        distance = tMaxZ
        gridZ += stepZ
        tMaxZ += tDeltaZ
      }
    }
    else {
      if (tMaxY < tMaxZ) {
        distance = tMaxY
        gridY += stepY
        tMaxY += tDeltaY
      }
      else {
        distance = tMaxZ
        gridZ += stepZ
        tMaxZ += tDeltaZ
      }
    }
  }

  return null
}

/**
 * 挖掘方塊：將指定座標設為 AIR
 */
export function digBlock(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
): boolean {
  if (
    blockX < 0 || blockX >= WORLD_SIZE
    || blockY < 0 || blockY >= WORLD_SIZE
    || blockZ < 0 || blockZ >= WORLD_SIZE
  ) {
    return false
  }

  const index = coordinateToIndex(blockX, blockY, blockZ)
  if (worldState[index] === BlockId.AIR) {
    return false
  }

  if (worldState[index] === BlockId.BEDROCK) {
    return false
  }

  worldState[index] = BlockId.AIR
  return true
}

/**
 * 放置方塊：在鄰接空格放置指定方塊
 *
 * 檢查目標必須為 AIR、且在世界邊界內
 */
export function placeBlock(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
  blockId: BlockId,
): boolean {
  if (
    blockX < 0 || blockX >= WORLD_SIZE
    || blockY < 0 || blockY >= WORLD_SIZE
    || blockZ < 0 || blockZ >= WORLD_SIZE
  ) {
    return false
  }

  const index = coordinateToIndex(blockX, blockY, blockZ)
  if (worldState[index] !== BlockId.AIR) {
    return false
  }

  worldState[index] = blockId
  return true
}

/**
 * 直接設定方塊 (主要用於網路同步時)
 */
export function setBlock(
  worldState: Uint8Array,
  blockX: number,
  blockY: number,
  blockZ: number,
  blockId: BlockId,
): boolean {
  if (
    blockX < 0 || blockX >= WORLD_SIZE
    || blockY < 0 || blockY >= WORLD_SIZE
    || blockZ < 0 || blockZ >= WORLD_SIZE
  ) {
    return false
  }

  const index = coordinateToIndex(blockX, blockY, blockZ)
  worldState[index] = blockId
  return true
}
