import type { HouseSpec, RoofStyle, WallStyle } from './village-buildings'
import { createSeededRandom } from '../../../utils/noise'
import { BlockId } from '../../block/block-constants'
import { placeBellTower, placeLampPost, placeVillageWell } from '../../garden/garden-builders-major'
import { carveWater, fillBox, fillDisc, pickOne, plantWithStack, setDecoration } from '../../garden/garden-kit'
import { getBlock, setBlock } from '../../world/world-access'
import { WORLD_SIZE } from '../../world/world-constants'
import { placePortalStructure } from '../portal-terrain'
import { findTopSolidY } from '../realm-terrain-kit'
import {
  DARK_ROOF,
  LIGHT_ROOF,
  placeBathhouse,
  placeCoveredGate,
  placeGranary,
  placeHouse,
  placeInn,
  placeMarketHall,
  placePottery,
  placeShrine,
  placeSmithy,
  placeWatchTower,
  placeWatermill,
} from './village-buildings'
import { placeVillageSetPieceList, scatterVillageDetail } from './village-detail'
import {
  BACK_ALLEY_Z,
  BATHHOUSE_POINT,
  BELL_TOWER_POINT,
  BELL_TOWER_SIZE,
  COVERED_GATE_POINT,
  FIELD_OUTER_RADIUS,
  FIELD_Y,
  GRANARY_POINT,
  HEARTH_POINT,
  HILL_OUTER_RADIUS,
  HOUSE_LOT_LIST,
  INN_POINT,
  LANE_HALF_WIDTH,
  MAIN_STREET_HALF_WIDTH,
  MARKET_HALL_POINT,
  MARKET_STALL_LIST,
  measureHillHeight,
  measureHillRadius,
  measureTerraceDistance,
  PLAZA_RADIUS,
  POTTERY_POINT,
  SHRINE_POINT,
  SMITHY_POINT,
  STREAM_Z,
  TERRACE_GROUND_Y,
  TERRACE_RADIUS,
  TERRACE_Y,
  VILLAGE_CENTER,
  VILLAGE_PORTAL_POINT,
  WATCH_TOWER_POINT,
  WATERMILL_POINT,
} from './village-layout'
import { VILLAGE_REALM } from './village-realm'

/**
 * 村落的地形
 *
 * 只有地形 worker 用。整座村子照市井坊（buildVillageGarden）放大：
 * 市井坊是一方草地木座，中央石板廣場與一口有頂棚的井，三間小屋圍著廣場，
 * 西南角一座鐘樓，一圈紙燈柱，市集的桶、箱、工作台、箱子、爐子、鍋與乾草，花盆與草花。
 * 這裡把木座換成高出田地一格的台地；井、鐘樓、紙燈柱用市井坊同一支函式蓋，
 * 屋子不再是同一個模子：民家各挑一種樣式，另有旅籠、神社、水車小屋、鍛冶屋、高倉、
 * 市場棚、望樓、湯屋、陶房與街口的屋根門（見 village-buildings）。
 * 台地外是花田，再往外是一圈丘陵。
 *
 * 順序有講究：先有地形、石板路與水道，屋子與攤子才蓋得上去；燈柱看頭上有沒有屋頂才擺；
 * 花草最後撒，傳送門排在花草之後，門洞與木牌前面那幾格要清乾淨
 */

const GRASS_SET = new Set([BlockId.GRASS])

/** 找地面時從這一層往下找：比丘陵的稜線再高幾格 */
const VILLAGE_SCAN_TOP_Y = FIELD_Y + 16

/** 台地上的草花照市井坊的比例：高草最多，其次鬱金香、蒲公英、堇 */
function pickTerraceFlower(random: () => number): BlockId {
  const roll = random()
  if (roll < 0.4)
    return BlockId.TALL_GRASS
  if (roll < 0.65)
    return BlockId.FLOWER_TULIP
  if (roll < 0.85)
    return BlockId.FLOWER_DANDELION
  return BlockId.FLOWER_VIOLA
}

