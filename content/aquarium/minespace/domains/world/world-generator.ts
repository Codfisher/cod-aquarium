import { createSeededRandom, fbm2D, fbm3D, smoothStep } from '../../utils/noise'
import { BlockId, isPassableBlock } from '../block/block-constants'
import {
  getBiomeWeightList,
  getDominantBiomeId,
  getIslandDistance,
  ISLAND_BEACH_RADIUS,
  ISLAND_SEA_RADIUS,
  ISLAND_SHORE_RADIUS,
  ISLAND_WATER_RADIUS,
  SNOW_LINE,
} from './biome'
import { placeStructures, WATERFALL_POSITION } from './structure-generator'
import { getBlock, setBlock } from './world-access'
import {
  isInsideWorld,
  SEA_LEVEL,
  WORLD_HEIGHT,
  WORLD_SIZE,
} from './world-constants'

/** 海床高度，島嶼邊緣的地形會往這個高度沉下去 */
const SEA_FLOOR_HEIGHT = 5
/**
 * 沙灘頂端的高度
 *
 * 剛好壓在 getSurfaceBlock 判定為沙的上限，
 * 整片沙灘才會是沙，草地則在沙灘上緣接住
 */
const BEACH_TOP_HEIGHT = SEA_LEVEL + 2
/** 沙丘起伏，沙灘完全平坦會像一圈貼上去的色帶 */
const DUNE_AMPLITUDE = 0.8

interface PathPoint {
  x: number;
  z: number;
}

/**
 * 主河道：自雪山南麓蜿蜒穿過草原，於南岸入海
 *
 * 最後兩點是島放大後補的，河得一路流到新的海岸線才有入海口，
 * 否則河道會在半路憑空斷在草原中央
 */
const MAIN_RIVER_PATH: PathPoint[] = [
  { x: 124, z: 52 },
  { x: 114, z: 72 },
  { x: 102, z: 90 },
  { x: 96, z: 110 },
  { x: 98, z: 132 },
  { x: 104, z: 152 },
  { x: 110, z: 172 },
  { x: 112, z: 188 },
  { x: 116, z: 204 },
]

/** 山澗：自瀑布下的水潭流入主河道 */
const MOUNTAIN_STREAM_PATH: PathPoint[] = [
  { x: WATERFALL_POSITION.x, z: WATERFALL_POSITION.z },
  { x: 117, z: 73 },
  { x: 114, z: 72 },
]

interface PolylineProjection {
  /** 到折線的最短水平距離 */
  distance: number;
  /** 最近點在折線上的正規化位置（0 ~ 1） */
  ratio: number;
}

/** 求水平座標到折線的最短距離與位置比例 */
function projectToPolyline(path: PathPoint[], x: number, z: number): PolylineProjection {
  const segmentLengthList: number[] = []
  let totalLength = 0

  for (let index = 0; index < path.length - 1; index++) {
    const start = path[index]!
    const end = path[index + 1]!
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    segmentLengthList.push(length)
    totalLength += length
  }

  let bestDistance = Number.POSITIVE_INFINITY
  let bestArcLength = 0
  let accumulated = 0

  for (let index = 0; index < path.length - 1; index++) {
    const start = path[index]!
    const end = path[index + 1]!
    const segmentX = end.x - start.x
    const segmentZ = end.z - start.z
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ

    const rawRatio = segmentLengthSquared === 0
      ? 0
      : ((x - start.x) * segmentX + (z - start.z) * segmentZ) / segmentLengthSquared
    const clampedRatio = Math.max(0, Math.min(1, rawRatio))

    const closestX = start.x + segmentX * clampedRatio
    const closestZ = start.z + segmentZ * clampedRatio
    const distance = Math.hypot(x - closestX, z - closestZ)

    if (distance < bestDistance) {
      bestDistance = distance
      bestArcLength = accumulated + segmentLengthList[index]! * clampedRatio
    }

    accumulated += segmentLengthList[index]!
  }

  return {
    distance: bestDistance,
    ratio: totalLength === 0 ? 0 : bestArcLength / totalLength,
  }
}

