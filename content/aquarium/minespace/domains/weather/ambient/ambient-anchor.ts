import type { AmbientAnchorKind } from '../../realm/realm-definition'
import type { BlockLightSource } from '../../world/light-source'
import { BlockId } from '../../block/block-constants'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'

/**
 * 環境粒子的錨點索引
 *
 * 蝴蝶要停在花上、螢火要貼著蘆葦、蛾要繞著燈——這些地方都是世界裡的方塊，
 * 粒子系統自己不知道它們在哪。世界一換好就掃一次（三百萬格的線性掃描，
 * 與 collectLightSourceList 同量級，換場景的霧蓋滿畫面時做），把每一種錨點的位置收進
 * 一張粗網格，之後每隔幾分之一秒問「鏡頭四周有哪些」只查周圍幾格。
 *
 * 只收這座場景用得到的種類：沒人要蘑菇就不掃蘑菇。
 * 空中、地面、樹冠與水面不在這裡，它們直接問世界（見 ambient-layer）
 */

/** 靠方塊或燈火索引的錨點種類 */
export type IndexedAnchorKind = Extract<AmbientAnchorKind, 'light' | 'fire' | 'flower' | 'grass' | 'reed' | 'mushroom' | 'crop'>

const INDEXED_ANCHOR_SET = new Set<AmbientAnchorKind>(['light', 'fire', 'flower', 'grass', 'reed', 'mushroom', 'crop'])

export function isIndexedAnchorKind(kind: AmbientAnchorKind): kind is IndexedAnchorKind {
  return INDEXED_ANCHOR_SET.has(kind)
}

/** 植物類的錨點各由哪些方塊構成 */
const ANCHOR_BLOCK_MAP: Record<'flower' | 'grass' | 'reed' | 'mushroom' | 'crop', BlockId[]> = {
  flower: [
    BlockId.FLOWER_ROSE,
    BlockId.FLOWER_TULIP,
    BlockId.FLOWER_DANDELION,
    BlockId.FLOWER_VIOLA,
    BlockId.FLOWER_WHITE_DANDELION,
    BlockId.BIG_FLOWER,
    BlockId.MOON_FLOWER,
    BlockId.FIRE_FLOWER,
    BlockId.JUNGLE_FLOWER,
  ],
  grass: [BlockId.TALL_GRASS, BlockId.WILD_GRASS, BlockId.FERN, BlockId.DRY_GRASS, BlockId.JUNGLE_GRASS],
  reed: [BlockId.PAPYRUS],
  mushroom: [BlockId.MUSHROOM, BlockId.BROWN_MUSHROOM],
  crop: [BlockId.WHEAT, BlockId.WHEAT_TALL],
}

/**
 * 一種錨點最多記幾個
 *
 * 風露原的草有一萬五千格，每個都記沒有意義：同一個小範圍裡留幾百個就夠挑了。
 * 超過就等距抽稀，記憶體與每次查詢的成本都有上限
 */
const MAX_ANCHOR_COUNT = 6000

/** 粗網格的邊長（格），查詢半徑通常在十幾二十格，一格十六剛好 */
const CELL_SIZE = 16
const CELL_STRIDE = 64

function toCellKey(x: number, z: number): number {
  return Math.floor(x / CELL_SIZE) * CELL_STRIDE + Math.floor(z / CELL_SIZE)
}

interface AnchorBucket {
  /** 每三個數字一組座標 */
  positionList: Float32Array;
  /** 格子 → 落在那格裡的錨點編號 */
  cellMap: Map<number, number[]>;
}

export interface AmbientAnchorIndex {
  /** 世界裡這種錨點總共有幾個（沒掃的種類是零） */
  getCount: (kind: IndexedAnchorKind) => number;
  /**
   * 從離 (x, z) 水平 reach 格內、高度與 y 差不超過 verticalReach 的錨點裡隨機抽最多 maxCount 個，
   * 座標寫進 out（三個一組），回傳實際抽到幾個
   */
  sampleNear: (
    kind: IndexedAnchorKind,
    x: number,
    y: number,
    z: number,
    reach: number,
    verticalReach: number,
    out: Float32Array,
    maxCount: number,
  ) => number;
}

export interface CreateAmbientAnchorIndexParams {
  worldState: Uint8Array;
  lightSourceList: readonly BlockLightSource[];
  /** 這座場景要用到哪些錨點，不在索引範圍內的種類會被略過 */
  kindList: readonly AmbientAnchorKind[];
}