/**
 * 丘陵的高度圖，相鄰兩格最多差一格
 *
 * 噪音疊出來的坡有的地方一步就是兩三格高的坎，走上去會被擋住，看起來像撞到一道看不見的牆。
 * 先算整張圖，再一遍一遍壓：每一格不能比四鄰最低的那一格高出一格以上，壓到不再變為止。
 * 只會壓低、不會墊高，稜線的輪廓照舊
 */
function measureHillHeightMap(): Int8Array {
  const heightMap = new Int8Array(WORLD_SIZE * WORLD_SIZE)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      heightMap[x * WORLD_SIZE + z] = measureHillHeight(x, z)
    }
  }

  let isChanged = true
  while (isChanged) {
    isChanged = false
    for (let x = 1; x < WORLD_SIZE - 1; x++) {
      for (let z = 1; z < WORLD_SIZE - 1; z++) {
        const index = x * WORLD_SIZE + z
        const lowest = Math.min(
          heightMap[index - WORLD_SIZE]!,
          heightMap[index + WORLD_SIZE]!,
          heightMap[index - 1]!,
          heightMap[index + 1]!,
        )
        if (heightMap[index]! > lowest + 1) {
          heightMap[index] = lowest + 1
          isChanged = true
        }
      }
    }
  }
  return heightMap
}

/**
 * 地形：台地、田地與丘陵
 *
 * 稜線後面整片換成不畫的 LAKE_BED（連同底下），由布景的地面平面代替：
 * 那一片從村子裡看不到，照方塊畫的話是五萬多格的頂面與陰影。
 * 地面的底層也一律是 LAKE_BED，世界四邊的側面不必畫
 */
function shapeTerrain(state: Uint8Array): void {
  const hillHeightMap = measureHillHeightMap()

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      if (measureHillRadius(x, z) >= HILL_OUTER_RADIUS) {
        fillBox(state, x, 0, z, x, FIELD_Y, z, BlockId.LAKE_BED)
        continue
      }

      setBlock(state, x, 0, z, BlockId.BEDROCK)

      const terraceDistance = measureTerraceDistance(x, z)
      if (terraceDistance < TERRACE_RADIUS) {
        /** 最外一圈是石砌的邊，像木座最外那一圈深色的唇 */
        const isCurb = terraceDistance >= TERRACE_RADIUS - 1
        fillBox(state, x, 1, z, x, TERRACE_Y - 3, z, BlockId.STONE)
        fillBox(state, x, TERRACE_Y - 2, z, x, TERRACE_Y - 1, z, isCurb ? BlockId.COBBLESTONE : BlockId.DIRT)
        setBlock(state, x, TERRACE_Y, z, isCurb ? BlockId.COBBLESTONE : BlockId.GRASS)
        continue
      }

      const topY = FIELD_Y + hillHeightMap[x * WORLD_SIZE + z]!
      fillBox(state, x, 1, z, x, topY - 3, z, BlockId.STONE)
      fillBox(state, x, topY - 2, z, x, topY - 1, z, BlockId.DIRT)
      setBlock(state, x, topY, z, BlockId.GRASS)
    }
  }
}

/** 這一格是不是台地上、石砌的邊以內 */
function isInsideCurb(x: number, z: number): boolean {
  return measureTerraceDistance(x, z) < TERRACE_RADIUS - 1
}

/**
 * 石板路：市街、小巷、後巷與廣場
 *
 * 市井坊只有一塊石板廣場，這裡從廣場往四面拉出路來：東西一條七格寬的市街（西端是回程門、東端是屋根門），
 * 南北一條三格寬的小巷，北邊一條兩格寬的後巷。路上夾一些圓石，走久了的石板才會補補貼貼；
 * 後巷比市街舊，圓石多一點
 */
