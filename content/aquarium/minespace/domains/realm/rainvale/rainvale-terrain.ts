import type { PavilionFacing, RainvalePavilion } from './rainvale-layout'
import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import {
  carveWater,
  fillBox,
  fillSquare,
  getNoisyDistance,
  placeOakTree,
  placeRoofCap,
  placeStandingStone,
  plantWithStack,
  setDecoration,
} from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { RAINVALE_REALM } from './rainvale-realm'
import {
  PAVILION_LIST,
  POND_LIST,
  RAINVALE_CENTER,
  RAINVALE_EDGE_RADIUS,
  RAINVALE_GROUND_Y,
  RAINVALE_PORTAL_POINT,
  THICKET_START_RADIUS,
} from './rainvale-layout'

/**
 * 聽雨林的地形
 *
 * 只有地形 worker 用。照聽雨亭（buildRainvaleGarden）放大：草地、濃綠的闊葉樹（橡樹配叢林葉）、
 * 一格深黏土底的積水、圍籬細柱撐著的小木亭、苔石，地上以菇與腐葉為主、蕨只留一點。
 * 聽雨亭沒有石燈籠、沒有路，這裡也不加；夜裡亮的只有亭子裡那幾盞吊燈與回程門。
 *
 * 樹葉的方塊很貴，樹只種到 RAINVALE_EDGE_RADIUS，外面的地面換成不畫的 LAKE_BED。
 * 順序：地面與積水 → 亭子 → 樹 → 掏空樹冠 → 苔石 → 花草 → 傳送門（清掉門洞前後與木牌旁的花草）
 */

/** 種樹的格子：每三格見方抽一次籤，樹幹落在格子裡的隨機一點 */
const TREE_CELL_SIZE = 3

/**
 * 林子裡每一格種樹的機率
 *
 * 聽雨亭十一格見方種三棵，樹冠五格寬、接起來壓掉大半個天空，人只在樹冠底下走。
 * 這裡每九格見方抽一次、中段機率六成上下，樹冠一樣接成一片、樹幹之間留得出路
 */
const GROVE_TREE_CHANCE = 0.58

/** 密林那一圈的機率（每兩格見方抽一次） */
const THICKET_TREE_CHANCE = 0.45

/** 椅子的木階梯：靠背朝人背後那一側，面朝 facing 坐 */
const SEAT_BLOCK_MAP: Record<PavilionFacing, BlockId> = {
  east: BlockId.WOOD_STAIRS_WEST,
  west: BlockId.WOOD_STAIRS_EAST,
  south: BlockId.WOOD_STAIRS_NORTH,
  north: BlockId.WOOD_STAIRS_SOUTH,
}

const FACING_OFFSET_MAP: Record<PavilionFacing, { x: number; z: number }> = {
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
}

/** 某一點離圓心的距離 */
function measureDistance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z)
}

/** 這一格在不在某一窪積水裡（岸線吃噪音，與聽雨亭那窪同一組頻率與振幅） */
function isPondCell(x: number, z: number): boolean {
  return POND_LIST.some((pond) => getNoisyDistance(x, z, pond.x, pond.z, 0.36, 1.1) <= pond.radius)
}

/** 離最近一窪積水的岸還有幾格（粗估，用圓心距離扣半徑） */
function measurePondGap(x: number, z: number): number {
  let gap = Number.POSITIVE_INFINITY
  for (const pond of POND_LIST) {
    gap = Math.min(gap, measureDistance(x, z, pond) - pond.radius)
  }
  return gap
}

/** 離最近一座亭子幾格 */
function measurePavilionDistance(x: number, z: number): number {
  let distance = Number.POSITIVE_INFINITY
  for (const pavilion of PAVILION_LIST) {
    distance = Math.min(distance, Math.max(Math.abs(x - pavilion.x), Math.abs(z - pavilion.z)))
  }
  return distance
}

/**
 * 落腳那一段：回程門到池東岸
 *
 * 門前到池邊要空著，落地第一眼才看得到那一池水與對岸的亭子
 */
