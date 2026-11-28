import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { placeSmallBoat } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeBench,
  placeCairn,
  placeDetail,
  placeFallenLog,
  placeRockCluster,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { findTopSolidY, isNextToWater } from '../realm-terrain-kit'
import {
  ISLAND_GROUND_Y,
  ISLAND_POND_RADIUS,
  ISLAND_RADIUS,
  LAKE_BENCH_POINT,
  LAKE_BOAT_POINT,
  LAKE_CAIRN_POINT,
  LAKE_CENTER,
  LAKE_JETTY_LENGTH,
  LAKE_JETTY_POINT,
  LAKE_ROCK_ISLET_POINT,
  LAKE_WATER_Y,
  SHALLOW_WIDTH,
} from './lake-layout'
import { LAKE_REALM } from './lake-realm'

/**
 * 湖中島的細節
 *
 * 只有地形 worker 用。水鏡池是一方很靜的池庭，這裡補的也都是靜的東西：
 * 池畔一張看水的長椅、東岸一條繫著小舟的短棧、西南淺灘裡三顆出水的石頭、南灘一座疊石，
 * 岸邊的香蒲、池裡幾朵蓮、草地上成片的白花與貼地的地錦、沙灘的碎石與漂流枝。
 *
 * 分兩段：造景零件要在撒花草之前擺（位置才是空的），地被在花草與睡蓮之後補
 */

const DETAIL_SCAN_TOP_Y = ISLAND_GROUND_Y + 8

const GRASS_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS])
const SAND_SET: ReadonlySet<BlockId> = new Set([BlockId.SAND, BlockId.GRAVEL])

/** 一顆從湖底立到水面上的石頭，topY 是最上面那一格 */
function placeWaterRock(state: Uint8Array, x: number, z: number, topY: number, blockId: BlockId): void {
  const floorY = findTopSolidY(state, x, z, LAKE_WATER_Y)
  for (let y = floorY + 1; y <= topY; y++) {
    setBlock(state, x, y, z, blockId)
  }
}

/**
 * 水中石
 *
 * 一高一中一低三顆，日本庭園的三尊石組。立在淺灘裡，水清見底，石腳看得到；
 * 最高那顆頂上一層苔，矮的那顆頂上一顆小石
 */
function placeRockIslet(state: Uint8Array): void {
  const { x, z } = LAKE_ROCK_ISLET_POINT
  placeWaterRock(state, x, z, LAKE_WATER_Y + 2, BlockId.MOSSY_COBBLESTONE)
  setBlock(state, x, LAKE_WATER_Y + 3, z, BlockId.MOSS_CARPET)
  placeWaterRock(state, x + 1, z + 1, LAKE_WATER_Y + 1, BlockId.MOSSY_COBBLESTONE)
  placeWaterRock(state, x - 1, z, LAKE_WATER_Y, BlockId.COBBLESTONE)
  setBlock(state, x - 1, LAKE_WATER_Y + 1, z, BlockId.SMALL_ROCK)
}

/**
 * 東岸的短棧與小舟
 *
 * 半磚鋪在湖面上一格（與池裡那條木棧同一種），盡頭一根從湖底立上來的繫船樁。
 * 小舟是潮汐磯那一艘（placeSmallBoat），船底那一層水換成木板：
 * 船是浮著的，從岸上看進去是船板，不是一窪水
 */
