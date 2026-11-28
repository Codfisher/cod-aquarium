import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { measureDistance, samplePathCurve } from '../land-realm-kit'
import { clearPlantColumn, isFreeArea, isFreeGround, putProp } from '../realm-prop-kit'
import {
  MEADOW_CENTER,
  MEADOW_HOLLOW_LIST,
  MEADOW_OLD_FENCE,
  MEADOW_PICNIC_POINT,
  MEADOW_PORTAL_POINT,
  MEADOW_SLOW_RADIUS,
  MEADOW_STONE_CIRCLE,
  MEADOW_WALL_CONTROL_POINT_LIST,
} from './meadow-layout'

/**
 * 風露原的細節小景
 *
 * 只有地形 worker 用，排在花草之後、傳送門之前。
 * 原野原本是丘、孤樹、枯木樁、圓石堆與滿地的花草，東西都是均勻撒的。這一輪補的是人留下的痕跡與成片的東西：
 * 一道塌了幾處的乾砌石牆、月見草原上的石環、小徑盡頭的野餐草蓆、一段舊牧欄、
 * 被踩出土的小徑、蕨窪的倒木，以及一片一片連成花海的蒲公英。
 *
 * 這裡的花草已經是其他場景的四五倍，所以不加植物：蒲公英是把原本的草換掉，石牆與石環反而佔掉幾十株
 */

const GRASS_SET = new Set([BlockId.GRASS])

/** 可以換成蒲公英的草：只換草，不動原本各區的花 */
const DRIFT_SOURCE_SET = new Set<BlockId>([BlockId.TALL_GRASS, BlockId.DRY_GRASS, BlockId.WILD_GRASS, BlockId.FERN])

/** 蒲公英花海有幾片，每片的半徑範圍 */
const DANDELION_DRIFT_COUNT = 7
const DANDELION_DRIFT_RADIUS_RANGE: [number, number] = [4, 7]

/** 石牆每幾格塌一個缺口，缺口幾格寬（人從這裡穿過去） */
const WALL_GAP_PERIOD = 11
const WALL_GAP_LENGTH = 2

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 沿著一條曲線走過的每一格（四方相連，不走斜角，牆才不會有縫） */
function traceCellList(controlPointList: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  const cellList: { x: number; z: number }[] = []
  for (const point of samplePathCurve(controlPointList)) {
    const cell = { x: Math.round(point.x), z: Math.round(point.z) }
    const previous = cellList.at(-1)
    if (previous && previous.x === cell.x && previous.z === cell.z)
      continue
    if (previous && previous.x !== cell.x && previous.z !== cell.z)
      cellList.push({ x: previous.x, z: cell.z })
    cellList.push(cell)
  }
  return cellList
}

/**
 * 乾砌的矮石牆
 *
 * 一格高的圓石與青苔圓石，兩成塌成半磚（走得過去），每十一格一個兩格寬的缺口；
 * 完整的那幾段偶爾壓一塊蓋頂石。牆跟著地面起伏，一格一格各自落在自己那一層
 */
function placeDryStoneWall(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array, random: () => number): void {
  for (const [index, cell] of traceCellList(MEADOW_WALL_CONTROL_POINT_LIST).entries()) {
    const roll = random()
    const hasCapstone = random() < 0.14
    if (index % WALL_GAP_PERIOD < WALL_GAP_LENGTH || pathDistanceMap[cell.x * WORLD_SIZE + cell.z]! < 3)
      continue
    const footY = readFootY(groundTopMap, cell.x, cell.z)
    if (!isFreeGround(state, cell.x, footY, cell.z, GRASS_SET))
      continue
    if (roll < 0.2) {
      putProp(state, cell.x, footY, cell.z, BlockId.STONE_SLAB)
      continue
    }
    putProp(state, cell.x, footY, cell.z, roll < 0.6 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
    if (hasCapstone)
      setBlock(state, cell.x, footY + 1, cell.z, BlockId.STONE_SLAB)
  }
}

/**
 * 月見石環
 *
 * 八塊立石圍成一圈，高矮不一（一到三格），圈心一塊平石；圈裡的草換成苔與碎石，月見草照樣留在圈外。
 * 每一塊各自落在自己那一格的地面上
 */
function placeStoneCircle(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const { x: centerX, z: centerZ, radius } = MEADOW_STONE_CIRCLE

  for (let offsetX = -radius; offsetX <= radius; offsetX++) {
    for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
      const roll = random()
      if (Math.hypot(offsetX, offsetZ) > radius - 0.8)
        continue
      const x = centerX + offsetX
      const z = centerZ + offsetZ
      const footY = readFootY(groundTopMap, x, z)
      if (!isFreeGround(state, x, footY, z, GRASS_SET))
        continue
      clearPlantColumn(state, x, footY, z)
      if (roll < 0.45)
        setBlock(state, x, footY, z, BlockId.MOSS_CARPET)
      else if (roll < 0.6)
        setBlock(state, x, footY, z, BlockId.PEBBLES)
    }
  }

  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * Math.PI * 2 + 0.2
    const x = centerX + Math.round(Math.cos(angle) * radius)
    const z = centerZ + Math.round(Math.sin(angle) * radius)
    const height = 1 + Math.floor(random() * 3)
    const blockId = random() < 0.5 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE
    const footY = readFootY(groundTopMap, x, z)
    if (!isFreeGround(state, x, footY, z, GRASS_SET))
      continue
    clearPlantColumn(state, x, footY, z)
    for (let level = 0; level < height; level++) {
      setBlock(state, x, footY + level, z, blockId)
    }
  }

  const centerFootY = readFootY(groundTopMap, centerX, centerZ)
  clearPlantColumn(state, centerX, centerFootY, centerZ)
  setBlock(state, centerX, centerFootY, centerZ, BlockId.STONE_SLAB)
}

