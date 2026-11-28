import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { carveWater, getNoisyDistance } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeBench,
  placeBoulderPile,
  placeCairn,
  placeDetail,
  placeRockCluster,
  placeSignpost,
  placeWoodPile,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { isNextToWater } from '../realm-terrain-kit'
import {
  ARRIVAL_CLEARING,
  BOULDER_CLEARING,
  FOREST_CENTER,
  FOREST_GROUND_Y,
  FOREST_PATH_POINT_LIST,
  FOREST_WOOD_PILE_POINT,
  SHRINE_CLEARING,
  SPRING_CLEARING,
  THICKET_START_RADIUS,
} from './forest-layout'
import { FOREST_REALM } from './forest-realm'

/**
 * 林海的細節
 *
 * 只有地形 worker 用。松籟林是一片安靜的針葉林，細節補的是「這片林子很老、有人照看」：
 * 倒木上的苔與菇、斷在林下的樹頭、老石板缺角長苔、路邊的碎石、一窪苔石圍著的泉、
 * 林子深處一座長滿苔的大石、空地老橡樹前的供石、落腳處的柴堆與路標。
 *
 * 一片葉子都不加。分兩段：造景零件在撒林下花草之前擺，地被在之後補
 */

/**
 * 找地面時從這一層往下找
 *
 * 林子裡走得到的地面只有原地與高一格的小丘；松的枝葉從樹幹第三格以上才開始，
 * 從這一層往下找不會把樹冠當成地面，倒木（高一格）的頂面則找得到
 */
const DETAIL_SCAN_TOP_Y = FOREST_GROUND_Y + 2

const GRASS_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS])
const LOG_SET: ReadonlySet<BlockId> = new Set([BlockId.DEAD_LOG_X, BlockId.DEAD_LOG_Z])
const BOULDER_BLOCK_LIST = [BlockId.MOSSY_COBBLESTONE, BlockId.MOSSY_COBBLESTONE, BlockId.COBBLESTONE, BlockId.STONE] as const

/** 細節只做在走得到的林子裡，密林那一圈人進不去，看也看不清 */
const DETAIL_REACH = THICKET_START_RADIUS + 2
const DETAIL_AREA = {
  minX: FOREST_CENTER.x - DETAIL_REACH,
  maxX: FOREST_CENTER.x + DETAIL_REACH,
  minZ: FOREST_CENTER.z - DETAIL_REACH,
  maxZ: FOREST_CENTER.z + DETAIL_REACH,
}

function isInsideReach(x: number, z: number): boolean {
  return Math.hypot(x - FOREST_CENTER.x, z - FOREST_CENTER.z) <= DETAIL_REACH
}

/** 這一格離小徑中心線多遠（只在路邊幾格內準，夠用） */
function measurePathDistance(x: number, z: number): number {
  let nearest = Number.POSITIVE_INFINITY
  for (const point of FOREST_PATH_POINT_LIST) {
    nearest = Math.min(nearest, Math.hypot(x - point.x, z - point.z))
  }
  return nearest
}

/**
 * 林間泉
 *
 * 一窪兩三格寬的淺水，黏土鋪底，水面與林地齊平（與水鏡池同一種挖法）。
 * 西、北兩側圍半圈苔石，東側朝小徑的那一面敞著；岸邊香蒲與蕨，北邊一座疊石
 */
function buildSpring(context: DetailContext): void {
  const { state, random } = context
  const { x: centerX, z: centerZ } = SPRING_CLEARING

  for (let x = centerX - 4; x <= centerX + 4; x++) {
    for (let z = centerZ - 4; z <= centerZ + 4; z++) {
      const distance = getNoisyDistance(x, z, centerX, centerZ, 0.3, 0.8)
      if (distance <= 2.3) {
        carveWater(state, x, FOREST_GROUND_Y, z, distance < 1.2 ? 2 : 1, BlockId.CLAY)
        continue
      }
      /** 東側留口：從小徑走過來的那一面看得到水 */
      const isOpenSide = x - centerX >= 2 && Math.abs(z - centerZ) <= 2
      if (distance <= 3.4 && !isOpenSide && random() < 0.6) {
        const y = placeDetail(context, x, z, BlockId.MOSSY_COBBLESTONE, GRASS_SET)
        if (y !== null && random() < 0.55)
          setBlock(state, x, y + 1, z, BlockId.MOSS_CARPET)
      }
    }
  }

  placeCairn(context, centerX - 1, centerZ - 4, 1, BlockId.MOSSY_COBBLESTONE)
  placeDetail(context, centerX + 3, centerZ + 3, BlockId.BASKET, GRASS_SET)

  /** 水面一兩片睡蓮、一朵蓮 */
  for (const pad of [{ x: 0, z: -1, blockId: BlockId.LILY_PAD }, { x: -1, z: 1, blockId: BlockId.LOTUS }]) {
    const x = centerX + pad.x
    const z = centerZ + pad.z
    if (getBlock(state, x, FOREST_GROUND_Y, z) === BlockId.WATER && getBlock(state, x, FOREST_GROUND_Y + 1, z) === BlockId.AIR)
      setBlock(state, x, FOREST_GROUND_Y + 1, z, pad.blockId)
  }

  /**
   * 從小徑引過來的飛石
   *
   * 隔一兩格一顆、左右偏一點，不是一條路，是有人常走踩出來的幾個落腳處。
   * 只落在空著的草地上，碰到樹就跳過
   */
  const pathPoint = FOREST_PATH_POINT_LIST.reduce((nearest, point) => (
    Math.hypot(point.x - centerX, point.z - centerZ) < Math.hypot(nearest.x - centerX, nearest.z - centerZ) ? point : nearest
  ))
  const startX = centerX + 4
  const stepCount = Math.max(0, Math.round(pathPoint.x) - 2 - startX)
  for (let step = 0; step <= stepCount; step += random() < 0.5 ? 2 : 3) {
    const ratio = stepCount === 0 ? 0 : step / stepCount
    const x = startX + step
    const z = Math.round(centerZ + (pathPoint.z - centerZ) * ratio + (random() - 0.5) * 1.4)
    placeDetail(context, x, z, BlockId.STEPPING_STONE, GRASS_SET)
  }
}

