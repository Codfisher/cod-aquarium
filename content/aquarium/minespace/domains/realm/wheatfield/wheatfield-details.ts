import type { PlanePoint } from '../land-realm-kit'
import type { WheatPlot } from './wheatfield-terrain'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { BLEACHED_LOG_SET, placeDeadTree } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { clearPlantColumn, isFreeArea, isFreeGround, measureNearestDistance, putProp } from '../realm-prop-kit'
import {
  isWheatfieldRoad,
  measureWheatfieldRadius,
  WHEATFIELD_CART_POINT,
  WHEATFIELD_CENTER,
  WHEATFIELD_GROUND_Y,
  WHEATFIELD_HARVEST_POINT_LIST,
  WHEATFIELD_HAYSTACK_POINT,
  WHEATFIELD_HUT_POINT,
  WHEATFIELD_OUTER_RADIUS,
  WHEATFIELD_PERCH_POINT,
  WHEATFIELD_POND_RECT,
  WHEATFIELD_PORTAL_POINT,
  WHEATFIELD_ROAD_HALF_WIDTH,
  WHEATFIELD_SHRINE_POINT,
  WHEATFIELD_SLOW_RADIUS,
} from './wheatfield-layout'

/**
 * 千頃麥浪的細節小景
 *
 * 只有地形 worker 用，排在麥子與野花之後、傳送門之前。
 * 這片田原本只有麥、路、稻草人與燈，走久了每一塊田都一樣。這一輪補的是「有人在這裡種田」：
 * 兩塊已經收割的田（麥茬、立著的禾束、草垛）、停在田邊的板車、蓄水池與水渠、
 * 十字路口的田頭小祠、看田的小寮、烏鴉歇腳的枯樹，以及路肩被踩出來的土與碎石。
 *
 * 這片田的花草已經是其他場景的四五倍，所以只加結構與道具：收割的兩塊田反而少掉上千株麥
 */

const DIRT_SET = new Set([BlockId.DIRT])

/** 收割後留在壟上的麥茬（枯草）佔多少 */
const STUBBLE_CHANCE = 0.2

/** 小寮的牆高（格）：頂是半磚，牆三格高，人走進去頭上還有半格 */
const HUT_WALL_HEIGHT = 3

/** 立著的禾束沿著壟每幾格一束 */
const STOOK_SPACING = 5

function readFootY(groundTopMap: Uint8Array, x: number, z: number): number {
  return groundTopMap[x * WORLD_SIZE + z]! + 1
}

function isWheat(blockId: BlockId): boolean {
  return blockId === BlockId.WHEAT || blockId === BlockId.WHEAT_TALL
}

/**
 * 收割一塊田
 *
 * 麥子全拿掉，壟上留兩成麥茬；每隔一壟、沿壟每五格立一束禾束（抽穗的麥），
 * 遠看是一排一排的小點，與旁邊還沒割的麥浪隔著田埂對比。稻草人與草束照舊留著
 */
function harvestPlot(state: Uint8Array, groundTopMap: Uint8Array, plot: WheatPlot, random: () => number): void {
  for (let x = plot.minX; x <= plot.maxX; x++) {
    for (let z = plot.minZ; z <= plot.maxZ; z++) {
      const roll = random()
      const footY = readFootY(groundTopMap, x, z)
      if (!isWheat(getBlock(state, x, footY, z)))
        continue
      clearPlantColumn(state, x, footY, z)

      const rowOffset = plot.isAlongX ? z - plot.minZ + 1 : x - plot.minX + 1
      const along = plot.isAlongX ? x - plot.minX : z - plot.minZ
      if (rowOffset % 4 === 2 && along % STOOK_SPACING === 2)
        setBlock(state, x, footY, z, BlockId.WHEAT_TALL)
      else if (roll < STUBBLE_CHANCE)
        setBlock(state, x, footY, z, BlockId.DRY_GRASS)
    }
  }
}

/**
 * 草垛：三格見方的底、十字的第二層、頂上一捆
 *
 * 九格要在同一層的土上，回傳有沒有堆起來
 */
function placeHaystack(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): boolean {
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x - 1, z - 1, x + 1, z + 1, footY, DIRT_SET))
    return false

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      putProp(state, x + offsetX, footY, z + offsetZ, BlockId.HAY)
      if (offsetX === 0 || offsetZ === 0)
        setBlock(state, x + offsetX, footY + 1, z + offsetZ, BlockId.HAY)
    }
  }
  setBlock(state, x, footY + 2, z, BlockId.HAY)
  return true
}

