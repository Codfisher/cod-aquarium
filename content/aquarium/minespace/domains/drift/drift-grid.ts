import type { RealmDefinition } from '../realm/realm-definition'
import { BLOCK_DEFS, BlockId, getCollisionHeight, isLavaBlock, isWaterBlock } from '../block/block-constants'
import { isBlockSolid, readBlock } from '../player/collision'
import { WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'
import { getDriftRegion } from './drift-flight-config'
import { itemAt } from './drift-util'

/**
 * 神遊用的可行走格子
 *
 * 神遊不經過漫遊控制器，所以「哪裡走得過去」要自己判斷：
 * 這裡把方塊資料整理成一格一格的站立面，尋路與曲線驗證都問它。
 * 只讀方塊資料，不碰 Babylon，每座場景進神遊時建一份，離開就丟
 */

/** 頭上要留幾格空氣：腳到鏡頭一點六二，加上樹枝、門楣的餘裕，低矮的通道不走 */
const CLEARANCE_BLOCK_COUNT = 3
/**
 * 一步最多往上跨幾格、往下落幾格；再高就是牆與懸崖，路線不經過
 *
 * 兩個數字刻意相等：走得去就走得回來。往下落兩格而往上只跨一格的話，
 * 路線會把鏡頭帶進回不來的坑裡（溪谷的谷底），從那裡出發就哪裡都去不了
 */
export const STEP_UP_BLOCK_MAX = 1
export const STEP_DOWN_BLOCK_MAX = 1
/** 水最深到幾格還算走得過去（涉水），再深就是游泳，鏡頭沿路徑走起來會像漂著 */
const WADE_DEPTH_MAX = 1
/** 邊界內縮幾格：推回線是水流與減速開始的地方，路線不貼著它 */
const BOUNDARY_MARGIN = 3
/** 沒有邊界的場景（地底）離世界邊緣留幾格 */
const WORLD_EDGE_MARGIN = 8
/**
 * 頭上這麼多格內都沒有實心方塊就算露天（樹冠與洞頂都會讓它變成假）
 *
 * 一路看到世界頂：無人機的起降是垂直的，只看十二格的話，頭上十六格高的樹冠會漏掉，
 * 鏡頭就從樹葉裡升上去、落下來（蟬鳴林的高樹）
 */
const OPEN_SKY_BLOCK_COUNT = WORLD_HEIGHT

/** 傳送門周圍幾格內不走 */
const PORTAL_AVOID_RADIUS = 3.5

/** 站不上去的方塊：樹葉（鬆軟的樹冠頂）與細長的裝飾，遇到它們整格當障礙 */
const NON_STANDABLE_SET = new Set<BlockId>([
  BlockId.OAK_LEAVES,
  BlockId.PINE_LEAVES,
  BlockId.AMBER_LEAVES,
  BlockId.GOLD_LEAVES,
  BlockId.ACACIA_LEAVES,
  BlockId.JUNGLE_LEAVES,
])
const STANDABLE_SHAPE_SET = new Set<string | undefined>([undefined, 'cube', 'slab', 'stairs', 'layer', 'flat'])

/** 一個站立面 */
export interface DriftCell {
  /** 腳下那一個方塊的 y（方塊中心在整數座標） */
  blockY: number;
  /** 站立面的世界高度，腳底落在這裡 */
  footY: number;
  /** 腳上的水深（格），零是乾地 */
  waterDepth: number;
  /** 頭上十二格內沒有東西遮著，樹下與洞裡都是 false */
  isOpenSky: boolean;
}

export interface DriftGrid {
  /** 這一格在不在神遊範圍裡（邊界內縮之後） */
  isInsideRegion: (blockX: number, blockZ: number) => boolean;
  /**
   * 取這一格柱上離 referenceBlockY 最近、而且一步走得到的站立面
   *
   * 往上最多跨一格、往下最多落一格；沒有就是 null（牆、深水、低矮通道、範圍外）
   */
  getCellNear: (blockX: number, blockZ: number, referenceBlockY: number) => DriftCell | null;
  /** 取這一格柱上最接近某個高度的站立面，找停留點用（不限跨幾格） */
  getCellAtHeight: (blockX: number, blockZ: number, height: number) => DriftCell | null;
  /** 取這一格柱上最高的站立面，飛行落點與環顧用 */
  getTopCell: (blockX: number, blockZ: number) => DriftCell | null;
}

/** 某一格柱掃一遍，把所有站得住的面收集起來（由低到高） */
function scanColumn(worldState: Uint8Array, blockX: number, blockZ: number): DriftCell[] {
  const cellList: DriftCell[] = []

  for (let blockY = 1; blockY < WORLD_HEIGHT - CLEARANCE_BLOCK_COUNT - 1; blockY++) {
    const blockId = readBlock(worldState, blockX, blockY, blockZ)
    if (!isBlockSolid(worldState, blockX, blockY, blockZ))
      continue
    if (NON_STANDABLE_SET.has(blockId) || !STANDABLE_SHAPE_SET.has(BLOCK_DEFS[blockId]?.shape))
      continue

    let isClear = true
    for (let offset = 1; offset <= CLEARANCE_BLOCK_COUNT; offset++) {
      if (isBlockSolid(worldState, blockX, blockY + offset, blockZ)) {
        isClear = false
        break
      }
    }
    if (!isClear)
      continue

    /** 腳上的水深與熔岩：熔岩一律不走，水深過了涉水的上限就是游泳 */
    let waterDepth = 0
    let isLava = false
    for (let offset = 1; offset <= CLEARANCE_BLOCK_COUNT; offset++) {
      const aboveId = readBlock(worldState, blockX, blockY + offset, blockZ)
      if (isLavaBlock(aboveId))
        isLava = true
      if (isWaterBlock(aboveId) && waterDepth === offset - 1)
        waterDepth = offset
    }
    if (isLava || waterDepth > WADE_DEPTH_MAX)
      continue

    let isOpenSky = true
    for (let offset = 1; offset <= OPEN_SKY_BLOCK_COUNT; offset++) {
      if (isBlockSolid(worldState, blockX, blockY + offset, blockZ)) {
        isOpenSky = false
        break
      }
    }

    cellList.push({
      blockY,
      footY: blockY - 0.5 + getCollisionHeight(blockId),
      waterDepth,
      isOpenSky,
    })
  }

  return cellList
}

export function createDriftGrid(worldState: Uint8Array, realm: RealmDefinition): DriftGrid {
  /** 一格柱只掃一次，尋路會反覆問同一批格子 */
  const columnCache = new Map<number, DriftCell[]>()
  const region = getDriftRegion(realm)
  /**
   * 傳送門周圍整片當障礙
   *
   * 神遊不穿門（範圍只在這座場景），而門洞本身是走得過去的空氣，
   * 尋路若從裡面穿過去，鏡頭會停在門洞中央的霧面上。門前三格半內一律不走
   */
  const portalDiscList = realm.portalList.map((portal) => ({ x: portal.x, z: portal.z }))

  function getColumn(blockX: number, blockZ: number): DriftCell[] {
    const key = blockX * WORLD_SIZE + blockZ
    let cellList = columnCache.get(key)
    if (!cellList) {
      cellList = scanColumn(worldState, blockX, blockZ)
      columnCache.set(key, cellList)
    }
    return cellList
  }

  function isInsideRegion(blockX: number, blockZ: number): boolean {
    for (const disc of portalDiscList) {
      if (Math.hypot(blockX - disc.x, blockZ - disc.z) < PORTAL_AVOID_RADIUS)
        return false
    }
    if (region) {
      return Math.hypot(blockX - region.x, blockZ - region.z) <= region.radius - BOUNDARY_MARGIN
    }
    return blockX >= WORLD_EDGE_MARGIN && blockX < WORLD_SIZE - WORLD_EDGE_MARGIN
      && blockZ >= WORLD_EDGE_MARGIN && blockZ < WORLD_SIZE - WORLD_EDGE_MARGIN
  }

  function getCellNear(blockX: number, blockZ: number, referenceBlockY: number): DriftCell | null {
    if (!isInsideRegion(blockX, blockZ))
      return null

    let best: DriftCell | null = null
    for (const cell of getColumn(blockX, blockZ)) {
      const difference = cell.blockY - referenceBlockY
      if (difference > STEP_UP_BLOCK_MAX || difference < -STEP_DOWN_BLOCK_MAX)
        continue
      if (!best || Math.abs(difference) < Math.abs(best.blockY - referenceBlockY))
        best = cell
    }
    return best
  }

  function getCellAtHeight(blockX: number, blockZ: number, height: number): DriftCell | null {
    if (!isInsideRegion(blockX, blockZ))
      return null

    let best: DriftCell | null = null
    for (const cell of getColumn(blockX, blockZ)) {
      if (!best || Math.abs(cell.footY - height) < Math.abs(best.footY - height))
        best = cell
    }
    return best
  }

  function getTopCell(blockX: number, blockZ: number): DriftCell | null {
    if (!isInsideRegion(blockX, blockZ))
      return null

    const cellList = getColumn(blockX, blockZ)
    return cellList.length > 0 ? itemAt(cellList, cellList.length - 1) : null
  }

  return { isInsideRegion, getCellNear, getCellAtHeight, getTopCell }
}