/** 計算單一水平座標的基礎地形高度 */
function getTerrainHeight(x: number, z: number): number {
  const weightList = getBiomeWeightList(x, z)

  let height = 0
  let alpineWeight = 0

  for (const { biome, weight } of weightList) {
    if (weight <= 0)
      continue

    const noise = fbm2D(x * biome.frequency, z * biome.frequency, 4, 0.5)
    height += (biome.baseHeight + noise * biome.amplitude) * weight

    if (biome.id === 'alpine') {
      alpineWeight = weight
    }
  }

  /** 雪山加上山脊噪音，讓稜線更有存在感 */
  if (alpineWeight > 0) {
    const ridge = 1 - Math.abs(fbm2D(x * 0.022, z * 0.022, 3, 0.5))
    height += ridge * ridge * 11 * alpineWeight
  }

  return shapeCoast(height, x, z)
}

/**
 * 把內陸高度收成海岸的剖面
 *
 * 內陸 → 下坡 → 沙灘 → 淺灘四段接起來。
 * 關鍵是中間那段沙灘：高度只從 BEACH_TOP_HEIGHT 緩緩掉到海平面，
 * 八格的寬度都還踩得到沙，海岸才是一片走得起來的沙灘，
 * 而不是一條把陸地與海切開的線
 */
function shapeCoast(inlandHeight: number, x: number, z: number): number {
  const distance = getIslandDistance(x, z)

  if (distance <= ISLAND_SHORE_RADIUS) {
    return inlandHeight
  }

  /** 下坡：內陸高度平滑降到沙灘頂 */
  if (distance <= ISLAND_BEACH_RADIUS) {
    const ratio = smoothStep(
      (distance - ISLAND_SHORE_RADIUS) / (ISLAND_BEACH_RADIUS - ISLAND_SHORE_RADIUS),
    )

    return inlandHeight + (BEACH_TOP_HEIGHT - inlandHeight) * ratio
  }

  /** 沙丘只鋪在沙灘與淺灘上，內陸有自己的地形起伏 */
  const dune = fbm2D(x * 0.09, z * 0.09, 2, 0.5) * DUNE_AMPLITUDE

  /** 沙灘：緩緩傾向海平面，這一段就是乾的沙灘 */
  if (distance <= ISLAND_WATER_RADIUS) {
    const ratio = (distance - ISLAND_BEACH_RADIUS) / (ISLAND_WATER_RADIUS - ISLAND_BEACH_RADIUS)

    return BEACH_TOP_HEIGHT + (SEA_LEVEL - BEACH_TOP_HEIGHT) * ratio + dune
  }

  /** 淺灘：出了海岸線一路沉到海床 */
  const ratio = smoothStep(
    Math.min(1, (distance - ISLAND_WATER_RADIUS) / (ISLAND_SEA_RADIUS - ISLAND_WATER_RADIUS)),
  )

  return SEA_LEVEL + (SEA_FLOOR_HEIGHT - SEA_LEVEL) * ratio + dune * (1 - ratio)
}

interface RiverSample {
  /** 河道影響強度 0 ~ 1 */
  strength: number;
  /** 河床高度 */
  bedHeight: number;
  /** 水面高度 */
  waterLevel: number;
}

/** 沿著河道折線取樣，回傳該座標受河道影響的程度與水位 */
function sampleRiver(
  path: PathPoint[],
  x: number,
  z: number,
  halfWidth: number,
  bankWidth: number,
  levelList: number[],
): RiverSample {
  const { distance, ratio } = projectToPolyline(path, x, z)
  const influence = halfWidth + bankWidth

  if (distance > influence) {
    return { strength: 0, bedHeight: 0, waterLevel: 0 }
  }

  const position = ratio * (levelList.length - 1)
  const lowIndex = Math.floor(position)
  const highIndex = Math.min(levelList.length - 1, lowIndex + 1)
  const blend = position - lowIndex
  const waterLevel = levelList[lowIndex]! * (1 - blend) + levelList[highIndex]! * blend

  const strength = distance <= halfWidth
    ? 1
    : smoothStep(1 - (distance - halfWidth) / bankWidth)

  return {
    strength,
    bedHeight: waterLevel - 2.5,
    waterLevel,
  }
}

/**
 * 算出河道各節點的水位
 *
 * 水位不能只看河道中心線的地形：河岸兩側若比中心低，
 * 水面就會高過河堤浮在半空中。這裡連同兩側河岸一起取樣，取最低的那個。
 */
