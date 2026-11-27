import type { RealmDefinition } from '../realm/realm-definition'
import { BLOCK_DEFS, BlockId, getCollisionHeight, isLavaBlock, isWaterBlock } from '../block/block-constants'
import { isBlockSolid, readBlock } from '../player/collision'
import { WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'
import { getDriftRegion } from './drift-flight-config'
import { isSolidBlockId } from './drift-solid'
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
  /** 整張格子裡獨一無二的編號（依掃到的順序），尋路用它當陣列下標 */
  id: number;
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
  /** 到目前為止掃到的站立面數量（編號都小於它），尋路的陣列依它配置大小 */
  getCellCount: () => number;
  /** 到目前為止掃過幾柱（沒有站立面的柱子也算）：分幀工作用它估「這一段掃了多少沒掃過的地」 */
  getScanCount: () => number;
}

/**
 * 某一格柱掃一遍，把所有站得住的面收集起來（由低到高）：逐格查詢的原始版本
 *
 * 只給世界範圍外的柱子用（出界的一律當白沙地，語意在 isBlockSolid 裡）；界內走下面的 scanColumn
 */
function scanColumnSlow(worldState: Uint8Array, blockX: number, blockZ: number, nextId: () => number): DriftCell[] {
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
      id: nextId(),
      blockY,
      footY: blockY - 0.5 + getCollisionHeight(blockId),
      waterDepth,
      isOpenSky,
    })
  }

  return cellList
}

/** 方塊 id 能不能站上去：擋得住、不是樹葉、形狀是整格或台階之類（查表，不用每格去問 BLOCK_DEFS） */
const STANDABLE_TABLE = new Uint8Array(256)
const WATER_TABLE = new Uint8Array(256)
const LAVA_TABLE = new Uint8Array(256)
const COLLISION_HEIGHT_TABLE = new Float64Array(256)
for (let blockId = 0; blockId < 256; blockId++) {
  STANDABLE_TABLE[blockId] = isSolidBlockId(blockId) && !NON_STANDABLE_SET.has(blockId) && STANDABLE_SHAPE_SET.has(BLOCK_DEFS[blockId as BlockId]?.shape) ? 1 : 0
  WATER_TABLE[blockId] = isWaterBlock(blockId) ? 1 : 0
  LAVA_TABLE[blockId] = isLavaBlock(blockId) ? 1 : 0
  COLLISION_HEIGHT_TABLE[blockId] = getCollisionHeight(blockId)
}
/** 掃柱子時的暫存：這一柱每一層的方塊 id */
const columnScratch = new Uint8Array(WORLD_HEIGHT)
const STANDABLE_Y_MAX = WORLD_HEIGHT - CLEARANCE_BLOCK_COUNT - 1

/**
 * 某一格柱掃一遍，把所有站得住的面收集起來（由低到高）
 *
 * 結果與 scanColumnSlow 逐格相同，只是這一柱的方塊 id 讀一次、全部用查表判斷，
 * 「頭上是不是露天」不再每個站立面往上掃一遍，改成與這一柱最高的實心方塊比一下
 */
function scanColumn(worldState: Uint8Array, blockX: number, blockZ: number, nextId: () => number): DriftCell[] {
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE)
    return scanColumnSlow(worldState, blockX, blockZ, nextId)

  const base = blockX * WORLD_HEIGHT * WORLD_SIZE + blockZ
  let topSolidY = -1
  for (let blockY = 0; blockY < WORLD_HEIGHT; blockY++) {
    const blockId = worldState[base + blockY * WORLD_SIZE] as number
    columnScratch[blockY] = blockId
    if (isSolidBlockId(blockId))
      topSolidY = blockY
  }

  const cellList: DriftCell[] = []
  for (let blockY = 1; blockY < STANDABLE_Y_MAX; blockY++) {
    const blockId = columnScratch[blockY] as number
    if (STANDABLE_TABLE[blockId] !== 1)
      continue

    /** 頭上三格要空；同時掃水深與熔岩 */
    let isClear = true
    let waterDepth = 0
    let isLava = false
    for (let offset = 1; offset <= CLEARANCE_BLOCK_COUNT; offset++) {
      const aboveId = columnScratch[blockY + offset] as number
      if (isSolidBlockId(aboveId)) {
        isClear = false
        break
      }
      if (LAVA_TABLE[aboveId] === 1)
        isLava = true
      if (WATER_TABLE[aboveId] === 1 && waterDepth === offset - 1)
        waterDepth = offset
    }
    if (!isClear || isLava || waterDepth > WADE_DEPTH_MAX)
      continue

    cellList.push({
      id: nextId(),
      blockY,
      footY: blockY - 0.5 + (COLLISION_HEIGHT_TABLE[blockId] as number),
      waterDepth,
      /** 這一格自己是實心的，所以頭上全空 ⇔ 它就是這一柱最高的實心方塊 */
      isOpenSky: blockY >= topSolidY,
    })
  }

  return cellList
}