function isArrivalLane(x: number, z: number): boolean {
  return Math.abs(z - RAINVALE_PORTAL_POINT.z) <= 3
    && x >= RAINVALE_PORTAL_POINT.x - 10
    && x <= RAINVALE_PORTAL_POINT.x + 3
}

/** 要保持平的地方：積水邊、亭子四周、門前 */
function isFlatGround(x: number, z: number): boolean {
  return measurePondGap(x, z) < 3
    || measurePavilionDistance(x, z) <= 4
    || measureDistance(x, z, RAINVALE_PORTAL_POINT) < 6
    || isArrivalLane(x, z)
}

/**
 * 地面隆起幾格
 *
 * 林子裡零星一格高的小丘；密林那一圈往外一路抬高成坡，最多四格，
 * 雨霧裡看出去林地是往上收的，像走到了山腳
 */
function measureGroundLevel(x: number, z: number, radius: number): number {
  if (isFlatGround(x, z))
    return 0

  const roll = fbm2D(x * 0.08 - 31, z * 0.08 + 17, 2, 0.5)
  if (radius < THICKET_START_RADIUS + 2)
    return roll > 0.35 ? 1 : 0

  const rise = Math.floor((radius - THICKET_START_RADIUS - 2) / 3)
  return Math.min(4, rise + (roll > 0.15 ? 1 : 0))
}

/** 地面與積水，回傳每一格的地表高度（積水的格子是水面那一層） */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, RAINVALE_CENTER)
      const index = x * WORLD_SIZE + z

      /** 林子外面：碰撞照算、不畫，由布景的地面平面代替 */
      if (radius > RAINVALE_EDGE_RADIUS + 2) {
        for (let y = 1; y < RAINVALE_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, RAINVALE_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[index] = RAINVALE_GROUND_Y
        continue
      }

      const topY = RAINVALE_GROUND_Y + measureGroundLevel(x, z, radius)
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, BlockId.GRASS)
      groundTopMap[index] = topY

      /**
       * 積水往下挖，水面與草地齊平（carveWater）：一格深、黏土底，與聽雨亭那窪一樣。
       * 大窪的中間再深一格，站在岸邊看得出水是有深淺的
       */
      if (topY === RAINVALE_GROUND_Y && isPondCell(x, z)) {
        const isDeep = POND_LIST.some((pond) => pond.radius >= 4 && measureDistance(x, z, pond) < pond.radius - 2.2)
        carveWater(state, x, RAINVALE_GROUND_Y, z, isDeep ? 2 : 1, BlockId.CLAY)
      }
    }
  }

  return groundTopMap
}

/**
 * 小木亭（聽雨亭那一座）
 *
 * 四根圍籬細柱撐一片深色木頂，地板鋪榻榻米，中央一張木階梯當椅子、面朝那一窪水；
 * 頂下貼著屋頂垂一盞吊燈（在椅子旁邊），屋簷伸出去的前左角掛一個風鈴。
 * 尺寸、材料與箱庭那一座一模一樣：只坐得下一個人
 */
function placePavilion(state: Uint8Array, pavilion: RainvalePavilion): void {
  const { x, z, facing } = pavilion
  const deckY = RAINVALE_GROUND_Y
  const groundY = deckY + 1

  for (const corner of [{ x: -1, z: -1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: 1, z: 1 }]) {
    for (let level = 0; level < 3; level++) {
      setBlock(state, x + corner.x, groundY + level, z + corner.z, BlockId.FENCE)
    }
  }
  fillSquare(state, x, z, 1, deckY, BlockId.TATAMI)
  placeRoofCap(state, x, groundY + 3, z, 2, BlockId.DARK_WOOD_SLAB, BlockId.DARK_PLANKS)
  fillSquare(state, x, z, 1, groundY + 4, BlockId.DARK_PLANKS)
  setBlock(state, x, groundY, z, SEAT_BLOCK_MAP[facing])

  const front = FACING_OFFSET_MAP[facing]
  /** 左手邊：面朝東時是北 */
  const left = { x: front.z, z: -front.x }
  /** 吊燈在椅子右手邊一格（箱庭那一座面朝東、燈在南邊一格） */
  setBlock(state, x - left.x, groundY + 2, z - left.z, BlockId.HANGING_LAMP)
  setBlock(state, x + (front.x + left.x) * 2, groundY + 2, z + (front.z + left.z) * 2, BlockId.WIND_CHIME)
}

