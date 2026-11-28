import type { MeadowZoneKind } from './meadow-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock } from '../../block/block-constants'
import { fillBox, getNoisyDistance, placeOakTree, placeStandingStone, plantWithStack, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { createPathDistanceMap, measureDistance, plantOnGround, samplePathCurve } from '../land-realm-kit'
import { placePortalStructure } from '../portal-terrain'
import { fillHeightStep } from '../realm-terrain-kit'
import { decorateMeadow } from './meadow-details'
import {
  MEADOW_CENTER,
  MEADOW_GROUND_Y,
  MEADOW_HOLLOW_LIST,
  MEADOW_OUTER_RADIUS,
  MEADOW_PATH_CONTROL_POINT_LIST,
  MEADOW_PORTAL_POINT,
  MEADOW_SLOW_RADIUS,
  MEADOW_ZONE_LIST,
  measureMeadowHeight,
  measureMeadowRadius,
} from './meadow-layout'
import { MEADOW_REALM } from './meadow-realm'

/**
 * 風露原的地形
 *
 * 只有地形 worker 用。地面是野花原那一座接一座的圓丘；草與花照蟲鳴夜原的分區撒（見 ZONE_MIX_MAP），
 * 丘頂的孤樹與長凳照草苑的擺法，谷底的乾土窪地、草裡的枯木樁與圓石堆照蟲聲叢的擺法。
 * 沒有燈、沒有房子，只有一條踩出來的小徑。
 *
 * 順序：地面 → 乾土窪地 → 孤樹與長凳 → 枯木樁 → 圓石堆 → 花草 → 傳送門（門洞前後與木牌前面的花草由它清掉）
 */

const GRASS_SET = new Set([BlockId.GRASS])
const SAND_SET = new Set([BlockId.SAND])

/** 外圍坡上走不到，但從原野裡看得到坡面，照樣種，少一點 */
const SLOPE_PLANT_CHANCE = 0.55

/**
 * 每一區的草與花：機率（累計前的權重）與撒的疏密
 *
 * court 與大廳風露苑（buildMeadowGarden 的 MEADOW_PLANT_MIX）同一組；thicket 是蟲聲叢那一組；
 * 其他幾區照蟲鳴夜原：草仍是主體，花只是那一區的顏色
 */
const ZONE_MIX_MAP: Record<MeadowZoneKind, { chance: number; mix: readonly (readonly [BlockId, number])[] }> = {
  court: {
    chance: 0.7,
    mix: [
      [BlockId.TALL_GRASS, 38],
      [BlockId.DRY_GRASS, 12],
      [BlockId.FERN, 8],
      [BlockId.FLOWER_DANDELION, 10],
      [BlockId.FLOWER_TULIP, 8],
      [BlockId.FLOWER_VIOLA, 8],
      [BlockId.BIG_FLOWER, 5],
      [BlockId.FLOWER_WHITE_DANDELION, 6],
      [BlockId.MOON_FLOWER, 5],
    ],
  },
  thicket: {
    chance: 0.78,
    mix: [[BlockId.TALL_GRASS, 50], [BlockId.DRY_GRASS, 20], [BlockId.FERN, 14], [BlockId.CURLY_PLANT, 8], [BlockId.FIRE_FLOWER, 8]],
  },
  /** 月見草與白蒲公英，夜裡原野上最亮的一片 */
  moon: {
    chance: 0.74,
    mix: [[BlockId.TALL_GRASS, 34], [BlockId.WILD_GRASS, 20], [BlockId.MOON_FLOWER, 24], [BlockId.FLOWER_WHITE_DANDELION, 14], [BlockId.FERN, 8]],
  },
  /** 乾草為主，抽穗的高草梢混在裡面，零星的黃蒲公英與枯灌 */
  golden: {
    chance: 0.84,
    mix: [[BlockId.DRY_GRASS, 48], [BlockId.WHEAT_TALL, 14], [BlockId.TALL_GRASS, 18], [BlockId.FLOWER_DANDELION, 10], [BlockId.DRY_SHRUB, 10]],
  },
  /** 堇菜一片紫，夾著捲葉草與白蒲公英 */
  violet: {
    chance: 0.72,
    mix: [[BlockId.TALL_GRASS, 30], [BlockId.DRY_GRASS, 16], [BlockId.FLOWER_VIOLA, 32], [BlockId.CURLY_PLANT, 12], [BlockId.FLOWER_WHITE_DANDELION, 10]],
  },
  /** 濕的低地：蕨、捲葉草、深色的草，石縫與樹樁邊冒出菇 */
  fern: {
    chance: 0.82,
    mix: [[BlockId.FERN, 40], [BlockId.CURLY_PLANT, 18], [BlockId.JUNGLE_GRASS, 18], [BlockId.WILD_GRASS, 14], [BlockId.MUSHROOM, 5], [BlockId.BROWN_MUSHROOM, 5]],
  },
  /** 紅的橘的野花：火焰花、玫瑰、鬱金香 */
  ember: {
    chance: 0.74,
    mix: [[BlockId.TALL_GRASS, 30], [BlockId.DRY_GRASS, 18], [BlockId.FIRE_FLOWER, 26], [BlockId.FLOWER_ROSE, 14], [BlockId.FLOWER_TULIP, 12]],
  },
}

/** 交界那一段多寬（格）：兩區的中心距離差在這以內，兩邊的草混著長 */
const ZONE_BLEND_WIDTH = 8

/** 孤樹最多幾棵，以及兩棵之間至少隔幾格 */
const LONE_TREE_COUNT_MAX = 6
const LONE_TREE_SPACING = 30

/**
 * 這一格屬於哪一區
 *
 * 離哪個中心最近就是哪一區，距離先吃一層噪音，邊界才是彎的；
 * 靠近交界時照距離差的比例擲一次，有機會長隔壁那一區的草，交界是漸層而不是一條線
 */
function pickZone(x: number, z: number, random: () => number): MeadowZoneKind {
  const warpX = fbm2D(x * 0.04 + 61, z * 0.04 - 13, 2, 0.5) * 10
  const warpZ = fbm2D(x * 0.04 - 29, z * 0.04 + 47, 2, 0.5) * 10
  let first = { kind: MEADOW_ZONE_LIST[0]!.kind, distance: Number.POSITIVE_INFINITY }
  let second = first
  for (const zone of MEADOW_ZONE_LIST) {
    const distance = Math.hypot(x + warpX - zone.x, z + warpZ - zone.z)
    if (distance < first.distance) {
      second = first
      first = { kind: zone.kind, distance }
    }
    else if (distance < second.distance) {
      second = { kind: zone.kind, distance }
    }
  }
  const blend = Math.min(1, (second.distance - first.distance) / ZONE_BLEND_WIDTH)
  return random() < 0.5 * (1 - blend) ? second.kind : first.kind
}

/** 照那一區的權重挑一株 */
function pickZonePlant(kind: MeadowZoneKind, random: () => number): BlockId {
  const { mix } = ZONE_MIX_MAP[kind]
  const total = mix.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [blockId, weight] of mix) {
    roll -= weight
    if (roll < 0)
      return blockId
  }
  return mix[0]![0]
}