export function createDriftGrid(worldState: Uint8Array, realm: RealmDefinition): DriftGrid {
  /**
   * 一格柱只掃一次，尋路會反覆問同一批格子
   *
   * 界內的柱子以 x × 世界寬 + z 為下標，查一張 Int32Array（沒掃過是 -1）找到存放站立面清單的位置，不用 Map：
   * 尋路一幀要問上萬次，查表比雜湊快得多；沒有站立面的柱子共用同一個空陣列。界外的柱子（少見）才用 Map
   */
  const columnIndexList = new Int32Array(WORLD_SIZE * WORLD_SIZE).fill(-1)
  const columnStore: DriftCell[][] = []
  const outsideColumnMap = new Map<number, DriftCell[]>()
  const emptyColumn: DriftCell[] = []
  let cellCount = 0
  let scanCount = 0
  const nextId = () => cellCount++
  const region = getDriftRegion(realm)
  /**
   * 傳送門周圍整片當障礙
   *
   * 神遊不穿門（範圍只在這座場景），而門洞本身是走得過去的空氣，
   * 尋路若從裡面穿過去，鏡頭會停在門洞中央的霧面上。門前三格半內一律不走
   */
  const portalDiscList = realm.portalList.map((portal) => ({ x: portal.x, z: portal.z }))
  const portalAvoidSquared = PORTAL_AVOID_RADIUS * PORTAL_AVOID_RADIUS
  /** 神遊範圍的半徑（內縮之後）平方：比距離不必開根號 */
  const regionRadius = region ? region.radius - BOUNDARY_MARGIN : 0
  const regionRadiusSquared = regionRadius * regionRadius

  function getColumn(blockX: number, blockZ: number): DriftCell[] {
    if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE) {
      const outsideKey = blockX * WORLD_SIZE + blockZ
      let outside = outsideColumnMap.get(outsideKey)
      if (!outside) {
        scanCount++
        outside = scanColumn(worldState, blockX, blockZ, nextId)
        outsideColumnMap.set(outsideKey, outside)
      }
      return outside
    }

    const key = blockX * WORLD_SIZE + blockZ
    const storeIndex = columnIndexList[key] as number
    if (storeIndex >= 0)
      return columnStore[storeIndex] as DriftCell[]

    scanCount++
    const scanned = scanColumn(worldState, blockX, blockZ, nextId)
    const cellList = scanned.length === 0 ? emptyColumn : scanned
    columnIndexList[key] = columnStore.push(cellList) - 1
    return cellList
  }

  function isInsideRegion(blockX: number, blockZ: number): boolean {
    for (const disc of portalDiscList) {
      const deltaX = blockX - disc.x
      const deltaZ = blockZ - disc.z
      if (deltaX * deltaX + deltaZ * deltaZ < portalAvoidSquared)
        return false
    }
    if (region) {
      const deltaX = blockX - region.x
      const deltaZ = blockZ - region.z
      return regionRadius >= 0 && deltaX * deltaX + deltaZ * deltaZ <= regionRadiusSquared
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

  return { isInsideRegion, getCellNear, getCellAtHeight, getTopCell, getCellCount: () => cellCount, getScanCount: () => scanCount }
}
