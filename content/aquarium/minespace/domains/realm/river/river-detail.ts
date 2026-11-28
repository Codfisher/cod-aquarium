import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isWaterBlock } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  isKeptOut,
  placeCairn,
  placeDetail,
  placeFallenLog,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { findTopSolidY, isNextToWater } from '../realm-terrain-kit'
import {
  CASCADE_X,
  measureStreamZ,
  RIVER_FISHING_POINT,
  RIVER_LOG_BRIDGE_POINT,
  UPPER_FLOOR_Y,
  VALLEY_END_X,
  VALLEY_FLOOR_Y,
  VALLEY_HEAD_X,
} from './river-layout'
import { RIVER_REALM } from './river-realm'

/**
 * 溪谷的細節
 *
 * 只有地形 worker 用。遣水是一道溪、兩岸礫石與一面瀑布，這裡照樣不加松、竹林與小屋，
 * 補的是溪自己會留下來的東西與溪邊的人：礫石灘上成堆的碎石與漂流木、溪心幾顆出水的石頭、
 * 水邊的香蒲與靜水處的蓮、谷壁腳下岩階上的苔、橡樹枝下垂的藤、草地上成片的白花；
 * 一棵倒下來正好跨過溪的橡樹、靜水池邊的釣點、跌水旁的三座疊石。
 *
 * 分兩段：造景零件在撒花草之前擺，地被在花草與睡蓮之後補
 */

/**
 * 找地面時從這一層往下找
 *
 * 谷底只有兩層（跌水上下差一格），岸邊的大石最多再高三格；谷壁一路往上，
 * 從這一層往下找，谷壁的格柱頂上不是空的，會被跳過，細節只落在谷底
 */
const DETAIL_SCAN_TOP_Y = UPPER_FLOOR_Y + 3

const GRASS_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS])
const GRAVEL_SET: ReadonlySet<BlockId> = new Set([BlockId.GRAVEL])
const BANK_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS, BlockId.GRAVEL])
const ROCK_SET: ReadonlySet<BlockId> = new Set([BlockId.COBBLESTONE, BlockId.MOSSY_COBBLESTONE, BlockId.STONE])

const DETAIL_AREA = {
  minX: VALLEY_HEAD_X + 2,
  maxX: VALLEY_END_X - 4,
  minZ: 108,
  maxZ: 172,
}

/** 某一格柱的水面那一層高度，不是水就回傳 -1 */
function findWaterTopY(state: Uint8Array, x: number, z: number): number {
  for (const y of [UPPER_FLOOR_Y, VALLEY_FLOOR_Y]) {
    if (isWaterBlock(getBlock(state, x, y, z)) && getBlock(state, x, y + 1, z) === BlockId.AIR)
      return y
  }
  return -1
}

/**
 * 橫在溪上的倒木
 *
 * 在那一排找出溪的那一段水，木頭從北岸躺到南岸，架在水面上一格。
 * 北岸再過去是折斷的樹頭，木頭上長苔。兩岸與水面要同一層才架得平，不平就不放
 */