function createWaterLevelList(
  path: PathPoint[],
  endLevel: number,
  bankOffset: number,
): number[] {
  const levelList = path.map((point, index) => {
    /** 河道在此處的走向，用來算出垂直於河道的兩側方向 */
    const previous = path[Math.max(0, index - 1)]!
    const next = path[Math.min(path.length - 1, index + 1)]!
    const directionX = next.x - previous.x
    const directionZ = next.z - previous.z
    const length = Math.hypot(directionX, directionZ) || 1
    const perpendicularX = -directionZ / length
    const perpendicularZ = directionX / length

    const sampleList = [
      getTerrainHeight(point.x, point.z),
      getTerrainHeight(point.x + perpendicularX * bankOffset, point.z + perpendicularZ * bankOffset),
      getTerrainHeight(point.x - perpendicularX * bankOffset, point.z - perpendicularZ * bankOffset),
    ]

    return Math.min(...sampleList) - 1
  })

  levelList[levelList.length - 1] = endLevel

  /** 確保水位單調遞減，避免水往上流的視覺矛盾 */
  for (let index = 1; index < levelList.length; index++) {
    levelList[index] = Math.min(levelList[index]!, levelList[index - 1]! - 0.4)
  }

  return levelList
}

interface ColumnInfo {
  height: number;
  waterLevel: number;
  isRiver: boolean;
}

/** 產生整張地圖的高度與水位資訊 */
function createColumnInfoList(): ColumnInfo[] {
  const mainLevelList = createWaterLevelList(MAIN_RIVER_PATH, SEA_LEVEL, 8)
  const streamLevelList = createWaterLevelList(MOUNTAIN_STREAM_PATH, mainLevelList[1]!, 6)

  const columnInfoList: ColumnInfo[] = Array.from({ length: WORLD_SIZE * WORLD_SIZE })

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      let height = getTerrainHeight(x, z)
      let waterLevel = SEA_LEVEL
      let isRiver = false

      const riverSampleList = [
        sampleRiver(MAIN_RIVER_PATH, x, z, 3, 5, mainLevelList),
        sampleRiver(MOUNTAIN_STREAM_PATH, x, z, 2, 4, streamLevelList),
      ]

      for (const sample of riverSampleList) {
        if (sample.strength <= 0)
          continue

        height = height * (1 - sample.strength) + sample.bedHeight * sample.strength
        if (sample.strength > 0.15) {
          isRiver = true
          waterLevel = Math.max(waterLevel, sample.waterLevel)
        }
      }

      columnInfoList[x * WORLD_SIZE + z] = {
        height: Math.max(2, Math.min(WORLD_HEIGHT - 6, Math.round(height))),
        waterLevel: Math.round(waterLevel),
        isRiver,
      }
    }
  }

  spreadRiverWater(columnInfoList)

  return columnInfoList
}

/**
 * 讓河水漫進旁邊比水面還低的乾地
 *
 * 河道寬度是用距離算的，地形起伏卻不理會這條線，
 * 於是岸邊偶爾會出現「地面比河面低卻還是乾的」，看起來就像水浮在半空中。
 * 這裡讓水往低處補幾格，河岸線自然就對齊了。
 */
function spreadRiverWater(columnInfoList: ColumnInfo[]): void {
  const SPREAD_PASS_COUNT = 2

  for (let pass = 0; pass < SPREAD_PASS_COUNT; pass++) {
    const updateList: { index: number; waterLevel: number }[] = []

    for (let x = 1; x < WORLD_SIZE - 1; x++) {
      for (let z = 1; z < WORLD_SIZE - 1; z++) {
        const index = x * WORLD_SIZE + z
        const info = columnInfoList[index]!
        if (info.isRiver)
          continue

        let highestWaterLevel = 0
        for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const neighbor = columnInfoList[(x + offsetX) * WORLD_SIZE + (z + offsetZ)]!
          if (!neighbor.isRiver)
            continue
          if (neighbor.waterLevel > info.height && neighbor.waterLevel > highestWaterLevel) {
            highestWaterLevel = neighbor.waterLevel
          }
        }

        if (highestWaterLevel > 0) {
          updateList.push({ index, waterLevel: highestWaterLevel })
        }
      }
    }

    if (updateList.length === 0)
      break

    for (const update of updateList) {
      const info = columnInfoList[update.index]!
      info.isRiver = true
      info.waterLevel = update.waterLevel
    }
  }

  /**
   * 把相鄰河道的水位拉平
   *
   * 河道寬度是用距離算的，同一條河兩側的水位可能差一格，
   * 這樣岸邊就會看到一段憑空高出來的水牆
   */
  applyToNeighbor(columnInfoList, (info, neighborWaterLevel) => {
    if (!info.isRiver)
      return
    info.waterLevel = Math.max(info.waterLevel, neighborWaterLevel)
  })

  /**
   * 剩下的落差改成把河岸墊高
   *
   * 一直漫下去會把整片低地淹掉，墊高一兩格則完全看不出來。
   * 判斷條件是「這一格是乾的，旁邊卻有更高的水」，
   * 墊高後它就是陸地，不會再往外傳染出新的落差
   */
  applyToNeighbor(columnInfoList, (info, neighborWaterLevel) => {
    const ownWaterTop = info.isRiver ? info.waterLevel : SEA_LEVEL
    const isDry = info.height >= ownWaterTop

    if (isDry && neighborWaterLevel > info.height) {
      info.height = neighborWaterLevel
    }
  })
}