/**
 * 野餐的草蓆
 *
 * 三格乘兩格的草蓆鋪在平地上，蓆邊一只竹簍、一個坐墊、一本攤開的書。x、z 是草蓆的西北角
 */
function placePicnic(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z } = MEADOW_PICNIC_POINT
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x, z, x + 2, z + 1, footY, GRASS_SET))
    return

  for (let offsetX = 0; offsetX <= 2; offsetX++) {
    for (let offsetZ = 0; offsetZ <= 1; offsetZ++) {
      putProp(state, x + offsetX, footY, z + offsetZ, BlockId.TATAMI_MAT)
    }
  }
  /** 蓆邊的東西各自落在自己那一格的地面上，那一格不是空草地就不放 */
  for (const [offsetX, offsetZ, blockId] of [
    [3, 0, BlockId.BASKET],
    [-1, 1, BlockId.CUSHION],
    [1, 2, BlockId.OPEN_BOOK],
    [3, 2, BlockId.FLOWER_POT],
  ] as const) {
    const propFootY = readFootY(groundTopMap, x + offsetX, z + offsetZ)
    if (isFreeGround(state, x + offsetX, propFootY, z + offsetZ, GRASS_SET))
      putProp(state, x + offsetX, propFootY, z + offsetZ, blockId)
  }
}

/**
 * 舊牧欄
 *
 * 小徑北側一段斜斜的柵欄，柱子缺了四成，剩下的三三兩兩還連著。風露苑沒有柵欄，
 * 這是野花原還放過牲口的時候留下來的
 */
function placeOldFence(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array, random: () => number): void {
  const { from, to } = MEADOW_OLD_FENCE
  for (const cell of traceCellList([from, to])) {
    const roll = random()
    if (roll < 0.4 || pathDistanceMap[cell.x * WORLD_SIZE + cell.z]! < 2)
      continue
    const footY = readFootY(groundTopMap, cell.x, cell.z)
    if (isFreeGround(state, cell.x, footY, cell.z, GRASS_SET))
      putProp(state, cell.x, footY, cell.z, BlockId.FENCE)
  }
}

/**
 * 小徑踩出來的土
 *
 * 小徑原本只是草比較少。中心線上六成的草皮換成土，一塊一塊斷斷續續的，像人常走的那幾步
 */
function wearPath(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      if (pathDistanceMap[x * WORLD_SIZE + z]! > 0.8 || measureDistance(x, z, MEADOW_PORTAL_POINT) < 3)
        continue
      if (fbm2D(x * 0.31 + 3, z * 0.31 - 17, 2, 0.5) < -0.12)
        continue
      const topY = groundTopMap[x * WORLD_SIZE + z]!
      if (getBlock(state, x, topY, z) === BlockId.GRASS && getBlock(state, x, topY + 1, z) === BlockId.AIR)
        setBlock(state, x, topY, z, BlockId.DIRT)
    }
  }
}

