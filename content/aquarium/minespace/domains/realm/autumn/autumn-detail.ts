import type { PlanePoint } from '../land-realm-kit'
import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import { samplePathCurve } from '../land-realm-kit'
import {
  createDetailContext,
  findDetailGround,
  placeBench,
  placeCairn,
  placeDetail,
  placeFallenLog,
  placeRockCluster,
  placeSignpost,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import {
  AUTUMN_CENTER,
  AUTUMN_LEAF_PILE_POINT,
  AUTUMN_LOOKOUT_POINT,
  AUTUMN_STELE_POINT,
  AUTUMN_STELE_TRAIL_CONTROL_LIST,
  AUTUMN_TRAIL_CONTROL_LIST,
  GROVE_GROUND_Y,
  GROVE_RADIUS,
  GROVE_RIM_WIDTH,
  measureGroveDistance,
} from './autumn-layout'
import { AUTUMN_REALM } from './autumn-realm'

/**
 * 金葉林的細節
 *
 * 只有地形 worker 用。金葉苑的主角是一地乾葉，細節補的是「葉子落了很久、有人在裡面走動」：
 * 落葉裡踩出來的一線土徑、耙沙邊的落葉堆與耙子、躺在葉子裡的白楊倒木與菇、
 * 半埋在葉子底下的石頭、東北一塊立在石板上的刻紋石碑、北緣一張看遠丘的長椅。
 *
 * 林地的地面本來就幾乎鋪滿，所以這一層多半是「換」不是「加」：落葉與乾草當成空的，
 * 細節放上去就是換掉那一片（見 realm-detail-kit 的 replaceableSet）。
 * 種樹之前不動任何東西：神遊的特色清單指著兩棵特定的白楊，樹的位置一變就指空了
 */

const DETAIL_SCAN_TOP_Y = GROVE_GROUND_Y + 2

const GRASS_SET: ReadonlySet<BlockId> = new Set([BlockId.GRASS, BlockId.DIRT])
/** 可以換掉的地被：落葉、乾草、枯灌與高草 */
const REPLACEABLE_SET: ReadonlySet<BlockId> = new Set([
  BlockId.FALLEN_LEAVES,
  BlockId.DRY_GRASS,
  BlockId.DRY_SHRUB,
  BlockId.TALL_GRASS,
])

/** 細節只做在林地那一層（含矮一格的唇），坡與低林不做 */
const DETAIL_AREA = {
  minX: AUTUMN_CENTER.x - GROVE_RADIUS - 6,
  maxX: AUTUMN_CENTER.x + GROVE_RADIUS + 6,
  minZ: AUTUMN_CENTER.z - GROVE_RADIUS - 6,
  maxZ: AUTUMN_CENTER.z + GROVE_RADIUS + 6,
}

function isOnGrove(x: number, z: number): boolean {
  return measureGroveDistance(x, z) < GROVE_RADIUS - GROVE_RIM_WIDTH - 1
}

/**
 * 踩出來的土徑
 *
 * 沿著骨架一格一格走：草皮換成土，頂上的落葉多半踩散了（留兩成），乾草與枯灌拿掉。
 * 路寬一格，偶爾多踩出旁邊一格。碰到耙沙、樹幹與造景就跳過，路是繞著它們走的
 */
function wearTrail(context: DetailContext, controlList: readonly PlanePoint[]): void {
  const { state, random } = context
  for (const point of samplePathCurve(controlList)) {
    const cellList = [{ x: Math.round(point.x), z: Math.round(point.z) }]
    if (random() < 0.3)
      cellList.push({ x: Math.round(point.x + (random() < 0.5 ? 1 : -1)), z: Math.round(point.z) })

    for (const { x, z } of cellList) {
      for (const y of [GROVE_GROUND_Y + 1, GROVE_GROUND_Y, GROVE_GROUND_Y - 1]) {
        const blockId = getBlock(state, x, y, z)
        if (blockId !== BlockId.GRASS && blockId !== BlockId.DIRT)
          continue
        const aboveBlock = getBlock(state, x, y + 1, z)
        if (aboveBlock !== BlockId.AIR && !REPLACEABLE_SET.has(aboveBlock))
          break
        setBlock(state, x, y, z, BlockId.DIRT)
        if (aboveBlock !== BlockId.FALLEN_LEAVES || random() < 0.8)
          setBlock(state, x, y + 1, z, BlockId.AIR)
        break
      }
    }
  }
}

/**
 * 落葉堆與耙子
 *
 * 大片耙沙的東北緣：兩堆耙攏的葉子（葉子方塊，全場只多這三格）、一把躺在旁邊的耙子、一只裝了半滿的竹簍。
 * 沙是有人在顧的，葉子不會自己從沙上消失
 */
function buildLeafPile(context: DetailContext): void {
  const { x, z } = AUTUMN_LEAF_PILE_POINT
  const firstY = placeDetail(context, x, z, BlockId.AMBER_LEAVES, GRASS_SET)
  if (firstY !== null && getBlock(context.state, x, firstY + 1, z) === BlockId.AIR)
    setBlock(context.state, x, firstY + 1, z, BlockId.FALLEN_LEAVES)
  placeDetail(context, x + 1, z, BlockId.GOLD_LEAVES, GRASS_SET)
  placeDetail(context, x - 2, z + 2, BlockId.AMBER_LEAVES, GRASS_SET)
  placeDetail(context, x - 1, z + 1, BlockId.TOOL_HOE, GRASS_SET)
  placeDetail(context, x + 1, z + 1, BlockId.BASKET, GRASS_SET)
}

/**
 * 刻紋石碑
 *
 * 一格石板墊著一塊刻紋石，兩側各一盆花，碑前三顆飛石，旁邊一座疊石。
 * 不放燈：林子裡的光只有耙沙旁那幾盞，石碑是白天才看得到的東西
 */
function buildStele(context: DetailContext): void {
  const { x, z } = AUTUMN_STELE_POINT
  const baseY = placeDetail(context, x, z, BlockId.STONE_TILE, GRASS_SET)
  if (baseY === null)
    return
  setBlock(context.state, x, baseY + 1, z, BlockId.RUNE_STONE)
  setBlock(context.state, x, baseY + 2, z, BlockId.FALLEN_LEAVES)
  placeDetail(context, x - 1, z, BlockId.FLOWER_POT, GRASS_SET)
  placeDetail(context, x + 1, z, BlockId.FLOWER_POT, GRASS_SET)
  for (const step of [1, 2, 3]) {
    placeDetail(context, x + (step === 2 ? 1 : 0), z + step, BlockId.STEPPING_STONE, GRASS_SET)
  }
  placeCairn(context, x - 3, z + 1, 1)
  placeDetail(context, x + 2, z + 1, BlockId.BASKET, GRASS_SET)
}

/** 北緣的見晴長椅：椅背朝南，坐著往北看；旁邊一根路標、一座疊石 */
function buildLookout(context: DetailContext): void {
  const { x, z } = AUTUMN_LOOKOUT_POINT
  placeBench(context, x, z, 'south')
  placeSignpost(context, x - 2, z + 1, 'x')
  placeCairn(context, x + 3, z, 2)
}

/**
 * 倒木與石
 *
 * 倒木用曬白的枯木，白楊倒下之後就是那個顏色；頂上零星幾朵菇，葉子落在上面。
 * 石頭半埋在葉子裡，頂上一片落葉。位置用抽的，落在樹、耙沙或造景上就不放
 */
function scatterLogAndRock(context: DetailContext): void {
  const { random } = context
  let logCount = 0
  let rockCount = 0
  for (let attempt = 0; attempt < 220 && (logCount < 9 || rockCount < 12); attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 5 + random() * (GROVE_RADIUS - 9)
    const x = Math.round(AUTUMN_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(AUTUMN_CENTER.z + Math.sin(angle) * radius)
    if (!isOnGrove(x, z) || findDetailGround(context, x, z)?.blockId !== BlockId.GRASS)
      continue

    if (logCount < 9 && random() < 0.45) {
      const isPlaced = placeFallenLog(context, {
        x,
        z,
        axis: random() < 0.5 ? 'x' : 'z',
        length: 3 + Math.floor(random() * 3),
        logBlockX: BlockId.DEAD_LOG_X,
        logBlockZ: BlockId.DEAD_LOG_Z,
        topList: [BlockId.FALLEN_LEAVES, BlockId.FALLEN_LEAVES, BlockId.BROWN_MUSHROOM],
        topChance: 0.55,
        groundSet: GRASS_SET,
      })
      if (isPlaced) {
        logCount++
        scatterDetailRing(context, x, z, 2.5, 0.3, (pick) => pick() < 0.6 ? BlockId.BROWN_MUSHROOM : BlockId.TWIGS, GRASS_SET)
      }
      continue
    }
    if (rockCount < 12 && placeRockCluster(context, x, z, random() < 0.5 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE, BlockId.FALLEN_LEAVES))
      rockCount++
  }
}

/** 樹幹腳邊的菇與枯枝：每四棵樹挑一棵，其餘的樹腳是乾淨的落葉 */
function dressTreeFoot(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (!isOnGrove(x, z))
        continue
      const isTrunkFoot = [GROVE_GROUND_Y + 1, GROVE_GROUND_Y + 2].some((y) => (
        getBlock(state, x, y, z) === BlockId.ASPEN_LOG && getBlock(state, x, y - 1, z) !== BlockId.ASPEN_LOG
      ))
      if (isTrunkFoot && random() < 0.25)
        scatterDetailRing(context, x, z, 1.6, 0.55, (pick) => pick() < 0.55 ? BlockId.BROWN_MUSHROOM : pick() < 0.5 ? BlockId.MUSHROOM : BlockId.TWIGS, GRASS_SET)
    }
  }
}