/** 掃過每個格子，把四周河道的最高水位交給 callback 處理 */
function applyToNeighbor(
  columnInfoList: ColumnInfo[],
  handle: (info: ColumnInfo, neighborWaterLevel: number) => void,
): void {
  const snapshotList = columnInfoList.map((info) => (info.isRiver ? info.waterLevel : 0))

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      let highestWaterLevel = 0

      for (const [offsetX, offsetZ] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        highestWaterLevel = Math.max(
          highestWaterLevel,
          snapshotList[(x + offsetX) * WORLD_SIZE + (z + offsetZ)]!,
        )
      }

      if (highestWaterLevel > 0) {
        handle(columnInfoList[x * WORLD_SIZE + z]!, highestWaterLevel)
      }
    }
  }
}

/** 依所在環境決定地表方塊 */
function getSurfaceBlock(x: number, z: number, height: number, isUnderWater: boolean): BlockId {
  const biomeId = getDominantBiomeId(x, z)

  if (height >= SNOW_LINE) {
    return BlockId.SNOW
  }

  if (isUnderWater) {
    if (biomeId === 'swamp') {
      return BlockId.CLAY
    }
    return height >= SEA_LEVEL - 3 ? BlockId.SAND : BlockId.GRAVEL
  }

  /** 貼著水面的低地一律是沙灘，環島一圈都有海岸 */
  if (height <= SEA_LEVEL + 2) {
    return biomeId === 'swamp' ? BlockId.CLAY : BlockId.SAND
  }

  switch (biomeId) {
    case 'coast':
      return BlockId.SAND
    case 'alpine':
      return height >= SNOW_LINE - 3 ? BlockId.STONE : BlockId.GRASS
    default:
      return BlockId.GRASS
  }
}

/** 填出地表與地底的方塊層 */
function fillTerrain(state: Uint8Array, columnInfoList: ColumnInfo[]): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const info = columnInfoList[x * WORLD_SIZE + z]!
      const { height } = info
      const waterTop = Math.max(SEA_LEVEL, info.isRiver ? info.waterLevel : SEA_LEVEL)
      const isUnderWater = height < waterTop

      const surfaceBlock = getSurfaceBlock(x, z, height, isUnderWater)
      const subSurfaceBlock = surfaceBlock === BlockId.SAND
        ? BlockId.SANDSTONE
        : surfaceBlock === BlockId.SNOW || surfaceBlock === BlockId.STONE
          ? BlockId.STONE
          : BlockId.DIRT

      for (let y = 0; y <= height; y++) {
        if (y === 0) {
          setBlock(state, x, y, z, BlockId.BEDROCK)
        }
        else if (y === height) {
          setBlock(state, x, y, z, surfaceBlock)
        }
        else if (y > height - 4) {
          setBlock(state, x, y, z, subSurfaceBlock)
        }
        else {
          setBlock(state, x, y, z, BlockId.STONE)
        }
      }

      /** 注水：海平面以下，或河道自己的水位以下 */
      for (let y = height + 1; y <= waterTop; y++) {
        setBlock(state, x, y, z, BlockId.WATER)
      }

      /** 高山湖面結冰 */
      if (height >= SNOW_LINE && waterTop > height) {
        setBlock(state, x, waterTop, z, BlockId.ICE)
      }
    }
  }
}

/**
 * 洞穴主通道，由雪山腳下的入口通往地底湖
 *
 * 每段落差都控制在水平距離的一半以內，
 * 玩家靠自動爬階就能走下去，也走得回來。
 */