function pavePathList(state: Uint8Array): void {
  const random = createSeededRandom('village-paving')
  const { x: centerX, z: centerZ } = VILLAGE_CENTER

  const pave = (x: number, z: number, cobbleChance: number) => {
    if (!isInsideCurb(x, z))
      return
    setBlock(state, x, TERRACE_Y, z, random() < cobbleChance ? BlockId.COBBLESTONE : BlockId.STONE_TILE)
  }

  for (let x = centerX - TERRACE_RADIUS; x <= centerX + TERRACE_RADIUS; x++) {
    for (let offsetZ = -MAIN_STREET_HALF_WIDTH; offsetZ <= MAIN_STREET_HALF_WIDTH; offsetZ++) {
      pave(x, centerZ + offsetZ, 0.14)
    }
    for (const offsetZ of [0, 1]) {
      pave(x, centerZ + BACK_ALLEY_Z + offsetZ, 0.4)
    }
  }
  for (let z = centerZ - TERRACE_RADIUS; z <= centerZ + TERRACE_RADIUS; z++) {
    for (let offsetX = -LANE_HALF_WIDTH; offsetX <= LANE_HALF_WIDTH; offsetX++) {
      pave(centerX + offsetX, z, 0.14)
    }
  }

  /** 廣場是一整塊的石板，不夾圓石：市井坊那一塊就是乾乾淨淨的 */
  fillDisc(state, centerX, centerZ, PLAZA_RADIUS, TERRACE_Y, BlockId.STONE_TILE)
}

/**
 * 水道與木橋
 *
 * 村子南半邊一條東西向的水道，兩格寬、兩格深，水面與地面齊平、兩岸一排圓石；
 * 水車小屋的水車就立在裡面。南北小巷用一座木橋跨過去，橋兩側一排欄杆
 */
function carveStream(state: Uint8Array): void {
  const { x: centerX, z: centerZ } = VILLAGE_CENTER
  const streamZ = centerZ + STREAM_Z

  for (let x = centerX - TERRACE_RADIUS; x <= centerX + TERRACE_RADIUS; x++) {
    if (!isInsideCurb(x, streamZ) || !isInsideCurb(x, streamZ + 1))
      continue
    for (const offsetZ of [0, 1]) {
      carveWater(state, x, TERRACE_Y, streamZ + offsetZ, 2, BlockId.COBBLESTONE)
    }
    for (const bankZ of [streamZ - 1, streamZ + 2]) {
      if (getBlock(state, x, TERRACE_Y, bankZ) === BlockId.GRASS)
        setBlock(state, x, TERRACE_Y, bankZ, BlockId.COBBLESTONE)
    }
  }

  /** 木橋：小巷那三格，從岸到岸鋪半磚，兩側欄杆 */
  for (let z = streamZ - 1; z <= streamZ + 2; z++) {
    for (let offsetX = -LANE_HALF_WIDTH; offsetX <= LANE_HALF_WIDTH; offsetX++) {
      setBlock(state, centerX + offsetX, TERRACE_GROUND_Y, z, BlockId.WOOD_SLAB)
    }
    for (const railX of [-LANE_HALF_WIDTH - 1, LANE_HALF_WIDTH + 1]) {
      setBlock(state, centerX + railX, TERRACE_GROUND_Y, z, BlockId.FENCE)
    }
  }
}

/**
 * 一攤
 *
 * 市井坊的雜物是散在廣場上的：桶、箱、工作台、箱子、乾草。這裡收成攤子：
 * 三格寬、兩格深，四角各一根籬笆柱，頂上一片深色半磚，柱子與頂棚照井的做法；
 * 靠街那一排的正中是櫃台，裡面一排是貨，櫃台上偶爾一盆花
 */
function placeMarketStall(state: Uint8Array, x: number, frontZ: number, side: -1 | 1, random: () => number): void {
  const backZ = frontZ + side
  const groundY = TERRACE_GROUND_Y

  for (const z of [frontZ, backZ]) {
    for (const offsetX of [-1, 1]) {
      setBlock(state, x + offsetX, groundY, z, BlockId.FENCE)
      setBlock(state, x + offsetX, groundY + 1, z, BlockId.FENCE)
    }
  }
  fillBox(state, x - 1, groundY + 2, frontZ, x + 1, groundY + 2, backZ, BlockId.DARK_WOOD_SLAB)

  setBlock(state, x, groundY, frontZ, pickOne(random, [BlockId.CRATE, BlockId.BARREL, BlockId.WORKBENCH, BlockId.CHEST]))
  setBlock(state, x, groundY, backZ, pickOne(random, [BlockId.HAY, BlockId.BARREL, BlockId.CRATE]))
  if (random() < 0.5) {
    setDecoration(state, x, groundY + 1, frontZ, BlockId.FLOWER_POT)
  }
}

