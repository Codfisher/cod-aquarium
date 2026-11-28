import type { PlanePoint } from '../land-realm-kit'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { getNoisyDistance, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import {
  BLIZZARD_CENTER,
  BLIZZARD_GROUND_Y,
  BLIZZARD_PORTAL_POINT,
  BURIED_FENCE_POINT_LIST,
  BURIED_SLED_POINT,
  CAIRN_TRAIL_POINT_LIST,
  DRIFT_WALL_START_RADIUS,
  FROZEN_POND,
  PORTAL_FLAT_RADIUS,
  SHELTER_HUT_POINT,
} from './blizzard-layout'

/**
 * 白矇雪原的細節小景
 *
 * 只有地形 worker 用，排在枯枝之後、蓋雪之前（新東西頂上照樣會積一層薄雪）。
 * 雪原原本只有雪丘、燈籠、木樁、矮松與幾塊石，白裡走久了沒有可以朝著走的東西。
 * 這一輪補的是雪地裡有人來過的痕跡：一道只剩幾段露出雪面的舊柵欄、被留在雪裡的雪橇、
 * 從雪原正中往東南排過去的疊石路標，路標盡頭一間亮著一盞燈的避難小屋；
 * 西北一片被風掃乾淨的冰面與伸到冰上的木棧，另外幾處零星的冰殼。
 *
 * 光源只多小屋裡那一盞：白矇裡多一個暖色的點，就多一個方向
 */

/** 雪面上可以清掉再擺東西的：薄雪與枯枝 */
const CLEARABLE_SET = new Set<BlockId>([BlockId.AIR, BlockId.SNOW_LAYER, BlockId.DRY_SHRUB])

/** 冰殼有幾處，每處的半徑範圍（格） */
const ICE_CRUST_COUNT = 5
const ICE_CRUST_RADIUS_RANGE: [number, number] = [1.6, 3]

interface SnowSite extends PlanePoint {
  /** 站在那裡的腳底高度（最上面那格實心方塊的上一格） */
  footY: number;
}

/** 這一格能不能擺東西：整格的頂面（不是半磚的雪丘），上面只有薄雪或枯枝 */
function isOpenTop(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, x: number, z: number): boolean {
  const index = x * WORLD_SIZE + z
  return !slabMap[index] && CLEARABLE_SET.has(getBlock(state, x, topMap[index]! + 1, z))
}

/** 清掉雪面上的薄雪與枯枝再擺一格東西，回傳腳底高度；擺不了回傳 null */
function putOnSnow(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, x: number, z: number, blockId: BlockId): number | null {
  if (!isOpenTop(state, topMap, slabMap, x, z))
    return null
  const footY = topMap[x * WORLD_SIZE + z]! + 1
  setBlock(state, x, footY, z, blockId)
  return footY
}

/**
 * 在目標點附近找一塊同一層、沒有東西的雪面
 *
 * 雪丘是半格一階堆起來的，寫死的座標不一定落在平的地方；一圈一圈往外找第一塊整片同高的
 */
function findSnowSite(
  state: Uint8Array,
  topMap: Uint8Array,
  slabMap: Uint8Array,
  target: PlanePoint,
  halfX: number,
  halfZ: number,
  searchRadius: number,
): SnowSite | null {
  for (let ring = 0; ring <= searchRadius; ring++) {
    for (let offsetX = -ring; offsetX <= ring; offsetX++) {
      for (let offsetZ = -ring; offsetZ <= ring; offsetZ++) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== ring)
          continue
        const x = target.x + offsetX
        const z = target.z + offsetZ
        const topY = topMap[x * WORLD_SIZE + z]!
        let isLevel = true
        for (let cellX = x - halfX; cellX <= x + halfX && isLevel; cellX++) {
          for (let cellZ = z - halfZ; cellZ <= z + halfZ; cellZ++) {
            if (topMap[cellX * WORLD_SIZE + cellZ] !== topY || !isOpenTop(state, topMap, slabMap, cellX, cellZ)) {
              isLevel = false
              break
            }
          }
        }
        if (isLevel)
          return { x, z, footY: topY + 1 }
      }
    }
  }
  return null
}

/** 清掉一塊範圍雪面上的薄雪與枯枝 */
function clearSnowArea(state: Uint8Array, minX: number, minZ: number, maxX: number, maxZ: number, footY: number): void {
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      if (getBlock(state, x, footY, z) !== BlockId.AIR && CLEARABLE_SET.has(getBlock(state, x, footY, z)))
        setBlock(state, x, footY, z, BlockId.AIR)
    }
  }
}

/**
 * 避難小屋
 *
 * 五格寬、三格深：南面與東西兩面是深色木板牆，北面敞開對著雪原正中；平頂往外出一格簷，蓋雪那一輪會替它積一層雪。
 * 屋裡一個木箱上放著一盞提燈、一捲鋪蓋、一個桶；簷下掛著冰柱，屋外牆邊堆著兩截柴
 */
