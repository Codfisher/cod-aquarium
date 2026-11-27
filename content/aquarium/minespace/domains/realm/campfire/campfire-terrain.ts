import type { CampSite } from './campfire-layout'
import { createSeededRandom, fbm2D, smoothStep } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { fillBox, getNoisyDistance, placeOakTree, plantWithStack } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import {
  BONFIRE_EMBER_OFFSET_LIST,
  BONFIRE_RING_RADIUS,
  CAMP_CENTER,
  CAMP_FOREST_EDGE_RADIUS,
  CAMP_GROUND_Y,
  CAMP_PORTAL_POINT,
  CAMP_RIDGE_HEIGHT,
  CAMP_RIDGE_RADIUS,
  CAMP_SITE_LIST,
} from './campfire-layout'
import { CAMPFIRE_REALM } from './campfire-realm'

/**
 * 營火谷的地形
 *
 * 只有地形 worker 用。整片照爐火壇（buildCampfireGarden）放大：草地、火塘四周踩禿的土、
 * 半磚石圈、沉進地面的餘燼、木階梯矮凳、籬笆柱撐的木板棚、柴堆木箱木桶與乾草、橡樹，
 * 草地上一半蕨一半高草，同一個密度。那一座只有一堆火，這裡一座大篝火加六處小營地，
 * 谷地外圍一圈橡樹林沿著谷坡長上去。
 *
 * 火只用餘燼，每一格都會變成一盞真光：大篝火五格、小營地各一格，再加回程門的燈，
 * 整座谷十幾盞，比禪庭（七十多盞）少得多。
 *
 * 順序：地面與土路 → 營火與棚子 → 樹 → 花草 → 傳送門（門洞與木牌前的花草由它清掉）
 */

/** 小營地的石圈半徑與幾顆石頭，照爐火壇 */
const CAMP_RING_RADIUS = 2
const CAMP_RING_STONE_COUNT = 12

/** 矮凳離火塘幾格，照爐火壇 */
const CAMP_STOOL_DISTANCE = 4

/** 種樹的格子：每四格見方抽一次籤 */
const TREE_CELL_SIZE = 4

/**
 * 林子裡每一格種樹的機率上限
 *
 * 樹葉是全場最貴的方塊（鏤空、整顆畫、進兩層陰影與深度圖），林海三萬多格葉子掉兩成 FPS。
 * 這裡只要林緣那一圈看得出是一片橡樹林，坡上的樹再疏一點，谷坡本身就擋住視線
 */
const FOREST_TREE_CHANCE = 0.42

/** 爐火壇的蕨與高草撒在兩成四的草地上 */
const PLANT_CHANCE = 0.24

/** 四個方向的單位向量：北是 -Z */
const SIDE_VECTOR_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

/** 矮凳在火的哪一側，就用靠背朝那一側的木階梯（爐火壇：北邊那張是 WOOD_STAIRS_NORTH） */
const STOOL_BLOCK_MAP = {
  north: BlockId.WOOD_STAIRS_NORTH,
  south: BlockId.WOOD_STAIRS_SOUTH,
  east: BlockId.WOOD_STAIRS_EAST,
  west: BlockId.WOOD_STAIRS_WEST,
} as const

type CampSide = keyof typeof SIDE_VECTOR_MAP

function measureDistance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z)
}

/**
 * 這一格離谷心多遠（吃一層低頻噪音）
 *
 * 谷地的邊不能是一個圓：林緣有的地方往裡凹、有的往外凸，從谷底看過去才像一片自然的林子
 */
function measureValleyRadius(x: number, z: number): number {
  return measureDistance(x, z, CAMP_CENTER) + fbm2D(x * 0.035 + 41, z * 0.035 - 17, 2, 0.5) * 5
}

/**
 * 谷坡想要多高
 *
 * 林緣以內是平的谷底；過了林緣照平滑曲線往上抬，到稜線剛好高出 CAMP_RIDGE_HEIGHT 格，
 * 再疊一層小噪音讓坡面有起伏。算出來的高度還要鬆弛一次（relaxHeightMap），保證一格一格走得上去
 */
function measureSlopeHeight(x: number, z: number, radius: number): number {
  if (radius <= CAMP_FOREST_EDGE_RADIUS)
    return 0
  const ratio = (radius - CAMP_FOREST_EDGE_RADIUS) / (CAMP_RIDGE_RADIUS - CAMP_FOREST_EDGE_RADIUS)
  const bump = fbm2D(x * 0.09 - 5, z * 0.09 + 23, 2, 0.5) * 1.4
  return Math.max(0, Math.min(CAMP_RIDGE_HEIGHT, Math.round(smoothStep(ratio) * CAMP_RIDGE_HEIGHT + bump)))
}

