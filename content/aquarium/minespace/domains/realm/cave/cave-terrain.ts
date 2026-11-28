import { createSeededRandom, fbm2D } from '../../../utils/noise'
import { BlockId, isPassableBlock, isWaterBlock } from '../../block/block-constants'
import { getNoisyDistance, placeStoneLantern, plantWithStack, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_HEIGHT } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { decorateCaveDetail } from './cave-detail'
import {
  CAVE_FLOOR_Y,
  CAVE_GROUND_Y,
  CAVE_PORTAL_POINT,
  GROTTO_CENTER,
  GROTTO_HEIGHT,
  GROTTO_RADIUS_X,
  GROTTO_RADIUS_Z,
  HALL_CENTER,
  HALL_RADIUS_X,
  HALL_RADIUS_Z,
  measureFloorRise,
  measureGlowDensity,
  measureGlowVein,
  measureHallDistance,
  measureHallHeight,
  OLD_MOUTH,
  PILLAR_LIST,
  TUNNEL_POINT_LIST,
  UNDERGROUND_LAKE_CENTER,
  UNDERGROUND_LAKE_RADIUS,
} from './cave-layout'
import { CAVE_REALM } from './cave-realm'

/**
 * 地底洞窟的地形
 *
 * 只有地形 worker 用。整座洞照岩響窟（buildCaveGarden）放大：
 * 岩響窟是碎石木座上一座中空的山，一條三格高的通道彎進山腹，走到底是一間洞室，
 * 洞室底下一池地底湖、四周一圈圓石石筍、岩壁上的礦脈（越深越好，最裡面兩顆鑽石）、
 * 洞頂的蛛網、幾盞燈籠，洞口兩側各一盞石燈籠，山腳碎石上長著蕨與石生植物。
 * 這裡一樣一樣照搬，只是把洞室放大成大廳，再多一間碎石鋪地的前室給門站。
 *
 * 整個世界先填滿不畫的 LAKE_BED，挖出洞之後，只把貼著洞裡空氣（與水）的那一層
 * 換成畫得出來的岩：世界是實心的四十格高，照方塊畫的話光是世界頂面就有七萬八千格，
 * 而那一面永遠沒有人看得到。
 *
 * 順序有講究：先挖洞與湖，岩壁才知道哪一層要露出來；石筍、鐘乳石、燈籠排在岩壁之後，
 * 它們本身是看得見的方塊，不必再經過那一道；傳送門排在最後
 */

/** 洞裡最高只挖到這一層，上面至少留兩格岩，世界頂那一面才不會露出來 */
const CEILING_LIMIT_Y = WORLD_HEIGHT - 3

/** 挖洞與露岩只看這個範圍，其餘全是不畫的岩 */
const CAVE_BOUND = {
  minX: HALL_CENTER.x - HALL_RADIUS_X - 8,
  maxX: OLD_MOUTH.endX + 4,
  minZ: HALL_CENTER.z - HALL_RADIUS_Z - 8,
  maxZ: HALL_CENTER.z + HALL_RADIUS_Z + 8,
}

/** 岩壁的礦脈，越往西（離前室越遠）越可能是好礦，與岩響窟「越深越好」同一個意思 */
const ORE_LIST = [BlockId.COAL_ORE, BlockId.IRON_ORE, BlockId.COPPER_ORE, BlockId.GOLD_ORE] as const

/** 某一格是不是空的（空氣、水、花草、燈籠這類穿得過去或不擋光的東西） */
function isOpenCell(state: Uint8Array, x: number, y: number, z: number): boolean {
  const blockId = getBlock(state, x, y, z)
  return blockId === BlockId.AIR || isWaterBlock(blockId) || isPassableBlock(blockId)
}

/** 挖空一格柱的一段 */
function carveColumn(state: Uint8Array, x: number, z: number, fromY: number, toY: number): void {
  for (let y = fromY; y <= Math.min(toY, CEILING_LIMIT_Y); y++) {
    setBlock(state, x, y, z, BlockId.AIR)
  }
}

/** 這一格是不是落在某根頂天石柱裡：石柱不挖，留著當實心的岩 */
function isInPillar(x: number, z: number): boolean {
  return PILLAR_LIST.some((pillar) => getNoisyDistance(
    x,
    z,
    HALL_CENTER.x + pillar.offsetX,
    HALL_CENTER.z + pillar.offsetZ,
    0.35,
    0.8,
  ) < pillar.radius)
}

