import type { DetailContext } from '../realm-detail-kit'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_HEIGHT } from '../../world/world-constants'
import {
  createDetailContext,
  findDetailGround,
  isKeptOut,
  placeBoulderPile,
  placeCairn,
  placeDetail,
  scatterDetailCluster,
  scatterDetailRing,
} from '../realm-detail-kit'
import { findTopSolidY } from '../realm-terrain-kit'
import {
  ALPINE_CAIRN_ALONG_LIST,
  ALPINE_CENTER,
  ALPINE_ICE_ARCH_HEIGHT,
  ALPINE_ICE_ARCH_POINT,
  ALPINE_ICE_ARCH_SPAN,
  ALPINE_ICE_HOLE_POINT,
  ALPINE_PUSH_RADIUS,
  toRidgeWorldPoint,
} from './alpine-layout'
import { ALPINE_REALM } from './alpine-realm'

/**
 * 雪稜的細節
 *
 * 只有地形 worker 用。雪稜丘只有岩、雪、冰與三株矮松，這裡照樣不加大樹、小屋與路，
 * 補的全是山上本來就會有的小東西：稜線上一座一座的疊石、雪原上半埋在雪裡的大石（頂上積雪）、
 * 一道橫岩底下垂著冰柱的岩門、矮松枝下的冰柱、融雪池冰面上鑿開的釣洞、
 * 從雪裡露出來的枯枝、露岩處的碎石。
 *
 * 雪面大半補了薄雪（半格、四分之一格、八分之一格），那些格柱的頂上不是空的，細節會自己跳過，
 * 只落在光的雪塊與露岩上——不會有東西浮在薄雪上
 */

const DETAIL_SCAN_TOP_Y = WORLD_HEIGHT - 2

const SNOW_SET: ReadonlySet<BlockId> = new Set([BlockId.SNOW_BLOCK, BlockId.SNOW])
const ROCK_SET: ReadonlySet<BlockId> = new Set([BlockId.STONE, BlockId.COBBLESTONE])
const GROUND_SET: ReadonlySet<BlockId> = new Set([...SNOW_SET, ...ROCK_SET])
const ARCH_BLOCK_LIST = [BlockId.STONE, BlockId.STONE, BlockId.COBBLESTONE] as const
/** 薄雪：岩門的柱腳壓在上面時直接換掉 */
const SNOW_LAYER_SET: ReadonlySet<BlockId> = new Set([BlockId.SNOW_LAYER, BlockId.SNOW_LAYER_QUARTER, BlockId.SNOW_SLAB])

const DETAIL_REACH = ALPINE_PUSH_RADIUS + 6
const DETAIL_AREA = {
  minX: ALPINE_CENTER.x - DETAIL_REACH,
  maxX: ALPINE_CENTER.x + DETAIL_REACH,
  minZ: ALPINE_CENTER.z - DETAIL_REACH,
  maxZ: ALPINE_CENTER.z + DETAIL_REACH,
}

function isInsideReach(x: number, z: number): boolean {
  return Math.hypot(x - ALPINE_CENTER.x, z - ALPINE_CENTER.z) < DETAIL_REACH
}

/** 這一格柱整格實心的頂面：薄雪不算，岩門的石頭要壓在雪塊或岩上 */
function findFullTopY(state: Uint8Array, x: number, z: number): number {
  let y = findTopSolidY(state, x, z, DETAIL_SCAN_TOP_Y)
  while (y > 0 && SNOW_LAYER_SET.has(getBlock(state, x, y, z))) {
    y -= 1
  }
  return y
}

/**
 * 冰柱岩門
 *
 * 兩根岩柱各自從自己的地面疊到同一個高度，頂上一道比兩柱各多出一格的橫岩，橫岩上積一層雪。
 * 冰柱垂在橫岩底下：門洞裡兩根、兩端懸出去的地方各一根。
 * 門洞淨寬兩格、淨高三格，最上面那一格是冰柱（穿得過去），人直著走過去碰不到頭
 */