/** 地面，回傳每一格的地表高度（那一格最上面的實心方塊） */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  /** 先算整張高度圖，填成相鄰兩格最多差一格，人才走得上每一道坡 */
  const heightMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measureMeadowHeight(x, z)
    }
  }
  fillHeightStep(heightMap)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 外圍坡的後面：碰撞照算、不畫，由布景的地面平面代替 */
      if (measureMeadowRadius(x, z) >= MEADOW_OUTER_RADIUS) {
        for (let y = 1; y < MEADOW_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, MEADOW_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[x * WORLD_SIZE + z] = MEADOW_GROUND_Y
        continue
      }

      const topY = MEADOW_GROUND_Y + heightMap[x * WORLD_SIZE + z]!
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, BlockId.GRASS)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }

  return groundTopMap
}

function readGroundY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

/**
 * 乾土窪地
 *
 * 蟲聲叢那一小片乾土（吃噪音的圓）、仙人掌、三成的格子長枯灌，每一處都照這樣做。
 * 窪地在谷底、本來就平，沙直接換掉每一格最上面那層草，不另外拉平
 */
function buildHollowList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('meadow-realm-hollow')

  for (const hollow of MEADOW_HOLLOW_LIST) {
    const reach = Math.ceil(hollow.radius + 2)
    for (let x = hollow.x - reach; x <= hollow.x + reach; x++) {
      for (let z = hollow.z - reach; z <= hollow.z + reach; z++) {
        if (getNoisyDistance(x, z, hollow.x, hollow.z, 0.22, 1.1) <= hollow.radius)
          setBlock(state, x, readGroundY(groundTopMap, x, z) - 1, z, BlockId.SAND)
      }
    }

    /** 仙人掌：大的窪地四株，小的兩株，一到兩格高 */
    const cactusCount = hollow.radius >= 5 ? 4 : 2
    for (let index = 0; index < cactusCount; index++) {
      const angle = random() * Math.PI * 2
      const distance = random() * (hollow.radius - 1)
      const x = Math.round(hollow.x + Math.cos(angle) * distance)
      const z = Math.round(hollow.z + Math.sin(angle) * distance)
      const height = random() < 0.5 ? 2 : 1
      const groundY = readGroundY(groundTopMap, x, z)
      if (getBlock(state, x, groundY - 1, z) !== BlockId.SAND)
        continue
      for (let level = 0; level < height; level++) {
        setBlock(state, x, groundY + level, z, BlockId.CACTUS)
      }
    }

    for (let x = hollow.x - reach; x <= hollow.x + reach; x++) {
      for (let z = hollow.z - reach; z <= hollow.z + reach; z++) {
        if (random() < 0.3)
          plantOnGround(state, x, readGroundY(groundTopMap, x, z), z, BlockId.DRY_SHRUB, SAND_SET)
      }
    }
  }
}

