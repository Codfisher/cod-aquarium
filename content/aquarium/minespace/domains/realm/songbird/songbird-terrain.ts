import type { PlanePoint } from '../land-realm-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { carveWater, fillBox, fillSquare, placeOakTree } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import {
  fillGroundColumn,
  fillHiddenColumn,
  hollowEnclosedLeafList,
  measureDistance,
  plantOnGround,
} from '../land-realm-kit'
import { placePortalStructure } from '../portal-terrain'
import {
  BASIN_LIST,
  BIRDHOUSE_LIST,
  PARK_RADIUS,
  SONGBIRD_CENTER,
  SONGBIRD_EDGE_RADIUS,
  SONGBIRD_GROUND_Y,
  SONGBIRD_OUTER_FLOOR_Y,
  SONGBIRD_PORTAL_POINT,
} from './songbird-layout'
import { SONGBIRD_REALM } from './songbird-realm'

/**
 * 百囀林苑的地形
 *
 * 只有地形 worker 用。鳴禽庭（buildSongbirdGarden）放大：開滿花的草地（同一組花、同一個比例）、
 * 三株一叢的矮橡樹、柵柱頂著的鳥屋、石板圍著一格淺水的飲水盤。
 * 那一座只有一方木座，這裡把草地攤開，樹叢、鳥屋、飲水盤散在上面，
 * 外圍一圈越來越密的橡樹、地面隆起，把整座園子圍成一個沒有風的地方。
 *
 * 樹葉的方塊很貴（每一格都整顆畫、還要進兩層陰影與深度圖），
 * 所以樹只種到 SONGBIRD_EDGE_RADIUS，外面換成不畫的 LAKE_BED，樹冠裡看不到的葉子也拿掉。
 * 順序：先地面，再飲水盤、鳥屋，再種樹，花最後撒，傳送門排在花之後
 */

const GRASS_SET = new Set([BlockId.GRASS])
const LEAF_SET = new Set([BlockId.OAK_LEAVES])
const CROWN_SET = new Set([BlockId.OAK_LEAVES, BlockId.OAK_LOG])

/** 草地上每一格撒花的機率，與鳴禽庭一樣是六成六 */
const FLOWER_CHANCE = 0.66
/** 外圍林子底下的花：樹蔭裡少一點 */
const GROVE_FLOWER_CHANCE = 0.3

/** 樹叢之間至少隔幾格：一叢三株、樹冠兩格半，再隔一段開滿花的草地 */
const CLUSTER_SPACING = 12

/**
 * 鳴禽庭那三株橡樹的相對位置，縮成四分之三
 *
 * 鳴禽庭是 (-4,-3)、(4,-4)、(-3,4)，三株站成一個鬆散的三角；
 * 縮一點，一叢的樹冠挨得近，遠看是一團，中間又還留得下一點天
 */
const CLUSTER_OFFSET_LIST = [
  { x: -3, z: -2 },
  { x: 3, z: -3 },
  { x: -2, z: 3 },
] as const

/** 鳴禽庭那一組花，與 buildSongbirdGarden 一字不差 */
function pickSongbirdFlower(random: () => number): BlockId {
  const roll = random()
  if (roll < 0.3)
    return BlockId.WILD_GRASS
  if (roll < 0.46)
    return BlockId.TALL_GRASS
  if (roll < 0.6)
    return BlockId.BIG_FLOWER
  if (roll < 0.72)
    return BlockId.FLOWER_ROSE
  if (roll < 0.84)
    return BlockId.FLOWER_VIOLA
  if (roll < 0.94)
    return BlockId.FLOWER_DANDELION
  return BlockId.FLOWER_TULIP
}

/** 離最近的飲水盤、鳥屋或回程門多遠，種樹與隆起地面都要讓開 */
function measureFeatureClearance(x: number, z: number): number {
  return Math.min(
    measureDistance(x, z, SONGBIRD_PORTAL_POINT) - 4,
    ...BASIN_LIST.map((basin) => measureDistance(x, z, basin) - 2),
    ...BIRDHOUSE_LIST.map((house) => measureDistance(x, z, house) - 1),
  )
}