/**
 * 鬆弛：任何一格都不比四鄰的最低那格高出一格以上
 *
 * 噪音相鄰兩格可以差很多，堆出來就是一排斷崖；壓到一格以內，整片谷坡一路走得上去，
 * 邊界靠的是越走越慢與推回，不是一面爬不上去的牆。照地獄谷谷壁的那一套
 */
function relaxHeightMap(heightMap: Int8Array): void {
  for (let pass = 0; pass < CAMP_RIDGE_HEIGHT + 2; pass++) {
    for (let x = 1; x < WORLD_SIZE - 1; x++) {
      for (let z = 1; z < WORLD_SIZE - 1; z++) {
        const index = x * WORLD_SIZE + z
        const lowest = Math.min(
          heightMap[index + WORLD_SIZE]!,
          heightMap[index - WORLD_SIZE]!,
          heightMap[index + 1]!,
          heightMap[index - 1]!,
        )
        heightMap[index] = Math.min(heightMap[index]!, lowest + 1)
      }
    }
  }
}

/** 這一格是不是要踩禿的土：大篝火四周、小營地四周、回程門到大篝火那條土路 */
function isWornGround(x: number, z: number): boolean {
  if (getNoisyDistance(x, z, CAMP_CENTER.x, CAMP_CENTER.z, 0.22, 1.6) < 7.5)
    return true
  if (CAMP_SITE_LIST.some((site) => getNoisyDistance(x, z, site.x, site.z, 0.22, 1.3) < 4.5))
    return true

  /** 土路：門前到大篝火，一格半寬，吃一點噪音左右擺 */
  if (x > CAMP_CENTER.x + 5 && x < CAMP_PORTAL_POINT.x + 2) {
    const sway = fbm2D(x * 0.11, 7.3, 2, 0.5) * 1.2
    return Math.abs(z - CAMP_CENTER.z - sway) < 1.3
  }
  return false
}

/** 這一格附近要不要留空：火塘、營地、土路、回程門前都不長樹 */
function isOpenGround(x: number, z: number): boolean {
  if (measureDistance(x, z, CAMP_CENTER) < 12)
    return true
  if (CAMP_SITE_LIST.some((site) => measureDistance(x, z, site) < 8))
    return true
  if (measureDistance(x, z, CAMP_PORTAL_POINT) < 7)
    return true
  return x > CAMP_CENTER.x && x < CAMP_PORTAL_POINT.x + 4 && Math.abs(z - CAMP_CENTER.z) < 4
}

/** 地面：谷底、谷坡、稜線外不畫的 LAKE_BED，回傳每一格的草地頂面高度 */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const heightMap = new Int8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureValleyRadius(x, z)
      heightMap[x * WORLD_SIZE + z] = radius > CAMP_RIDGE_RADIUS
        ? CAMP_RIDGE_HEIGHT
        : measureSlopeHeight(x, z, radius)
    }
  }
  relaxHeightMap(heightMap)

  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      const topY = CAMP_GROUND_Y + heightMap[index]!
      groundTopMap[index] = topY

      /**
       * 稜線外面：碰撞照算、不畫，由布景那片鋪到地平線的草地平面代替
       *
       * 稜線以外與稜線同高，推回線離這裡還有十格，人走不到，從谷底也看不過去
       */
      if (measureValleyRadius(x, z) > CAMP_RIDGE_RADIUS + 2) {
        for (let y = 1; y < topY; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, topY, z, BlockId.LAKE_BED)
        continue
      }

      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, isWornGround(x, z) ? BlockId.DIRT : BlockId.GRASS)
    }
  }

  return groundTopMap
}

/** 沿著某一側走 along 格、往橫走 across 格 */
function toSidePoint(x: number, z: number, side: CampSide, along: number, across = 0): { x: number; z: number } {
  const forward = SIDE_VECTOR_MAP[side]
  return {
    x: x + forward.x * along - forward.z * across,
    z: z + forward.z * along + forward.x * across,
  }
}

/** 一圈半磚石頭，照爐火壇：整格的石頭圍成一圈會成一道牆，半磚只到腳踝 */
function placeStoneRing(state: Uint8Array, x: number, z: number, radius: number, stoneCount: number): void {
  for (let step = 0; step < stoneCount; step++) {
    const angle = (step / stoneCount) * Math.PI * 2
    setBlock(
      state,
      x + Math.round(Math.cos(angle) * radius),
      CAMP_GROUND_Y + 1,
      z + Math.round(Math.sin(angle) * radius),
      BlockId.STONE_SLAB,
    )
  }
}