/**
 * 大廳
 *
 * 洞底吃一點起伏（湖邊與通道口是平的），洞頂是吃噪音的拋物面穹頂；
 * 四根石柱的位置不挖，從地面一路接到穹頂
 */
function carveHall(state: Uint8Array): void {
  for (let x = HALL_CENTER.x - HALL_RADIUS_X - 6; x <= HALL_CENTER.x + HALL_RADIUS_X + 6; x++) {
    for (let z = HALL_CENTER.z - HALL_RADIUS_Z - 6; z <= HALL_CENTER.z + HALL_RADIUS_Z + 6; z++) {
      const distance = measureHallDistance(x, z)
      if (distance >= 1 || isInPillar(x, z))
        continue

      const floorY = CAVE_FLOOR_Y + measureFloorRise(x, z)
      carveColumn(state, x, z, floorY + 1, CAVE_FLOOR_Y + measureHallHeight(x, z, distance))
    }
  }
}

/** 某一點在前室橢圓裡的正規化距離 */
function measureGrottoDistance(x: number, z: number): number {
  return Math.hypot((x - GROTTO_CENTER.x) / GROTTO_RADIUS_X, (z - GROTTO_CENTER.z) / GROTTO_RADIUS_Z)
    + fbm2D(x * 0.2 + 3, z * 0.2 - 9, 2, 0.5) * 0.08
}

/** 這一格是不是前室或門後那段舊洞口：地面鋪碎石 */
function isGrottoFloor(x: number, z: number): boolean {
  const isOldMouth = x >= OLD_MOUTH.startX && x <= OLD_MOUTH.endX && Math.abs(z - OLD_MOUTH.z) <= 1
  return isOldMouth || measureGrottoDistance(x, z) < 1.05
}

/**
 * 前室與門後的舊洞口
 *
 * 前室是一間平頂微拱的小洞，門框五格高，門那一帶的頂要再高一兩格才不壓著它。
 * 門後往東一段三格寬的短坑道，越走越矮，盡頭坍了一堆碎石與圓石
 */
function carveGrotto(state: Uint8Array): void {
  for (let x = GROTTO_CENTER.x - GROTTO_RADIUS_X - 2; x <= GROTTO_CENTER.x + GROTTO_RADIUS_X + 2; x++) {
    for (let z = GROTTO_CENTER.z - GROTTO_RADIUS_Z - 2; z <= GROTTO_CENTER.z + GROTTO_RADIUS_Z + 2; z++) {
      const distance = measureGrottoDistance(x, z)
      if (distance >= 1)
        continue

      const height = 4 + Math.round((GROTTO_HEIGHT - 2.5) * (1 - distance * distance))
      carveColumn(state, x, z, CAVE_GROUND_Y, CAVE_FLOOR_Y + height)
    }
  }

  const length = OLD_MOUTH.endX - OLD_MOUTH.startX
  for (let x = OLD_MOUTH.startX; x <= OLD_MOUTH.endX; x++) {
    const step = x - OLD_MOUTH.startX
    const height = 4 - Math.floor((step / length) * 2)
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      carveColumn(state, x, OLD_MOUTH.z + offsetZ, CAVE_GROUND_Y, CAVE_FLOOR_Y + height - (offsetZ === 0 ? 0 : 1))
    }
  }
}

/**
 * 前室到大廳的通道
 *
 * 照岩響窟的做法分兩趟：先沿折線算出每一步的地面高度（只往上起伏一格），
 * 每一格柱取覆蓋到它的步裡最高的那個，再一次挖完。
 * 一邊算一邊挖的話，相鄰兩步的 3×3 會互相填掉（岩響窟踩過兩次的坑）
 */