/**
 * 民家的幾種樣式，每一種都不一樣
 *
 * 層數、牆、屋頂、窗、門廊、露台、煙囪、小棚、小院各挑一組；
 * 七塊地各拿一種（亂數排過順序），隔壁兩間不會是同一個模子
 */
interface HouseStyle {
  storeyCount: number;
  wall: WallStyle;
  hasStoneBase: boolean;
  roof: RoofStyle;
  isDarkRoof: boolean;
  eave: number;
  hasPorch: boolean;
  hasBalcony: boolean;
  hasChimney: boolean;
  hasShed: boolean;
  hasYard: boolean;
}

const HOUSE_STYLE_LIST: HouseStyle[] = [
  { storeyCount: 2, wall: 'timber', hasStoneBase: true, roof: 'hip', isDarkRoof: true, eave: 1, hasPorch: true, hasBalcony: false, hasChimney: true, hasShed: false, hasYard: false },
  { storeyCount: 1, wall: 'planks', hasStoneBase: false, roof: 'gableX', isDarkRoof: false, eave: 1, hasPorch: false, hasBalcony: false, hasChimney: false, hasShed: true, hasYard: true },
  { storeyCount: 3, wall: 'dark', hasStoneBase: false, roof: 'gableZ', isDarkRoof: true, eave: 0, hasPorch: false, hasBalcony: true, hasChimney: false, hasShed: false, hasYard: false },
  { storeyCount: 1, wall: 'plaster', hasStoneBase: true, roof: 'hip', isDarkRoof: false, eave: 1, hasPorch: true, hasBalcony: false, hasChimney: false, hasShed: false, hasYard: true },
  { storeyCount: 2, wall: 'stone', hasStoneBase: false, roof: 'gableX', isDarkRoof: true, eave: 1, hasPorch: false, hasBalcony: true, hasChimney: true, hasShed: false, hasYard: false },
  { storeyCount: 1, wall: 'dark', hasStoneBase: false, roof: 'gableZ', isDarkRoof: false, eave: 1, hasPorch: true, hasBalcony: false, hasChimney: true, hasShed: true, hasYard: false },
  { storeyCount: 2, wall: 'plaster', hasStoneBase: false, roof: 'gableZ', isDarkRoof: true, eave: 1, hasPorch: false, hasBalcony: false, hasChimney: false, hasShed: false, hasYard: true },
]

/** 小棚擺在不擋路的那一側：門朝南北的放東西兩側，朝東西的放南北 */
function pickShedSide(doorSide: HouseSpec['doorSide'], random: () => number): HouseSpec['doorSide'] {
  if (doorSide === 'north' || doorSide === 'south')
    return random() < 0.5 ? 'east' : 'west'
  return random() < 0.5 ? 'north' : 'south'
}