/**
 * 一頂木棚，照爐火壇
 *
 * 四根三格高的籬笆柱撐一片木板頂，底下堆柴、木箱與木桶。
 * 棚子離火塘五格：棚頂比火低，壓到火的那一格柱會把火焰削掉一半，渲染端找火塘高度也會找到棚頂上去
 */
function placeShelter(state: Uint8Array, fireX: number, fireZ: number, side: CampSide): void {
  const footY = CAMP_GROUND_Y + 1
  /** 棚子的四角：沿著那一側從四格到七格、左右各兩格 */
  for (const along of [4, 7]) {
    for (const across of [-2, 2]) {
      const corner = toSidePoint(fireX, fireZ, side, along, across)
      for (let level = 0; level < 3; level++) {
        setBlock(state, corner.x, footY + level, corner.z, BlockId.FENCE)
      }
    }
  }
  for (let along = 4; along <= 7; along++) {
    for (let across = -2; across <= 2; across++) {
      const cell = toSidePoint(fireX, fireZ, side, along, across)
      setBlock(state, cell.x, footY + 3, cell.z, BlockId.WOOD_SLAB)
    }
  }

  /** 柴堆與雜物，照爐火壇棚子底下那幾樣 */
  const crate = toSidePoint(fireX, fireZ, side, 6, 0)
  const barrel = toSidePoint(fireX, fireZ, side, 6, 1)
  const log = toSidePoint(fireX, fireZ, side, 5, -1)
  setBlock(state, crate.x, footY, crate.z, BlockId.CRATE)
  setBlock(state, barrel.x, footY, barrel.z, BlockId.BARREL)
  setBlock(state, log.x, footY, log.z, BlockId.OAK_LOG)
  setBlock(state, log.x, footY + 1, log.z, BlockId.OAK_LOG)
}

/**
 * 一處小營地：一座爐火壇
 *
 * 火塘沉進地面（與草地齊平），一圈半磚石頭，四面各一張矮凳，靠背朝外、人面向火；
 * 搭了棚子的那一側不放矮凳，另在斜角擺一捆乾草
 */
function placeCampSite(state: Uint8Array, site: CampSite, random: () => number): void {
  const footY = CAMP_GROUND_Y + 1
  placeStoneRing(state, site.x, site.z, CAMP_RING_RADIUS, CAMP_RING_STONE_COUNT)
  setBlock(state, site.x, CAMP_GROUND_Y, site.z, BlockId.EMBER)

  for (const side of Object.keys(SIDE_VECTOR_MAP) as CampSide[]) {
    if (side === site.shelterSide)
      continue
    const stool = toSidePoint(site.x, site.z, side, CAMP_STOOL_DISTANCE)
    setBlock(state, stool.x, footY, stool.z, STOOL_BLOCK_MAP[side])
  }

  if (site.shelterSide) {
    placeShelter(state, site.x, site.z, site.shelterSide)
    const hay = toSidePoint(site.x, site.z, site.shelterSide, -4, random() < 0.5 ? 5 : -5)
    setBlock(state, hay.x, footY, hay.z, BlockId.HAY)
  }
}

/**
 * 正中的大篝火
 *
 * 火塘是五格的十字（每一格上渲染端各立一組火焰，疊起來比人高），石圈放到三格半；
 * 外面一圈是坐人的地方：西、南、北三面各橫一根三格長的原木，斜角四張矮凳。
 * 東面空著，是從回程門走過來的那條土路。
 * 北邊靠著一堆劈好的柴與兩個木箱，照爐火壇棚子底下的那幾樣，只是攤在火邊
 */
function placeBonfire(state: Uint8Array): void {
  const { x, z } = CAMP_CENTER
  const footY = CAMP_GROUND_Y + 1

  for (const offset of BONFIRE_EMBER_OFFSET_LIST) {
    setBlock(state, x + offset.x, CAMP_GROUND_Y, z + offset.z, BlockId.EMBER)
  }
  placeStoneRing(state, x, z, BONFIRE_RING_RADIUS, 20)

  /** 三根原木：橫的那一軸與火塘相切 */
  const SEAT_DISTANCE = 7
  for (let offset = -1; offset <= 1; offset++) {
    setBlock(state, x - SEAT_DISTANCE, footY, z + offset, BlockId.OAK_LOG_Z)
    setBlock(state, x + offset, footY, z + SEAT_DISTANCE, BlockId.OAK_LOG_X)
    setBlock(state, x + offset, footY, z - SEAT_DISTANCE, BlockId.OAK_LOG_X)
  }

  /** 斜角四張矮凳，靠背朝外 */
  setBlock(state, x - 5, footY, z - 5, BlockId.WOOD_STAIRS_NORTH)
  setBlock(state, x - 5, footY, z + 5, BlockId.WOOD_STAIRS_SOUTH)
  setBlock(state, x + 5, footY, z + 5, BlockId.WOOD_STAIRS_SOUTH)
  setBlock(state, x + 5, footY, z - 5, BlockId.WOOD_STAIRS_NORTH)

  /** 火邊的柴堆：直立兩疊原木、兩個木箱、一個木桶，一捆乾草 */
  setBlock(state, x - 3, footY, z - 9, BlockId.OAK_LOG)
  setBlock(state, x - 3, footY + 1, z - 9, BlockId.OAK_LOG)
  setBlock(state, x - 2, footY, z - 9, BlockId.OAK_LOG)
  setBlock(state, x - 1, footY, z - 10, BlockId.CRATE)
  setBlock(state, x, footY, z - 10, BlockId.CRATE)
  setBlock(state, x, footY + 1, z - 10, BlockId.BARREL)
  setBlock(state, x + 3, footY, z - 9, BlockId.HAY)
}