function buildIceArch(context: DetailContext): void {
  const { state, random } = context
  const { x, z } = ALPINE_ICE_ARCH_POINT
  const baseY = findFullTopY(state, x, z)
  const lintelY = baseY + ALPINE_ICE_ARCH_HEIGHT
  const pick = () => ARCH_BLOCK_LIST[Math.floor(random() * ARCH_BLOCK_LIST.length)]!

  for (const pillarX of [x, x + ALPINE_ICE_ARCH_SPAN]) {
    for (let y = findFullTopY(state, pillarX, z) + 1; y < lintelY; y++) {
      setBlock(state, pillarX, y, z, pick())
    }
  }
  for (let offsetX = -1; offsetX <= ALPINE_ICE_ARCH_SPAN + 1; offsetX++) {
    setBlock(state, x + offsetX, lintelY, z, pick())
    setBlock(state, x + offsetX, lintelY + 1, z, offsetX % 2 === 0 ? BlockId.SNOW_SLAB : BlockId.SNOW_LAYER_QUARTER)
    const isPillar = offsetX === 0 || offsetX === ALPINE_ICE_ARCH_SPAN
    if (!isPillar && getBlock(state, x + offsetX, lintelY - 1, z) === BlockId.AIR)
      setBlock(state, x + offsetX, lintelY - 1, z, BlockId.ICICLE)
  }
  /** 西柱旁再靠一顆矮石，岩門才不是孤零零兩根柱子 */
  const sideY = findFullTopY(state, x - 1, z + 1)
  setBlock(state, x - 1, sideY + 1, z + 1, BlockId.COBBLESTONE)
  setBlock(state, x - 1, sideY + 2, z + 1, BlockId.SNOW_LAYER)
  scatterDetailRing(context, x + 1.5, z, 3.5, 0.4, (roll) => roll() < 0.6 ? BlockId.PEBBLES : BlockId.SMALL_ROCK, GROUND_SET)
}

/**
 * 冰上的釣洞
 *
 * 把那一格冰換成水（水面比冰面矮一點，看得出是鑿開的洞），洞邊的冰上一只竹簍、一截枯枝、一塊坐墊。
 * 只在那一格真的是冰的時候才鑿
 */
function buildIceHole(context: DetailContext): void {
  const { state } = context
  const { x, z } = ALPINE_ICE_HOLE_POINT
  const topY = findTopSolidY(state, x, z, DETAIL_SCAN_TOP_Y)
  const topBlock = getBlock(state, x, topY, z)
  if (topBlock !== BlockId.ICE && topBlock !== BlockId.PACKED_ICE)
    return
  setBlock(state, x, topY, z, BlockId.WATER)
  /** 洞底要有東西接著水，不然從洞口看下去是空的 */
  if (getBlock(state, x, topY - 1, z) === BlockId.AIR)
    setBlock(state, x, topY - 1, z, BlockId.PACKED_ICE)

  for (const prop of [
    { x: 1, z: 0, blockId: BlockId.BASKET },
    { x: -1, z: 0, blockId: BlockId.TWIGS },
    { x: 0, z: 1, blockId: BlockId.CUSHION },
  ]) {
    const propY = findTopSolidY(state, x + prop.x, z + prop.z, DETAIL_SCAN_TOP_Y)
    const ground = getBlock(state, x + prop.x, propY, z + prop.z)
    if ((ground === BlockId.ICE || ground === BlockId.PACKED_ICE) && getBlock(state, x + prop.x, propY + 1, z + prop.z) === BlockId.AIR)
      setBlock(state, x + prop.x, propY + 1, z + prop.z, prop.blockId)
  }
}

/**
 * 稜線上的疊石
 *
 * 沿稜線每隔十來格一座，兩格高。稜頂有的地方是岩脊、有的補了薄雪，
 * 所以在定點四周三格內找第一個放得下的位置
 */