/** 長凳擺在樹的哪一側，以及那一側要用哪一種階梯（靠背朝著樹） */
const BENCH_SIDE_LIST = [
  { x: 1, z: 0, blockId: BlockId.WOOD_STAIRS_WEST },
  { x: 0, z: 1, blockId: BlockId.WOOD_STAIRS_NORTH },
  { x: -1, z: 0, blockId: BlockId.WOOD_STAIRS_EAST },
  { x: 0, z: -1, blockId: BlockId.WOOD_STAIRS_SOUTH },
] as const

/**
 * 找丘頂
 *
 * 每六格取一點，比四周七格內都高（或一樣高）就算丘頂；
 * 由高到低挑，彼此隔三十格以上，太靠外圍或離回程門太近的不要。
 * 孤樹要站在丘頂：站在丘間的話，從別的丘上看過去只露出一截樹冠
 */
function findHilltopList(groundTopMap: Uint8Array): { x: number; z: number }[] {
  const candidateList: { x: number; z: number; topY: number }[] = []
  const searchRadius = 7

  for (let x = searchRadius; x < WORLD_SIZE - searchRadius; x += 6) {
    for (let z = searchRadius; z < WORLD_SIZE - searchRadius; z += 6) {
      if (Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z) > MEADOW_SLOW_RADIUS - 8)
        continue
      if (Math.hypot(x - MEADOW_PORTAL_POINT.x, z - MEADOW_PORTAL_POINT.z) < 14)
        continue

      const topY = groundTopMap[x * WORLD_SIZE + z]!
      if (topY < MEADOW_GROUND_Y + 3)
        continue

      let isPeak = true
      for (let offsetX = -searchRadius; offsetX <= searchRadius && isPeak; offsetX++) {
        for (let offsetZ = -searchRadius; offsetZ <= searchRadius; offsetZ++) {
          if (groundTopMap[(x + offsetX) * WORLD_SIZE + z + offsetZ]! > topY) {
            isPeak = false
            break
          }
        }
      }
      if (isPeak) {
        candidateList.push({ x, z, topY })
      }
    }
  }

  candidateList.sort((a, b) => b.topY - a.topY)
  const hilltopList: { x: number; z: number }[] = []
  for (const candidate of candidateList) {
    if (hilltopList.length >= LONE_TREE_COUNT_MAX)
      break
    if (hilltopList.every((hilltop) => Math.hypot(hilltop.x - candidate.x, hilltop.z - candidate.z) >= LONE_TREE_SPACING)) {
      hilltopList.push({ x: candidate.x, z: candidate.z })
    }
  }
  return hilltopList
}