function placeJettyAndBoat(context: DetailContext): void {
  const { state } = context
  const { x: startX, z } = LAKE_JETTY_POINT

  for (let step = 0; step < LAKE_JETTY_LENGTH; step++) {
    if (getBlock(state, startX + step, LAKE_WATER_Y + 1, z) === BlockId.AIR)
      setBlock(state, startX + step, LAKE_WATER_Y + 1, z, BlockId.WOOD_SLAB)
  }
  const postX = startX + LAKE_JETTY_LENGTH
  for (let y = findTopSolidY(state, postX, z, LAKE_WATER_Y) + 1; y <= LAKE_WATER_Y + 2; y++) {
    setBlock(state, postX, y, z, BlockId.WOOD_POST)
  }

  const boat = LAKE_BOAT_POINT
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      setBlock(state, boat.x + offsetX, LAKE_WATER_Y, boat.z + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  placeSmallBoat(state, boat.x, LAKE_WATER_Y + 1, boat.z, true)

  /** 棧根的沙灘上：一只竹簍、一張攤開晾的網 */
  placeDetail(context, startX - 1, z - 1, BlockId.BASKET, SAND_SET)
  placeDetail(context, startX - 2, z + 1, BlockId.FISHING_NET, SAND_SET)
  placeDetail(context, startX - 2, z + 2, BlockId.FISHING_NET, SAND_SET)
}

/** 造景零件：要在撒花草之前擺 */
export function placeLakeSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, LAKE_REALM, createSeededRandom('lake-set-piece'), DETAIL_SCAN_TOP_Y)

  placeBench(context, LAKE_BENCH_POINT.x, LAKE_BENCH_POINT.z, 'west')
  placeDetail(context, LAKE_BENCH_POINT.x, LAKE_BENCH_POINT.z - 1, BlockId.BASKET, GRASS_SET)

  placeRockIslet(state)
  placeJettyAndBoat(context)

  placeCairn(context, LAKE_CAIRN_POINT.x, LAKE_CAIRN_POINT.z, 2)
  /** 疊石旁一段被浪推上來的漂流木，順著南岸（東西向）躺；岸線彎，往內外各試一排 */
  for (const offsetZ of [0, -1, 1, -2]) {
    const isPlaced = placeFallenLog(context, {
      x: LAKE_CAIRN_POINT.x + 3,
      z: LAKE_CAIRN_POINT.z + offsetZ,
      axis: 'x',
      length: 3,
      logBlockX: BlockId.DEAD_LOG_X,
      logBlockZ: BlockId.DEAD_LOG_Z,
    })
    if (isPlaced)
      break
  }

  /** 草地上幾處長了苔的石頭，都離池岸與小丘有一點距離 */
  for (const rock of [
    { x: -19, z: 4 },
    { x: 13, z: 14 },
    { x: 18, z: -6 },
    { x: -5, z: -17 },
  ]) {
    const x = LAKE_CENTER.x + rock.x
    const z = LAKE_CENTER.z + rock.z
    if (findDetailGround(context, x, z)?.blockId === BlockId.GRASS)
      placeRockCluster(context, x, z, BlockId.MOSSY_COBBLESTONE, BlockId.MOSS_CARPET)
  }
}

/**
 * 沙灘貼著水的那一圈換成礫石
 *
 * 浪把細沙帶走、留下粗的。只換頂面那一格，成段成段的，整圈都換就只是一條灰邊
 */
function roughenWaterline(context: DetailContext): void {
  const { state } = context
  const reach = ISLAND_RADIUS + 5
  for (let x = LAKE_CENTER.x - reach; x <= LAKE_CENTER.x + reach; x++) {
    for (let z = LAKE_CENTER.z - reach; z <= LAKE_CENTER.z + reach; z++) {
      if (getBlock(state, x, LAKE_WATER_Y, z) !== BlockId.SAND || getBlock(state, x, LAKE_WATER_Y + 1, z) !== BlockId.AIR)
        continue
      if (!isNextToWater(state, x, LAKE_WATER_Y, z))
        continue
      if (fbm2D(x * 0.15 + 91, z * 0.15 + 3, 2, 0.5) > 0.02)
        setBlock(state, x, LAKE_WATER_Y, z, BlockId.GRAVEL)
    }
  }
}