/**
 * 一片一片的蒲公英
 *
 * 原本的花是照各區的比例逐格抽的，遠看是均勻的雜色。這裡挑幾處把草換成蒲公英（黃的或絮白的，一片一種），
 * 中心密、邊緣疏，從丘頂看下去是一塊一塊的色斑。只換草不加株數
 */
function paintDandelionDrift(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  const [radiusMin, radiusMax] = DANDELION_DRIFT_RADIUS_RANGE
  for (let drift = 0; drift < DANDELION_DRIFT_COUNT; drift++) {
    const angle = random() * Math.PI * 2
    const distance = 10 + random() * (MEADOW_SLOW_RADIUS - 22)
    const centerX = Math.round(MEADOW_CENTER.x + Math.cos(angle) * distance)
    const centerZ = Math.round(MEADOW_CENTER.z + Math.sin(angle) * distance)
    const radius = radiusMin + random() * (radiusMax - radiusMin)
    const blockId = random() < 0.5 ? BlockId.FLOWER_DANDELION : BlockId.FLOWER_WHITE_DANDELION
    const reach = Math.ceil(radius)

    for (let offsetX = -reach; offsetX <= reach; offsetX++) {
      for (let offsetZ = -reach; offsetZ <= reach; offsetZ++) {
        const roll = random()
        const ratio = Math.hypot(offsetX, offsetZ) / radius
        if (ratio > 1 || roll > 0.95 - ratio * 0.55)
          continue
        const x = centerX + offsetX
        const z = centerZ + offsetZ
        const footY = readFootY(groundTopMap, x, z)
        if (!DRIFT_SOURCE_SET.has(getBlock(state, x, footY, z)))
          continue
        clearPlantColumn(state, x, footY, z)
        setBlock(state, x, footY, z, blockId)
      }
    }
  }
}

/**
 * 倒木與碎石
 *
 * 每一處枯木樁堆與圓石堆旁邊補一點零碎：樁邊一截躺著的枯木或幾根枯枝，石邊幾顆小石與一片苔。
 * 都是把原本那一格的草換掉
 */
function scatterDebris(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (let x = 2; x < WORLD_SIZE - 2; x++) {
    for (let z = 2; z < WORLD_SIZE - 2; z++) {
      const roll = random()
      const side = Math.floor(random() * 4)
      if (measureDistance(x, z, MEADOW_CENTER) > MEADOW_SLOW_RADIUS - 6)
        continue
      const footY = readFootY(groundTopMap, x, z)
      const blockId = getBlock(state, x, footY, z)
      const isStump = blockId === BlockId.DEAD_LOG
      const isStone = blockId === BlockId.COBBLESTONE && getBlock(state, x, footY - 1, z) === BlockId.GRASS
      if (!isStump && !isStone)
        continue

      const offsetX = [1, -1, 0, 0][side]!
      const offsetZ = [0, 0, 1, -1][side]!
      const nearX = x + offsetX
      const nearZ = z + offsetZ
      if (readFootY(groundTopMap, nearX, nearZ) !== footY || !isFreeGround(state, nearX, footY, nearZ, GRASS_SET))
        continue
      if (isStump) {
        if (roll < 0.25)
          putProp(state, nearX, footY, nearZ, offsetX !== 0 ? BlockId.DEAD_LOG_X : BlockId.DEAD_LOG_Z)
        else if (roll < 0.6)
          putProp(state, nearX, footY, nearZ, BlockId.TWIGS)
      }
      else if (roll < 0.4) {
        putProp(state, nearX, footY, nearZ, BlockId.SMALL_ROCK)
      }
      else if (roll < 0.75) {
        putProp(state, nearX, footY, nearZ, BlockId.MOSS_CARPET)
      }
    }
  }
}

/** 補上風露原的細節小景 */
export function decorateMeadow(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('meadow-detail')
  const isInHollow = MEADOW_HOLLOW_LIST.some((hollow) => measureDistance(MEADOW_STONE_CIRCLE.x, MEADOW_STONE_CIRCLE.z, hollow) < hollow.radius + MEADOW_STONE_CIRCLE.radius)

  paintDandelionDrift(state, groundTopMap, random)
  placeDryStoneWall(state, groundTopMap, pathDistanceMap, random)
  if (!isInHollow)
    placeStoneCircle(state, groundTopMap, random)
  placePicnic(state, groundTopMap)
  placeOldFence(state, groundTopMap, pathDistanceMap, random)
  wearPath(state, groundTopMap, pathDistanceMap)
  scatterDebris(state, groundTopMap, random)
}
