import { BlockId, getCollisionHeight, isPassableBlock, isWaterBlock } from '../block/block-constants'
import {
  coordinateToIndex,
  isInsideWorld,
  WORLD_HEIGHT,
  WORLD_VOLUME,
} from './world-constants'

/** 建立空白世界（全為空氣） */
export function createWorldState(): Uint8Array {
  return new Uint8Array(WORLD_VOLUME)
}

export function setBlock(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId): void {
  if (!isInsideWorld(x, y, z))
    return
  state[coordinateToIndex(x, y, z)] = blockId
}

export function getBlock(state: Uint8Array, x: number, y: number, z: number): BlockId {
  if (!isInsideWorld(x, y, z))
    return BlockId.AIR
  return state[coordinateToIndex(x, y, z)] as BlockId
}

/**
 * 取得可站立的地面高度（第一個踩得到的方塊上方一格）
 *
 * 空氣、水、花草這類穿得過去的方塊都不算地面，
 * 否則羊會站在草叢頂端、音源也會浮在花上面
 */
export function getGroundY(state: Uint8Array, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (!isPassableBlock(getBlock(state, x, y, z))) {
      return y + 1
    }
  }
  return 1
}

/** 取得地表高度，水面也算表面 */
export function getSurfaceY(state: Uint8Array, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (getBlock(state, x, y, z) !== BlockId.AIR) {
      return y + 1
    }
  }
  return 1
}

/**
 * 從天空往下打一道射線，找出雨滴打到的表面高度（世界座標，不是格子索引）
 *
 * 回傳頂面的實際高度：半磚只有半格高、水面擋在水的頂面，
 * 花草這類穿得過去的方塊擋不住雨，直接落到底下的地面。
 * 屋頂與樹冠會擋下射線，雨本來就打在上面而不是穿過去。
 * 整根格柱都是空的時回傳 null，那裡沒有東西可以濺起水花
 */
export function castRainRay(state: Uint8Array, x: number, z: number): number | null {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const blockId = getBlock(state, x, y, z)
    if (blockId === BlockId.AIR)
      continue
    if (isPassableBlock(blockId) && !isWaterBlock(blockId))
      continue

    /** 方塊中心在整數座標，底面為 y - 0.5 */
    return y - 0.5 + getCollisionHeight(blockId)
  }

  return null
}

/** 該座標的地表是否泡在水裡 */
export function isUnderWaterSurface(state: Uint8Array, x: number, z: number): boolean {
  return getSurfaceY(state, x, z) > getGroundY(state, x, z)
}

/**
 * 取得站得住腳的高度：有水就取水面，沒水就取地面
 *
 * 與 {@link getSurfaceY} 的差別在於樹冠不算數，
 * 音源才不會被抬到樹頂上。
 */
export function getWaterlineY(state: Uint8Array, x: number, z: number): number {
  const groundY = getGroundY(state, x, z)

  for (let y = WORLD_HEIGHT - 1; y >= groundY; y--) {
    if (isWaterBlock(getBlock(state, x, y, z))) {
      return y + 1
    }
  }

  return groundY
}
