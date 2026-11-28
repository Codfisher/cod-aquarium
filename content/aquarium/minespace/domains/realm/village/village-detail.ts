import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import {
  createDetailContext,
  findDetailGround,
  placeBench,
  placeBoulderPile,
  placeCairn,
  placeDetail,
  placeSignpost,
  placeWoodPile,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import {
  FIELD_OUTER_RADIUS,
  FIELD_Y,
  STREAM_Z,
  TERRACE_GROUND_Y,
  TERRACE_RADIUS,
  TERRACE_Y,
  VILLAGE_CENTER,
  VILLAGE_HAYSTACK_POINT,
  VILLAGE_LOOKOUT_POINT,
  VILLAGE_PUSH_RADIUS,
} from './village-layout'
import { VILLAGE_REALM } from './village-realm'

/**
 * 鐘聲村的細節
 *
 * 只有地形 worker 用。市井坊的村子本身已經很滿（屋、攤、井、田），細節補在村子外圍與人做事的痕跡上：
 * 村西田裡的草垛場與稻草人、屋旁的柴堆與斧頭、水道邊洗東西的木桶與水面的睡蓮、
 * 田間小路口的路標、外圍丘陵上的石、疊石、成片的野花與一張回頭看村子的長椅。
 *
 * 屋頂底下不放東西：找地面是從高處往下找，會先碰到屋頂，所以每一樣都限定腳下是草（或指定的石岸）。
 * 分兩段：造景零件在種田之前擺（田裡的作物會繞著它們長），地被在花草之後補
 */

const DETAIL_SCAN_TOP_Y = FIELD_Y + 16

const GRASS_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS])
const BOULDER_BLOCK_LIST = [BlockId.COBBLESTONE, BlockId.STONE, BlockId.MOSSY_COBBLESTONE] as const

/** 丘陵上做細節的範圍：田的外緣到推回線外幾格，再遠人走不到 */
const HILL_INNER_RADIUS = FIELD_OUTER_RADIUS + 3
const HILL_OUTER_RADIUS = VILLAGE_PUSH_RADIUS + 6

function measureRadius(x: number, z: number): number {
  return Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z)
}

function isOnHill(x: number, z: number): boolean {
  const radius = measureRadius(x, z)
  return radius > HILL_INNER_RADIUS && radius < HILL_OUTER_RADIUS
}

/**
 * 稻草人
 *
 * 一截木籬當腳、一塊稻草當身體、頂上一只竹簍當頭（竹簍是貼著格子底的小方塊，正好坐在稻草上）
 */
function placeScarecrow(context: DetailContext, x: number, z: number): boolean {
  const y = placeDetail(context, x, z, BlockId.FENCE, GRASS_SET)
  if (y === null)
    return false
  setBlock(context.state, x, y + 1, z, BlockId.HAY)
  setBlock(context.state, x, y + 2, z, BlockId.BASKET)
  return true
}

/**
 * 草垛場
 *
 * 一座兩格見方、兩格高、頂上再一塊的大草垛，東邊兩捆散的；稻草人站在西邊，
 * 鋤頭躺在草垛前、一只竹簍、一只木桶與一口木箱。田裡的人收工了，東西還沒收
 */
function buildHaystackYard(context: DetailContext): void {
  const { state } = context
  const { x, z } = VILLAGE_HAYSTACK_POINT

  for (const [offsetX, offsetZ] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const y = placeDetail(context, x + offsetX, z + offsetZ, BlockId.HAY, GRASS_SET)
    if (y !== null)
      setBlock(state, x + offsetX, y + 1, z + offsetZ, BlockId.HAY)
  }
  if (getBlock(state, x, FIELD_Y + 2, z) === BlockId.HAY)
    setBlock(state, x, FIELD_Y + 3, z, BlockId.HAY)

  placeDetail(context, x + 4, z, BlockId.HAY, GRASS_SET)
  placeDetail(context, x + 4, z + 2, BlockId.HAY, GRASS_SET)
  placeScarecrow(context, x - 4, z + 1)
  placeDetail(context, x + 2, z - 2, BlockId.TOOL_HOE, GRASS_SET)
  placeDetail(context, x - 1, z - 1, BlockId.BASKET, GRASS_SET)
  placeDetail(context, x + 3, z + 3, BlockId.BARREL, GRASS_SET)
  placeDetail(context, x - 2, z + 3, BlockId.CRATE, GRASS_SET)
}

/** 南丘的見晴長椅：椅背朝南（上坡那一側），坐著往北看村子；旁邊一座疊石與一根路標 */
function buildLookout(context: DetailContext): void {
  const { x, z } = VILLAGE_LOOKOUT_POINT
  placeBench(context, x, z, 'south')
  placeCairn(context, x + 3, z, 2)
  placeSignpost(context, x - 2, z - 1, 'x')
  placeDetail(context, x - 1, z, BlockId.BASKET, GRASS_SET)
}

/**
 * 水道邊
 *
 * 北岸的石岸上一只木桶、一只竹簍（洗東西的人放的）；水面零星幾片睡蓮與蓮。
 * 石岸在台地那一層，東西放在上面一格
 */