/** 池裡的睡蓮叢心換幾朵蓮：只換已經有睡蓮的格子，數量不變 */
function bloomLotus(context: DetailContext): void {
  const { state, random } = context
  const reach = ISLAND_POND_RADIUS + 4
  for (let x = LAKE_CENTER.x - reach; x <= LAKE_CENTER.x + reach; x++) {
    for (let z = LAKE_CENTER.z - reach; z <= LAKE_CENTER.z + reach; z++) {
      if (getBlock(state, x, ISLAND_GROUND_Y + 1, z) !== BlockId.LILY_PAD)
        continue
      if (fbm2D(x * 0.12 + 41, z * 0.12 - 13, 2, 0.5) > 0.2 && random() < 0.32)
        setBlock(state, x, ISLAND_GROUND_Y + 1, z, BlockId.LOTUS)
    }
  }
}

/** 地被：要在花草與睡蓮之後補 */
export function scatterLakeDetail(state: Uint8Array): void {
  const context = createDetailContext(state, LAKE_REALM, createSeededRandom('lake-detail'), DETAIL_SCAN_TOP_Y)
  const reach = ISLAND_RADIUS + 5
  const area = {
    minX: LAKE_CENTER.x - reach,
    maxX: LAKE_CENTER.x + reach,
    minZ: LAKE_CENTER.z - reach,
    maxZ: LAKE_CENTER.z + reach,
  }

  roughenWaterline(context)
  bloomLotus(context)

  /** 香蒲：只長在貼著水的那一圈，與紙莎草混著 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 7,
    frequency: 0.16,
    threshold: -0.05,
    chance: 0.4,
    pick: () => BlockId.CATTAIL,
    groundSet: new Set([BlockId.GRASS, BlockId.SAND, BlockId.GRAVEL]),
    isAllowed: (x, z, ground) => isNextToWater(state, x, ground.y, z) || isNextToWater(state, x, ground.y - 1, z),
  })

  /** 草地上成片的白花，幾片而已，片與片之間是原本的草 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 23,
    frequency: 0.12,
    threshold: 0.2,
    chance: 0.45,
    pick: (random) => random() < 0.85 ? BlockId.FLOWER_WHITE_DANDELION : BlockId.FLOWER_DANDELION,
    groundSet: GRASS_SET,
  })

  /** 貼地的地錦：另一組叢，多半落在白花之間 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 57,
    frequency: 0.14,
    threshold: 0.18,
    chance: 0.5,
    pick: () => BlockId.GROUND_IVY,
    groundSet: GRASS_SET,
  })

  /** 沙灘：碎石成叢，偶爾一截漂流枝 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 81,
    frequency: 0.2,
    threshold: 0.08,
    chance: 0.4,
    pick: (random) => random() < 0.12 ? BlockId.TWIGS : random() < 0.2 ? BlockId.SMALL_ROCK : BlockId.PEBBLES,
    groundSet: SAND_SET,
  })

  /** 立石腳下一圈碎石：石頭是從地裡冒出來的，腳邊不會乾乾淨淨 */
  for (const stone of [{ x: -13, z: -3 }, { x: 17, z: 5 }, { x: -6, z: 17 }]) {
    scatterDetailRing(context, LAKE_CENTER.x + stone.x, LAKE_CENTER.z + stone.z, 2.2, 0.75, (random) => random() < 0.7 ? BlockId.PEBBLES : BlockId.SMALL_ROCK, GRASS_SET)
  }

  /** 淺灘的水面上零星幾朵蓮，湖面不至於只有睡蓮一種綠 */
  const { random } = context
  for (let x = area.minX - SHALLOW_WIDTH; x <= area.maxX + SHALLOW_WIDTH; x++) {
    for (let z = area.minZ - SHALLOW_WIDTH; z <= area.maxZ + SHALLOW_WIDTH; z++) {
      if (getBlock(state, x, LAKE_WATER_Y + 1, z) === BlockId.LILY_PAD && random() < 0.15)
        setBlock(state, x, LAKE_WATER_Y + 1, z, BlockId.LOTUS)
    }
  }
}
