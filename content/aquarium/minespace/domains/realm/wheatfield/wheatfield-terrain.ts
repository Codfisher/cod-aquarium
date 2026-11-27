import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { fillBox, placeStoneLantern } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { fillHeightStep } from '../realm-terrain-kit'
import {
  isWheatfieldRoad,
  measureWheatfieldHeight,
  measureWheatfieldRadius,
  WHEATFIELD_CENTER,
  WHEATFIELD_GROUND_Y,
  WHEATFIELD_OUTER_RADIUS,
  WHEATFIELD_PORTAL_POINT,
  WHEATFIELD_ROAD_HALF_WIDTH,
  WHEATFIELD_SLOW_RADIUS,
} from './wheatfield-layout'
import { WHEATFIELD_REALM } from './wheatfield-realm'

/**
 * 千頃麥浪的地形
 *
 * 只有地形 worker 用。整片照麥浪田（buildWheatGarden）放大：
 * 土地上麥子照壟種、每四行空一行，兩成抽了穗；碎石路三格寬；
 * 稻草人（竹竿、橫桿、草束當頭）、田邊一捆捆草束、路邊的石燈籠；空著的壟上冒出蒲公英與堇。
 * 箱庭只有一塊田，這裡是一塊接一塊：田與田之間一道一格寬的空壟（田埂），
 * 每塊田的壟各走各的方向、抽穗的多寡也不一樣，遠看才是拼起來的一片，而不是一塊布。
 *
 * 順序有講究：先有地面與路，麥子才知道哪裡不能種；稻草人、草束、燈籠蓋在麥子上，
 * 野花最後撒在空壟裡，傳送門排在最後，門洞與木牌前面那幾格要清乾淨
 */

/** 一塊田的寬度範圍（格），田埂之間的距離 */
const PLOT_SIZE_RANGE: [number, number] = [16, 28]

/** 每四行空一行，與麥浪田同一個間距 */
const ROW_PERIOD = 4

/** 一塊田抽穗的比例範圍，麥浪田是兩成 */
const TALL_SHARE_RANGE: [number, number] = [0.12, 0.32]

/** 空壟上冒出野花的機率，與麥浪田同一個數字 */
const WILDFLOWER_CHANCE = 0.06

/** 有稻草人的田的比例 */
const SCARECROW_CHANCE = 0.4

/** 路邊石燈籠的間距（格），從十字路口往外數 */
const LANTERN_SPACING = 24

/** 石燈籠離路中心幾格：路寬三格，燈籠站在路邊往田裡一格 */
const LANTERN_ROAD_OFFSET = 3

/** 一塊田：兩個方向上的起訖（不含田埂那一格），壟走哪個方向，抽穗多少 */
interface WheatPlot {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  isAlongX: boolean;
  tallShare: number;
}

/**
 * 田埂的位置
 *
 * 從路（中心）往兩側各自隨機隔十幾二十幾格一道，一路排到世界邊緣。
 * 路本身也是一道分界，所以中心那一格也算在裡面
 */
function createBoundaryList(center: number, random: () => number): number[] {
  const [min, max] = PLOT_SIZE_RANGE
  const boundaryList = [center]
  for (const direction of [-1, 1]) {
    let position = center
    while (position > 0 && position < WORLD_SIZE - 1) {
      position += direction * Math.round(min + random() * (max - min))
      boundaryList.push(Math.max(0, Math.min(WORLD_SIZE - 1, position)))
    }
  }
  return [...new Set(boundaryList)].sort((a, b) => a - b)
}