function carveTunnel(state: Uint8Array): void {
  const floorMap = new Map<string, number>()
  let travelled = 0

  for (let index = 0; index < TUNNEL_POINT_LIST.length - 1; index++) {
    const start = TUNNEL_POINT_LIST[index]!
    const end = TUNNEL_POINT_LIST[index + 1]!
    const stepCount = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z)) * 2)

    for (let step = 0; step <= stepCount; step++) {
      const ratio = step / stepCount
      const x = Math.round(start.x + (end.x - start.x) * ratio)
      const z = Math.round(start.z + (end.z - start.z) * ratio)
      travelled += 1
      /** 起伏沿走過的距離取噪音，抬起來的那幾格才連成一段緩坡；頭尾兩段平的，接得上前室與大廳 */
      const isEndSegment = index === 0 || index === TUNNEL_POINT_LIST.length - 2
      const wave = fbm2D(travelled * 0.13, 7, 2, 0.5)
      const rise = !isEndSegment && wave > 0.1 ? 1 : 0

      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
          const key = `${x + offsetX},${z + offsetZ}`
          floorMap.set(key, Math.max(floorMap.get(key) ?? 0, CAVE_FLOOR_Y + rise))
        }
      }
    }
  }

  for (const [key, floorY] of floorMap) {
    const [x, z] = key.split(',').map(Number) as [number, number]
    /** 抬高的那一格是實心的岩：先填回來，露岩那一道會把它換成看得見的石頭 */
    for (let y = CAVE_FLOOR_Y + 1; y <= floorY; y++) {
      if (getBlock(state, x, y, z) === BlockId.AIR && !isWaterBlock(getBlock(state, x, y - 1, z))) {
        setBlock(state, x, y, z, BlockId.LAKE_BED)
      }
    }
    carveColumn(state, x, z, floorY + 1, floorY + 3)
  }
}

/**
 * 地底湖
 *
 * 照岩響窟那一池：往下挖、水面與洞底齊平。深兩格，湖心偏北一窪三格。
 * 底床先留著 LAKE_BED，露岩那一道會把貼著水的那一層換成石頭與碎石
 */
function carveLake(state: Uint8Array): void {
  const { x: centerX, z: centerZ } = UNDERGROUND_LAKE_CENTER
  const reach = UNDERGROUND_LAKE_RADIUS + 4

  for (let x = centerX - reach; x <= centerX + reach; x++) {
    for (let z = centerZ - reach; z <= centerZ + reach; z++) {
      if (getNoisyDistance(x, z, centerX, centerZ, 0.12, 3) > UNDERGROUND_LAKE_RADIUS)
        continue
      /** 湖只挖在大廳的地上：頭頂要是空的，才不會挖進岩壁裡變成一池封在石頭裡的水 */
      if (getBlock(state, x, CAVE_GROUND_Y, z) !== BlockId.AIR)
        continue

      const isDeep = getNoisyDistance(x, z, centerX + 2, centerZ - 4, 0.2, 2) < 5
      const depth = isDeep ? 3 : 2
      for (let y = CAVE_FLOOR_Y - depth + 1; y <= CAVE_FLOOR_Y; y++) {
        setBlock(state, x, y, z, BlockId.WATER)
      }
    }
  }
}

/** 某一點離地底湖的岸多遠（負值在湖裡） */
function measureLakeShoreDistance(x: number, z: number): number {
  return getNoisyDistance(x, z, UNDERGROUND_LAKE_CENTER.x, UNDERGROUND_LAKE_CENTER.z, 0.12, 3) - UNDERGROUND_LAKE_RADIUS
}

/**
 * 露岩：把貼著洞裡空氣與水的那一層岩換成看得見的石頭
 *
 * 地面那一層（上面是空的）：前室與舊洞口是碎石（岩響窟木座的碎石），大廳是石頭夾碎石與圓石，
 * 湖底是石頭與碎石。岩壁與洞頂是石頭夾一成多的圓石（岩響窟山體的配方），
 * 湖邊的岩壁長苔；少數幾格是礦，越往西越可能是好礦
 */
