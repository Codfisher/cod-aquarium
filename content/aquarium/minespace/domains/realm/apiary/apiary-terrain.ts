import type { PlanePoint } from '../land-realm-kit'
import type { HiveYard } from './apiary-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { fillBox } from '../../garden/garden-kit'
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
  APIARY_CENTER,
  APIARY_EDGE_RADIUS,
  APIARY_FLOOR_RADIUS,
  APIARY_FLOOR_Y,
  APIARY_PORTAL_POINT,
  APIARY_RIDGE_Y,
  APIARY_RIM_RADIUS,
  HIVE_YARD_LIST,
  HIVE_YARD_RADIUS,
  RIM_RISE_MAX,
  RIM_STEP_WIDTH,
  STAIR_DEGREE_LIST,
  TERRACE_COUNT,
  TERRACE_WIDTH,
} from './apiary-layout'
import { APIARY_REALM } from './apiary-realm'

/**
 * 萬花蜂台的地形
 *
 * 只有地形 worker 用。蜂巢圃（buildApiaryGarden）放大：草地、疊在一起的蜂箱、
 * 竹籬、蜂蜜與木桶、滿地的花，花的種類與比例照抄。那一座只有一方木座，
 * 這裡把它攤成一座碗狀的花谷，谷底一大疊蜂箱，四周五層花台，再外面一圈跳不上去的花坡。
 *
 * 順序：先地面（每一格柱的高度先整片算好），再木階、蜂箱，花最後撒，
 * 傳送門排在花之後，門洞與木牌前面那幾格要清乾淨
 */

const GRASS_SET = new Set([BlockId.GRASS])

/** 走得到的花台上每一格撒花的機率，與蜂巢圃一樣是六成，花床的疏密再吃一層噪音 */
const FLOWER_CHANCE = 0.6
/** 花坡上的花：走不到，從谷裡看上去仍是一片花，但少一點，省些花草 */
const RIM_FLOWER_CHANCE = 0.42

/**
 * 蜂巢圃那一組花
 *
 * 大花三成、玫瑰兩成、鬱金香、蒲公英、堇，最後一成不到的高草，與 buildApiaryGarden 一字不差
 */
function pickApiaryFlower(random: () => number): BlockId {
  const roll = random()
  if (roll < 0.3)
    return BlockId.BIG_FLOWER
  if (roll < 0.5)
    return BlockId.FLOWER_ROSE
  if (roll < 0.66)
    return BlockId.FLOWER_TULIP
  if (roll < 0.8)
    return BlockId.FLOWER_DANDELION
  if (roll < 0.92)
    return BlockId.FLOWER_VIOLA
  return BlockId.TALL_GRASS
}

/**
 * 吃過噪音的半徑
 *
 * 花台的邊是一圈一圈的等高線，規則的同心圓一看就是畫出來的；
 * 半徑加一層低頻噪音，每一層花台的寬窄就會一段寬一段窄
 */
function measureWarpedRadius(x: number, z: number): number {
  return measureDistance(x, z, APIARY_CENTER) + fbm2D(x * 0.045 + 31, z * 0.045 - 17, 2, 0.5) * 4
}

/**
 * 這一格柱高出谷底幾格
 *
 * 谷底是零，五層花台各高一格；最上層外面的花坡兩格一階，一路墊到稜線
 */
function measureRawLevel(x: number, z: number): number {
  const warped = measureWarpedRadius(x, z)
  if (warped < APIARY_FLOOR_RADIUS)
    return 0
  if (warped < APIARY_RIM_RADIUS)
    return 1 + Math.floor((warped - APIARY_FLOOR_RADIUS) / TERRACE_WIDTH)
  const step = 1 + Math.floor((warped - APIARY_RIM_RADIUS) / RIM_STEP_WIDTH)
  return TERRACE_COUNT + Math.min(RIM_RISE_MAX, step * 2)
}

/**
 * 整片的高度表
 *
 * 一組蜂箱的範圍裡一律跟著中心那一格的高度：花台的邊是噪音畫的，
 * 不讓開的話會有一格落差從三個蜂箱中間穿過去。回程門前後與谷底正中同樣是平的
 */
function createLevelMap(): Uint8Array {
  const levelMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      levelMap[x * WORLD_SIZE + z] = measureRawLevel(x, z)
    }
  }

  const flattenList = [
    ...HIVE_YARD_LIST.map((yard) => ({ x: yard.x, z: yard.z, radius: HIVE_YARD_RADIUS, level: measureRawLevel(yard.x, yard.z) })),
    { ...APIARY_PORTAL_POINT, radius: 5, level: 0 },
    { ...APIARY_CENTER, radius: 9, level: 0 },
  ]
  for (const { x: centerX, z: centerZ, radius, level } of flattenList) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        if (Math.hypot(x - centerX, z - centerZ) <= radius)
          levelMap[x * WORLD_SIZE + z] = level
      }
    }
  }
  return levelMap
}