/** 落葉之後、門框之前 */
export function decorateAutumnDetail(state: Uint8Array): void {
  const context = createDetailContext(state, AUTUMN_REALM, createSeededRandom('autumn-detail'), DETAIL_SCAN_TOP_Y, REPLACEABLE_SET)

  wearTrail(context, AUTUMN_TRAIL_CONTROL_LIST)
  wearTrail(context, AUTUMN_STELE_TRAIL_CONTROL_LIST)

  buildLeafPile(context)
  buildStele(context)
  buildLookout(context)
  scatterLogAndRock(context)
  dressTreeFoot(context)

  /** 掉在葉子上的枯枝與碎石：成叢，換掉那幾格落葉 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 17,
    frequency: 0.17,
    threshold: 0.26,
    chance: 0.24,
    pick: (random) => random() < 0.6 ? BlockId.TWIGS : random() < 0.6 ? BlockId.PEBBLES : BlockId.SMALL_ROCK,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isOnGrove(x, z),
  })

  /** 幾片還沒枯的地錦：一地金黃裡的幾塊綠，葉色才有對照 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 43,
    frequency: 0.1,
    threshold: 0.3,
    chance: 0.5,
    pick: () => BlockId.GROUND_IVY,
    groundSet: GRASS_SET,
    isAllowed: (x, z) => isOnGrove(x, z),
  })
}