function exposeRockLining(state: Uint8Array): void {
  const random = createSeededRandom('cave-lining')
  const neighbourList = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const
  const westMostX = CAVE_BOUND.minX
  const eastMostX = GROTTO_CENTER.x

  for (let x = CAVE_BOUND.minX; x <= CAVE_BOUND.maxX; x++) {
    for (let z = CAVE_BOUND.minZ; z <= CAVE_BOUND.maxZ; z++) {
      for (let y = 1; y <= CEILING_LIMIT_Y + 1; y++) {
        if (getBlock(state, x, y, z) !== BlockId.LAKE_BED)
          continue

        const isExposed = neighbourList.some(([offsetX, offsetY, offsetZ]) =>
          isOpenCell(state, x + offsetX, y + offsetY, z + offsetZ))
        if (!isExposed)
          continue

        const aboveId = getBlock(state, x, y + 1, z)
        const isFloor = aboveId === BlockId.AIR || isWaterBlock(aboveId)
        const shoreDistance = measureLakeShoreDistance(x, z)

        if (isFloor) {
          if (isWaterBlock(aboveId)) {
            setBlock(state, x, y, z, random() < 0.35 ? BlockId.GRAVEL : BlockId.STONE)
          }
          else if (isGrottoFloor(x, z)) {
            setBlock(state, x, y, z, BlockId.GRAVEL)
          }
          else {
            const patch = fbm2D(x * 0.09 + 13, z * 0.09 - 21, 2, 0.5)
            const roll = random()
            let blockId: BlockId = BlockId.STONE
            if (patch > 0.25 || (shoreDistance < 3 && roll < 0.3))
              blockId = BlockId.GRAVEL
            else if (roll < 0.1)
              blockId = BlockId.COBBLESTONE
            setBlock(state, x, y, z, blockId)
          }
          continue
        }

        const roll = random()
        const depthRatio = (eastMostX - x) / (eastMostX - westMostX)
        let blockId: BlockId = BlockId.STONE
        if (roll < 0.035) {
          /** 越深越好：亂數乘上深度，西邊才輪得到金 */
          const pick = Math.min(ORE_LIST.length - 1, Math.floor(random() * (1 + depthRatio * 3)))
          blockId = ORE_LIST[pick] ?? BlockId.COAL_ORE
        }
        else if (shoreDistance < 5 && y <= CAVE_FLOOR_Y + 5 && roll < 0.4) {
          blockId = BlockId.MOSSY_COBBLESTONE
        }
        else if (roll < 0.16) {
          blockId = BlockId.COBBLESTONE
        }
        setBlock(state, x, y, z, blockId)
      }
    }
  }
}

/** 這一格柱從 fromY 往上第一格實心的岩，找不到回傳 -1 */
function findCeilingY(state: Uint8Array, x: number, z: number, fromY: number): number {
  for (let y = fromY; y <= CEILING_LIMIT_Y + 1; y++) {
    if (!isOpenCell(state, x, y, z))
      return y
  }
  return -1
}

/** 這一格柱從 fromY 往下第一格實心的岩 */
function findFloorY(state: Uint8Array, x: number, z: number, fromY: number): number {
  for (let y = fromY; y > 0; y--) {
    if (!isOpenCell(state, x, y, z))
      return y
  }
  return 0
}

/**
 * 石筍與鐘乳石
 *
 * 岩響窟的石筍是一圈圍著洞室的圓石，一到三格高。這裡湖邊照樣圍一圈，
 * 大廳裡再散一些；洞頂高的地方往下垂鐘乳石（同樣是圓石），有的正對著底下一根石筍，
 * 那是同一滴水在上下兩頭留下來的
 */
function placeSpeleothemList(state: Uint8Array): void {
  const random = createSeededRandom('cave-speleothem')

  const growStalagmite = (x: number, z: number, maxHeight: number) => {
    const floorY = findFloorY(state, x, z, CAVE_FLOOR_Y + 3)
    if (floorY < CAVE_FLOOR_Y || isWaterBlock(getBlock(state, x, floorY + 1, z)))
      return
    const ceilingY = findCeilingY(state, x, z, floorY + 1)
    const height = Math.min(maxHeight, ceilingY - floorY - 3)
    for (let level = 1; level <= height; level++) {
      setDecoration(state, x, floorY + level, z, BlockId.COBBLESTONE)
    }
  }

  /** 湖邊一圈，照岩響窟洞室那一圈 */
  for (let attempt = 0; attempt < 46; attempt++) {
    const angle = random() * Math.PI * 2
    const radius = UNDERGROUND_LAKE_RADIUS + 2 + random() * 4
    growStalagmite(
      UNDERGROUND_LAKE_CENTER.x + Math.round(Math.cos(angle) * radius),
      UNDERGROUND_LAKE_CENTER.z + Math.round(Math.sin(angle) * radius),
      1 + Math.floor(random() * 3),
    )
  }

  for (let attempt = 0; attempt < 140; attempt++) {
    const x = HALL_CENTER.x + Math.round((random() * 2 - 1) * HALL_RADIUS_X)
    const z = HALL_CENTER.z + Math.round((random() * 2 - 1) * HALL_RADIUS_Z)
    const distance = measureHallDistance(x, z)
    if (distance >= 0.95)
      continue

    const floorY = findFloorY(state, x, z, CAVE_FLOOR_Y + 3)
    const ceilingY = findCeilingY(state, x, z, floorY + 1)
    if (ceilingY < 0)
      continue

    /** 洞頂夠高才垂，垂下來的底端離地至少還有四格，人走得過去 */
    const room = ceilingY - floorY - 1
    if (room >= 8) {
      const length = Math.min(room - 4, 1 + Math.floor(random() * 4))
      for (let level = 1; level <= length; level++) {
        setDecoration(state, x, ceilingY - level, z, BlockId.COBBLESTONE)
      }
      if (random() < 0.35) {
        growStalagmite(x, z, 1 + Math.floor(random() * 2))
      }
    }
    else if (distance > 0.55 && random() < 0.5) {
      growStalagmite(x, z, 1 + Math.floor(random() * 3))
    }
  }
}

