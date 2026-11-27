import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { fillBox, getNoisyDistance, placeStandingStone, setDecoration } from '../../garden/garden-kit'
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
  DOWNS_RISE_MAX,
  DOWNS_STEP_WIDTH,
  INSECT_CENTER,
  INSECT_EDGE_RADIUS,
  INSECT_GROUND_Y,
  INSECT_PATH_CONTROL_POINT_LIST,
  INSECT_PORTAL_POINT,
  INSECT_RIDGE_Y,
  MEADOW_RADIUS,
  SAND_PATCH_LIST,
} from './insect-layout'
import { INSECT_REALM } from './insect-realm'

/**
 * 蟲鳴夜原的地形
 *
 * 只有地形 worker 用。蟲聲叢（buildInsectGarden）放大：草種到滿，同一組草、同一個比例
 * （高草五成、乾草兩成、蕨、捲葉草、火焰花），埋了半截的枯木樁、圓石堆、
 * 一片一片的乾土上長仙人掌與枯灌。那一座只有一方木座，這裡讓草原起伏著長出去，
 * 外圍一圈兩格一階的草坡圍住，再外面換成不畫的 LAKE_BED。
 *
 * 順序：先地面，再乾土、枯木樁、圓石，草最後撒，傳送門排在草之後
 */

const GRASS_SET = new Set([BlockId.GRASS])
const SAND_SET = new Set([BlockId.SAND])

/** 草地每一格撒草的機率，與蟲聲叢一樣是七成八，高到看不見地面 */
const GRASS_CHANCE = 0.78
/** 草坡上走不到，但從草原裡看得到坡面，照樣種，少一點 */
const DOWNS_GRASS_CHANCE = 0.6

/** 蟲聲叢那一組草，與 buildInsectGarden 一字不差 */
function pickInsectPlant(random: () => number): BlockId {
  const roll = random()
  if (roll < 0.5)
    return BlockId.TALL_GRASS
  if (roll < 0.7)
    return BlockId.DRY_GRASS
  if (roll < 0.84)
    return BlockId.FERN
  if (roll < 0.92)
    return BlockId.CURLY_PLANT
  return BlockId.FIRE_FLOWER
}

/** 吃過噪音的半徑，草坡的腳才不是一個圓 */
function measureWarpedRadius(x: number, z: number): number {
  return measureDistance(x, z, INSECT_CENTER) + fbm2D(x * 0.05 - 41, z * 0.05 + 7, 2, 0.5) * 4
}

/**
 * 這一格柱高出最低那一層幾格
 *
 * 草原裡是零到三格的緩丘（低頻噪音，一片一片的），小徑兩側壓平，人才走得順；
 * 外圍的草坡兩格一階往上墊
 */
function measureRawLevel(x: number, z: number, pathDistance: number): number {
  const warped = measureWarpedRadius(x, z)
  const hill = fbm2D(x * 0.04 + 3, z * 0.04 - 8, 3, 0.5)
  const hillLevel = Math.max(0, Math.min(3, Math.floor((hill + 0.35) * 3.2)))
  const pathCap = Math.max(0, Math.floor((pathDistance - 2) / 3))
  const meadowLevel = Math.min(hillLevel, pathCap)
  if (warped < MEADOW_RADIUS)
    return meadowLevel

  const step = 1 + Math.floor((warped - MEADOW_RADIUS) / DOWNS_STEP_WIDTH)
  const downsLevel = step <= 2 ? step : 2 + (step - 2) * 2
  return Math.max(meadowLevel, Math.min(DOWNS_RISE_MAX, downsLevel))
}

/**
 * 整片的高度表
 *
 * 乾土窪地與回程門前後一律是平的：窪地照中心那一格的高度，門前是最低那一層
 */
function createLevelMap(pathDistanceMap: Float32Array): Uint8Array {
  const levelMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      levelMap[x * WORLD_SIZE + z] = measureRawLevel(x, z, pathDistanceMap[x * WORLD_SIZE + z]!)
    }
  }

  const flattenList = [
    ...SAND_PATCH_LIST.map((patch) => ({
      x: patch.x,
      z: patch.z,
      radius: patch.radius + 3,
      level: levelMap[patch.x * WORLD_SIZE + patch.z]!,
    })),
    { ...INSECT_PORTAL_POINT, radius: 6, level: 0 },
  ]
  for (const { x: centerX, z: centerZ, radius, level } of flattenList) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
      for (let z = Math.floor(centerZ - radius); z <= Math.ceil(centerZ + radius); z++) {
        if (Math.hypot(x - centerX, z - centerZ) <= radius)
          levelMap[x * WORLD_SIZE + z] = level
      }
    }
  }
  return levelMap
}