function placeShelterHut(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const site = findSnowSite(state, topMap, slabMap, SHELTER_HUT_POINT, 3, 3, 6)
  if (!site)
    return
  const { x, z, footY } = site
  clearSnowArea(state, x - 3, z - 3, x + 3, z + 3, footY)

  for (let level = 0; level < 3; level++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      setBlock(state, x + offsetX, footY + level, z + 2, BlockId.DARK_PLANKS)
    }
    for (const offsetX of [-2, 2]) {
      setBlock(state, x + offsetX, footY + level, z + 1, BlockId.DARK_PLANKS)
      setBlock(state, x + offsetX, footY + level, z, BlockId.DARK_PLANKS)
    }
  }
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 3; offsetZ++) {
      setBlock(state, x + offsetX, footY + 3, z + offsetZ, BlockId.DARK_PLANKS)
    }
  }
  /** 屋裡的地板換成木板，雪只積到門口 */
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = 0; offsetZ <= 1; offsetZ++) {
      setBlock(state, x + offsetX, footY - 1, z + offsetZ, BlockId.PLANKS)
    }
  }
  setBlock(state, x + 1, footY, z + 1, BlockId.CRATE)
  setBlock(state, x + 1, footY + 1, z + 1, BlockId.LANTERN)
  setBlock(state, x - 1, footY, z + 1, BlockId.CUSHION)
  setBlock(state, x, footY, z + 1, BlockId.CUSHION)
  setBlock(state, x - 1, footY, z, BlockId.BARREL)

  /** 北面簷下的冰柱與東牆外的柴 */
  for (const offsetX of [-3, -1, 2]) {
    setDecoration(state, x + offsetX, footY + 2, z - 1, BlockId.ICICLE)
  }
  setDecoration(state, x + 3, footY, z + 1, BlockId.OAK_LOG_Z)
  setDecoration(state, x + 3, footY, z + 2, BlockId.OAK_LOG_Z)
  setDecoration(state, x + 3, footY + 1, z + 2, BlockId.OAK_LOG_Z)
}

/**
 * 疊石路標
 *
 * 從雪原正中往東南一路排到小屋：每一堆是一兩格圓石頂一片半磚，風雪裡只看得到下一堆
 */
function placeCairnTrail(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, random: () => number): void {
  for (const point of CAIRN_TRAIL_POINT_LIST) {
    const height = random() < 0.5 ? 1 : 2
    const site = findSnowSite(state, topMap, slabMap, { x: BLIZZARD_CENTER.x + point.x, z: BLIZZARD_CENTER.z + point.z }, 0, 0, 2)
    if (!site)
      continue
    for (let level = 0; level < height; level++) {
      setBlock(state, site.x, site.footY + level, site.z, BlockId.COBBLESTONE)
    }
    setBlock(state, site.x, site.footY + height, site.z, BlockId.STONE_SLAB)
  }
}

/**
 * 半埋的雪橇
 *
 * 三格長的橇板，後頭還綁著一個木箱，前頭一根拉桿斜插在雪裡；迎風那一側的雪已經堆到橇板一樣高
 */
function placeBuriedSled(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const site = findSnowSite(state, topMap, slabMap, BURIED_SLED_POINT, 2, 1, 4)
  if (!site)
    return
  const { x, z, footY } = site
  clearSnowArea(state, x - 2, z - 1, x + 2, z + 1, footY)
  setBlock(state, x - 1, footY, z, BlockId.CRATE)
  setBlock(state, x, footY, z, BlockId.DARK_WOOD_SLAB)
  setBlock(state, x + 1, footY, z, BlockId.DARK_WOOD_SLAB)
  setBlock(state, x + 2, footY, z, BlockId.FENCE)
  for (let offsetX = -2; offsetX <= 0; offsetX++) {
    setBlock(state, x + offsetX, footY, z + 1, BlockId.SNOW_SLAB)
  }
  setBlock(state, x - 2, footY, z, BlockId.SNOW_SLAB)
}

/**
 * 雪埋的柵欄
 *
 * 沿著骨架一格一根：站在平地上的才露出雪面，雪丘蓋過去的那幾段就埋在底下（不放），
 * 露出來的再缺兩成。遠看是雪面上一截一截的短線
 */
function placeBuriedFence(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, random: () => number): void {
  for (let index = 0; index < BURIED_FENCE_POINT_LIST.length - 1; index++) {
    const from = BURIED_FENCE_POINT_LIST[index]!
    const to = BURIED_FENCE_POINT_LIST[index + 1]!
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    for (let step = 0; step < length; step++) {
      const roll = random()
      const x = Math.round(from.x + ((to.x - from.x) * step) / length)
      const z = Math.round(from.z + ((to.z - from.z) * step) / length)
      if (roll < 0.2 || topMap[x * WORLD_SIZE + z] !== BLIZZARD_GROUND_Y)
        continue
      putOnSnow(state, topMap, slabMap, x, z, BlockId.FENCE)
    }
  }
}

/**
 * 把一塊雪面換成冰
 *
 * 只換平地那一層的雪（雪丘底下不換），上面的薄雪與枯枝一起清掉；
 * 冰面上再留一成被風吹成條的薄雪，才不是一整片光滑的藍
 */
