import type { CicadaClearing } from './cicada-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { fillBox, getNoisyDistance, placeStoneLantern, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import {
  createPathDistanceMap,
  fillGroundColumn,
  fillHiddenColumn,
  measureDistance,
  plantOnGround,
  samplePathCurve,
} from '../land-realm-kit'
import { placePortalStructure } from '../portal-terrain'
import {
  ARRIVAL_CLEARING,
  CANOPY_RADIUS,
  CANOPY_Y,
  CICADA_CENTER,
  CICADA_EDGE_RADIUS,
  CICADA_GROUND_Y,
  CICADA_PATH_CONTROL_POINT_LIST,
  CICADA_PORTAL_POINT,
  SHADE_CLEARING,
  VERANDA_HALF_LENGTH,
  VERANDA_LIST,
  WOOD_RADIUS,
} from './cicada-layout'
import { CICADA_REALM } from './cicada-realm'

/**
 * 蟬雨深林的地形
 *
 * 只有地形 worker 用。蟬時雨（buildCicadaGarden）放大：橡樹擠在一起、最高處一整片葉子補成蓋子
 * （兩成不到的葉縫漏光）、土與苔的地面、蕨腐葉高草與石生植物、朝北的緣廊與石燈籠。
 * 那一座只有四棵樹，這裡種成一整片林子，蓋子一路鋪到林子外緣，最外面一圈樹幹密成一堵牆。
 *
 * 樹葉的方塊很貴，這座的樹因此只在蓋子底下補一層樹冠：抬頭看到的是那層蓋子，
 * 樹自己的那一層只是讓蓋子底下不是一張平板。開花的東西照蟬時雨一律不放。
 * 順序：先地面與土徑，再緣廊與石燈籠，再種樹、鋪蓋子，花草最後撒，傳送門排在花草之後
 */

const FLOOR_SET = new Set([BlockId.GRASS, BlockId.DIRT])

/**
 * 蓋子留幾成的洞
 *
 * 與蟬時雨一樣，每一格有一成八的機率不鋪：全部蓋滿就成了天花板而不是樹，
 * 陽光只從這些葉縫漏下幾個亮點
 */
const CANOPY_HOLE_CHANCE = 0.18

/** 林地上每一格長草的機率，與蟬時雨一樣三成四 */
const PLANT_CHANCE = 0.34

/** 種樹的格子：每四格見方抽一次籤，林子裡樹幹約五格一根 */
const TREE_CELL_SIZE = 4
/** 外圍那一圈每兩格見方抽一次，樹幹一排比一排密 */
const THICKET_CELL_SIZE = 2

/** 蟬時雨那一組林下的草，與 buildCicadaGarden 一字不差 */
function pickCicadaPlant(random: () => number): BlockId {
  const roll = random()
  if (roll < 0.34)
    return BlockId.FERN
  if (roll < 0.6)
    return BlockId.FOREST_LITTER
  if (roll < 0.82)
    return BlockId.TALL_GRASS
  return BlockId.STONE_PLANT
}

function measureClearingOvershoot(x: number, z: number, clearing: CicadaClearing): number {
  return measureDistance(x, z, clearing) - clearing.radius
}

/** 緣廊佔的那一塊（廊板、柵柱與前面一格），樹與草都要讓開 */
function isVerandaCell(x: number, z: number): boolean {
  return VERANDA_LIST.some((veranda) =>
    Math.abs(x - veranda.x) <= VERANDA_HALF_LENGTH + 1 && z >= veranda.z - 1 && z <= veranda.z + 1)
}

/** 兩片空地、門前與緣廊都要平：不隆起、不種樹 */
function isOpenGround(x: number, z: number): boolean {
  return measureClearingOvershoot(x, z, ARRIVAL_CLEARING) < 1
    || measureClearingOvershoot(x, z, SHADE_CLEARING) < 1
    || measureDistance(x, z, CICADA_PORTAL_POINT) < 4
    || isVerandaCell(x, z)
}

/**
 * 地面隆起幾格
 *
 * 林子裡零星一格高的小丘；外圍那一圈每三格高一格，最多四格，樹幹牆長在往上收的坡上
 */
function measureLevel(x: number, z: number, radius: number, pathDistance: number): number {
  if (pathDistance < 2.5 || isOpenGround(x, z))
    return 0
  const roll = fbm2D(x * 0.07 - 37, z * 0.07 + 5, 2, 0.5)
  if (radius < WOOD_RADIUS + 2)
    return roll > 0.34 ? 1 : 0
  const rise = Math.min(4, 1 + Math.floor((radius - WOOD_RADIUS - 2) / 3))
  return rise + (roll > 0.2 ? 1 : 0)
}

/**
 * 地面與土徑，回傳每一格的地表高度
 *
 * 蟬時雨的地是草皮中間一塊土，樹底下曬不到太陽的地方是土；
 * 這裡整片都在樹底下，土與草一片一片交錯，土多一點；土徑整條是土
 */