function buildLogBridge(context: DetailContext): void {
  const { state, random } = context
  const { x, z: streamZ } = RIVER_LOG_BRIDGE_POINT
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let waterY = -1
  for (let z = streamZ - 8; z <= streamZ + 8; z++) {
    const y = findWaterTopY(state, x, z)
    if (y < 0)
      continue
    waterY = y
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  if (waterY < 0)
    return

  /** 兩岸各搭一格是一定要的；再過去那一格若也是平的就多搭一格，木頭比溪長才像倒下來的樹 */
  const isLevel = (z: number) => findWaterTopY(state, x, z) === waterY || findTopSolidY(state, x, z, DETAIL_SCAN_TOP_Y) === waterY
  for (let z = minZ - 1; z <= maxZ + 1; z++) {
    if (!isLevel(z))
      return
  }
  const fromZ = isLevel(minZ - 2) ? minZ - 2 : minZ - 1
  const toZ = isLevel(maxZ + 2) ? maxZ + 2 : maxZ + 1
  for (let z = fromZ; z <= toZ; z++) {
    setBlock(state, x, waterY + 1, z, BlockId.OAK_LOG_Z)
    if (random() < 0.35)
      setBlock(state, x, waterY + 2, z, BlockId.MOSS_CARPET)
  }
  placeDetail(context, x, fromZ - 2, BlockId.OAK_LOG, BANK_SET)
  scatterDetailRing(context, x, fromZ - 2, 2, 0.5, (pick) => pick() < 0.6 ? BlockId.BROWN_MUSHROOM : BlockId.TWIGS, BANK_SET)
}

/** 釣點：一塊坐的石頭、一只竹簍、一張攤開的網與一截當釣竿的枯枝 */
function buildFishingSpot(context: DetailContext): void {
  const { x, z } = RIVER_FISHING_POINT
  placeDetail(context, x, z, BlockId.COBBLESTONE, BANK_SET)
  placeDetail(context, x + 1, z + 1, BlockId.BASKET, BANK_SET)
  placeDetail(context, x - 1, z + 1, BlockId.TWIGS, BANK_SET)
  placeDetail(context, x + 2, z - 1, BlockId.FISHING_NET, BANK_SET)
  placeDetail(context, x + 3, z - 1, BlockId.FISHING_NET, BANK_SET)
}

/** 跌水北岸的三座疊石：有人每次走到這裡就疊一座 */
function buildCairnGroup(context: DetailContext): void {
  const baseZ = Math.round(measureStreamZ(CASCADE_X - 3)) - 7
  placeCairn(context, CASCADE_X - 3, baseZ, 2, BlockId.MOSSY_COBBLESTONE)
  placeCairn(context, CASCADE_X - 1, baseZ - 1, 1)
  placeCairn(context, CASCADE_X - 5, baseZ - 2, 1)
}

/**
 * 溪心的石頭
 *
 * 從溪底疊到水面上一格，頂上有的長苔。位置用抽的：只挑水深一兩格的地方，
 * 離木橋、倒木與神遊的站點遠一點，溪還是游得過去
 */
function placeStreamRock(context: DetailContext): void {
  const { state, random } = context
  let count = 0
  for (let attempt = 0; attempt < 200 && count < 9; attempt++) {
    const x = Math.round(VALLEY_HEAD_X + 24 + random() * (VALLEY_END_X - VALLEY_HEAD_X - 40))
    const z = Math.round(measureStreamZ(x) + (random() * 2 - 1) * 2)
    const isMossy = random() < 0.5
    if (isKeptOut(context, x, z) || Math.abs(x - RIVER_LOG_BRIDGE_POINT.x) < 4 || Math.abs(x - CASCADE_X) < 4)
      continue
    const waterY = findWaterTopY(state, x, z)
    if (waterY < 0 || getBlock(state, x, waterY + 1, z) !== BlockId.AIR)
      continue
    const bedY = findTopSolidY(state, x, z, waterY)
    if (waterY - bedY > 2)
      continue
    for (let y = bedY + 1; y <= waterY + 1; y++) {
      setBlock(state, x, y, z, isMossy ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
    }
    if (isMossy)
      setBlock(state, x, waterY + 2, z, BlockId.MOSS_CARPET)
    count++
  }
}

/** 礫石灘上的漂流木與草地上的倒木 */
function scatterLog(context: DetailContext): void {
  const { random } = context
  let driftwoodCount = 0
  let oakLogCount = 0
  for (let attempt = 0; attempt < 400 && (driftwoodCount < 6 || oakLogCount < 4); attempt++) {
    const x = Math.round(DETAIL_AREA.minX + 6 + random() * (DETAIL_AREA.maxX - DETAIL_AREA.minX - 12))
    const z = Math.round(measureStreamZ(x) + (random() * 2 - 1) * 14)
    const axis = random() < 0.7 ? 'x' : 'z'
    const ground = findDetailGround(context, x, z)
    if (!ground)
      continue

    if (ground.blockId === BlockId.GRAVEL && driftwoodCount < 6) {
      /** 漂流木順著水流的方向（東西向）躺 */
      if (placeFallenLog(context, { x, z, axis: 'x', length: 2 + Math.floor(random() * 2), logBlockX: BlockId.DEAD_LOG_X, logBlockZ: BlockId.DEAD_LOG_Z, groundSet: BANK_SET }))
        driftwoodCount++
    }
    else if (ground.blockId === BlockId.GRASS && oakLogCount < 4) {
      const isPlaced = placeFallenLog(context, {
        x,
        z,
        axis,
        length: 3 + Math.floor(random() * 2),
        logBlockX: BlockId.OAK_LOG_X,
        logBlockZ: BlockId.OAK_LOG_Z,
        topList: [BlockId.MOSS_CARPET, BlockId.MOSS_CARPET, BlockId.BROWN_MUSHROOM],
        topChance: 0.6,
        stumpBlock: BlockId.OAK_LOG,
        groundSet: GRASS_SET,
      })
      if (isPlaced)
        oakLogCount++
    }
  }
}

/** 造景零件：樹與石燈籠之後、撒花草之前 */
export function placeRiverSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, RIVER_REALM, createSeededRandom('river-set-piece'), DETAIL_SCAN_TOP_Y)
  buildLogBridge(context)
  buildFishingSpot(context)
  buildCairnGroup(context)
  placeStreamRock(context)
  scatterLog(context)
}