/**
 * 密林的細高樹：七到九格高的樹幹，頂上一小撮叢林葉
 *
 * 從林子裡往外看，平視的那一層是一排一排越來越密的樹幹；樹冠在頭頂，
 * 看得出是闊葉就夠了。整棵橡樹（五十多格葉）種滿那一圈太貴，所以換成這種
 */
function placeThicketTree(state: Uint8Array, x: number, groundY: number, z: number, trunkHeight: number): void {
  for (let level = 0; level < trunkHeight; level++) {
    setBlock(state, x, groundY + level, z, BlockId.OAK_LOG)
  }
  const topY = groundY + trunkHeight
  setDecoration(state, x, topY, z, BlockId.JUNGLE_LEAVES)
  for (let layer = 0; layer <= 1; layer++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        if (offsetX === 0 && offsetZ === 0)
          continue
        const isCorner = Math.abs(offsetX) + Math.abs(offsetZ) === 2
        if (isCorner && layer === 0)
          continue
        setDecoration(state, x + offsetX, topY - layer, z + offsetZ, BlockId.JUNGLE_LEAVES)
      }
    }
  }
}

/**
 * 這一格要不要種樹的機率
 *
 * 林子裡疏密由低頻噪音決定；積水、亭子與門前讓開（樹冠可以從旁邊蓋過來）。
 * 密林那一圈改用細高樹，每兩格見方抽一次
 */
function measureTreeChance(x: number, z: number, radius: number): number {
  if (radius > RAINVALE_EDGE_RADIUS)
    return 0
  if (measurePondGap(x, z) < 1.5 || measurePavilionDistance(x, z) <= 3)
    return 0
  if (measureDistance(x, z, RAINVALE_PORTAL_POINT) < 5 || isArrivalLane(x, z))
    return 0

  if (radius > THICKET_START_RADIUS)
    return THICKET_TREE_CHANCE

  const density = fbm2D(x * 0.05 + 23, z * 0.05 - 11, 2, 0.5)
  return Math.min(0.85, Math.max(0.3, GROVE_TREE_CHANCE + density * 0.4))
}

/** 種樹：林子裡是聽雨亭那種五到七格高的橡樹配叢林葉，密林那一圈是細高樹 */
function placeTreeList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('rainvale-tree')

  for (let cellX = 0; cellX < WORLD_SIZE; cellX += TREE_CELL_SIZE) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += TREE_CELL_SIZE) {
      const roll = random()
      const heightRoll = random()
      const offsetX = Math.floor(random() * TREE_CELL_SIZE)
      const offsetZ = Math.floor(random() * TREE_CELL_SIZE)
      const x = cellX + offsetX
      const z = cellZ + offsetZ
      if (x >= WORLD_SIZE || z >= WORLD_SIZE)
        continue

      const radius = measureDistance(x, z, RAINVALE_CENTER)
      if (radius > THICKET_START_RADIUS || roll > measureTreeChance(x, z, radius))
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY, z) !== BlockId.AIR || getBlock(state, x, groundY - 1, z) !== BlockId.GRASS)
        continue

      placeOakTree(state, x, groundY, z, 5 + Math.floor(heightRoll * 3), BlockId.JUNGLE_LEAVES)
    }
  }

  /** 密林那一圈每兩格見方抽一次 */
  const thicketRandom = createSeededRandom('rainvale-thicket')
  for (let cellX = 0; cellX < WORLD_SIZE; cellX += 2) {
    for (let cellZ = 0; cellZ < WORLD_SIZE; cellZ += 2) {
      const roll = thicketRandom()
      const heightRoll = thicketRandom()
      const x = cellX + Math.floor(thicketRandom() * 2)
      const z = cellZ + Math.floor(thicketRandom() * 2)
      const radius = measureDistance(x, z, RAINVALE_CENTER)
      if (radius <= THICKET_START_RADIUS || roll > measureTreeChance(x, z, radius))
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY, z) !== BlockId.AIR || getBlock(state, x, groundY - 1, z) !== BlockId.GRASS)
        continue

      placeThicketTree(state, x, groundY, z, 7 + Math.floor(heightRoll * 3))
    }
  }
}