/**
 * 板車：單軸兩輪、四格長的車斗、堆到冒尖的草束，車轅朝東擱在地上
 *
 * 車身沿 X 擺，x、z 是車斗西北角
 */
function placeHayCart(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): void {
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x, z, x + 5, z + 1, footY, DIRT_SET))
    return

  for (let offsetX = 0; offsetX <= 5; offsetX++) {
    for (let offsetZ = 0; offsetZ <= 1; offsetZ++) {
      clearPlantColumn(state, x + offsetX, footY, z + offsetZ)
    }
  }
  for (let offsetZ = 0; offsetZ <= 1; offsetZ++) {
    setBlock(state, x + 1, footY, z + offsetZ, BlockId.OAK_LOG_Z)
    for (let offsetX = 0; offsetX <= 3; offsetX++) {
      setBlock(state, x + offsetX, footY + 1, z + offsetZ, BlockId.PLANKS)
    }
    for (let offsetX = 0; offsetX <= 2; offsetX++) {
      setBlock(state, x + offsetX, footY + 2, z + offsetZ, BlockId.HAY)
    }
    /** 車轅：兩根伸出去的桿子，前端落地 */
    setBlock(state, x + 4, footY + 1, z + offsetZ, BlockId.FENCE)
    setBlock(state, x + 5, footY, z + offsetZ, BlockId.FENCE)
  }
  setBlock(state, x + 1, footY + 3, z, BlockId.HAY)
  /** 車斗後端的撐腳，單軸的車卸了牲口要靠它站著 */
  setBlock(state, x + 3, footY, z, BlockId.WOOD_POST)
}

/**
 * 蓄水池、水門與水渠
 *
 * 圓石砌一圈池岸，池裡一格深的水、黏土底；北岸正中兩根樁夾一片木閘板。
 * 池東一道一格寬的水渠沿著空壟往東流到南北路的路肩，碰到地面高一階就停。
 *
 * 水要比最低那層地高一格：布景的地面平面鋪在最低那層地的頂面（WHEATFIELD_GROUND_Y + 0.5），
 * 水面矮八分之一格，水落在最低那層的話整池會被那片平面蓋住（同聽雨林踩過的坑）
 */
function placePond(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { minX, maxX, minZ, maxZ } = WHEATFIELD_POND_RECT
  const topY = groundTopMap[minX * WORLD_SIZE + minZ]!
  /** 路邊的草束剛好有一捆堆在池岸上，先挪開 */
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let level = 1; level <= 2; level++) {
        if (getBlock(state, x, topY + level, z) === BlockId.HAY)
          setBlock(state, x, topY + level, z, BlockId.AIR)
      }
    }
  }
  if (topY <= WHEATFIELD_GROUND_Y || !isFreeArea(state, minX, minZ, maxX, maxZ, topY + 1, DIRT_SET))
    return

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      clearPlantColumn(state, x, topY + 1, z)
      const isRim = x === minX || x === maxX || z === minZ || z === maxZ
      if (isRim) {
        setBlock(state, x, topY, z, (x + z) % 3 === 0 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
        continue
      }
      setBlock(state, x, topY, z, BlockId.WATER)
      setBlock(state, x, topY - 1, z, BlockId.CLAY)
    }
  }

  /** 水門：兩根樁、一道橫桿、一片閘板 */
  const gateX = Math.round((minX + maxX) / 2)
  for (const offsetX of [-1, 1]) {
    setBlock(state, gateX + offsetX, topY + 1, minZ, BlockId.WOOD_POST)
    setBlock(state, gateX + offsetX, topY + 2, minZ, BlockId.WOOD_POST)
  }
  setBlock(state, gateX, topY + 2, minZ, BlockId.FENCE)
  setBlock(state, gateX, topY + 1, minZ, BlockId.STORM_PANEL_X)

  /** 池邊的水桶與鋤頭，南岸一塊跳板，水裡三叢香蒲 */
  setBlock(state, minX + 1, topY + 1, maxZ, BlockId.BARREL)
  putProp(state, minX - 1, topY + 1, maxZ - 1, BlockId.TOOL_HOE)
  setBlock(state, maxX - 2, topY + 1, maxZ, BlockId.WOOD_SLAB)
  for (const [offsetX, offsetZ] of [[1, 1], [maxX - minX - 1, 1], [1, 2]] as const) {
    setBlock(state, minX + offsetX, topY + 1, minZ + offsetZ, BlockId.CATTAIL)
  }

  /** 水渠：從池東岸往東，沿著同一層的土挖到路肩 */
  const ditchZ = minZ + 3
  setBlock(state, maxX, topY, ditchZ, BlockId.WATER)
  setBlock(state, maxX, topY - 1, ditchZ, BlockId.CLAY)
  for (let x = maxX + 1; x < WHEATFIELD_CENTER.x - WHEATFIELD_ROAD_HALF_WIDTH - 1; x++) {
    const isLevel = [-1, 0, 1].every((offsetZ) => groundTopMap[x * WORLD_SIZE + ditchZ + offsetZ] === topY)
    if (!isLevel || !isFreeGround(state, x, topY + 1, ditchZ, DIRT_SET))
      break
    clearPlantColumn(state, x, topY + 1, ditchZ)
    setBlock(state, x, topY, ditchZ, BlockId.WATER)
    setBlock(state, x, topY - 1, ditchZ, BlockId.CLAY)
  }
}