function readLevel(levelMap: Uint8Array, x: number, z: number): number {
  return levelMap[x * WORLD_SIZE + z]!
}

/** 站在這一格上的腳底高度 */
function toGroundY(level: number): number {
  return APIARY_FLOOR_Y + level + 1
}

/** 地面：谷底、花台、花坡，外圍換成不畫的 LAKE_BED */
function shapeTerrain(state: Uint8Array, levelMap: Uint8Array): void {
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureDistance(x, z, APIARY_CENTER) > APIARY_EDGE_RADIUS) {
        fillHiddenColumn(state, x, z, APIARY_RIDGE_Y)
        continue
      }
      fillGroundColumn(state, x, z, APIARY_FLOOR_Y + readLevel(levelMap, x, z), BlockId.GRASS)
    }
  }
}

/**
 * 四道上下花台的小徑
 *
 * 從谷底斜斜往外，中段彎一點，一路走到最上層花台的外緣
 */
function createStairPathList(): PlanePoint[][] {
  return STAIR_DEGREE_LIST.map((degree) => {
    const pointAt = (radius: number, bend: number) => {
      const radian = ((degree + bend) / 180) * Math.PI
      return {
        x: APIARY_CENTER.x + Math.cos(radian) * radius,
        z: APIARY_CENTER.z + Math.sin(radian) * radius,
      }
    }
    return samplePathCurve([
      pointAt(8, 0),
      pointAt(APIARY_FLOOR_RADIUS + TERRACE_WIDTH * 1.5, 6),
      pointAt(APIARY_FLOOR_RADIUS + TERRACE_WIDTH * 3.5, -5),
      pointAt(APIARY_RIM_RADIUS - 1, 2),
    ])
  })
}

/**
 * 小徑上的木階
 *
 * 一層花台高一格，人得跳才上得去。小徑上每一道落差前面（低的那一格）墊一片木半磚：
 * 半格高自動跨得上去，再半格就到上一層。木半磚是蜂巢圃蜂箱頂上那一片
 */
function placeStairStepList(state: Uint8Array, levelMap: Uint8Array, pathDistanceMap: Float32Array): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      if (pathDistanceMap[x * WORLD_SIZE + z]! > 1.1)
        continue
      const level = readLevel(levelMap, x, z)
      if (level >= TERRACE_COUNT)
        continue
      const hasRiser = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) =>
        readLevel(levelMap, x + offsetX!, z + offsetZ!) === level + 1)
      if (hasRiser)
        setBlock(state, x, toGroundY(level), z, BlockId.WOOD_SLAB)
    }
  }
}

/** 一個蜂箱：木板墊底、疊幾格蜂箱、頂上一片木半磚，與蜂巢圃同一種疊法 */
function placeHive(state: Uint8Array, x: number, groundY: number, z: number, height: number): void {
  setBlock(state, x, groundY, z, BlockId.PLANKS)
  for (let level = 1; level <= height; level++) {
    setBlock(state, x, groundY + level, z, BlockId.HIVE)
  }
  setBlock(state, x, groundY + height + 1, z, BlockId.WOOD_SLAB)
}

/**
 * 谷底正中那一大疊蜂箱
 *
 * 蜂巢圃三個蜂箱高度錯開疊在一起，聲音的來源看起來是一團；
 * 這裡放大成前後兩排九個，中間最高、往兩邊遞減，遠看是一座蜂箱堆成的小丘。
 * 北側照樣一道竹籬（人從回程門走過來先看到它，得繞路才靠得近），
 * 東側擺著收成的蜂蜜與木桶
 */
function buildMainHiveStack(state: Uint8Array): void {
  const { x: centerX, z: centerZ } = APIARY_CENTER
  const groundY = toGroundY(0)

  const hiveList = [
    { x: -4, z: 0, height: 1 },
    { x: -2, z: 0, height: 2 },
    { x: 0, z: 0, height: 3 },
    { x: 2, z: 0, height: 2 },
    { x: 4, z: 0, height: 1 },
    { x: -3, z: 2, height: 1 },
    { x: -1, z: 2, height: 2 },
    { x: 1, z: 2, height: 2 },
    { x: 3, z: 2, height: 1 },
  ]
  for (const hive of hiveList) {
    placeHive(state, centerX + hive.x, groundY, centerZ + hive.z, hive.height)
  }

  for (let offsetX = -6; offsetX <= 6; offsetX++) {
    setBlock(state, centerX + offsetX, groundY, centerZ - 3, BlockId.BAMBOO_FENCE)
  }

  for (const spot of [{ x: 6, z: -1 }, { x: 6, z: 0 }, { x: 7, z: 1 }]) {
    setBlock(state, centerX + spot.x, groundY, centerZ + spot.z, BlockId.HONEY_BLOCK)
  }
  for (const spot of [{ x: 6, z: -2 }, { x: 7, z: 0 }, { x: -6, z: 1 }]) {
    setBlock(state, centerX + spot.x, groundY, centerZ + spot.z, BlockId.BARREL)
  }
  setBlock(state, centerX + 6, groundY + 1, centerZ - 1, BlockId.HONEY_BLOCK)
}

