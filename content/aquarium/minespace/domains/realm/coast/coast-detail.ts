import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeDetail,
  placeFallenLog,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { findTopSolidY, isNextToWater } from '../realm-terrain-kit'
import {
  COAST_CENTER,
  COAST_FIRE_RING_POINT,
  COAST_FISHING_POINT,
  COAST_REEF_ROCK_POINT,
  DUNE_GROUND_Y,
  measureCoastShoreDistance,
  SAND_ISLAND_RADIUS,
  SEA_WATER_Y,
} from './coast-layout'
import { COAST_REALM } from './coast-realm'

/**
 * 海中沙島的細節
 *
 * 只有地形 worker 用。潮汐磯說的是「潮水來過又退了」，細節補的就是潮水留下來的東西與住在潮邊的人：
 * 灘上成片的貝殼與碎石、潮池底的珊瑚骨、外海一座出水的礁岩、
 * 晾著網的矮籬與漁具、沙丘腳下一圈熄了的營火、沙丘上貼著沙爬的濱藤。
 *
 * 分兩段：造景零件在撒花草之前擺，地被在之後補
 */

const DETAIL_SCAN_TOP_Y = DUNE_GROUND_Y + 3

const SAND_SET: ReadonlySet<BlockId> = new Set([BlockId.SAND])
const REEF_BLOCK_LIST = [BlockId.STONE, BlockId.COBBLESTONE, BlockId.STONE, BlockId.CORAL_SKELETON] as const

const DETAIL_REACH = SAND_ISLAND_RADIUS + 8
const DETAIL_AREA = {
  minX: COAST_CENTER.x - DETAIL_REACH,
  maxX: COAST_CENTER.x + DETAIL_REACH,
  minZ: COAST_CENTER.z - DETAIL_REACH - 4,
  maxZ: COAST_CENTER.z + DETAIL_REACH + 4,
}

/** 一顆從海底立上來的礁石，topY 是最上面那一格 */
function placeSeaRock(context: DetailContext, x: number, z: number, topY: number): void {
  const { state, random } = context
  const floorY = findTopSolidY(state, x, z, SEA_WATER_Y)
  for (let y = floorY + 1; y <= topY; y++) {
    setBlock(state, x, y, z, REEF_BLOCK_LIST[Math.floor(random() * REEF_BLOCK_LIST.length)]!)
  }
}

/**
 * 外海的礁岩
 *
 * 中間兩顆高出水面兩格，四周一圈剛好出水或剛好沒在水下：浪一來就蓋過去的那種。
 * 最高那顆旁邊留一格凹下去的潮池，頂上幾片貝殼。腳邊的海底補幾塊珊瑚
 */
function buildReefRock(context: DetailContext): void {
  const { state, random } = context
  const { x, z } = COAST_REEF_ROCK_POINT

  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      const distance = Math.hypot(offsetX, offsetZ * 1.2)
      if (distance > 2.4 || (distance > 1.6 && random() < 0.45))
        continue
      const topY = distance < 0.8
        ? SEA_WATER_Y + 2
        : distance < 1.7 ? SEA_WATER_Y + (random() < 0.5 ? 1 : 0) : SEA_WATER_Y - (random() < 0.5 ? 1 : 0)
      placeSeaRock(context, x + offsetX, z + offsetZ, topY)
    }
  }
  placeSeaRock(context, x + 1, z, SEA_WATER_Y + 1)
  /** 礁頂的潮池：最高那顆的東側挖一格水 */
  setBlock(state, x + 1, SEA_WATER_Y + 1, z, BlockId.WATER)
  placeSeaRock(context, x + 2, z, SEA_WATER_Y + 1)
  placeSeaRock(context, x + 1, z - 1, SEA_WATER_Y + 1)
  placeSeaRock(context, x + 1, z + 1, SEA_WATER_Y + 1)
  setBlock(state, x, SEA_WATER_Y + 3, z, BlockId.SEASHELLS)
  setBlock(state, x + 2, SEA_WATER_Y + 2, z, BlockId.SMALL_ROCK)
}

/**
 * 晾網的矮籬與漁具
 *
 * 四格長的木籬順著岸（東西向），籬腳兩側的沙上攤著網；西端一只木桶、一口木箱，旁邊一只竹簍
 */
function buildFishingCorner(context: DetailContext): void {
  const { x, z } = COAST_FISHING_POINT
  for (let step = 0; step < 4; step++) {
    placeDetail(context, x + step, z, BlockId.FENCE, SAND_SET)
  }
  for (const net of [{ x: 0, z: 1 }, { x: 1, z: 1 }, { x: 2, z: -1 }, { x: 3, z: 1 }, { x: 1, z: 2 }]) {
    placeDetail(context, x + net.x, z + net.z, BlockId.FISHING_NET, SAND_SET)
  }
  placeDetail(context, x - 1, z, BlockId.BARREL, SAND_SET)
  placeDetail(context, x - 2, z + 1, BlockId.CRATE, SAND_SET)
  placeDetail(context, x - 1, z - 1, BlockId.BASKET, SAND_SET)
  placeDetail(context, x + 4, z - 1, BlockId.BASKET, SAND_SET)
}

/**
 * 熄了的營火
 *
 * 中間一截燒黑的木頭（不發光），四邊各一顆小石，西側一根漂流木當椅子。
 * 夜裡這裡是暗的：有人來過、走了
 */