function shapeTerrain(state: Uint8Array, pathDistanceMap: Float32Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, CICADA_CENTER)
      if (radius > CICADA_EDGE_RADIUS + 2) {
        fillHiddenColumn(state, x, z, CICADA_GROUND_Y)
        groundTopMap[x * WORLD_SIZE + z] = CICADA_GROUND_Y
        continue
      }
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      const topY = CICADA_GROUND_Y + measureLevel(x, z, radius, pathDistance)
      const isDirt = pathDistance <= 1.05 || fbm2D(x * 0.11 + 9, z * 0.11 - 3, 2, 0.5) > -0.08
      fillGroundColumn(state, x, z, topY, isDirt ? BlockId.DIRT : BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }
  return groundTopMap
}

function readGroundY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/**
 * 緣廊
 *
 * 與蟬時雨一模一樣：廊板是七格木板（貼地那一層）、坐墊隔一格一個、
 * 後面兩端各一根三格高的柵柱撐著深色木的短簷，簷的前緣是朝北的階梯，簷下一盞吊燈
 */
function buildVerandaList(state: Uint8Array, groundTopMap: Uint8Array): void {
  for (const veranda of VERANDA_LIST) {
    const deckY = groundTopMap[veranda.x * WORLD_SIZE + veranda.z]!
    const groundY = deckY + 1
    for (let offsetX = -VERANDA_HALF_LENGTH; offsetX <= VERANDA_HALF_LENGTH; offsetX++) {
      setBlock(state, veranda.x + offsetX, deckY, veranda.z, BlockId.PLANKS)
    }
    for (const offsetX of [-VERANDA_HALF_LENGTH, VERANDA_HALF_LENGTH]) {
      for (let level = 0; level < 3; level++) {
        setBlock(state, veranda.x + offsetX, groundY + level, veranda.z + 1, BlockId.FENCE)
      }
    }
    for (let offsetX = -VERANDA_HALF_LENGTH; offsetX <= VERANDA_HALF_LENGTH; offsetX++) {
      setBlock(state, veranda.x + offsetX, groundY + 3, veranda.z + 1, BlockId.DARK_PLANKS)
      setBlock(state, veranda.x + offsetX, groundY + 3, veranda.z, BlockId.DARK_STAIRS_NORTH)
    }
    for (const offsetX of [-3, -1, 1, 3]) {
      setBlock(state, veranda.x + offsetX, groundY, veranda.z, BlockId.CUSHION)
    }
    setBlock(state, veranda.x + 2, groundY + 2, veranda.z, BlockId.HANGING_LAMP)
  }
}

/**
 * 石燈籠
 *
 * 蟬時雨一盞，「白天不亮，但它是這片陰影裡唯一的直線」。
 * 這裡回程門東側（木牌再過去）一盞、兩片空地邊上各一盞，夜裡回頭找門與緣廊就靠它們
 */
function placeLanternList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const pointList = [
    { x: CICADA_PORTAL_POINT.x + 6, z: CICADA_PORTAL_POINT.z - 1 },
    { x: ARRIVAL_CLEARING.x + 5, z: ARRIVAL_CLEARING.z - 4 },
    { x: SHADE_CLEARING.x + 5, z: SHADE_CLEARING.z - 3 },
  ]
  for (const point of pointList) {
    placeStoneLantern(state, point.x, readGroundY(groundTopMap, point.x, point.z), point.z)
  }
}

/** 這一格要不要種樹的機率：林子裡由低頻噪音決定疏密，外圍那一圈越來越密 */
function measureTreeChance(x: number, z: number, radius: number, pathDistance: number): number {
  if (radius > CICADA_EDGE_RADIUS || pathDistance < 2.2 || isOpenGround(x, z))
    return 0
  if (measureDistance(x, z, CICADA_PORTAL_POINT) < 6)
    return 0
  const clearingOvershoot = Math.min(
    measureClearingOvershoot(x, z, ARRIVAL_CLEARING),
    measureClearingOvershoot(x, z, SHADE_CLEARING),
  )
  if (clearingOvershoot < 1)
    return 0
  const density = fbm2D(x * 0.05 + 17, z * 0.05 - 23, 2, 0.5)
  return Math.min(0.85, Math.max(0.35, 0.6 + density * 0.4))
}

/**
 * 一棵樹：光禿禿的樹幹一路撐到蓋子底下，頂上一圈樹冠
 *
 * 樹冠只有蓋子下面那一層（五格見方去掉四角），蓋子本身由 spreadCanopy 整片鋪
 */
function placeCicadaTree(state: Uint8Array, x: number, groundY: number, z: number, hasCrown: boolean): void {
  for (let y = groundY; y < CANOPY_Y; y++) {
    setBlock(state, x, y, z, BlockId.OAK_LOG)
  }
  if (!hasCrown)
    return
  const crownY = CANOPY_Y - 1
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (Math.abs(offsetX) === 2 && Math.abs(offsetZ) === 2)
        continue
      setDecoration(state, x + offsetX, crownY, z + offsetZ, BlockId.OAK_LEAVES)
    }
  }
}