/** 民家、井、鐘樓、攤子、灶，以及各有輪廓的那幾座建築 */
function placeBuildingList(state: Uint8Array): void {
  const random = createSeededRandom('village-building')
  const { x: centerX, z: centerZ } = VILLAGE_CENTER
  const groundY = TERRACE_GROUND_Y
  const at = (point: { offsetX: number; offsetZ: number }) => ({ x: centerX + point.offsetX, z: centerZ + point.offsetZ })

  /** 樣式的順序洗一次牌，每一塊地拿一種 */
  const styleList = [...HOUSE_STYLE_LIST]
  for (let index = styleList.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1))
    const swapped = styleList[swapIndex]!
    styleList[swapIndex] = styleList[index]!
    styleList[index] = swapped
  }

  for (const [index, lot] of HOUSE_LOT_LIST.entries()) {
    const style = styleList[index % styleList.length]!
    placeHouse(state, {
      x: centerX + lot.offsetX,
      z: centerZ + lot.offsetZ,
      groundY,
      halfWidth: lot.halfWidth,
      halfDepth: lot.halfDepth,
      storeyCount: style.storeyCount,
      wall: style.wall,
      hasStoneBase: style.hasStoneBase,
      window: random() < 0.5 ? 'glass' : 'shoji',
      roof: style.roof,
      roofKit: style.isDarkRoof ? DARK_ROOF : LIGHT_ROOF,
      eave: style.eave,
      doorSide: lot.doorSide,
      hasPorch: style.hasPorch,
      hasBalcony: style.hasBalcony,
      hasChimney: style.hasChimney,
      shedSide: style.hasShed ? pickShedSide(lot.doorSide, random) : null,
      hasYard: style.hasYard,
    }, random)
  }

  placeVillageWell(state, centerX, TERRACE_Y, centerZ)
  placeBellTower(state, centerX + BELL_TOWER_POINT.offsetX, groundY, centerZ + BELL_TOWER_POINT.offsetZ, BELL_TOWER_SIZE)

  const inn = at(INN_POINT)
  placeInn(state, inn.x, groundY, inn.z, random)
  const smithy = at(SMITHY_POINT)
  placeSmithy(state, smithy.x, groundY, smithy.z, 'south')
  const marketHall = at(MARKET_HALL_POINT)
  placeMarketHall(state, marketHall.x, groundY, marketHall.z, random)
  const shrine = at(SHRINE_POINT)
  placeShrine(state, shrine.x, groundY, shrine.z)
  const granary = at(GRANARY_POINT)
  placeGranary(state, granary.x, groundY, granary.z)
  const pottery = at(POTTERY_POINT)
  placePottery(state, pottery.x, groundY, pottery.z, random)
  const watchTower = at(WATCH_TOWER_POINT)
  placeWatchTower(state, watchTower.x, groundY, watchTower.z)
  const bathhouse = at(BATHHOUSE_POINT)
  placeBathhouse(state, bathhouse.x, groundY, bathhouse.z, random)
  const watermill = at(WATERMILL_POINT)
  placeWatermill(state, watermill.x, groundY, watermill.z, centerZ + STREAM_Z + 1, random)
  const coveredGate = at(COVERED_GATE_POINT)
  placeCoveredGate(state, coveredGate.x, groundY, coveredGate.z, MAIN_STREET_HALF_WIDTH + 1)

  for (const stall of MARKET_STALL_LIST) {
    const frontZ = centerZ + stall.side * (MAIN_STREET_HALF_WIDTH + 1)
    placeMarketStall(state, centerX + stall.offsetX, frontZ, stall.side, random)
  }

  /** 灶：市井坊那一組爐子與鍋，旁邊一個桶、一箱柴 */
  const hearthX = centerX + HEARTH_POINT.offsetX
  const hearthZ = centerZ + HEARTH_POINT.offsetZ
  setBlock(state, hearthX, groundY, hearthZ, BlockId.FURNACE)
  setBlock(state, hearthX + 1, groundY, hearthZ, BlockId.CAULDRON)
  setBlock(state, hearthX - 1, groundY, hearthZ + 1, BlockId.BARREL)
  setBlock(state, hearthX + 1, groundY, hearthZ + 1, BlockId.CRATE)

  /**
   * 後巷北側一道矮石牆，到神社、高倉、陶房與望樓門前斷開
   *
   * 巷子才有「一邊是人家後院」的感覺，而不是一條鋪在草地上的路
   */
  const wallZ = centerZ + BACK_ALLEY_Z - 1
  const gapList = [SHRINE_POINT, GRANARY_POINT, POTTERY_POINT, WATCH_TOWER_POINT].map((point) => centerX + point.offsetX)
  for (let x = centerX - TERRACE_RADIUS; x <= centerX + TERRACE_RADIUS; x++) {
    if (!isInsideCurb(x, wallZ) || Math.abs(x - centerX) <= LANE_HALF_WIDTH)
      continue
    if (gapList.some((gapX) => Math.abs(x - gapX) <= 3))
      continue
    if (getBlock(state, x, groundY, wallZ) === BlockId.AIR && getBlock(state, x, TERRACE_Y, wallZ) === BlockId.GRASS)
      setBlock(state, x, groundY, wallZ, random() < 0.25 ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE)
  }
}