function buildFireRing(context: DetailContext): void {
  const { x, z } = COAST_FIRE_RING_POINT
  if (placeDetail(context, x, z, BlockId.CHARRED_LOG_X, SAND_SET) === null)
    return
  for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    placeDetail(context, x + offsetX, z + offsetZ, BlockId.SMALL_ROCK, SAND_SET)
  }
  placeDetail(context, x + 1, z + 1, BlockId.PEBBLES, SAND_SET)
  placeDetail(context, x - 1, z - 1, BlockId.TWIGS, SAND_SET)
  /** 沙丘起伏，三個位置依序試，放得下的第一個就是椅子 */
  for (const seat of [{ x: -3, z: -1, axis: 'z' }, { x: 3, z: -1, axis: 'z' }, { x: -1, z: 3, axis: 'x' }, { x: -1, z: -3, axis: 'x' }] as const) {
    const isPlaced = placeFallenLog(context, { x: x + seat.x, z: z + seat.z, axis: seat.axis, length: 3, logBlockX: BlockId.DEAD_LOG_X, logBlockZ: BlockId.DEAD_LOG_Z })
    if (isPlaced)
      break
  }
}

/** 小舟旁的沙堡：一塊砂岩上插一截枯枝當旗，四周幾片貝殼 */
function buildSandCastle(context: DetailContext): void {
  const x = COAST_CENTER.x + 6
  const z = COAST_CENTER.z + 9
  const y = placeDetail(context, x, z, BlockId.SANDSTONE, SAND_SET)
  if (y === null)
    return
  setBlock(context.state, x, y + 1, z, BlockId.TWIGS)
  scatterDetailRing(context, x, z, 1.6, 0.8, () => BlockId.SEASHELLS, SAND_SET)
}

/** 造景零件：撒花草之前 */
export function placeCoastSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, COAST_REALM, createSeededRandom('coast-set-piece'), DETAIL_SCAN_TOP_Y)
  buildReefRock(context)
  buildFishingCorner(context)
  buildFireRing(context)
  buildSandCastle(context)
}

/**
 * 潮池
 *
 * 池底的沙換成珊瑚骨與零星的橘珊瑚（退潮留在窪裡的），池邊一圈貝殼與小石。
 * 只換池底那一格，水的格數不變
 */
function dressTidePool(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (measureCoastShoreDistance(x, z) >= SAND_ISLAND_RADIUS || getBlock(state, x, SEA_WATER_Y, z) !== BlockId.WATER)
        continue
      if (getBlock(state, x, SEA_WATER_Y - 1, z) === BlockId.SAND && random() < 0.5)
        setBlock(state, x, SEA_WATER_Y - 1, z, random() < 0.75 ? BlockId.CORAL_SKELETON : BlockId.CORAL_ORANGE)
      scatterDetailRing(context, x, z, 1.5, 0.45, (pick) => pick() < 0.7 ? BlockId.SEASHELLS : BlockId.SMALL_ROCK, SAND_SET)
    }
  }
}

/** 地被：花草之後補 */
export function scatterCoastDetail(state: Uint8Array): void {
  const context = createDetailContext(state, COAST_REALM, createSeededRandom('coast-detail'), DETAIL_SCAN_TOP_Y)
  const isFlat = (y: number) => y === SEA_WATER_Y

  dressTidePool(context)

  /** 灘上的貝殼：成片，潮水把它們堆在同一段岸 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 11,
    frequency: 0.2,
    threshold: 0.02,
    chance: 0.5,
    pick: (random) => random() < 0.8 ? BlockId.SEASHELLS : BlockId.PEBBLES,
    groundSet: SAND_SET,
    isAllowed: (_x, _z, ground) => isFlat(ground.y),
  })

  /** 貼著海的那一排：碎石與被浪推上來的枯枝 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 37,
    frequency: 0.18,
    threshold: -0.02,
    chance: 0.35,
    pick: (random) => random() < 0.6 ? BlockId.PEBBLES : random() < 0.6 ? BlockId.TWIGS : BlockId.SMALL_ROCK,
    groundSet: SAND_SET,
    isAllowed: (x, z, ground) => isFlat(ground.y) && isNextToWater(state, x, ground.y, z),
  })

  /** 沙丘上貼著沙爬的濱藤：只長在比灘高的沙地 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 53,
    frequency: 0.16,
    threshold: 0.12,
    chance: 0.55,
    pick: () => BlockId.GROUND_IVY,
    groundSet: SAND_SET,
    isAllowed: (_x, _z, ground) => ground.y >= DUNE_GROUND_Y,
  })

  /** 丘頂成叢的乾草：風把草籽吹到最高的地方 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 79,
    frequency: 0.22,
    threshold: 0,
    chance: 0.45,
    pick: (random) => random() < 0.8 ? BlockId.DRY_GRASS : BlockId.TWIGS,
    groundSet: SAND_SET,
    isAllowed: (_x, _z, ground) => ground.y >= DUNE_GROUND_Y + 1,
  })

  /** 漂流木旁邊的枯枝與碎石：木頭擋下來的 */
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      const blockId = getBlock(state, x, SEA_WATER_Y + 1, z)
      if ((blockId === BlockId.DEAD_LOG_X || blockId === BlockId.DEAD_LOG_Z) && context.random() < 0.5)
        scatterDetailRing(context, x, z, 1.5, 0.5, (pick) => pick() < 0.5 ? BlockId.TWIGS : BlockId.PEBBLES, SAND_SET)
    }
  }

  /** 沙丘上零星幾顆半埋的石頭 */
  for (const rock of [{ x: -6, z: 2 }, { x: 4, z: -1 }, { x: 9, z: 8 }]) {
    const x = COAST_CENTER.x + rock.x
    const z = COAST_CENTER.z + rock.z
    if (findDetailGround(context, x, z)?.blockId === BlockId.SAND) {
      placeDetail(context, x, z, BlockId.SMALL_ROCK)
      scatterDetailRing(context, x, z, 1.5, 0.6, () => BlockId.PEBBLES, SAND_SET)
    }
  }
}