function readGroundY(levelMap: Uint8Array, x: number, z: number): number {
  return INSECT_GROUND_Y + levelMap[x * WORLD_SIZE + z]! + 1
}

/** 地面：草原、草坡，外圍換成不畫的 LAKE_BED */
function shapeTerrain(state: Uint8Array, levelMap: Uint8Array): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, INSECT_CENTER) > INSECT_EDGE_RADIUS) {
        fillHiddenColumn(state, x, z, INSECT_RIDGE_Y)
        continue
      }
      fillGroundColumn(state, x, z, INSECT_GROUND_Y + levelMap[x * WORLD_SIZE + z]!, BlockId.GRASS)
    }
  }
}

/**
 * 乾土窪地
 *
 * 蟲聲叢那一小片乾土（吃噪音的圓）、兩株仙人掌、三成的格子長枯灌，這裡每一處都照這樣做
 */
function buildSandPatchList(state: Uint8Array, levelMap: Uint8Array): void {
  const random = createSeededRandom('insect-realm-sand')

  for (const patch of SAND_PATCH_LIST) {
    const reach = Math.ceil(patch.radius + 2)
    const groundY = readGroundY(levelMap, patch.x, patch.z)
    for (let x = patch.x - reach; x <= patch.x + reach; x++) {
      for (let z = patch.z - reach; z <= patch.z + reach; z++) {
        if (getNoisyDistance(x, z, patch.x, patch.z, 0.22, 1.1) <= patch.radius)
          setBlock(state, x, groundY - 1, z, BlockId.SAND)
      }
    }

    /** 仙人掌：大的窪地四株，小的兩株，一到兩格高 */
    const cactusCount = patch.radius >= 5 ? 4 : 2
    for (let index = 0; index < cactusCount; index++) {
      const angle = random() * Math.PI * 2
      const distance = random() * (patch.radius - 1)
      const x = Math.round(patch.x + Math.cos(angle) * distance)
      const z = Math.round(patch.z + Math.sin(angle) * distance)
      const height = random() < 0.5 ? 2 : 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.SAND)
        continue
      for (let level = 0; level < height; level++) {
        setBlock(state, x, groundY + level, z, BlockId.CACTUS)
      }
    }

    for (let x = patch.x - reach; x <= patch.x + reach; x++) {
      for (let z = patch.z - reach; z <= patch.z + reach; z++) {
        if (random() < 0.3)
          plantOnGround(state, x, groundY, z, BlockId.DRY_SHRUB, SAND_SET)
      }
    }
  }
}

/** 這一格能不能放枯木樁或圓石：不在小徑上、不在門前、不在窪地裡、還在草原裡 */
function isOpenMeadow(x: number, z: number, pathDistanceMap: Float32Array): boolean {
  if (pathDistanceMap[x * WORLD_SIZE + z]! < 3)
    return false
  if (measureDistance(x, z, INSECT_PORTAL_POINT) < 7)
    return false
  if (measureWarpedRadius(x, z) > MEADOW_RADIUS - 2)
    return false
  return SAND_PATCH_LIST.every((patch) => measureDistance(x, z, patch) > patch.radius + 1.5)
}

/**
 * 埋了半截的枯木樁
 *
 * 蟲聲叢三根，一根一或兩格高，蟲從縫裡叫出來。這裡三四根一叢，散在草原裡，
 * 一叢的木樁彼此隔一兩格，像是一截倒下的老木頭爛剩的幾段
 */