/** 這一格頭上幾格內有沒有東西：有的話是在屋裡或屋簷下，燈柱不擺 */
function isUnderRoof(state: Uint8Array, x: number, groundY: number, z: number): boolean {
  for (let y = groundY; y <= groundY + 8; y++) {
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && blockId !== BlockId.TALL_GRASS)
      return true
  }
  return false
}

/**
 * 紙燈柱
 *
 * 市井坊是一圈八根繞著廣場。這裡廣場照樣一圈八根（轉半格，不擋在四條路的正中），
 * 再沿市街兩側、小巷、後巷與橋頭各立幾根，夜裡沿著燈走得到村子的每一頭。
 * 擺之前看一下頭上：落在屋裡或屋簷下的那幾根就不擺
 */
function placeLampList(state: Uint8Array): void {
  const { x: centerX, z: centerZ } = VILLAGE_CENTER
  const groundY = TERRACE_GROUND_Y
  const pointList: { x: number; z: number }[] = []

  for (let step = 0; step < 8; step++) {
    const angle = ((step + 0.5) / 8) * Math.PI * 2
    pointList.push({
      x: Math.round(Math.cos(angle) * (PLAZA_RADIUS + 2)),
      z: Math.round(Math.sin(angle) * (PLAZA_RADIUS + 2)),
    })
  }
  for (const offsetX of [-30, -22, -14, 14, 22]) {
    for (const side of [-1, 1]) {
      pointList.push({ x: offsetX, z: side * MAIN_STREET_HALF_WIDTH })
    }
  }
  pointList.push(
    { x: -2, z: -16 },
    { x: 2, z: -28 },
    { x: -2, z: STREAM_Z - 2 },
    { x: 2, z: STREAM_Z + 3 },
    { x: -2, z: 30 },
    { x: -10, z: BACK_ALLEY_Z + 2 },
    { x: 18, z: BACK_ALLEY_Z + 2 },
  )

  for (const point of pointList) {
    const x = centerX + point.x
    const z = centerZ + point.z
    if (isUnderRoof(state, x, groundY, z))
      continue
    placeLampPost(state, x, groundY, z)
  }
}

/** 一塊田的大小（格），含四周一格的田埂 */
const PLOT_SIZE = 11

/** 每一塊田種什麼 */
const PLOT_CROP_LIST = [
  BlockId.FLOWER_TULIP,
  BlockId.FLOWER_TULIP,
  BlockId.FLOWER_DANDELION,
  BlockId.FLOWER_DANDELION,
  BlockId.FLOWER_VIOLA,
  BlockId.TALL_GRASS,
] as const

/** 一塊田的固定亂數：同一塊田每次生成都種一樣的東西 */
function hashPlot(plotX: number, plotZ: number): number {
  const value = Math.sin(plotX * 127.1 + plotZ * 311.7) * 43758.5453
  return value - Math.floor(value)
}

/**
 * 這一格要不要留空
 *
 * 從回程門往西那一條、南北小巷往外那兩條是走出田裡的路；
 * 台地邊外一格也留一圈草，花田才是貼著村子鋪開，而不是種到牆腳
 */
function isFieldPath(x: number, z: number): boolean {
  const isPortalPath = x < VILLAGE_CENTER.x && Math.abs(z - VILLAGE_PORTAL_POINT.z) <= 2
  const isLanePath = Math.abs(x - VILLAGE_CENTER.x) <= LANE_HALF_WIDTH + 1
  return isPortalPath || isLanePath || measureTerraceDistance(x, z) < TERRACE_RADIUS + 1.5
}