/**
 * 種樹
 *
 * 全是橡樹，照爐火壇那一棵。谷底只零星幾棵（站在營地邊遮一點天），
 * 過了林緣越來越密，沿著谷坡一路長上去；營地、土路與回程門前留空
 */
function placeTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('campfire-tree')

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += TREE_CELL_SIZE) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += TREE_CELL_SIZE) {
      const x = cellX + Math.floor(random() * TREE_CELL_SIZE)
      const z = cellZ + Math.floor(random() * TREE_CELL_SIZE)
      const roll = random()
      const heightRoll = random()
      if (x >= WORLD_SIZE || z >= WORLD_SIZE)
        continue

      const radius = measureValleyRadius(x, z)
      if (radius > CAMP_RIDGE_RADIUS || isOpenGround(x, z))
        continue

      /** 谷底一成左右，林緣往外四格內爬到上限，噪音讓林子有疏有密 */
      const edge = smoothStep((radius - (CAMP_FOREST_EDGE_RADIUS - 6)) / 10)
      const density = 0.75 + fbm2D(x * 0.05 + 3, z * 0.05 - 11, 2, 0.5) * 0.35
      const chance = (0.05 + (FOREST_TREE_CHANCE - 0.05) * edge) * density
      if (roll > chance)
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      placeOakTree(state, x, groundY, z, 4 + Math.floor(heightRoll * 3))
    }
  }
}

/** 樹冠的方塊，掏空樹冠時用來判斷一格是不是被包在裡面 */
const CROWN_BLOCK_SET = new Set([BlockId.OAK_LEAVES, BlockId.OAK_LOG])

/**
 * 掏空樹冠
 *
 * 六面都貼著樹葉或樹幹的那幾格從外面幾乎看不到，拿掉之後樹冠外觀不變、葉子少一截。
 * 先整片判斷完再一起拿，免得拿掉一格之後旁邊那格的判斷跟著變（同林海）
 */
function hollowCrownList(state: Uint8Array): void {
  const enclosedList: { x: number; y: number; z: number }[] = []
  const isCrown = (x: number, y: number, z: number) => CROWN_BLOCK_SET.has(getBlock(state, x, y, z))

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      for (let y = CAMP_GROUND_Y + 2; y < CAMP_GROUND_Y + CAMP_RIDGE_HEIGHT + 12; y++) {
        if (getBlock(state, x, y, z) !== BlockId.OAK_LEAVES)
          continue
        if (
          isCrown(x + 1, y, z) && isCrown(x - 1, y, z)
          && isCrown(x, y + 1, z) && isCrown(x, y - 1, z)
          && isCrown(x, y, z + 1) && isCrown(x, y, z - 1)
        ) {
          enclosedList.push({ x, y, z })
        }
      }
    }
  }

  for (const { x, y, z } of enclosedList) {
    setBlock(state, x, y, z, BlockId.AIR)
  }
}

/**
 * 草地上的蕨與高草，照爐火壇：兩成四的草地、一半一半
 *
 * 只撒在草上，踩禿的土上不長
 */
function scatterPlantList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('campfire-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > PLANT_CHANCE)
        continue
      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      plantWithStack(state, x, groundY, z, random() < 0.5 ? BlockId.FERN : BlockId.TALL_GRASS, random)
    }
  }
}

/** 生成整座營火谷 */
export function generateCampfireWorld(state: Uint8Array): void {
  const groundTopMap = shapeTerrain(state)
  placeBonfire(state)
  const random = createSeededRandom('campfire-site')
  for (const site of CAMP_SITE_LIST) {
    placeCampSite(state, site, random)
  }
  placeTreeList(state, groundTopMap)
  hollowCrownList(state)
  scatterPlantList(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of CAMPFIRE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