/**
 * 田頭小祠
 *
 * 十字路口東北角一小塊碎石地，石座上一塊刻紋石、頂一片木簷；
 * 前面一盆花、一簍剛割的麥，是種田的人順路放的
 */
function placeFieldShrine(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z } = WHEATFIELD_SHRINE_POINT
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x - 1, z - 1, x + 1, z + 2, footY, DIRT_SET))
    return

  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 2; offsetZ++) {
      clearPlantColumn(state, x + offsetX, footY, z + offsetZ)
      setBlock(state, x + offsetX, footY - 1, z + offsetZ, BlockId.GRAVEL)
    }
  }
  setBlock(state, x, footY, z, BlockId.STONE_BRICKS)
  setBlock(state, x, footY + 1, z, BlockId.RUNE_STONE)
  setBlock(state, x, footY + 2, z, BlockId.DARK_WOOD_SLAB)
  setBlock(state, x - 1, footY, z + 1, BlockId.FLOWER_POT)
  setBlock(state, x + 1, footY, z + 1, BlockId.BASKET)
  setBlock(state, x - 1, footY, z - 1, BlockId.MOSSY_COBBLESTONE)
  setBlock(state, x + 1, footY, z - 1, BlockId.COBBLESTONE)
}

/**
 * 看田的小寮
 *
 * 三面木板牆、朝南對著路敞開，深色木半磚的平頂往外出一格簷；
 * 裡面一個木箱、一個桶、一捆草，門口地上躺著一把鋤頭。不點燈
 */
function placeFieldHut(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z } = WHEATFIELD_HUT_POINT
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x - 2, z - 1, x + 2, z + 2, footY, DIRT_SET))
    return

  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 2; offsetZ++) {
      clearPlantColumn(state, x + offsetX, footY, z + offsetZ)
    }
  }
  for (let level = 0; level < HUT_WALL_HEIGHT; level++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      setBlock(state, x + offsetX, footY + level, z - 1, BlockId.PLANKS)
    }
    for (const offsetX of [-2, 2]) {
      setBlock(state, x + offsetX, footY + level, z, BlockId.PLANKS)
      setBlock(state, x + offsetX, footY + level, z + 1, BlockId.FENCE)
    }
  }
  for (let offsetX = -3; offsetX <= 3; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (getBlock(state, x + offsetX, footY + HUT_WALL_HEIGHT, z + offsetZ) === BlockId.AIR)
        setBlock(state, x + offsetX, footY + HUT_WALL_HEIGHT, z + offsetZ, BlockId.DARK_WOOD_SLAB)
    }
  }
  setBlock(state, x - 1, footY, z, BlockId.CRATE)
  setBlock(state, x + 1, footY, z, BlockId.BARREL)
  setBlock(state, x, footY, z, BlockId.HAY)
  putProp(state, x + 1, footY, z + 2, BlockId.TOOL_HOE)
}

/** 烏鴉歇腳的枯樹：田埂上一棵曬白的枯木，四周一圈麥子讓出來 */
function placePerchTree(state: Uint8Array, groundTopMap: Uint8Array): void {
  const { x, z } = WHEATFIELD_PERCH_POINT
  const footY = readFootY(groundTopMap, x, z)
  if (!isFreeArea(state, x - 1, z - 1, x + 1, z + 1, footY, DIRT_SET))
    return
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      clearPlantColumn(state, x + offsetX, footY, z + offsetZ)
    }
  }
  placeDeadTree(state, x, footY, z, 6, BLEACHED_LOG_SET)
  setBlock(state, x - 1, footY + 3, z, BLEACHED_LOG_SET.branchX)
  putProp(state, x + 1, footY, z + 1, BlockId.SMALL_ROCK)
}