/**
 * 種樹
 *
 * 林子裡每四格見方抽一次籤，樹幹之間隔四五格，人在樹幹之間穿得過去；
 * 外圍那一圈每兩格抽一次，樹幹一排比一排密，看出去是一整面樹幹的牆。
 * 外圍的樹不另外長樹冠（蓋子一路鋪過去，看不出差別），省下大把葉子
 */
function placeTreeList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('cicada-realm-tree')

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += TREE_CELL_SIZE) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += TREE_CELL_SIZE) {
      const x = cellX + 1 + Math.floor(random() * (TREE_CELL_SIZE - 1))
      const z = cellZ + 1 + Math.floor(random() * (TREE_CELL_SIZE - 1))
      const roll = random()
      const radius = measureDistance(x, z, CICADA_CENTER)
      if (radius > WOOD_RADIUS + 2)
        continue
      if (roll > measureTreeChance(x, z, radius, pathDistanceMap[x * WORLD_SIZE + z]!))
        continue
      const groundY = readGroundY(groundTopMap, x, z)
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      placeCicadaTree(state, x, groundY, z, true)
    }
  }

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += THICKET_CELL_SIZE) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += THICKET_CELL_SIZE) {
      const x = cellX + Math.floor(random() * THICKET_CELL_SIZE)
      const z = cellZ + Math.floor(random() * THICKET_CELL_SIZE)
      const roll = random()
      const radius = measureDistance(x, z, CICADA_CENTER)
      if (radius <= WOOD_RADIUS + 2 || radius > CICADA_EDGE_RADIUS)
        continue
      const chance = Math.min(0.6, 0.2 + ((radius - WOOD_RADIUS - 2) / 8) * 0.4)
      if (roll > chance)
        continue
      const groundY = readGroundY(groundTopMap, x, z)
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      placeCicadaTree(state, x, groundY, z, false)
    }
  }
}

/**
 * 頭頂那層蓋子
 *
 * 蟬時雨在最高處補一整片葉子，把四棵樹之間透光的洞蓋掉，只留一成八的葉縫。
 * 這裡一路鋪到林子外緣（邊緣吃噪音），走到哪裡抬頭都是一片綠，光從葉縫漏下來
 */
function spreadCanopy(state: Uint8Array): void {
  const random = createSeededRandom('cicada-realm-canopy')
  const reach = CANOPY_RADIUS + 3
  for (let x = CICADA_CENTER.x - reach; x <= CICADA_CENTER.x + reach; x++) {
    for (let z = CICADA_CENTER.z - reach; z <= CICADA_CENTER.z + reach; z++) {
      const isHole = random() < CANOPY_HOLE_CHANCE
      if (getNoisyDistance(x, z, CICADA_CENTER.x, CICADA_CENTER.z, 0.12, 2.5) > CANOPY_RADIUS)
        continue
      if (isHole)
        continue
      setDecoration(state, x, CANOPY_Y, z, BlockId.OAK_LEAVES)
    }
  }
}

/**
 * 林下的草
 *
 * 與蟬時雨同一組、同一個比例，三成四；土徑上不長，空地裡少一點。
 * 開花的東西一律不放：那些會把視線拉回地面，而這座林子希望人一直抬著頭
 */
function scatterUndergrowth(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('cicada-realm-plant')
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, CICADA_CENTER) > CICADA_EDGE_RADIUS)
        continue
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      if (pathDistance < 1.6 || isVerandaCell(x, z))
        continue
      const chance = isOpenGround(x, z) ? 0.18 : PLANT_CHANCE
      if (random() > chance)
        continue
      plantOnGround(state, x, readGroundY(groundTopMap, x, z), z, pickCicadaPlant(random), FLOOR_SET)
    }
  }
}

/** 生成整片蟬雨深林 */
export function generateCicadaWorld(state: Uint8Array): void {
  const pathPointList = samplePathCurve(CICADA_PATH_CONTROL_POINT_LIST)
  const pathDistanceMap = createPathDistanceMap([pathPointList], 6)
  const groundTopMap = shapeTerrain(state, pathDistanceMap)
  buildVerandaList(state, groundTopMap)
  placeLanternList(state, groundTopMap)
  placeTreeList(state, groundTopMap, pathDistanceMap)
  spreadCanopy(state)
  scatterUndergrowth(state, groundTopMap, pathDistanceMap)

  /** 門框排在花草之後：門洞前後與木牌前面的草由它清掉 */
  for (const portal of CICADA_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門往北、落腳那幾格也清掉 */
  for (let offsetZ = -4; offsetZ <= 2; offsetZ++) {
    const x = CICADA_PORTAL_POINT.x
    const z = CICADA_PORTAL_POINT.z + offsetZ
    const y = readGroundY(groundTopMap, x, z)
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