/** 由田埂切出一塊一塊的田 */
function createPlotList(boundaryXList: number[], boundaryZList: number[], random: () => number): WheatPlot[] {
  const plotList: WheatPlot[] = []
  for (let indexX = 0; indexX < boundaryXList.length - 1; indexX++) {
    for (let indexZ = 0; indexZ < boundaryZList.length - 1; indexZ++) {
      const [tallMin, tallMax] = TALL_SHARE_RANGE
      plotList.push({
        minX: boundaryXList[indexX]! + 1,
        maxX: boundaryXList[indexX + 1]! - 1,
        minZ: boundaryZList[indexZ]! + 1,
        maxZ: boundaryZList[indexZ + 1]! - 1,
        isAlongX: random() < 0.5,
        tallShare: tallMin + random() * (tallMax - tallMin),
      })
    }
  }
  return plotList
}

/** 地面與路，回傳每一格的地表高度 */
function shapeTerrain(state: Uint8Array): Uint8Array {
  const groundTopMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  fillBox(state, 0, 0, 0, WORLD_SIZE - 1, 0, WORLD_SIZE - 1, BlockId.BEDROCK)

  /** 先算整張高度圖，填成相鄰兩格最多差一格，人才走得上每一道坡 */
  const heightMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measureWheatfieldHeight(x, z)
    }
  }
  fillHeightStep(heightMap)

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 緩坡外面：碰撞照算、不畫，由布景的地面平面代替 */
      if (measureWheatfieldRadius(x, z) >= WHEATFIELD_OUTER_RADIUS) {
        for (let y = 1; y < WHEATFIELD_GROUND_Y; y++) {
          setBlock(state, x, y, z, BlockId.STONE)
        }
        setBlock(state, x, WHEATFIELD_GROUND_Y, z, BlockId.LAKE_BED)
        groundTopMap[x * WORLD_SIZE + z] = WHEATFIELD_GROUND_Y
        continue
      }

      const topY = WHEATFIELD_GROUND_Y + heightMap[x * WORLD_SIZE + z]!
      for (let y = 1; y < topY - 2; y++) {
        setBlock(state, x, y, z, BlockId.STONE)
      }
      for (let y = topY - 2; y < topY; y++) {
        setBlock(state, x, y, z, BlockId.DIRT)
      }
      setBlock(state, x, topY, z, isWheatfieldRoad(x, z) ? BlockId.GRAVEL : BlockId.DIRT)
      groundTopMap[x * WORLD_SIZE + z] = topY
    }
  }

  return groundTopMap
}

/**
 * 種麥
 *
 * 每一塊田照自己的方向種壟，從田埂往裡數、每四行空一行；
 * 田埂那一格本身是空的。路上與緩坡外不種
 */
function plantWheat(state: Uint8Array, groundTopMap: Uint8Array, plotList: WheatPlot[]): void {
  const random = createSeededRandom('wheatfield-wheat')

  for (const plot of plotList) {
    for (let x = plot.minX; x <= plot.maxX; x++) {
      for (let z = plot.minZ; z <= plot.maxZ; z++) {
        const rowOffset = plot.isAlongX ? z - plot.minZ + 1 : x - plot.minX + 1
        if (rowOffset % ROW_PERIOD === 0)
          continue
        if (isWheatfieldRoad(x, z) || measureWheatfieldRadius(x, z) >= WHEATFIELD_OUTER_RADIUS)
          continue

        const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
        if (getBlock(state, x, groundY - 1, z) !== BlockId.DIRT)
          continue
        setBlock(state, x, groundY, z, random() < plot.tallShare ? BlockId.WHEAT_TALL : BlockId.WHEAT)
      }
    }
  }
}

/**
 * 稻草人
 *
 * 一根竹竿、一根橫桿、一顆草束當頭，與麥浪田那一個一樣。
 * 四成的田各立一個，站在田中央附近的麥子裡；太靠外圍的田不立，人走不到那裡
 */