/**
 * 路肩
 *
 * 碎石路的兩道邊有一成被踩成土，路邊第一格田裡散著從路上踢出去的碎石。
 * 回程門前那一段不動，門框自己會清
 */
function wearRoadShoulder(state: Uint8Array, groundTopMap: Uint8Array, random: () => number): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const roll = random()
      if (Math.hypot(x - WHEATFIELD_CENTER.x, z - WHEATFIELD_CENTER.z) > WHEATFIELD_SLOW_RADIUS + 8)
        continue
      if (Math.hypot(x - WHEATFIELD_PORTAL_POINT.x, z - WHEATFIELD_PORTAL_POINT.z) < 6)
        continue
      const isRoad = isWheatfieldRoad(x, z)
      const hasRoadNeighbour = isWheatfieldRoad(x + 1, z) || isWheatfieldRoad(x - 1, z) || isWheatfieldRoad(x, z + 1) || isWheatfieldRoad(x, z - 1)
      const hasFieldNeighbour = !isWheatfieldRoad(x + 1, z) || !isWheatfieldRoad(x - 1, z) || !isWheatfieldRoad(x, z + 1) || !isWheatfieldRoad(x, z - 1)
      const topY = groundTopMap[x * WORLD_SIZE + z]!
      if (getBlock(state, x, topY + 1, z) !== BlockId.AIR)
        continue
      if (isRoad && hasFieldNeighbour && roll < 0.1 && getBlock(state, x, topY, z) === BlockId.GRAVEL)
        setBlock(state, x, topY, z, BlockId.DIRT)
      else if (!isRoad && hasRoadNeighbour && roll < 0.14 && getBlock(state, x, topY, z) === BlockId.DIRT)
        setBlock(state, x, topY + 1, z, BlockId.PEBBLES)
    }
  }
}

/** 補上千頃麥浪的細節小景 */
export function decorateWheatfield(state: Uint8Array, groundTopMap: Uint8Array, plotList: readonly WheatPlot[]): void {
  const random = createSeededRandom('wheatfield-detail')

  const harvestPlotList = WHEATFIELD_HARVEST_POINT_LIST.flatMap((point) => plotList.filter((candidate) =>
    point.x >= candidate.minX && point.x <= candidate.maxX && point.z >= candidate.minZ && point.z <= candidate.maxZ))
  for (const plot of harvestPlotList) {
    harvestPlot(state, groundTopMap, plot, random)
  }

  /** 定點的先擺：大草垛、板車與小祠都在收割田裡，割完才有空地 */
  placeHaystack(state, groundTopMap, WHEATFIELD_HAYSTACK_POINT.x, WHEATFIELD_HAYSTACK_POINT.z)
  placeHayCart(state, groundTopMap, WHEATFIELD_CART_POINT.x, WHEATFIELD_CART_POINT.z)
  placeFieldShrine(state, groundTopMap)

  /** 每塊收割田再堆兩座草垛，位置在田裡抽；堆不起來（地不平、壓到稻草人）或離別的東西太近就換一處 */
  const occupiedList: PlanePoint[] = [WHEATFIELD_HAYSTACK_POINT, WHEATFIELD_CART_POINT, WHEATFIELD_SHRINE_POINT]
  for (const plot of harvestPlotList) {
    for (let attempt = 0, placedCount = 0; attempt < 16 && placedCount < 2; attempt++) {
      const x = Math.round(plot.minX + 2 + random() * (plot.maxX - plot.minX - 4))
      const z = Math.round(plot.minZ + 2 + random() * (plot.maxZ - plot.minZ - 4))
      if (measureWheatfieldRadius(x, z) >= WHEATFIELD_OUTER_RADIUS - 4 || measureNearestDistance(x, z, occupiedList) < 9)
        continue
      if (placeHaystack(state, groundTopMap, x, z)) {
        occupiedList.push({ x, z })
        placedCount++
      }
    }
  }

  placePond(state, groundTopMap)
  placeFieldHut(state, groundTopMap)
  placePerchTree(state, groundTopMap)
  wearRoadShoulder(state, groundTopMap, random)
}