function placeRidgeCairnList(context: DetailContext): void {
  for (const along of ALPINE_CAIRN_ALONG_LIST) {
    const point = toRidgeWorldPoint(along, 0)
    let isPlaced = false
    for (let radius = 0; radius <= 3 && !isPlaced; radius++) {
      for (let offsetX = -radius; offsetX <= radius && !isPlaced; offsetX++) {
        for (let offsetZ = -radius; offsetZ <= radius && !isPlaced; offsetZ++) {
          const ground = findDetailGround(context, point.x + offsetX, point.z + offsetZ)
          if (ground && GROUND_SET.has(ground.blockId))
            isPlaced = placeCairn(context, point.x + offsetX, point.z + offsetZ, 2)
        }
      }
    }
  }
}

/** 雪原上半埋的大石：頂上積雪。位置用抽的，只落在光的雪塊上 */
function scatterBoulder(context: DetailContext): void {
  const { random } = context
  let count = 0
  for (let attempt = 0; attempt < 300 && count < 12; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 10 + random() * (DETAIL_REACH - 14)
    const x = Math.round(ALPINE_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(ALPINE_CENTER.z + Math.sin(angle) * radius)
    const ground = findDetailGround(context, x, z)
    if (!ground || !SNOW_SET.has(ground.blockId))
      continue
    if (placeBoulderPile(context, x, z, 2 + (random() < 0.3 ? 1 : 0), [BlockId.STONE, BlockId.COBBLESTONE], BlockId.SNOW_LAYER, 0.85))
      count++
  }
}

/** 矮松枝下的冰柱：枝葉最底那一層、底下是空的格子，三成垂一根 */
function hangPineIcicle(context: DetailContext): void {
  const { state, random } = context
  for (let x = DETAIL_AREA.minX; x <= DETAIL_AREA.maxX; x++) {
    for (let z = DETAIL_AREA.minZ; z <= DETAIL_AREA.maxZ; z++) {
      if (!isInsideReach(x, z) || isKeptOut(context, x, z))
        continue
      for (let y = DETAIL_SCAN_TOP_Y; y > 8; y--) {
        const blockId = getBlock(state, x, y, z)
        if (blockId === BlockId.AIR)
          continue
        if (blockId === BlockId.PINE_LEAVES && getBlock(state, x, y - 1, z) === BlockId.AIR && getBlock(state, x, y - 2, z) === BlockId.AIR && random() < 0.3)
          setBlock(state, x, y - 1, z, BlockId.ICICLE)
        break
      }
    }
  }
}

/** 樹、花草與石燈籠之後、門框之前 */
export function decorateAlpineDetail(state: Uint8Array): void {
  const context = createDetailContext(state, ALPINE_REALM, createSeededRandom('alpine-detail'), DETAIL_SCAN_TOP_Y)

  buildIceArch(context)
  buildIceHole(context)
  placeRidgeCairnList(context)
  scatterBoulder(context)
  hangPineIcicle(context)

  /** 從雪裡露出來的枯枝：成叢，是被雪埋掉大半的灌木 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 21,
    frequency: 0.15,
    threshold: 0.32,
    chance: 0.22,
    pick: () => BlockId.TWIGS,
    groundSet: SNOW_SET,
    isAllowed: (x, z) => isInsideReach(x, z),
  })

  /** 露岩上的碎石與小石：風把雪吹走的地方，岩屑留在原地 */
  scatterDetailCluster(context, {
    ...DETAIL_AREA,
    noiseOffset: 59,
    frequency: 0.2,
    threshold: -0.05,
    chance: 0.3,
    pick: (random) => random() < 0.7 ? BlockId.PEBBLES : BlockId.SMALL_ROCK,
    groundSet: ROCK_SET,
    isAllowed: (x, z) => isInsideReach(x, z),
  })

  /** 石燈籠與疊石腳邊不必再補：placeCairn 自己會撒一圈。雪原上另外零星幾顆單獨的小石 */
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = context.random() * Math.PI * 2
    const radius = 8 + context.random() * (DETAIL_REACH - 12)
    placeDetail(
      context,
      Math.round(ALPINE_CENTER.x + Math.cos(angle) * radius),
      Math.round(ALPINE_CENTER.z + Math.sin(angle) * radius),
      BlockId.SMALL_ROCK,
      SNOW_SET,
    )
  }
}