/** 苔巖：三格高的一座大石，頂面一層苔，腳邊蕨與碎石 */
function buildBoulder(context: DetailContext): void {
  const { x, z } = BOULDER_CLEARING
  placeBoulderPile(context, x, z, 3, BOULDER_BLOCK_LIST, BlockId.MOSS_CARPET, 0.75)
  /** 旁邊再一顆矮的，兩顆石頭才有主從 */
  placeBoulderPile(context, x + 3, z + 1, 2, BOULDER_BLOCK_LIST, BlockId.MOSS_CARPET, 0.6)
  scatterDetailRing(context, x, z, 4, 0.5, (random) => random() < 0.7 ? BlockId.FERN : BlockId.BROWN_MUSHROOM, GRASS_SET)
}

/**
 * 空地老橡樹前的供石
 *
 * 樹幹南側一格一塊石板，上面一盆花；兩側一只竹簍、一株月見草。
 * 空地東緣一張長椅，椅背朝東，坐著看的是老橡樹與兩盞石燈籠
 */
function dressShrine(context: DetailContext): void {
  const { x, z } = SHRINE_CLEARING
  const altarY = placeDetail(context, x, z - 1, BlockId.STONE_TILE, GRASS_SET)
  if (altarY !== null)
    setBlock(context.state, x, altarY + 1, z - 1, BlockId.FLOWER_POT)
  placeDetail(context, x - 1, z - 1, BlockId.BASKET, GRASS_SET)
  placeDetail(context, x + 1, z - 1, BlockId.MOON_FLOWER, GRASS_SET)
  placeBench(context, x + 5, z - 1, 'east')
  scatterDetailRing(context, x, z - 2, 3, 0.35, () => BlockId.FALLEN_LEAVES, GRASS_SET)
}

/** 落腳空地：東緣的柴堆與斧頭、小徑離開空地那一口的路標 */
function dressArrival(context: DetailContext): void {
  placeWoodPile(context, FOREST_WOOD_PILE_POINT.x, FOREST_WOOD_PILE_POINT.z, 'z', BlockId.OAK_LOG_X, BlockId.OAK_LOG_Z, BlockId.OAK_LOG)
  placeSignpost(context, ARRIVAL_CLEARING.x - 2, ARRIVAL_CLEARING.z - ARRIVAL_CLEARING.radius + 1, 'x')
}

/**
 * 林下的樹頭與石
 *
 * 樹頭是斷掉的樹留下的一格樹幹，頂上一層苔，腳邊一圈菇；石頭是半埋在土裡的苔石。
 * 位置用抽的，落在樹幹、小徑或空地上就不放
 */
function scatterStumpAndRock(context: DetailContext): void {
  const { random } = context
  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 6 + random() * (DETAIL_REACH - 8)
    const x = Math.round(FOREST_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(FOREST_CENTER.z + Math.sin(angle) * radius)
    const isStump = random() < 0.55
    const ground = findDetailGround(context, x, z)
    if (!ground || ground.blockId !== BlockId.GRASS || measurePathDistance(x, z) < 2.5)
      continue
    if (Math.hypot(x - ARRIVAL_CLEARING.x, z - ARRIVAL_CLEARING.z) < ARRIVAL_CLEARING.radius
      || Math.hypot(x - SHRINE_CLEARING.x, z - SHRINE_CLEARING.z) < SHRINE_CLEARING.radius) {
      continue
    }

    if (isStump) {
      setBlock(context.state, x, ground.y + 1, z, random() < 0.75 ? BlockId.PINE_LOG : BlockId.OAK_LOG)
      setBlock(context.state, x, ground.y + 2, z, BlockId.MOSS_CARPET)
      scatterDetailRing(context, x, z, 1.8, 0.5, (pick) => pick() < 0.6 ? BlockId.BROWN_MUSHROOM : BlockId.MUSHROOM, GRASS_SET)
    }
    else {
      placeRockCluster(context, x, z, BlockId.MOSSY_COBBLESTONE, BlockId.MOSS_CARPET)
    }
  }
}