/**
 * 地面隆起幾格
 *
 * 草地上零星一格高的小丘；飲水盤、鳥屋與回程門四周是平的。
 * 草地外緣往外每三格高一格，最多四格再加一點起伏，林子是長在往上收的坡上的
 */
function measureLevel(x: number, z: number, radius: number): number {
  if (measureFeatureClearance(x, z) < 1.5)
    return 0
  const roll = fbm2D(x * 0.07 + 23, z * 0.07 - 11, 2, 0.5)
  if (radius < PARK_RADIUS)
    return roll > 0.32 ? 1 : 0
  const rise = Math.min(4, 1 + Math.floor((radius - PARK_RADIUS) / 3))
  return rise + (roll > 0.15 ? 1 : 0)
}

/** 地面，回傳每一格的地表高度 */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, SONGBIRD_CENTER)
      if (radius > SONGBIRD_EDGE_RADIUS + 2) {
        fillHiddenColumn(state, x, z, SONGBIRD_OUTER_FLOOR_Y)
        groundTopMap[x * WORLD_SIZE + z] = SONGBIRD_OUTER_FLOOR_Y
        continue
      }
      const topY = SONGBIRD_GROUND_Y + measureLevel(x, z, radius)
      fillGroundColumn(state, x, z, topY, BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }
  return groundTopMap
}

function readGroundY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/** 飲水盤：三格見方的石板、正中一格淺水，與鳴禽庭那一只一樣 */
function placeBasinList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const basin of BASIN_LIST) {
    const topY = groundTopMap[basin.x * WORLD_SIZE + basin.z]!
    fillSquare(state, basin.x, basin.z, 1, topY, BlockId.STONE_TILE)
    carveWater(state, basin.x, topY, basin.z, 1, BlockId.STONE_TILE)
  }
}

/**
 * 鳥屋
 *
 * 一根三格高的柵柱頂著一個小木盒：木板、蜂箱做的盒身（正面那個洞就是鳥的門）、深色木半磚的屋頂。
 * 與鳴禽庭那一座一格不差
 */
function placeBirdhouseList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const house of BIRDHOUSE_LIST) {
    const groundY = readGroundY(groundTopMap, house.x, house.z)
    for (let level = 0; level < 3; level++) {
      setBlock(state, house.x, groundY + level, house.z, BlockId.FENCE)
    }
    setBlock(state, house.x, groundY + 3, house.z, BlockId.PLANKS)
    setBlock(state, house.x, groundY + 4, house.z, BlockId.HIVE)
    setBlock(state, house.x, groundY + 5, house.z, BlockId.DARK_WOOD_SLAB)
  }
}

/**
 * 樹叢的位置
 *
 * 草地上隨機抽點，彼此至少隔 CLUSTER_SPACING 格，避開回程門、飲水盤與鳥屋，
 * 也不壓到落腳那一眼：門往西那一條（看得到第一只飲水盤與後面的園子）不種
 */
function pickClusterList(): PlanePoint[] {
  const random = createSeededRandom('songbird-realm-cluster')
  const clusterList: PlanePoint[] = []

  for (let attempt = 0; attempt < 600 && clusterList.length < 26; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * (PARK_RADIUS - 3)
    const point = {
      x: Math.round(SONGBIRD_CENTER.x + Math.cos(angle) * radius),
      z: Math.round(SONGBIRD_CENTER.z + Math.sin(angle) * radius),
    }
    if (measureFeatureClearance(point.x, point.z) < 4)
      continue
    const isInArrivalView = point.x > SONGBIRD_PORTAL_POINT.x - 16 && Math.abs(point.z - SONGBIRD_PORTAL_POINT.z) < 6
    if (isInArrivalView)
      continue
    if (clusterList.some((cluster) => measureDistance(point.x, point.z, cluster) < CLUSTER_SPACING))
      continue
    clusterList.push(point)
  }
  return clusterList
}