function createBucket(pointList: number[]): AnchorBucket {
  /** 超過上限就等距抽稀 */
  const pointCount = pointList.length / 3
  const stride = Math.max(1, Math.ceil(pointCount / MAX_ANCHOR_COUNT))
  const keptCount = Math.ceil(pointCount / stride)
  const positionList = new Float32Array(keptCount * 3)
  const cellMap = new Map<number, number[]>()

  for (let keptIndex = 0; keptIndex < keptCount; keptIndex++) {
    const source = keptIndex * stride * 3
    const x = pointList[source]!
    const y = pointList[source + 1]!
    const z = pointList[source + 2]!
    positionList[keptIndex * 3] = x
    positionList[keptIndex * 3 + 1] = y
    positionList[keptIndex * 3 + 2] = z

    const key = toCellKey(x, z)
    const cell = cellMap.get(key)
    if (cell)
      cell.push(keptIndex)
    else
      cellMap.set(key, [keptIndex])
  }

  return { positionList, cellMap }
}

export function createAmbientAnchorIndex({
  worldState,
  lightSourceList,
  kindList,
}: CreateAmbientAnchorIndexParams): AmbientAnchorIndex {
  const wantedSet = new Set<IndexedAnchorKind>(kindList.filter(isIndexedAnchorKind))
  const pointMap = new Map<IndexedAnchorKind, number[]>()
  for (const kind of wantedSet)
    pointMap.set(kind, [])

  /** 燈火：燈籠與營火照原樣記下，燒著的另外一份給 fire */
  for (const source of lightSourceList) {
    if (wantedSet.has('light'))
      pointMap.get('light')!.push(source.x, source.y, source.z)
    if (source.isFire && wantedSet.has('fire'))
      pointMap.get('fire')!.push(source.x, source.y, source.z)
  }

  /**
   * 植物方塊：編號對應到錨點種類的查表，一趟線性掃完
   *
   * 世界狀態的排列是 (x × 高 + y) × 寬 + z，照記憶體順序走最快。
   * 座標記方塊頂面（中心再加半格），粒子的高度從植物的頂上算起
   */
  const blockKindList: (IndexedAnchorKind | undefined)[] = Array.from({ length: 256 })
  let hasBlockKind = false
  for (const [kind, blockIdList] of Object.entries(ANCHOR_BLOCK_MAP) as [keyof typeof ANCHOR_BLOCK_MAP, BlockId[]][]) {
    if (!wantedSet.has(kind))
      continue
    hasBlockKind = true
    for (const blockId of blockIdList)
      blockKindList[blockId] = kind
  }

  if (hasBlockKind) {
    let cursor = 0
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let z = 0; z < WORLD_SIZE; z++, cursor++) {
          const blockId = worldState[cursor]!
          if (blockId === 0)
            continue
          const kind = blockKindList[blockId]
          if (kind)
            pointMap.get(kind)!.push(x, y + 0.5, z)
        }
      }
    }
  }

  const bucketMap = new Map<IndexedAnchorKind, AnchorBucket>()
  for (const [kind, pointList] of pointMap)
    bucketMap.set(kind, createBucket(pointList))

  return {
    getCount: (kind) => (bucketMap.get(kind)?.positionList.length ?? 0) / 3,
    sampleNear(kind, x, y, z, reach, verticalReach, out, maxCount) {
      const bucket = bucketMap.get(kind)
      if (!bucket || bucket.positionList.length === 0)
        return 0

      const { positionList, cellMap } = bucket
      const reachSquared = reach * reach
      const minCellX = Math.floor((x - reach) / CELL_SIZE)
      const maxCellX = Math.floor((x + reach) / CELL_SIZE)
      const minCellZ = Math.floor((z - reach) / CELL_SIZE)
      const maxCellZ = Math.floor((z + reach) / CELL_SIZE)

      /** 水塘抽樣：不必先把候選全收起來，一趟走完就是均勻的 */
      let seenCount = 0
      let pickedCount = 0

      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
          const cell = cellMap.get(cellX * CELL_STRIDE + cellZ)
          if (!cell)
            continue

          for (const pointIndex of cell) {
            const offset = pointIndex * 3
            const pointX = positionList[offset]!
            const pointY = positionList[offset + 1]!
            const pointZ = positionList[offset + 2]!
            if (Math.abs(pointY - y) > verticalReach)
              continue
            const distanceX = pointX - x
            const distanceZ = pointZ - z
            if (distanceX * distanceX + distanceZ * distanceZ > reachSquared)
              continue

            seenCount++
            let slot = pickedCount
            if (pickedCount < maxCount) {
              pickedCount++
            }
            else {
              slot = Math.floor(Math.random() * seenCount)
              if (slot >= maxCount)
                continue
            }
            out[slot * 3] = pointX
            out[slot * 3 + 1] = pointY
            out[slot * 3 + 2] = pointZ
          }
        }
      }

      return pickedCount
    },
  }
}