const CAVE_SHAPE_LIST: { x: number; z: number; radius: number }[] = [
  { x: 122, z: 88, radius: 3 },
  { x: 126, z: 82, radius: 3 },
  { x: 130, z: 76, radius: 3.2 },
  { x: 134, z: 70, radius: 3.2 },
  { x: 137, z: 65, radius: 3.4 },
  { x: 140, z: 60, radius: 7.5 },
]

/** 洞穴頂部至少要蓋這麼多岩層，太薄會從山坡上看到破洞，也不會被判定成進洞 */
const CAVE_ROCK_COVER = 8
/** 每走一格水平距離最多下降多少，太陡就爬不回來 */
const CAVE_MAX_SLOPE = 0.45

/**
 * 依地形推算洞穴路徑的高度
 *
 * 高度寫死的話，地形參數一改洞就會埋進山裡或穿出地表。
 * 洞口貼齊地表，之後每一段都壓在岩層底下並穩定往下走。
 */
function createCavePath() {
  const pathList: { x: number; y: number; z: number; radius: number }[] = []

  for (const [index, point] of CAVE_SHAPE_LIST.entries()) {
    const terrainHeight = Math.round(getTerrainHeight(point.x, point.z))
    let y = index === 0 ? terrainHeight : terrainHeight - CAVE_ROCK_COVER

    const previous = pathList[index - 1]
    if (previous) {
      const length = Math.hypot(point.x - previous.x, point.z - previous.z)
      y = Math.min(y, previous.y - Math.round(length * CAVE_MAX_SLOPE))
    }

    pathList.push({ x: point.x, y: Math.max(5, y), z: point.z, radius: point.radius })
  }

  return pathList
}

/** 解析後的洞穴路徑，音源要靠它決定高度 */
export const CAVE_PATH = createCavePath()

/** 洞穴入口（雪山腳下） */
export const CAVE_ENTRANCE = CAVE_PATH[0]!
/** 地底湖所在的洞窟 */
export const CAVE_CHAMBER = CAVE_PATH[CAVE_PATH.length - 1]!