/**
 * 一組蜂箱的本地座標換成世界座標
 *
 * 本地座標照 buildApiaryGarden 寫（竹籬在 -Z），再依 fenceSide 轉成竹籬朝上坡
 */
function toYardPoint(yard: HiveYard, localX: number, localZ: number): PlanePoint {
  switch (yard.fenceSide) {
    case 'north':
      return { x: yard.x + localX, z: yard.z + localZ }
    case 'south':
      return { x: yard.x - localX, z: yard.z - localZ }
    case 'east':
      return { x: yard.x - localZ, z: yard.z + localX }
    case 'west':
      return { x: yard.x + localZ, z: yard.z - localX }
  }
}

/**
 * 花台上的一組蜂箱
 *
 * 與蜂巢圃一模一樣：三個蜂箱（高二、一、一）、上坡那一側七格竹籬、旁邊一格蜂蜜一格木桶
 */
function buildHiveYard(state: Uint8Array, levelMap: Uint8Array, yard: HiveYard): void {
  const groundY = toGroundY(readLevel(levelMap, yard.x, yard.z))

  for (const spot of [{ x: 0, z: 0, height: 2 }, { x: 2, z: 1, height: 1 }, { x: -2, z: 2, height: 1 }]) {
    const point = toYardPoint(yard, spot.x, spot.z)
    placeHive(state, point.x, groundY, point.z, spot.height)
  }

  const honey = toYardPoint(yard, 4, -1)
  setBlock(state, honey.x, groundY, honey.z, BlockId.HONEY_BLOCK)
  const barrel = toYardPoint(yard, 4, -2)
  setBlock(state, barrel.x, groundY, barrel.z, BlockId.BARREL)

  for (let offset = -3; offset <= 3; offset++) {
    const point = toYardPoint(yard, offset, -3)
    setBlock(state, point.x, groundY, point.z, BlockId.BAMBOO_FENCE)
  }
}

/**
 * 撒花
 *
 * 每一格草地都照蜂巢圃那一組花撒，花床的疏密吃一層低頻噪音（五成到七成），
 * 一片一片的濃淡看得出是花床；小徑上只零星幾株，路才看得出來
 */
function scatterFlowerList(state: Uint8Array, levelMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('apiary-realm-flower')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, APIARY_CENTER)
      if (radius > APIARY_EDGE_RADIUS - 4)
        continue

      const level = readLevel(levelMap, x, z)
      const isRim = level > TERRACE_COUNT
      const bed = fbm2D(x * 0.09 - 5, z * 0.09 + 11, 2, 0.5)
      const isPath = pathDistanceMap[x * WORLD_SIZE + z]! < 1.6
      const chance = isPath
        ? 0.05
        : isRim ? RIM_FLOWER_CHANCE : FLOWER_CHANCE + bed * 0.2
      if (random() > chance)
        continue

      plantOnGround(state, x, toGroundY(level), z, pickApiaryFlower(random), GRASS_SET)
    }
  }
}

/** 生成整座萬花蜂台 */
export function generateApiaryWorld(state: Uint8Array): void {
  const levelMap = createLevelMap()
  const pathDistanceMap = createPathDistanceMap(createStairPathList(), 3)
  shapeTerrain(state, levelMap)
  placeStairStepList(state, levelMap, pathDistanceMap)
  buildMainHiveStack(state)
  for (const yard of HIVE_YARD_LIST) {
    buildHiveYard(state, levelMap, yard)
  }
  scatterFlowerList(state, levelMap, pathDistanceMap)

  /** 門框排在花之後：門洞前後與木牌前面的花由它清掉 */
  for (const portal of APIARY_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門前後那一段也清出來，從落腳處望出去不是一叢花擋在門洞前 */
  for (let offsetZ = -3; offsetZ <= 4; offsetZ++) {
    const x = APIARY_PORTAL_POINT.x
    const z = APIARY_PORTAL_POINT.z + offsetZ
    const y = toGroundY(readLevel(levelMap, x, z))
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