function placeScarecrowList(state: Uint8Array, groundTopMap: Uint8Array, plotList: WheatPlot[]): void {
  const random = createSeededRandom('wheatfield-scarecrow')

  for (const plot of plotList) {
    const roll = random()
    const offsetX = random() - 0.5
    const offsetZ = random() - 0.5
    const isFacingX = random() < 0.5
    if (roll > SCARECROW_CHANCE || plot.maxX - plot.minX < 8 || plot.maxZ - plot.minZ < 8)
      continue

    const x = Math.round((plot.minX + plot.maxX) / 2 + offsetX * (plot.maxX - plot.minX) * 0.4)
    const z = Math.round((plot.minZ + plot.maxZ) / 2 + offsetZ * (plot.maxZ - plot.minZ) * 0.4)
    if (Math.hypot(x - WHEATFIELD_CENTER.x, z - WHEATFIELD_CENTER.z) > WHEATFIELD_SLOW_RADIUS + 6)
      continue
    if (Math.hypot(x - WHEATFIELD_PORTAL_POINT.x, z - WHEATFIELD_PORTAL_POINT.z) < 8)
      continue

    const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
    /** 橫桿兩端也要落在同一層：站在台階邊上的話一隻手會插進土裡 */
    const armList = isFacingX ? [{ x: x - 1, z }, { x: x + 1, z }] : [{ x, z: z - 1 }, { x, z: z + 1 }]
    if (armList.some((arm) => groundTopMap[arm.x * WORLD_SIZE + arm.z]! + 1 !== groundY))
      continue

    for (let level = 0; level < 3; level++) {
      setBlock(state, x, groundY + level, z, BlockId.BAMBOO_BLOCK)
    }
    for (const arm of armList) {
      setBlock(state, arm.x, groundY + 2, arm.z, BlockId.BAMBOO_BLOCK)
    }
    setBlock(state, x, groundY + 3, z, BlockId.HAY)
  }
}

/** 路上某一段的方向與路中心：沿路走 distance 格、往路的哪一側偏 side 格 */
interface RoadArm {
  /** 沿路前進的方向 */
  directionX: number;
  directionZ: number;
  /** 這條路走到多遠為止（從十字路口量） */
  length: number;
}

/** 南、北、西三條從十字路口出去的路，東邊那條只到回程門 */
const ROAD_ARM_LIST: RoadArm[] = [
  { directionX: 0, directionZ: 1, length: WHEATFIELD_SLOW_RADIUS + 6 },
  { directionX: 0, directionZ: -1, length: WHEATFIELD_SLOW_RADIUS + 6 },
  { directionX: -1, directionZ: 0, length: WHEATFIELD_SLOW_RADIUS + 6 },
]

/** 路邊某一點：沿路 distance 格，往右手邊（side 1）或左手邊（-1）離路中心 offset 格 */
function atRoadSide(arm: RoadArm, distance: number, side: number, offset: number): { x: number; z: number } {
  return {
    x: WHEATFIELD_CENTER.x + arm.directionX * distance - arm.directionZ * side * offset,
    z: WHEATFIELD_CENTER.z + arm.directionZ * distance + arm.directionX * side * offset,
  }
}

/** 這一格能不能放東西：是土、上面只有麥子或空氣 */
function isFieldCell(state: Uint8Array, groundTopMap: Uint8Array, x: number, z: number): boolean {
  const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
  const above = getBlock(state, x, groundY, z)
  return getBlock(state, x, groundY - 1, z) === BlockId.DIRT
    && (above === BlockId.AIR || above === BlockId.WHEAT || above === BlockId.WHEAT_TALL)
}

/**
 * 路邊的石燈籠
 *
 * 麥浪田兩盞，一盞在路北頭的西邊、一盞在路南頭的東邊。這裡沿著三條路每二十四格一盞、左右交錯，
 * 十字路口對角兩盞，回程門南側一盞：夜裡整片田沉進黑裡，只剩一條一條的燈指著路
 */