/** 造景零件：樹與倒木之後、林下花草之前 */
export function placeForestSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, FOREST_REALM, createSeededRandom('forest-set-piece'), DETAIL_SCAN_TOP_Y)
  buildSpring(context)
  buildBoulder(context)
  dressShrine(context)
  dressArrival(context)
  scatterStumpAndRock(context)
}

/**
 * 倒木頂上的苔與菇
 *
 * 只找已經躺在那裡的倒木：頂上還空著的格子，四成鋪苔、一成長菇
 */
function coverFallenLog(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      for (const y of [FOREST_GROUND_Y + 1, FOREST_GROUND_Y + 2]) {
        if (!LOG_SET.has(getBlock(state, x, y, z)) || getBlock(state, x, y + 1, z) !== BlockId.AIR)
          continue
        const roll = random()
        if (roll < 0.42)
          setBlock(state, x, y + 1, z, BlockId.MOSS_CARPET)
        else if (roll < 0.54)
          setBlock(state, x, y + 1, z, random() < 0.6 ? BlockId.BROWN_MUSHROOM : BlockId.MUSHROOM)
      }
    }
  }
}

/**
 * 老石板
 *
 * 石板小徑成段地缺角：換成圓石或苔石，只換頂面那一格，走起來一樣平。
 * 落腳空地與神社空地裡的那幾段不換，門口與鳥居前是有人掃的
 */
function ageStonePath(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (getBlock(state, x, FOREST_GROUND_Y, z) !== BlockId.STONE_TILE)
        continue
      if (Math.hypot(x - ARRIVAL_CLEARING.x, z - ARRIVAL_CLEARING.z) < ARRIVAL_CLEARING.radius + 2
        || Math.hypot(x - SHRINE_CLEARING.x, z - SHRINE_CLEARING.z) < SHRINE_CLEARING.radius) {
        continue
      }
      if (fbm2D(x * 0.22 + 3, z * 0.22 + 77, 2, 0.5) > 0.12 && random() < 0.7)
        setBlock(state, x, FOREST_GROUND_Y, z, random() < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
    }
  }
}

/**
 * 橡樹枝下垂的藤
 *
 * 只有橡樹（林子裡一成的樹）：樹冠最底那一層、底下是空的葉子，偶爾垂一兩格常春藤。
 * 不是葉子的方塊，是交叉立板，貴不到哪裡去
 */
function hangVine(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (!isInsideReach(x, z))
        continue
      for (let y = FOREST_GROUND_Y + 4; y <= FOREST_GROUND_Y + 9; y++) {
        if (getBlock(state, x, y, z) !== BlockId.OAK_LEAVES || getBlock(state, x, y - 1, z) !== BlockId.AIR)
          continue
        if (random() < 0.1) {
          setBlock(state, x, y - 1, z, BlockId.IVY)
          if (random() < 0.4 && getBlock(state, x, y - 2, z) === BlockId.AIR)
            setBlock(state, x, y - 2, z, BlockId.IVY)
        }
        break
      }
    }
  }
}

/** 地被：林下花草之後補 */
export function scatterForestDetail(state: Uint8Array): void {
  const context = createDetailContext(state, FOREST_REALM, createSeededRandom('forest-detail'), DETAIL_SCAN_TOP_Y)

  coverFallenLog(context)
  ageStonePath(context)
  hangVine(context)

  /** 泉邊的香蒲：只長在貼著水的那一圈 */
  for (let x = SPRING_CLEARING.x - 4; x <= SPRING_CLEARING.x + 4; x++) {
    for (let z = SPRING_CLEARING.z - 4; z <= SPRING_CLEARING.z + 4; z++) {
      const ground = findDetailGround(context, x, z)
      if (ground?.blockId === BlockId.GRASS && isNextToWater(state, x, ground.y, z) && context.random() < 0.55)
        setBlock(state, x, ground.y + 1, z, context.random() < 0.7 ? BlockId.CATTAIL : BlockId.FERN)
    }
  }

  /** 貼地的地錦：成片，落在樹與樹之間比較透光的地方 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 19,
    frequency: 0.11,
    threshold: 0.16,
    chance: 0.5,
    pick: () => BlockId.GROUND_IVY,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isInsideReach(x, z),
  })

  /** 幾片堇：林下的花不多，成片出現才看得到 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 63,
    frequency: 0.13,
    threshold: 0.36,
    chance: 0.4,
    pick: () => BlockId.FLOWER_VIOLA,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isInsideReach(x, z),
  })

  /** 路邊的碎石與掉下來的枯枝：只在石板兩側兩格內 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 91,
    frequency: 0.2,
    threshold: -0.1,
    chance: 0.3,
    pick: (random) => random() < 0.7 ? BlockId.PEBBLES : random() < 0.5 ? BlockId.TWIGS : BlockId.SMALL_ROCK,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => {
      const distance = measurePathDistance(x, z)
      return distance > 1.05 && distance < 3.2
    },
  })
}