/**
 * 花田
 *
 * 市井坊的花只是撒在草地上；這裡是村子外圍的田：切成一塊一塊，每塊種一種花、一行一行種，
 * 有的田四周圍一圈籬笆（每邊正中留一個缺口），有的田埂邊堆幾捆乾草。
 * 越往外越稀，接到草坡時已經只剩零星的高草
 */
function plantFieldList(state: Uint8Array): void {
  const random = createSeededRandom('village-field')
  const groundY = FIELD_Y + 1
  const { x: centerX, z: centerZ } = VILLAGE_CENTER
  const reach = FIELD_OUTER_RADIUS

  for (let x = centerX - reach; x <= centerX + reach; x++) {
    for (let z = centerZ - reach; z <= centerZ + reach; z++) {
      if (getBlock(state, x, FIELD_Y, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue
      if (isFieldPath(x, z))
        continue

      const radius = Math.hypot(x - centerX, z - centerZ)
      const shiftedX = x - centerX + PLOT_SIZE * 20
      const shiftedZ = z - centerZ + PLOT_SIZE * 20
      const plotX = Math.floor(shiftedX / PLOT_SIZE)
      const plotZ = Math.floor(shiftedZ / PLOT_SIZE)
      const localX = shiftedX % PLOT_SIZE
      const localZ = shiftedZ % PLOT_SIZE
      const plotHash = hashPlot(plotX, plotZ)
      const isBorder = localX === 0 || localZ === 0
      const isGap = localX === Math.floor(PLOT_SIZE / 2) || localZ === Math.floor(PLOT_SIZE / 2)

      /** 外圈的田漸漸荒成草地：離台地越遠，整塊田「還有人種」的機率越低 */
      const tendedChance = 1 - Math.max(0, (radius - 40) / (FIELD_OUTER_RADIUS - 40))
      const isTended = plotHash * 0.999 < tendedChance

      if (isBorder) {
        if (isTended && plotHash > 0.55 && !isGap) {
          setBlock(state, x, groundY, z, BlockId.FENCE)
        }
        else if (isTended && localX === 0 && localZ === 0 && plotHash < 0.3) {
          /** 田角堆一捆乾草，偶爾疊兩捆 */
          setBlock(state, x, groundY, z, BlockId.HAY)
          if (random() < 0.4) {
            setBlock(state, x, groundY + 1, z, BlockId.HAY)
          }
        }
        continue
      }

      if (!isTended) {
        if (random() < 0.12) {
          plantWithStack(state, x, groundY, z, BlockId.TALL_GRASS, random)
        }
        continue
      }

      /** 一行一行種，行與行之間空一行；行的方向每塊田各自決定 */
      const isRowAlongX = hashPlot(plotX + 17, plotZ - 5) < 0.5
      const isRow = (isRowAlongX ? localZ : localX) % 2 === 1
      if (!isRow || random() < 0.12)
        continue

      const crop = PLOT_CROP_LIST[Math.floor(hashPlot(plotX - 3, plotZ + 29) * PLOT_CROP_LIST.length)] ?? BlockId.TALL_GRASS
      plantWithStack(state, x, groundY, z, crop, random)
    }
  }
}

/**
 * 台地上的草花與草坡上的野草
 *
 * 台地上照市井坊撒（比那裡稀一點，屋子之間才不會被雜草淹掉）；
 * 草坡上多半是高草，偶爾一朵蒲公英，越往稜線越稀
 */
function scatterPlantList(state: Uint8Array): void {
  const random = createSeededRandom('village-plant')
  const { x: centerX, z: centerZ } = VILLAGE_CENTER

  for (let x = centerX - HILL_OUTER_RADIUS; x <= centerX + HILL_OUTER_RADIUS; x++) {
    for (let z = centerZ - HILL_OUTER_RADIUS; z <= centerZ + HILL_OUTER_RADIUS; z++) {
      if (isInsideCurb(x, z)) {
        if (getBlock(state, x, TERRACE_Y, z) === BlockId.GRASS
          && getBlock(state, x, TERRACE_GROUND_Y, z) === BlockId.AIR
          && random() < 0.09) {
          plantWithStack(state, x, TERRACE_GROUND_Y, z, pickTerraceFlower(random), random)
        }
        continue
      }

      if (measureHillHeight(x, z) === 0)
        continue

      const topY = findTopSolidY(state, x, z, VILLAGE_SCAN_TOP_Y)
      if (!GRASS_SET.has(getBlock(state, x, topY, z)) || getBlock(state, x, topY + 1, z) !== BlockId.AIR)
        continue

      const roll = random()
      if (roll < 0.1) {
        plantWithStack(state, x, topY + 1, z, BlockId.TALL_GRASS, random)
      }
      else if (roll < 0.112) {
        setBlock(state, x, topY + 1, z, BlockId.FLOWER_DANDELION)
      }
    }
  }
}

/**
 * 飛石
 *
 * 大廳那座門外是一排從禪庭中心過來的飛石；回程門外照樣一排，往西走進花田，
 * 南北小巷出了台地也各接一排。只擺在乾淨的草上
 */
function placeSteppingStoneList(state: Uint8Array): void {
  const random = createSeededRandom('village-stepping')
  const groundY = FIELD_Y + 1
  const routeList = [
    { x: VILLAGE_PORTAL_POINT.x - 2, z: VILLAGE_PORTAL_POINT.z, stepX: -1, stepZ: 0 },
    { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z - TERRACE_RADIUS, stepX: 0, stepZ: -1 },
    { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z + TERRACE_RADIUS, stepX: 0, stepZ: 1 },
  ]

  for (const route of routeList) {
    let travelled = 0
    for (let index = 0; index < 9; index++) {
      travelled += 1 + Math.floor(random() * 2)
      const side = Math.round(random() * 2 - 1)
      const x = route.x + route.stepX * travelled + route.stepZ * side
      const z = route.z + route.stepZ * travelled + route.stepX * side
      if (getBlock(state, x, FIELD_Y, z) !== BlockId.GRASS || getBlock(state, x, groundY, z) !== BlockId.AIR)
        continue

      setBlock(state, x, groundY, z, BlockId.STEPPING_STONE)
    }
  }

  /**
   * 台地邊的石階
   *
   * 台地比田地高一整格，人走不上去得跳。三條路出台地的地方（回程門外、小巷南北兩頭），
   * 石砌邊外面那一排補一列石半磚，一格的落差拆成兩個半階
   */
  const stepList = [
    { x: VILLAGE_PORTAL_POINT.x - 2, z: VILLAGE_PORTAL_POINT.z, alongX: false },
    { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z - TERRACE_RADIUS, alongX: true },
    { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z + TERRACE_RADIUS, alongX: true },
  ]
  for (const step of stepList) {
    for (let offset = -2; offset <= 2; offset++) {
      const x = step.x + (step.alongX ? offset : 0)
      const z = step.z + (step.alongX ? 0 : offset)
      if (getBlock(state, x, FIELD_Y, z) === BlockId.GRASS && getBlock(state, x, groundY, z) !== BlockId.FENCE)
        setBlock(state, x, groundY, z, BlockId.STONE_SLAB)
    }
  }
}

/** 生成整座村落 */
export function generateVillageWorld(state: Uint8Array): void {
  shapeTerrain(state)
  pavePathList(state)
  carveStream(state)
  placeBuildingList(state)
  placeLampList(state)
  placeSteppingStoneList(state)
  /** 細節的造景零件排在種田之前，田裡的作物會繞著它們長（見 village-detail） */
  placeVillageSetPieceList(state)
  plantFieldList(state)
  scatterPlantList(state)
  /** 地被補在花草之後，只做在外圍的丘陵上 */
  scatterVillageDetail(state)

  /** 門框排在花草之後：門洞前後與木牌前面的花草由它清掉 */
  for (const portal of VILLAGE_REALM.portalList) {
    placePortalStructure(state, portal)
  }
}