/**
 * 最深處的兩顆鑽石
 *
 * 照岩響窟：交給機率的話它幾乎不會出現，那等於白做一種方塊。
 * 嵌在地底湖後面（大廳最西側）的岩壁上，走到湖的那一頭抬頭看見兩點微光
 */
function placeDiamondList(state: Uint8Array): void {
  const random = createSeededRandom('cave-diamond')
  let diamondCount = 0

  for (let attempt = 0; attempt < 400 && diamondCount < 2; attempt++) {
    const x = HALL_CENTER.x - HALL_RADIUS_X + Math.floor(random() * 14)
    const z = UNDERGROUND_LAKE_CENTER.z + Math.round((random() * 2 - 1) * 14)
    const y = CAVE_FLOOR_Y + 2 + Math.floor(random() * 5)
    const blockId = getBlock(state, x, y, z)
    /** 一定要嵌在露出來的岩壁上：嵌進不畫的岩裡等於沒有 */
    if (blockId !== BlockId.STONE && blockId !== BlockId.COBBLESTONE)
      continue
    if (!isOpenCell(state, x + 1, y, z) && !isOpenCell(state, x, y, z + 1) && !isOpenCell(state, x, y, z - 1))
      continue

    setBlock(state, x, y, z, BlockId.DIAMOND_ORE)
    diamondCount++
  }
}

/**
 * 洞頂的螢光地衣
 *
 * 螢光洞窟的岩：大廳洞頂與高處岩壁上，一片一片冷藍綠的地衣（GLOW_LICHEN）。
 * 只長在離地八格以上、露在空氣裡的岩上，疏密跟著 measureGlowDensity：
 * 渲染端洞頂那層螢光蟲也讀同一份，兩者長在同一片。
 * 鐘乳石（圓石）不長，石柱也不長，免得整根柱子發光
 */
function placeGlowLichen(state: Uint8Array): void {
  const random = createSeededRandom('cave-lichen')
  const minY = CAVE_FLOOR_Y + 8

  for (let x = HALL_CENTER.x - HALL_RADIUS_X - 6; x <= HALL_CENTER.x + HALL_RADIUS_X + 6; x++) {
    for (let z = HALL_CENTER.z - HALL_RADIUS_Z - 6; z <= HALL_CENTER.z + HALL_RADIUS_Z + 6; z++) {
      const density = measureGlowDensity(x, z)
      if (density < 0.2 || isInPillar(x, z))
        continue

      for (let y = minY; y <= CEILING_LIMIT_Y + 1; y++) {
        const blockId = getBlock(state, x, y, z)
        if (blockId !== BlockId.STONE && blockId !== BlockId.MOSSY_COBBLESTONE)
          continue

        const isCeiling = isOpenCell(state, x, y - 1, z)
        const isWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) =>
          isOpenCell(state, x + offsetX!, y, z + offsetZ!))
        if (!isCeiling && !isWall)
          continue

        /**
         * 只長在岩縫與小叢上（measureGlowVein），不是整片貼滿：
         * 縫心機率高、往兩側掉，邊緣零星幾塊，光禿的岩面一塊也沒有。
         * 洞頂那一片星空由渲染端的螢光蟲點陣擔綱，地衣只是幾處暗淡的苔斑
         */
        const chance = (isCeiling ? 0.7 : 0.4) * measureGlowVein(x, y, z) * (0.35 + density * 0.65)
        if (random() < chance) {
          setBlock(state, x, y, z, BlockId.GLOW_LICHEN)
        }
      }
    }
  }
}