function freezePatch(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, center: PlanePoint, radius: number, random: () => number): void {
  const reach = Math.ceil(radius + 2)
  for (let x = center.x - reach; x <= center.x + reach; x++) {
    for (let z = center.z - reach; z <= center.z + reach; z++) {
      const roll = random()
      const index = x * WORLD_SIZE + z
      if (getNoisyDistance(x, z, center.x, center.z, 0.3, 1.1) > radius)
        continue
      if (topMap[index] !== BLIZZARD_GROUND_Y || slabMap[index] || getBlock(state, x, BLIZZARD_GROUND_Y, z) !== BlockId.SNOW)
        continue
      if (!CLEARABLE_SET.has(getBlock(state, x, BLIZZARD_GROUND_Y + 1, z)))
        continue
      const isVein = fbm2D(x * 0.45 + 13, z * 0.45 - 5, 2, 0.5) > 0.3
      setBlock(state, x, BLIZZARD_GROUND_Y, z, isVein ? BlockId.PACKED_ICE : BlockId.ICE)
      setBlock(state, x, BLIZZARD_GROUND_Y + 1, z, roll < 0.1 ? BlockId.SNOW_LAYER : BlockId.AIR)
    }
  }
}

/**
 * 結冰的池
 *
 * 一片半徑六格的冰面；東岸一道三格長的木棧伸到冰上，棧頭一根樁、一張矮凳與一只竹簍，
 * 岸邊幾叢凍枯的蘆稈
 */
function placeFrozenPond(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, random: () => number): void {
  freezePatch(state, topMap, slabMap, FROZEN_POND, FROZEN_POND.radius, random)

  const jettyZ = FROZEN_POND.z
  const jettyFromX = FROZEN_POND.x + FROZEN_POND.radius - 3
  for (let offsetX = 0; offsetX <= 3; offsetX++) {
    const x = jettyFromX + offsetX
    if (topMap[x * WORLD_SIZE + jettyZ] === BLIZZARD_GROUND_Y && CLEARABLE_SET.has(getBlock(state, x, BLIZZARD_GROUND_Y + 1, jettyZ)) && !slabMap[x * WORLD_SIZE + jettyZ])
      setBlock(state, x, BLIZZARD_GROUND_Y + 1, jettyZ, BlockId.WOOD_SLAB)
  }
  putOnSnow(state, topMap, slabMap, jettyFromX, jettyZ - 1, BlockId.WOOD_POST)
  putOnSnow(state, topMap, slabMap, jettyFromX - 1, jettyZ + 1, BlockId.WOOD_STAIRS_EAST)
  putOnSnow(state, topMap, slabMap, jettyFromX - 1, jettyZ - 1, BlockId.BASKET)
  for (const [offsetX, offsetZ] of [[-5, 3], [-4, -4], [2, 5], [4, -4]] as const) {
    const x = FROZEN_POND.x + offsetX
    const z = FROZEN_POND.z + offsetZ
    if (getBlock(state, x, BLIZZARD_GROUND_Y, z) === BlockId.SNOW)
      putOnSnow(state, topMap, slabMap, x, z, BlockId.CATTAIL)
  }
}

/** 零星的冰殼：風把雪掃走、露出底下凍硬的那幾塊，離門與雪原正中遠一點 */
function scatterIceCrust(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array, random: () => number): void {
  const [radiusMin, radiusMax] = ICE_CRUST_RADIUS_RANGE
  let placedCount = 0
  for (let attempt = 0; attempt < 60 && placedCount < ICE_CRUST_COUNT; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = 12 + random() * (DRIFT_WALL_START_RADIUS - 18)
    const center = {
      x: Math.round(BLIZZARD_CENTER.x + Math.cos(angle) * distance),
      z: Math.round(BLIZZARD_CENTER.z + Math.sin(angle) * distance),
    }
    const radius = radiusMin + random() * (radiusMax - radiusMin)
    if (Math.hypot(center.x - BLIZZARD_PORTAL_POINT.x, center.z - BLIZZARD_PORTAL_POINT.z) < PORTAL_FLAT_RADIUS + 4)
      continue
    if (Math.hypot(center.x - FROZEN_POND.x, center.z - FROZEN_POND.z) < FROZEN_POND.radius + 6)
      continue
    if (topMap[center.x * WORLD_SIZE + center.z] !== BLIZZARD_GROUND_Y)
      continue
    freezePatch(state, topMap, slabMap, center, radius, random)
    placedCount++
  }
}

/** 補上白矇雪原的細節小景（蓋雪之前呼叫） */
export function decorateBlizzard(state: Uint8Array, topMap: Uint8Array, slabMap: Uint8Array): void {
  const random = createSeededRandom('blizzard-detail')

  placeShelterHut(state, topMap, slabMap)
  placeCairnTrail(state, topMap, slabMap, random)
  placeBuriedSled(state, topMap, slabMap)
  placeBuriedFence(state, topMap, slabMap, random)
  placeFrozenPond(state, topMap, slabMap, random)
  scatterIceCrust(state, topMap, slabMap, random)
}
