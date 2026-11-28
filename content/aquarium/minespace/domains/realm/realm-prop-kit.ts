import type { PlanePoint } from './land-realm-kit'
import { BlockId, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { getBlock, setBlock } from '../world/world-access'
import { WORLD_SIZE } from '../world/world-constants'

/**
 * 大場景細節小物共用的小工具
 *
 * 只有地形 worker 用。各場景的地形生完之後，再補一輪小物（路邊的道具、石堆、倒木、小景）。
 * 這一輪排在花草之後，所以每一樣東西落地之前都要先問「這一格是不是還空著」，
 * 擺下去的時候順手把原本那一株花草清掉；整輪不動原本那幾條亂數序列，
 * 既有的造景與神遊特色的座標才不會跟著跑
 */

/** 這一格是不是花草一類：穿得過去、不是空氣也不是水，可以被小物蓋掉 */
function isPlantBlock(blockId: BlockId): boolean {
  return blockId !== BlockId.AIR && isPassableBlock(blockId) && !isWaterBlock(blockId)
}

/**
 * 清掉這一格往上的花草
 *
 * 高草與麥穗會疊兩格，只拿掉底下那格的話上半截會浮在半空
 */
export function clearPlantColumn(state: Uint8Array, x: number, y: number, z: number): void {
  for (let level = 0; level < 3; level++) {
    if (!isPlantBlock(getBlock(state, x, y + level, z)))
      return
    setBlock(state, x, y + level, z, BlockId.AIR)
  }
}

/** 這一格能不能擺東西：腳下是 groundSet 裡的方塊，這一格是空氣或花草 */
export function isFreeGround(
  state: Uint8Array,
  x: number,
  footY: number,
  z: number,
  groundSet: ReadonlySet<BlockId>,
): boolean {
  if (!groundSet.has(getBlock(state, x, footY - 1, z)))
    return false
  const blockId = getBlock(state, x, footY, z)
  return blockId === BlockId.AIR || isPlantBlock(blockId)
}

/** 一塊長方形範圍（含兩端）是不是整片同一層的空地 */
export function isFreeArea(
  state: Uint8Array,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  footY: number,
  groundSet: ReadonlySet<BlockId>,
): boolean {
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      if (!isFreeGround(state, x, footY, z, groundSet))
        return false
    }
  }
  return true
}

/**
 * 擺一格小物，回傳有沒有擺下去
 *
 * 原本是花草就清掉再擺，已經有別的東西（石頭、樹幹、水）就不動
 */
export function putProp(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId): boolean {
  clearPlantColumn(state, x, y, z)
  if (getBlock(state, x, y, z) !== BlockId.AIR)
    return false
  setBlock(state, x, y, z, blockId)
  return true
}

/**
 * 從 fromY 往下找腳底的高度：第一格 groundSet 裡的方塊的上一格
 *
 * 途中碰到別的實心方塊（屋頂、樹冠、石頭）就當成這裡不能放，回傳 null
 */
export function findFootY(
  state: Uint8Array,
  x: number,
  z: number,
  fromY: number,
  groundSet: ReadonlySet<BlockId>,
): number | null {
  for (let y = fromY; y > 0; y--) {
    const blockId = getBlock(state, x, y, z)
    if (groundSet.has(blockId))
      return y + 1
    if (blockId !== BlockId.AIR && !isPlantBlock(blockId))
      return null
  }
  return null
}

/** 一處擺得下東西的平地：中心與腳底高度 */
export interface PropSite extends PlanePoint {
  footY: number;
}

/**
 * 在目標點附近找一塊擺得下的平地
 *
 * 噪音堆出來的地面到處有一格的起伏，花草與石頭又是亂數撒的，寫死的座標不一定剛好是平的空地。
 * 從目標點一圈一圈往外找，第一塊「整個範圍同一層、地面是 groundSet、上面只有花草」的地方就用。
 * groundTopMap 是各場景自己記的地表高度（索引 x * WORLD_SIZE + z），找不到回傳 null
 */
export function findFreeSite(
  state: Uint8Array,
  groundTopMap: Uint8Array,
  target: PlanePoint,
  halfX: number,
  halfZ: number,
  groundSet: ReadonlySet<BlockId>,
  searchRadius = 4,
): PropSite | null {
  for (let ring = 0; ring <= searchRadius; ring++) {
    for (let offsetX = -ring; offsetX <= ring; offsetX++) {
      for (let offsetZ = -ring; offsetZ <= ring; offsetZ++) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== ring)
          continue
        const x = target.x + offsetX
        const z = target.z + offsetZ
        const footY = groundTopMap[x * WORLD_SIZE + z]! + 1
        let isLevel = true
        for (let cellX = x - halfX; cellX <= x + halfX && isLevel; cellX++) {
          for (let cellZ = z - halfZ; cellZ <= z + halfZ; cellZ++) {
            if (groundTopMap[cellX * WORLD_SIZE + cellZ]! + 1 !== footY) {
              isLevel = false
              break
            }
          }
        }
        if (isLevel && isFreeArea(state, x - halfX, z - halfZ, x + halfX, z + halfZ, footY, groundSet))
          return { x, z, footY }
      }
    }
  }
  return null
}

/** 把一塊範圍（含兩端）裡的花草清掉，蓋東西之前先整地 */
export function clearPlantArea(state: Uint8Array, minX: number, minZ: number, maxX: number, maxZ: number, footY: number): void {
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      clearPlantColumn(state, x, footY, z)
    }
  }
}

/** 離一串定點最近的距離 */
export function measureNearestDistance(x: number, z: number, pointList: readonly PlanePoint[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const point of pointList) {
    nearest = Math.min(nearest, Math.hypot(x - point.x, z - point.z))
  }
  return nearest
}

/**
 * 立一根柱子加柱頂一塊東西：木牌、餵鳥台、提燈柱都是這個樣子
 *
 * 柱腳那一格要是空地，回傳有沒有立起來
 */
export function placePostWithTop(
  state: Uint8Array,
  x: number,
  footY: number,
  z: number,
  postHeight: number,
  postBlock: BlockId,
  topBlock: BlockId,
): boolean {
  clearPlantColumn(state, x, footY, z)
  for (let level = 0; level <= postHeight; level++) {
    if (getBlock(state, x, footY + level, z) !== BlockId.AIR)
      return false
  }
  for (let level = 0; level < postHeight; level++) {
    setBlock(state, x, footY + level, z, postBlock)
  }
  setBlock(state, x, footY + postHeight, z, topBlock)
  return true
}

/**
 * 一堆疊石：底下一格圓石、頂上一塊半磚，高的那種中間再多一格
 *
 * 路標、積石、雪地裡的指路石都是它
 */
export function placeCairn(state: Uint8Array, x: number, footY: number, z: number, height: number, blockId: BlockId = BlockId.COBBLESTONE): boolean {
  clearPlantColumn(state, x, footY, z)
  for (let level = 0; level <= height; level++) {
    if (getBlock(state, x, footY + level, z) !== BlockId.AIR)
      return false
  }
  for (let level = 0; level < height; level++) {
    setBlock(state, x, footY + level, z, blockId)
  }
  setBlock(state, x, footY + height, z, BlockId.STONE_SLAB)
  return true
}