/** 沿著路徑挖出球狀洞穴 */
function carveCave(state: Uint8Array, columnInfoList: ColumnInfo[]): void {
  const stepCount = 24

  /**
   * 洞口高度改用實際地形推算
   *
   * 山腳高度會隨噪音浮動，寫死高度容易讓洞口埋進土裡，
   * 玩家只會看到一座沒有門的山。
   */
  const entrance = CAVE_PATH[0]!
  const entranceHeight = columnInfoList[entrance.x * WORLD_SIZE + entrance.z]?.height ?? entrance.y
  const cavePath = CAVE_PATH.map((point, index) => (
    index === 0 ? { ...point, y: entranceHeight + 1 } : point
  ))

  for (let index = 0; index < cavePath.length - 1; index++) {
    const start = cavePath[index]!
    const end = cavePath[index + 1]!

    for (let step = 0; step <= stepCount; step++) {
      const blend = step / stepCount
      const centerX = start.x + (end.x - start.x) * blend
      const centerY = start.y + (end.y - start.y) * blend
      const centerZ = start.z + (end.z - start.z) * blend
      const radius = start.radius + (end.radius - start.radius) * blend

      const bound = Math.ceil(radius) + 1
      for (let offsetX = -bound; offsetX <= bound; offsetX++) {
        for (let offsetY = -bound; offsetY <= bound; offsetY++) {
          for (let offsetZ = -bound; offsetZ <= bound; offsetZ++) {
            const distance = Math.hypot(offsetX, offsetY, offsetZ)
            /** 邊界加一點噪音，避免洞壁像用圓規畫的 */
            const wobble = fbm3D(
              (centerX + offsetX) * 0.12,
              (centerY + offsetY) * 0.12,
              (centerZ + offsetZ) * 0.12,
              2,
              0.5,
            ) * 0.6

            if (distance + wobble > radius)
              continue

            const blockX = Math.round(centerX + offsetX)
            const blockY = Math.round(centerY + offsetY)
            const blockZ = Math.round(centerZ + offsetZ)

            if (blockY <= 1)
              continue

            /** 別把地表挖穿，只留入口那一段 */
            const info = columnInfoList[blockX * WORLD_SIZE + blockZ]
            if (info && blockY >= info.height && index > 0)
              continue

            setBlock(state, blockX, blockY, blockZ, BlockId.AIR)
          }
        }
      }
    }
  }

  /**
   * 沿路鋪一條平緩的步道
   *
   * 球狀開挖加上噪音，洞底會出現三四格的落差，
   * 玩家跳不上來就只能困在裡面，這裡直接把地板補成連續的緩坡。
   *
   * 洞窟半徑一路放大到 7.5 格，地板高度是「中心高度減半徑」算出來的，
   * 快到底時會一口氣掉兩三格。所以先把整條路的高度算出來，
   * 再逐點限制成每格最多升降一階，一定跳得回去
   */
  const walkwayList: { x: number; z: number; y: number }[] = []
  for (let index = 0; index < cavePath.length - 1; index++) {
    const start = cavePath[index]!
    const end = cavePath[index + 1]!
    const pathStepCount = 48

    for (let step = 0; step <= pathStepCount; step++) {
      const blend = step / pathStepCount
      const centerY = start.y + (end.y - start.y) * blend
      const radius = start.radius + (end.radius - start.radius) * blend

      walkwayList.push({
        x: Math.round(start.x + (end.x - start.x) * blend),
        z: Math.round(start.z + (end.z - start.z) * blend),
        y: Math.round(centerY - radius + 1),
      })
    }
  }

  const chamber = cavePath[cavePath.length - 1]!
  /** 地底湖的水面高度，同時也是湖岸的地板高度 */
  const lakeLevel = chamber.y - 3

  /**
   * 地底湖的岸
   *
   * 洞窟是顆直徑十五格的大球，湖岸若照著球面往下斜，
   * 走到水邊就是兩三格的落差，掉下去爬不回來。
   * 沿著湖外圍鋪一圈與湖面同高的平地，繞著湖走一整圈都不用跳。
   *
   * 這一段要排在步道之前：兩者在湖邊會重疊，
   * 若讓湖岸後鋪，會把步道下坡的最後幾格削掉三格深
   */
  for (let x = chamber.x - 11; x <= chamber.x + 11; x++) {
    for (let z = chamber.z - 11; z <= chamber.z + 11; z++) {
      const distance = Math.hypot(x - chamber.x, z - chamber.z)
      /** 內圈留給湖水，鋪太進去整座地底湖會變成一塊石頭地板 */
      if (distance < 5.5 || distance > 9.5)
        continue
      /** 只鋪在挖開的洞裡，不要往岩層裡鑿 */
      if (getBlock(state, x, lakeLevel + 2, z) !== BlockId.AIR)
        continue

      setBlock(state, x, lakeLevel, z, BlockId.STONE)
      for (let height = 1; height <= 3; height++) {
        setBlock(state, x, lakeLevel + height, z, BlockId.AIR)
      }
    }
  }

  /**
   * 步道每一格的地板高度
   *
   * 先沿著中心線算出高度，每踏進新的一格最多升降一階；
   * 再把三格寬的走道整片記進來
   */
  const floorMap = new Map<string, number>()
  let previousFloorY = walkwayList[0]?.y ?? 0
  let previousX = walkwayList[0]?.x ?? 0
  let previousZ = walkwayList[0]?.z ?? 0

  for (const point of walkwayList) {
    const hasMoved = point.x !== previousX || point.z !== previousZ
    const steppedY = hasMoved
      ? Math.max(previousFloorY - 1, Math.min(previousFloorY + 1, point.y))
      : previousFloorY
    const floorY = Math.max(lakeLevel, steppedY)
    previousFloorY = floorY
    previousX = point.x
    previousZ = point.z

    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        floorMap.set(`${point.x + offsetX}_${point.z + offsetZ}`, floorY)
      }
    }
  }

  /**
   * 把走道兩側補成階梯
   *
   * 中心線雖然一格一階，但三格寬的走道會被後面較低的中心點覆蓋，
   * 斜對角的兩格因此差到兩階——往下走沒事，回頭就跳不上來。
   * 這裡反覆把過低的那一格墊高，直到相鄰兩格最多差一階
   */
  for (let pass = 0; pass < 8; pass++) {
    let hasChanged = false

    for (const [key, floorY] of floorMap) {
      const [x, z] = key.split('_').map(Number) as [number, number]

      for (const step of HORIZONTAL_STEP_LIST) {
        const neighborFloorY = floorMap.get(`${x + step.x}_${z + step.z}`)
        if (neighborFloorY === undefined || neighborFloorY - floorY <= 1)
          continue

        floorMap.set(key, neighborFloorY - 1)
        hasChanged = true
        break
      }
    }

    if (!hasChanged)
      break
  }

  for (const [key, floorY] of floorMap) {
    const [x, z] = key.split('_').map(Number) as [number, number]
    setBlock(state, x, floorY, z, BlockId.STONE)

    for (let height = 1; height <= 3; height++) {
      setBlock(state, x, floorY + height, z, BlockId.AIR)
    }
  }

  /**
   * 湖心的小石島
   *
   * 湖岸的燈石離湖心有八九格，光走到中間就衰減得差不多了，
   * 整座洞窟最開闊的地方反而最暗。
   * 中央墊一塊小石台擺上燈石，既是光源也是走到底的視覺焦點
   */
  for (let offsetX = -2; offsetX <= 2; offsetX++) {
    for (let offsetZ = -2; offsetZ <= 2; offsetZ++) {
      if (Math.hypot(offsetX, offsetZ) > 2.2)
        continue
      setBlock(state, chamber.x + offsetX, lakeLevel, chamber.z + offsetZ, BlockId.STONE)
      setBlock(state, chamber.x + offsetX, lakeLevel + 1, chamber.z + offsetZ, BlockId.AIR)
    }
  }
  setBlock(state, chamber.x, lakeLevel + 1, chamber.z, BlockId.LANTERN)

  decorateCaveOre(state, cavePath)

  /** 地底湖：把洞底注水 */
  for (let x = chamber.x - 8; x <= chamber.x + 8; x++) {
    for (let z = chamber.z - 8; z <= chamber.z + 8; z++) {
      for (let y = 2; y <= lakeLevel; y++) {
        if (getBlock(state, x, y, z) === BlockId.AIR) {
          setBlock(state, x, y, z, BlockId.WATER)
        }
      }
    }
  }

  /**
   * 沿路嵌燈石，不然裡面伸手不見五指
   *
   * 燈石的光會由 Worker 做一次擴散烘進方塊，
   * 一路點過去就是一條看得見的動線
   */
  for (const point of cavePath.slice(0, -1)) {
    const floorY = Math.round(point.y - point.radius + 1)
    /**
     * 一個路口一顆就夠
     *
     * 燈石的光會擴散十四格，沿路每隔幾格塞一顆只是讓通道變成一條燈管，
     * 該有的幽暗都被洗掉了
     */
    placeLantern(state, point.x + 1, floorY, point.z + 1)
  }

  /**
   * 洞窟四周補一圈，走到底才有豁然開朗的感覺
   *
   * 洞窟是個球，岩壁的位置隨角度與高度而變，
   * 只好從湖心往八個方向摸出去，碰到第一塊嵌得住的岩石就點亮
   */
  const directionCount = 4
  for (let index = 0; index < directionCount; index++) {
    const angle = (index / directionCount) * Math.PI * 2 + Math.PI / 4
    const stepX = Math.cos(angle)
    const stepZ = Math.sin(angle)

    for (let distance = 4; distance <= 11; distance++) {
      const isPlaced = placeLantern(
        state,
        Math.round(chamber.x + stepX * distance),
        lakeLevel + 1,
        Math.round(chamber.z + stepZ * distance),
      )
      if (isPlaced)
        break
    }
  }
}