/**
 * 丘頂的孤樹與樹下的長凳
 *
 * 草苑那棵橡樹六格高，長凳在樹幹旁三格、三格長、靠背朝著樹。
 * 這裡每一棵都照這個擺法，長凳挑一側三格都與樹腳同高的地方放；四側都不平就只種樹
 */
function placeLoneTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('meadow-lone-tree')

  for (const hilltop of findHilltopList(groundTopMap)) {
    const groundY = readGroundY(groundTopMap, hilltop.x, hilltop.z)
    placeOakTree(state, hilltop.x, groundY, hilltop.z, 5 + Math.floor(random() * 3))

    const startIndex = Math.floor(random() * BENCH_SIDE_LIST.length)
    for (let attempt = 0; attempt < BENCH_SIDE_LIST.length; attempt++) {
      const side = BENCH_SIDE_LIST[(startIndex + attempt) % BENCH_SIDE_LIST.length]!
      const cellList = [-1, 0, 1].map((along) => ({
        x: hilltop.x + side.x * 3 + (side.x === 0 ? along : 0),
        z: hilltop.z + side.z * 3 + (side.z === 0 ? along : 0),
      }))
      const isFlat = cellList.every((cell) => (
        readGroundY(groundTopMap, cell.x, cell.z) === groundY
        && getBlock(state, cell.x, groundY, cell.z) === BlockId.AIR
      ))
      if (!isFlat)
        continue
      for (const cell of cellList) {
        setBlock(state, cell.x, groundY, cell.z, side.blockId)
      }
      break
    }
  }
}

/** 這一格能不能放枯木樁或圓石：不在小徑上、不在門前、不在窪地裡、還在原野裡、地表是草 */
function isOpenMeadow(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number, pathDistanceMap: Float32Array): boolean {
  if (pathDistanceMap[x * WORLD_SIZE + z]! < 3)
    return false
  if (measureDistance(x, z, MEADOW_PORTAL_POINT) < 8)
    return false
  if (measureDistance(x, z, MEADOW_CENTER) > MEADOW_SLOW_RADIUS - 8)
    return false
  if (!MEADOW_HOLLOW_LIST.every((hollow) => measureDistance(x, z, hollow) > hollow.radius + 1.5))
    return false
  const groundY = readGroundY(groundTopMap, x, z)
  return getBlock(state, x, groundY - 1, z) === BlockId.GRASS && getBlock(state, x, groundY, z) === BlockId.AIR
}

/**
 * 埋了半截的枯木樁
 *
 * 蟲聲叢三根，一根一或兩格高，蟲從縫裡叫出來。這裡兩到四根一叢，散在原野裡，
 * 一叢的木樁彼此隔一兩格，像是一截倒下的老木頭爛剩的幾段
 */