/** 樹冠的方塊，掏空樹冠時用來判斷一格是不是被包在裡面 */
const CROWN_BLOCK_SET = new Set([BlockId.JUNGLE_LEAVES, BlockId.OAK_LOG])

/**
 * 掏空樹冠
 *
 * 樹葉是鏤空的方塊，每一格都整顆畫、還要進兩層陰影與深度圖。
 * 六面都貼著樹葉或樹幹的那些格子從外面幾乎看不到，拿掉之後外觀不變（做法同林海）
 */
function hollowCrownList(state: Uint8Array): void {
  const enclosedList: { x: number; y: number; z: number }[] = []
  const isCrown = (x: number, y: number, z: number) => CROWN_BLOCK_SET.has(getBlock(state, x, y, z))

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      for (let y = RAINVALE_GROUND_Y + 3; y < RAINVALE_GROUND_Y + 16; y++) {
        if (getBlock(state, x, y, z) !== BlockId.JUNGLE_LEAVES)
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
 * 苔石
 *
 * 聽雨亭一塊兩格高的苔石，濕氣重的地方才長得出來。
 * 林子大了散十幾塊，一到兩格高，多半落在積水邊
 */
function placeMossyStoneList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('rainvale-stone')
  let placedCount = 0

  for (let attempt = 0; attempt < 120 && placedCount < 14; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = 4 + random() * (THICKET_START_RADIUS - 6)
    const x = Math.round(RAINVALE_CENTER.x + Math.cos(angle) * radius)
    const z = Math.round(RAINVALE_CENTER.z + Math.sin(angle) * radius)
    const height = random() < 0.5 ? 1 : 2
    const gap = measurePondGap(x, z)
    if (gap < 1.5 || gap > 6 || measurePavilionDistance(x, z) <= 4 || isArrivalLane(x, z))
      continue
    if (measureDistance(x, z, RAINVALE_PORTAL_POINT) < 6)
      continue

    const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
    const isClear = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([offsetX, offsetZ]) => (
      getBlock(state, x + offsetX!, groundY, z + offsetZ!) === BlockId.AIR
      && getBlock(state, x + offsetX!, groundY - 1, z + offsetZ!) === BlockId.GRASS
    ))
    if (!isClear)
      continue

    placeStandingStone(state, x, groundY, z, height, BlockId.MOSSY_COBBLESTONE)
    placedCount++
  }
}

/**
 * 林下的花草
 *
 * 與聽雨亭同一組、同一個比例：每格一成九的機率，蕨二成九、腐葉三成三、褐菇二成二、紅菇一成六。
 * 那一座把草收到只剩點綴，是要讓亭子、苔石與積水露出來；這裡照樣。
 * 密林那一圈多撒一點，貼地那一層也擋住視線
 */
function scatterUndergrowth(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('rainvale-plant')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const radius = measureDistance(x, z, RAINVALE_CENTER)
      if (radius > RAINVALE_EDGE_RADIUS)
        continue

      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      const chance = radius > THICKET_START_RADIUS ? 0.32 : 0.19
      if (random() > chance)
        continue

      const roll = random()
      let blockId: BlockId
      if (roll < 0.29)
        blockId = BlockId.FERN
      else if (roll < 0.62)
        blockId = BlockId.FOREST_LITTER
      else if (roll < 0.84)
        blockId = BlockId.BROWN_MUSHROOM
      else
        blockId = BlockId.MUSHROOM
      plantWithStack(state, x, groundY, z, blockId, random)
    }
  }
}

/** 生成整片聽雨林 */
export function generateRainvaleWorld(state: Uint8Array): void {
  const groundTopMap = shapeTerrain(state)
  for (const pavilion of PAVILION_LIST) {
    placePavilion(state, pavilion)
  }
  placeTreeList(state, groundTopMap)
  hollowCrownList(state)
  placeMossyStoneList(state, groundTopMap)
  scatterUndergrowth(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of RAINVALE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