/**
 * 在洞壁表層鋪礦脈
 *
 * 只換掉「貼著空洞的那一層岩石」，深埋在山體裡的礦看不到也沒意義。
 * 用三維噪音決定成脈的位置，礦才會一叢一叢長在一起，
 * 而不是均勻地灑滿整面牆。
 * 種類依深度分層：煤到處都是，鐵銅在中段，金與鑽石要走到最底下
 */
function decorateCaveOre(
  state: Uint8Array,
  cavePath: { x: number; y: number; z: number; radius: number }[],
): void {
  const random = createSeededRandom('minespace-cave-ore')

  for (const point of cavePath) {
    const bound = Math.ceil(point.radius) + 3

    for (let offsetX = -bound; offsetX <= bound; offsetX++) {
      for (let offsetY = -bound; offsetY <= bound; offsetY++) {
        for (let offsetZ = -bound; offsetZ <= bound; offsetZ++) {
          const x = point.x + offsetX
          const y = point.y + offsetY
          const z = point.z + offsetZ

          if (getBlock(state, x, y, z) !== BlockId.STONE)
            continue

          /** 沒有任何一面露出來的岩石就跳過 */
          const isExposed = NEIGHBOR_STEP_LIST.some(
            (step) => getBlock(state, x + step.x, y + step.y, z + step.z) === BlockId.AIR,
          )
          if (!isExposed)
            continue

          /** 成脈的噪音，高於門檻才長礦 */
          const vein = fbm3D(x * 0.26, y * 0.26, z * 0.26, 2, 0.5)
          if (vein < 0.34)
            continue

          setBlock(state, x, y, z, pickOreBlock(y, random()))
        }
      }
    }
  }
}