/** 舊洞口盡頭坍下來的一堆碎石與圓石，越往裡堆得越高 */
function placeRubble(state: Uint8Array): void {
  const random = createSeededRandom('cave-rubble')

  for (let x = OLD_MOUTH.endX - 3; x <= OLD_MOUTH.endX; x++) {
    const pileHeight = x - (OLD_MOUTH.endX - 3) + 1
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const z = OLD_MOUTH.z + offsetZ
      for (let level = 0; level < pileHeight - (offsetZ === 0 ? 1 : 0); level++) {
        const y = CAVE_GROUND_Y + level
        if (getBlock(state, x, y, z) !== BlockId.AIR)
          continue
        setBlock(state, x, y, z, random() < 0.6 ? BlockId.GRAVEL : BlockId.COBBLESTONE)
      }
    }
  }
}

/** 在這一格的地上擺一盞燈籠；腳下要是岩、頭上要是空的，水也撐不住燈 */
function placeLanternAt(state: Uint8Array, x: number, z: number): boolean {
  const floorY = findFloorY(state, x, z, CAVE_FLOOR_Y + 3)
  if (isPassableBlock(getBlock(state, x, floorY, z)) || isWaterBlock(getBlock(state, x, floorY, z)))
    return false
  if (getBlock(state, x, floorY + 1, z) !== BlockId.AIR)
    return false

  setBlock(state, x, floorY + 1, z, BlockId.LANTERN)
  return true
}

/**
 * 燈籠
 *
 * 岩響窟是洞口、通道、洞室各一盞，洞口兩側各一盞石燈籠。
 * 這裡前室照樣兩盞石燈籠夾著通道口、門邊一盞，通道裡兩盞，
 * 大廳裡一路從通道口擺到湖邊，湖岸再三盞——夜裡（洞裡永遠是夜裡）照著燈走就走得到湖
 */
function placeLanternList(state: Uint8Array): void {
  const tunnelMouth = TUNNEL_POINT_LIST[0]!
  placeStoneLantern(state, tunnelMouth.x + 2, CAVE_GROUND_Y, tunnelMouth.z - 3)
  placeStoneLantern(state, tunnelMouth.x + 2, CAVE_GROUND_Y, tunnelMouth.z + 3)

  /** 門的南側兩格（木牌在北側），夜裡從前室望回來，門就在這盞燈旁邊 */
  placeLanternAt(state, CAVE_PORTAL_POINT.x - 1, CAVE_PORTAL_POINT.z + 3)

  const pointList = [
    { x: TUNNEL_POINT_LIST[1]!.x, z: TUNNEL_POINT_LIST[1]!.z - 2 },
    { x: TUNNEL_POINT_LIST[2]!.x, z: TUNNEL_POINT_LIST[2]!.z + 2 },
    /** 大廳：從通道口一路彎向西南的湖 */
    { x: HALL_CENTER.x + 36, z: HALL_CENTER.z + 5 },
    { x: HALL_CENTER.x + 26, z: HALL_CENTER.z + 2 },
    { x: HALL_CENTER.x + 15, z: HALL_CENTER.z + 4 },
    { x: HALL_CENTER.x + 5, z: HALL_CENTER.z + 1 },
    { x: HALL_CENTER.x - 4, z: HALL_CENTER.z + 5 },
    /** 湖岸 */
    { x: UNDERGROUND_LAKE_CENTER.x + UNDERGROUND_LAKE_RADIUS + 2, z: UNDERGROUND_LAKE_CENTER.z },
    { x: UNDERGROUND_LAKE_CENTER.x, z: UNDERGROUND_LAKE_CENTER.z - UNDERGROUND_LAKE_RADIUS - 3 },
    { x: UNDERGROUND_LAKE_CENTER.x - 4, z: UNDERGROUND_LAKE_CENTER.z + UNDERGROUND_LAKE_RADIUS + 2 },
    /** 石柱腳下各一盞，光打在柱子上才看得出前後 */
    ...PILLAR_LIST.map((pillar) => ({
      x: HALL_CENTER.x + pillar.offsetX + Math.ceil(pillar.radius) + 1,
      z: HALL_CENTER.z + pillar.offsetZ,
    })),
  ]

  /** 指定的那一格放不下（落在水裡、石筍上）就在旁邊找一格 */
  for (const point of pointList) {
    for (const offset of [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 2, z: 2 }]) {
      if (placeLanternAt(state, point.x + offset.x, point.z + offset.z))
        break
    }
  }

  /**
   * 沿著大廳的牆腳一圈
   *
   * 大廳九十格寬，只靠路上那幾盞，站在中間望出去四周是一片黑，看不出這個洞有多大。
   * 牆腳每隔一段一盞，燈照亮那一片岩壁，整座大廳的輪廓才一塊一塊浮出來。
   * 牆吃噪音，從橢圓外緣往中心一步一步找，第一個擺得下的地方就是牆腳
   */
  const wallLanternCount = 14
  for (let index = 0; index < wallLanternCount; index++) {
    const angle = ((index + 0.5) / wallLanternCount) * Math.PI * 2
    for (let ratio = 1; ratio > 0.6; ratio -= 0.03) {
      const x = HALL_CENTER.x + Math.round(Math.cos(angle) * HALL_RADIUS_X * ratio)
      const z = HALL_CENTER.z + Math.round(Math.sin(angle) * HALL_RADIUS_Z * ratio)
      if (measureLakeShoreDistance(x, z) < 2)
        break
      if (placeLanternAt(state, x, z))
        break
    }
  }
}