/**
 * 草地上的樹叢
 *
 * 每一叢三株，照鳴禽庭那三株站成的三角，轉個方向；樹幹四到五格（鳴禽庭那三株的高度），
 * 一成多長到六格，是園子裡鳥最愛站的幾棵高枝
 */
function placeClusterTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('songbird-realm-tree')

  for (const cluster of pickClusterList()) {
    const turn = Math.floor(random() * 4)
    for (const offset of CLUSTER_OFFSET_LIST) {
      const heightRoll = random()
      const rotatedX = turn === 0 ? offset.x : turn === 1 ? -offset.z : turn === 2 ? -offset.x : offset.z
      const rotatedZ = turn === 0 ? offset.z : turn === 1 ? offset.x : turn === 2 ? -offset.z : -offset.x
      const x = cluster.x + rotatedX
      const z = cluster.z + rotatedZ
      if (measureFeatureClearance(x, z) < 2)
        continue
      const groundY = readGroundY(groundTopMap, x, z)
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      const trunkHeight = heightRoll < 0.15 ? 6 : 4 + Math.floor(heightRoll * 2)
      placeOakTree(state, x, groundY, z, trunkHeight)
    }
  }
}

/**
 * 外圍的林子
 *
 * 每三格見方抽一次籤，草地外緣往外越來越密；樹幹三到五格，樹冠壓在人的視線高度，
 * 從園子裡看出去是一整圈枝葉，看不到林子後面，也擋住了風
 */
function placeGroveTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('songbird-realm-grove')
  const cellSize = 3

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += cellSize) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += cellSize) {
      const x = cellX + Math.floor(random() * cellSize)
      const z = cellZ + Math.floor(random() * cellSize)
      const roll = random()
      const heightRoll = random()
      if (x >= WORLD_SIZE || z >= WORLD_SIZE)
        continue

      const radius = measureDistance(x, z, SONGBIRD_CENTER)
      if (radius < PARK_RADIUS - 1 || radius > SONGBIRD_EDGE_RADIUS)
        continue
      const chance = Math.min(0.78, 0.3 + ((radius - PARK_RADIUS) / 10) * 0.5)
      if (roll > chance)
        continue

      const groundY = readGroundY(groundTopMap, x, z)
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      placeOakTree(state, x, groundY, z, 3 + Math.floor(heightRoll * 3))
    }
  }
}

/**
 * 撒花
 *
 * 草地照鳴禽庭那一組花撒，六成六——把鳥引來的理由要看得見；
 * 外圍林子底下少一點。飲水盤的石板與鳥屋柱腳不長
 */
function scatterFlowerList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('songbird-realm-flower')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, SONGBIRD_CENTER)
      if (radius > SONGBIRD_EDGE_RADIUS)
        continue
      if (random() > (radius < PARK_RADIUS ? FLOWER_CHANCE : GROVE_FLOWER_CHANCE))
        continue
      plantOnGround(state, x, readGroundY(groundTopMap, x, z), z, pickSongbirdFlower(random), GRASS_SET)
    }
  }
}

/** 生成整座百囀林苑 */
export function generateSongbirdWorld(state: Uint8Array): void {
  const groundTopMap = shapeTerrain(state)
  placeBasinList(state, groundTopMap)
  placeBirdhouseList(state, groundTopMap)
  placeClusterTreeList(state, groundTopMap)
  placeGroveTreeList(state, groundTopMap)
  hollowEnclosedLeafList(state, LEAF_SET, CROWN_SET, SONGBIRD_GROUND_Y + 2, SONGBIRD_GROUND_Y + 16)
  scatterFlowerList(state, groundTopMap)

  /** 門框排在花之後：門洞前後與木牌前面的花由它清掉 */
  for (const portal of SONGBIRD_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門往西到第一只飲水盤那一段也清掉，一落地就看得到它 */
  for (let offsetX = -6; offsetX <= 2; offsetX++) {
    const x = SONGBIRD_PORTAL_POINT.x + offsetX
    const z = SONGBIRD_PORTAL_POINT.z
    const y = readGroundY(groundTopMap, x, z)
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