/** 靜水處的睡蓮換幾朵蓮：只換已經有睡蓮的格子 */
function bloomLotus(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      for (const y of [UPPER_FLOOR_Y + 1, VALLEY_FLOOR_Y + 1]) {
        if (getBlock(state, x, y, z) === BlockId.LILY_PAD && random() < 0.14)
          setBlock(state, x, y, z, BlockId.LOTUS)
      }
    }
  }
}

/**
 * 谷壁腳下岩階上的苔
 *
 * 谷壁最底下那幾階（比谷底高一到四格）與岸邊的大石：頂上還空著的圓石，成片鋪苔毯，零星長蕨。
 * 再往上不鋪：人抬頭看不到岩階的頂面，鋪了也只是多畫
 */
function coverLedgeMoss(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (isKeptOut(context, x, z) || fbm2D(x * 0.14 + 37, z * 0.14 - 9, 2, 0.5) < 0.02)
        continue
      for (let y = VALLEY_FLOOR_Y + 1; y <= VALLEY_FLOOR_Y + 5; y++) {
        if (!ROCK_SET.has(getBlock(state, x, y, z)) || getBlock(state, x, y + 1, z) !== BlockId.AIR)
          continue
        const roll = random()
        if (roll < 0.5)
          setBlock(state, x, y + 1, z, BlockId.MOSS_CARPET)
        else if (roll < 0.58)
          setBlock(state, x, y + 1, z, BlockId.FERN)
        break
      }
    }
  }
}

/** 橡樹枝下垂的藤：樹冠最底那一層、底下是空的葉子，偶爾垂一兩格 */
function hangVine(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      for (let y = VALLEY_FLOOR_Y + 4; y <= VALLEY_FLOOR_Y + 9; y++) {
        if (getBlock(state, x, y, z) !== BlockId.OAK_LEAVES || getBlock(state, x, y - 1, z) !== BlockId.AIR)
          continue
        if (random() < 0.12) {
          setBlock(state, x, y - 1, z, BlockId.IVY)
          if (random() < 0.4 && getBlock(state, x, y - 2, z) === BlockId.AIR)
            setBlock(state, x, y - 2, z, BlockId.IVY)
        }
        break
      }
    }
  }
}

/** 地被：花草與睡蓮之後補 */
export function scatterRiverDetail(state: Uint8Array): void {
  const context = createDetailContext(state, RIVER_REALM, createSeededRandom('river-detail'), DETAIL_SCAN_TOP_Y)

  bloomLotus(context)
  coverLedgeMoss(context)
  hangVine(context)

  /** 水邊的香蒲：貼著水的草與礫石，成段 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 9,
    frequency: 0.15,
    threshold: 0,
    chance: 0.45,
    pick: () => BlockId.CATTAIL,
    groundSet: BANK_SET,
    isAllowed: (x, z, ground) => isNextToWater(state, x, ground.y, z),
  })

  /** 礫石灘：成堆的碎石、小石與漂流枝 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 33,
    frequency: 0.2,
    threshold: 0.02,
    chance: 0.42,
    pick: (random) => random() < 0.6 ? BlockId.PEBBLES : random() < 0.65 ? BlockId.SMALL_ROCK : BlockId.TWIGS,
    groundSet: GRAVEL_SET,
  })

  /** 草地上成片的白花與蒲公英 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 61,
    frequency: 0.11,
    threshold: 0.26,
    chance: 0.4,
    pick: (random) => random() < 0.7 ? BlockId.FLOWER_WHITE_DANDELION : BlockId.FLOWER_DANDELION,
    groundSet: GRASS_SET,
  })

  /** 貼地的地錦：另一組叢 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 87,
    frequency: 0.13,
    threshold: 0.22,
    chance: 0.5,
    pick: () => BlockId.GROUND_IVY,
    groundSet: GRASS_SET,
  })
}