function placeLogStumpList(state: Uint8Array, levelMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('insect-realm-log')

  for (let attempt = 0; attempt < 44; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 6 + random() * (MEADOW_RADIUS - 10)
    const clusterX = Math.round(INSECT_CENTER.x + Math.cos(angle) * radius)
    const clusterZ = Math.round(INSECT_CENTER.z + Math.sin(angle) * radius)
    const stumpCount = 2 + Math.floor(random() * 3)

    for (let index = 0; index < stumpCount; index++) {
      const x = clusterX + Math.round((random() * 2 - 1) * 2.5)
      const z = clusterZ + Math.round((random() * 2 - 1) * 2.5)
      const isTall = random() < 0.6
      if (!isOpenMeadow(x, z, pathDistanceMap))
        continue
      const groundY = readGroundY(levelMap, x, z)
      if (getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      setBlock(state, x, groundY, z, BlockId.DEAD_LOG)
      if (isTall)
        setBlock(state, x, groundY + 1, z, BlockId.DEAD_LOG)
    }
  }
}

/**
 * 圓石堆
 *
 * 蟲聲叢一堆：一顆兩格高的圓石立石，旁邊再擱一塊，石縫是另一種蟲的家
 */
function placeStoneHeapList(state: Uint8Array, levelMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('insect-realm-stone')

  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * (MEADOW_RADIUS - 12)
    const x = Math.round(INSECT_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(INSECT_CENTER.z + Math.sin(angle) * radius)
    const height = random() < 0.35 ? 3 : 2
    const sideRoll = random()
    if (!isOpenMeadow(x, z, pathDistanceMap))
      continue

    /** 立石的底座是十字五格，五格要在同一個高度，不然底座會懸空或插進坡裡 */
    const groundY = readGroundY(levelMap, x, z)
    const isFlat = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([offsetX, offsetZ]) =>
      readGroundY(levelMap, x + offsetX!, z + offsetZ!) === groundY
      && getBlock(state, x + offsetX!, groundY, z + offsetZ!) === BlockId.AIR)
    if (!isFlat)
      continue

    placeStandingStone(state, x, groundY, z, height, BlockId.COBBLESTONE)
    const sideX = sideRoll < 0.5 ? x + 2 : x
    const sideZ = sideRoll < 0.5 ? z : z + 2
    if (readGroundY(levelMap, sideX, sideZ) === groundY)
      setDecoration(state, sideX, groundY, sideZ, BlockId.COBBLESTONE)
  }
}

/**
 * 撒草
 *
 * 每一格草地都照蟲聲叢那一組撒，七成八，高到看不見地面；
 * 小徑上只零星幾叢乾草，看得出是一條被踩過的路
 */
function scatterGrassList(state: Uint8Array, levelMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('insect-realm-grass')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, INSECT_CENTER) > INSECT_EDGE_RADIUS - 4)
        continue

      const groundY = readGroundY(levelMap, x, z)
      const pathDistance = pathDistanceMap[x * WORLD_SIZE + z]!
      if (pathDistance < 1.1) {
        if (random() < 0.08)
          plantOnGround(state, x, groundY, z, BlockId.DRY_GRASS, GRASS_SET)
        continue
      }

      const isDowns = measureWarpedRadius(x, z) >= MEADOW_RADIUS
      if (random() > (isDowns ? DOWNS_GRASS_CHANCE : GRASS_CHANCE))
        continue
      plantOnGround(state, x, groundY, z, pickInsectPlant(random), GRASS_SET)
    }
  }
}

/** 生成整片蟲鳴夜原 */
export function generateInsectWorld(state: Uint8Array): void {
  const pathPointList = samplePathCurve(INSECT_PATH_CONTROL_POINT_LIST)
  const pathDistanceMap = createPathDistanceMap([pathPointList], 9)
  const levelMap = createLevelMap(pathDistanceMap)
  shapeTerrain(state, levelMap)
  buildSandPatchList(state, levelMap)
  placeLogStumpList(state, levelMap, pathDistanceMap)
  placeStoneHeapList(state, levelMap, pathDistanceMap)
  scatterGrassList(state, levelMap, pathDistanceMap)

  /** 門框排在草之後：門洞前後與木牌前面的草由它清掉 */
  for (const portal of INSECT_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門往西、落腳那幾格也清掉，一落地就看得到小徑從腳下鑽進草裡 */
  for (let offsetX = -4; offsetX <= 2; offsetX++) {
    const x = INSECT_PORTAL_POINT.x + offsetX
    const z = INSECT_PORTAL_POINT.z
    const y = readGroundY(levelMap, x, z)
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