/** 依深度挑礦種：越深越稀有 */
function pickOreBlock(y: number, roll: number): BlockId {
  if (y <= 8) {
    if (roll < 0.1)
      return BlockId.DIAMOND_ORE
    if (roll < 0.28)
      return BlockId.GOLD_ORE
    if (roll < 0.55)
      return BlockId.IRON_ORE
    return BlockId.COAL_ORE
  }

  if (y <= 16) {
    if (roll < 0.06)
      return BlockId.GOLD_ORE
    if (roll < 0.34)
      return BlockId.IRON_ORE
    if (roll < 0.58)
      return BlockId.COPPER_ORE
    return BlockId.COAL_ORE
  }

  if (roll < 0.22)
    return BlockId.COPPER_ORE
  if (roll < 0.4)
    return BlockId.IRON_ORE
  return BlockId.COAL_ORE
}

/** 六個方向的鄰居 */
const NEIGHBOR_STEP_LIST = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
]

/**
 * 嵌一顆燈石
 *
 * 只換掉貼著空洞的那面岩石：
 * 擺在水面或半空中會浮著，埋進岩層深處則一絲光都透不出來
 */
function placeLantern(state: Uint8Array, x: number, y: number, z: number): boolean {
  if (isPassableBlock(getBlock(state, x, y, z)))
    return false

  const hasOpenSide = NEIGHBOR_STEP_LIST.some(
    (step) => isPassableBlock(getBlock(state, x + step.x, y + step.y, z + step.z)),
  )
  if (!hasOpenSide)
    return false

  setBlock(state, x, y, z, BlockId.LANTERN)
  return true
}

/**
 * 標記流動的水
 *
 * Minecraft 把水分成靜水與流水兩種方塊，兩者只差在貼圖：
 * 流水那張是往下捲動的連續畫格，看得出來水正往哪裡走。
 *
 * 判定條件抓兩種情形：
 * - 腳下是空的：水正在往下掉，也就是瀑布
 * - 側邊有一格是空的：水從這裡溢出去，河道的每一級落差都是這樣
 *
 * 湖面與海面四周都被岸擋著，不會被誤判，仍舊維持靜水
 */
function markFlowingWater(state: Uint8Array): void {
  const flowingList: { x: number; y: number; z: number }[] = []

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let y = 1; y < WORLD_HEIGHT; y++) {
        if (getBlock(state, x, y, z) !== BlockId.WATER)
          continue
        /** 睡蓮只長在靜止的水面，底下這格就維持靜水 */
        if (getBlock(state, x, y + 1, z) === BlockId.LILY_PAD)
          continue

        const isFalling = getBlock(state, x, y - 1, z) === BlockId.AIR
        const isSpilling = HORIZONTAL_STEP_LIST.some((step) => {
          const neighborX = x + step.x
          const neighborZ = z + step.z
          if (!isInsideWorld(neighborX, y, neighborZ))
            return false

          return getBlock(state, neighborX, y, neighborZ) === BlockId.AIR
        })

        if (isFalling || isSpilling) {
          flowingList.push({ x, y, z })
        }
      }
    }
  }

  for (const point of flowingList) {
    setBlock(state, point.x, point.y, point.z, BlockId.FLOWING_WATER)
  }
}

/** 水平四方向 */
const HORIZONTAL_STEP_LIST = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
]

/**
 * 產生完整世界
 *
 * 流程：生態區高度混合 → 河道下切 → 填方塊與水 → 挖洞穴 → 擺設景物 → 標記流水
 */
export function generateWorld(state: Uint8Array): void {
  const columnInfoList = createColumnInfoList()

  fillTerrain(state, columnInfoList)
  carveCave(state, columnInfoList)
  placeStructures(state)
  markFlowingWater(state)
}

/** 出生點：中央草原，離河道幾步路，一睜眼就聽得到水聲 */
export const SPAWN_POSITION = { x: 90, z: 92 }