function placeLogStumpList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('meadow-realm-log')

  for (let attempt = 0; attempt < 60; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 6 + random() * (MEADOW_SLOW_RADIUS - 16)
    const clusterX = Math.round(MEADOW_CENTER.x + Math.cos(angle) * radius)
    const clusterZ = Math.round(MEADOW_CENTER.z + Math.sin(angle) * radius)
    const stumpCount = 2 + Math.floor(random() * 3)

    for (let index = 0; index < stumpCount; index++) {
      const x = clusterX + Math.round((random() * 2 - 1) * 2.5)
      const z = clusterZ + Math.round((random() * 2 - 1) * 2.5)
      const isTall = random() < 0.6
      if (!isOpenMeadow(state, groundTopMap, x, z, pathDistanceMap))
        continue
      const groundY = readGroundY(groundTopMap, x, z)
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
function placeStoneHeapList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('meadow-realm-stone')

  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 8 + random() * (MEADOW_SLOW_RADIUS - 18)
    const x = Math.round(MEADOW_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(MEADOW_CENTER.z + Math.sin(angle) * radius)
    const height = random() < 0.35 ? 3 : 2
    const sideRoll = random()
    if (!isOpenMeadow(state, groundTopMap, x, z, pathDistanceMap))
      continue

    /** 立石的底座是十字五格，五格要在同一個高度，不然底座會懸空或插進坡裡 */
    const groundY = readGroundY(groundTopMap, x, z)
    const isFlat = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([offsetX, offsetZ]) =>
      readGroundY(groundTopMap, x + offsetX!, z + offsetZ!) === groundY
      && getBlock(state, x + offsetX!, groundY, z + offsetZ!) === BlockId.AIR)
    if (!isFlat)
      continue

    placeStandingStone(state, x, groundY, z, height, BlockId.COBBLESTONE)
    const sideX = sideRoll < 0.5 ? x + 2 : x
    const sideZ = sideRoll < 0.5 ? z : z + 2
    if (readGroundY(groundTopMap, sideX, sideZ) === groundY)
      setDecoration(state, sideX, groundY, sideZ, BlockId.COBBLESTONE)
  }
}

/**
 * 滿地的草與花
 *
 * 每一格草地照所在的那一區撒（見 ZONE_MIX_MAP），花色一區一區不同；
 * 小徑上只零星幾叢乾草，看得出是一條被踩過的路
 */
function scatterPlantList(state: Uint8Array, groundTopMap: Uint8Array, pathDistanceMap: Float32Array): void {
  const random = createSeededRandom('meadow-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureMeadowRadius(x, z) >= MEADOW_OUTER_RADIUS)
        continue

      const groundY = readGroundY(groundTopMap, x, z)
      if (pathDistanceMap[x * WORLD_SIZE + z]! < 1.1) {
        if (random() < 0.08)
          plantOnGround(state, x, groundY, z, BlockId.DRY_GRASS, GRASS_SET)
        continue
      }

      const kind = pickZone(x, z, random)
      const isSlope = measureDistance(x, z, MEADOW_CENTER) > MEADOW_SLOW_RADIUS
      if (random() > (isSlope ? SLOPE_PLANT_CHANCE : ZONE_MIX_MAP[kind].chance))
        continue
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      plantWithStack(state, x, groundY, z, pickZonePlant(kind, random), random)
    }
  }
}

/** 生成整片風露原 */
export function generateMeadowWorld(state: Uint8Array): void {
  const pathDistanceMap = createPathDistanceMap([samplePathCurve(MEADOW_PATH_CONTROL_POINT_LIST)], 9)
  const groundTopMap = shapeTerrain(state)
  buildHollowList(state, groundTopMap)
  placeLoneTreeList(state, groundTopMap)
  placeLogStumpList(state, groundTopMap, pathDistanceMap)
  placeStoneHeapList(state, groundTopMap, pathDistanceMap)
  scatterPlantList(state, groundTopMap, pathDistanceMap)
  /** 細節小景排在花草之後：石牆、石環、草蓆都把原本那一格的草換掉 */
  decorateMeadow(state, groundTopMap, pathDistanceMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of MEADOW_REALM.portalList) {
    placePortalStructure(state, portal)
  }

  /** 回程門往東、落腳那幾格也清掉，一落地就看得到小徑從腳下鑽進草裡 */
  for (let offsetX = -2; offsetX <= 4; offsetX++) {
    const x = MEADOW_PORTAL_POINT.x + offsetX
    const z = MEADOW_PORTAL_POINT.z
    const y = readGroundY(groundTopMap, x, z)
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && isPassableBlock(blockId))
      setBlock(state, x, y, z, BlockId.AIR)
  }
}