/**
 * 蛛網
 *
 * 岩響窟的蛛網掛在洞頂，時間感全靠它。這裡掛在矮的地方：
 * 大廳牆腳、通道與前室的頂角，貼著岩、頭頂是岩的那幾格
 */
function placeCobwebList(state: Uint8Array): void {
  const random = createSeededRandom('cave-cobweb')
  let placedCount = 0

  for (let attempt = 0; attempt < 3000 && placedCount < 70; attempt++) {
    const x = CAVE_BOUND.minX + Math.floor(random() * (CAVE_BOUND.maxX - CAVE_BOUND.minX))
    const z = CAVE_BOUND.minZ + Math.floor(random() * (CAVE_BOUND.maxZ - CAVE_BOUND.minZ))
    const y = CAVE_FLOOR_Y + 3 + Math.floor(random() * 4)
    if (getBlock(state, x, y, z) !== BlockId.AIR || isOpenCell(state, x, y + 1, z))
      continue

    const wallCount = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .filter(([offsetX, offsetZ]) => !isOpenCell(state, x + offsetX!, y, z + offsetZ!))
      .length
    if (wallCount === 0)
      continue

    setBlock(state, x, y, z, BlockId.COBWEB)
    placedCount++
  }
}

/**
 * 前室碎石上的蕨與石生植物
 *
 * 岩響窟山腳的碎石上長著這兩種耐陰的草。門前那一條（門洞前後與落腳的地方）留空
 */
function scatterGrottoPlantList(state: Uint8Array): void {
  const random = createSeededRandom('cave-plant')

  for (let x = GROTTO_CENTER.x - GROTTO_RADIUS_X; x <= GROTTO_CENTER.x + GROTTO_RADIUS_X; x++) {
    for (let z = GROTTO_CENTER.z - GROTTO_RADIUS_Z; z <= GROTTO_CENTER.z + GROTTO_RADIUS_Z; z++) {
      if (Math.abs(z - CAVE_PORTAL_POINT.z) <= 1)
        continue
      if (getBlock(state, x, CAVE_FLOOR_Y, z) !== BlockId.GRAVEL || getBlock(state, x, CAVE_GROUND_Y, z) !== BlockId.AIR)
        continue
      if (random() > 0.22)
        continue

      plantWithStack(state, x, CAVE_GROUND_Y, z, random() < 0.5 ? BlockId.FERN : BlockId.STONE_PLANT, random)
    }
  }
}

/** 生成整座地底洞窟 */
export function generateCaveWorld(state: Uint8Array): void {
  /** 整個世界先是實心、不畫的岩 */
  state.fill(BlockId.LAKE_BED)

  carveHall(state)
  carveGrotto(state)
  carveTunnel(state)
  carveLake(state)
  exposeRockLining(state)
  placeSpeleothemList(state)
  placeGlowLichen(state)
  placeDiamondList(state)
  placeRubble(state)
  placeLanternList(state)
  placeCobwebList(state)
  scatterGrottoPlantList(state)
  /** 細節排在所有造景之後：鐘乳石的尖要接在已經垂下來的石柱底下（見 cave-detail） */
  decorateCaveDetail(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of CAVE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