function placeLanternList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const pointList: { x: number; z: number }[] = [
    { x: WHEATFIELD_PORTAL_POINT.x - 1, z: WHEATFIELD_PORTAL_POINT.z + LANTERN_ROAD_OFFSET },
    { x: WHEATFIELD_CENTER.x - LANTERN_ROAD_OFFSET, z: WHEATFIELD_CENTER.z - LANTERN_ROAD_OFFSET },
    { x: WHEATFIELD_CENTER.x + LANTERN_ROAD_OFFSET, z: WHEATFIELD_CENTER.z + LANTERN_ROAD_OFFSET },
  ]
  for (const [armIndex, arm] of ROAD_ARM_LIST.entries()) {
    for (let distance = LANTERN_SPACING; distance < arm.length; distance += LANTERN_SPACING) {
      const side = (distance / LANTERN_SPACING + armIndex) % 2 === 0 ? 1 : -1
      pointList.push(atRoadSide(arm, distance, side, LANTERN_ROAD_OFFSET))
    }
  }

  for (const point of pointList) {
    if (!isFieldCell(state, groundTopMap, point.x, point.z))
      continue
    const groundY = groundTopMap[point.x * WORLD_SIZE + point.z]! + 1
    setBlock(state, point.x, groundY, point.z, BlockId.AIR)
    placeStoneLantern(state, point.x, groundY, point.z)
  }
}

/**
 * 田邊的草束
 *
 * 麥浪田在田邊散著三捆，有的疊兩層。這裡沿著路每隔二三十格一堆，左右隨機，
 * 一堆兩到四捆、散在路邊幾格內，像收割的人順手堆在那裡的
 */
function placeHayList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('wheatfield-hay')

  for (const arm of ROAD_ARM_LIST) {
    for (let distance = 10 + random() * 12; distance < arm.length - 4; distance += 22 + random() * 14) {
      const side = random() < 0.5 ? 1 : -1
      const baleCount = 2 + Math.floor(random() * 3)
      for (let bale = 0; bale < baleCount; bale++) {
        const point = atRoadSide(
          arm,
          Math.round(distance + (random() - 0.5) * 5),
          side,
          WHEATFIELD_ROAD_HALF_WIDTH + 2 + Math.floor(random() * 4),
        )
        const isStacked = random() < 0.4
        if (!isFieldCell(state, groundTopMap, point.x, point.z))
          continue
        const groundY = groundTopMap[point.x * WORLD_SIZE + point.z]! + 1
        setBlock(state, point.x, groundY, point.z, BlockId.HAY)
        if (isStacked) {
          setBlock(state, point.x, groundY + 1, point.z, BlockId.HAY)
        }
      }
    }
  }
}

/**
 * 空壟上的野花
 *
 * 與麥浪田同一個機率、同一對花：蒲公英與堇各半，只開在沒種麥的土上（田埂、空著的那幾行、路邊）
 */
function scatterWildflowerList(state: Uint8Array, groundTopMap: Uint8Array): void {
  const random = createSeededRandom('wheatfield-flower')

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (random() > WILDFLOWER_CHANCE)
        continue
      const isDandelion = random() < 0.5
      if (measureWheatfieldRadius(x, z) >= WHEATFIELD_OUTER_RADIUS)
        continue
      const groundY = groundTopMap[x * WORLD_SIZE + z]! + 1
      if (getBlock(state, x, groundY - 1, z) !== BlockId.DIRT || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      setBlock(state, x, groundY, z, isDandelion ? BlockId.FLOWER_DANDELION : BlockId.FLOWER_VIOLA)
    }
  }
}

/** 生成整片千頃麥浪 */
export function generateWheatfieldWorld(state: Uint8Array): void {
  const random = createSeededRandom('wheatfield-plot')
  const boundaryXList = createBoundaryList(WHEATFIELD_CENTER.x, random)
  const boundaryZList = createBoundaryList(WHEATFIELD_CENTER.z, random)
  const plotList = createPlotList(boundaryXList, boundaryZList, random)

  const groundTopMap = shapeTerrain(state)
  plantWheat(state, groundTopMap, plotList)
  placeScarecrowList(state, groundTopMap, plotList)
  placeLanternList(state, groundTopMap)
  placeHayList(state, groundTopMap)
  scatterWildflowerList(state, groundTopMap)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of WHEATFIELD_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