function dressStream(context: DetailContext): void {
  const { state, random } = context
  const streamZ = VILLAGE_CENTER.z + STREAM_Z
  for (const prop of [{ x: 8, blockId: BlockId.BARREL }, { x: 9, blockId: BlockId.BASKET }, { x: -14, blockId: BlockId.BASKET }]) {
    const x = VILLAGE_CENTER.x + prop.x
    if (getBlock(state, x, TERRACE_Y, streamZ - 1) === BlockId.COBBLESTONE && getBlock(state, x, TERRACE_GROUND_Y, streamZ - 1) === BlockId.AIR)
      setBlock(state, x, TERRACE_GROUND_Y, streamZ - 1, prop.blockId)
  }
  for (let x = VILLAGE_CENTER.x - TERRACE_RADIUS; x <= VILLAGE_CENTER.x + TERRACE_RADIUS; x++) {
    for (const z of [streamZ, streamZ + 1]) {
      if (getBlock(state, x, TERRACE_Y, z) !== BlockId.WATER || getBlock(state, x, TERRACE_GROUND_Y, z) !== BlockId.AIR)
        continue
      if (random() < 0.09)
        setBlock(state, x, TERRACE_GROUND_Y, z, random() < 0.3 ? BlockId.LOTUS : BlockId.LILY_PAD)
    }
  }
}

/** 丘陵上的石與疊石：位置用抽的，只落在草坡上 */
function scatterHillRock(context: DetailContext): void {
  const { random } = context
  let boulderCount = 0
  let cairnCount = 0
  for (let attempt = 0; attempt < 200 && (boulderCount < 12 || cairnCount < 3); attempt++) {
    const angle = random() * Math.PI * 2
    const radius = HILL_INNER_RADIUS + 3 + random() * (HILL_OUTER_RADIUS - HILL_INNER_RADIUS - 5)
    const x = Math.round(VILLAGE_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(VILLAGE_CENTER.z + Math.sin(angle) * radius)
    const isCairn = random() < 0.2
    if (findDetailGround(context, x, z)?.blockId !== BlockId.GRASS)
      continue
    if (isCairn && cairnCount < 3) {
      if (placeCairn(context, x, z, 2))
        cairnCount++
    }
    else if (boulderCount < 12 && placeBoulderPile(context, x, z, 2 + (random() < 0.35 ? 1 : 0), BOULDER_BLOCK_LIST, BlockId.MOSS_CARPET, 0.4)) {
      boulderCount++
    }
  }
}

/** 造景零件：種田之前 */
export function placeVillageSetPieceList(state: Uint8Array): void {
  const context = createDetailContext(state, VILLAGE_REALM, createSeededRandom('village-set-piece'), DETAIL_SCAN_TOP_Y)

  buildHaystackYard(context)
  buildLookout(context)
  dressStream(context)

  /** 田裡另外三個稻草人，各守一塊田 */
  for (const point of [{ x: 44, z: -20 }, { x: -12, z: 47 }, { x: 20, z: -46 }]) {
    placeScarecrow(context, VILLAGE_CENTER.x + point.x, VILLAGE_CENTER.z + point.z)
  }

  /** 屋旁的柴堆：都在台地的草地上，落在屋簷下或石板上的那一處就不放 */
  for (const pile of [
    { x: -31, z: -4, axis: 'x' },
    { x: 3, z: -6, axis: 'z' },
    { x: 31, z: 6, axis: 'z' },
    { x: -12, z: 21, axis: 'x' },
  ] as const) {
    const x = VILLAGE_CENTER.x + pile.x
    const z = VILLAGE_CENTER.z + pile.z
    if (findDetailGround(context, x, z)?.blockId === BlockId.GRASS)
      placeWoodPile(context, x, z, pile.axis, BlockId.OAK_LOG_X, BlockId.OAK_LOG_Z, BlockId.OAK_LOG)
  }

  /** 南北兩條田間小路出村的地方各一根路標 */
  for (const sign of [{ x: 4, z: -TERRACE_RADIUS - 5 }, { x: -4, z: TERRACE_RADIUS + 5 }]) {
    const x = VILLAGE_CENTER.x + sign.x
    const z = VILLAGE_CENTER.z + sign.z
    if (findDetailGround(context, x, z)?.blockId === BlockId.GRASS)
      placeSignpost(context, x, z, 'z')
  }

  scatterHillRock(context)
}

/** 地被：花草之後補，只做在外圍的丘陵上 */
export function scatterVillageDetail(state: Uint8Array): void {
  const context = createDetailContext(state, VILLAGE_REALM, createSeededRandom('village-detail'), DETAIL_SCAN_TOP_Y)
  const area = {
    minX: VILLAGE_CENTER.x - HILL_OUTER_RADIUS,
    maxX: VILLAGE_CENTER.x + HILL_OUTER_RADIUS,
    minZ: VILLAGE_CENTER.z - HILL_OUTER_RADIUS,
    maxZ: VILLAGE_CENTER.z + HILL_OUTER_RADIUS,
  }

  /** 丘上的野花：一片白一片紫，片與片之間是草 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 29,
    frequency: 0.09,
    threshold: 0.28,
    chance: 0.35,
    pick: (random) => random() < 0.8 ? BlockId.FLOWER_WHITE_DANDELION : BlockId.BIG_FLOWER,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isOnHill(x, z),
  })
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 67,
    frequency: 0.1,
    threshold: 0.32,
    chance: 0.35,
    pick: () => BlockId.FLOWER_VIOLA,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isOnHill(x, z),
  })

  /** 丘上的灌叢與蕨：成團，草坡遠看才不是一整片同一種綠 */
  scatterDetailCluster(context, {
    ...area,
    noiseOffset: 93,
    frequency: 0.13,
    threshold: 0.34,
    chance: 0.4,
    pick: (random) => random() < 0.45 ? BlockId.BUSH : BlockId.FERN,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isOnHill(x, z),
  })

  /** 草垛腳邊掉下來的草屑與稻草人腳下的雜草 */
  scatterDetailRing(context, VILLAGE_HAYSTACK_POINT.x + 1, VILLAGE_HAYSTACK_POINT.z + 1, 4, 0.35, (random) => random() < 0.6 ? BlockId.DRY_GRASS : BlockId.TWIGS, GRASS_SET)
}
