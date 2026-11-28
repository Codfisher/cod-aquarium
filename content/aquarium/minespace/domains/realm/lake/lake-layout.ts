import { WORLD_SIZE } from '../../world/world-constants'
import { createIslandShape } from '../island-shape'

/**
 * 湖中島的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 湖中島是水鏡池的放大版：水鏡池是一方草地木座上挖一池水，
 * 這裡把木座換成湖心的一座草島，島中央再挖一池水——湖中有島，島中有湖。
 * 池裡的半磚木棧、紙燈、青苔立石、盆景松、睡蓮與紙莎草都照著水鏡池來
 */

/** 湖心，也是島心、島中池心與遠景山稜環的中心 */
export const LAKE_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 湖面那一層方塊的高度
 *
 * 水面的世界高度是這一格的頂面再矮八分之一格（LIQUID_SURFACE_DROP），約 10.4。
 * 底下留得出七格深的湖，上面還有三十格給島上的東西
 */
export const LAKE_WATER_Y = 10

/** 水面的世界高度，布景的湖面要與方塊的水面齊平 */
export const LAKE_WATER_SURFACE_Y = LAKE_WATER_Y + 0.5 - 0.125

/**
 * 島的半徑（岸線，格）
 *
 * 直徑約五十格。岸線吃噪音，實際會在正負三格之間起伏
 */
export const ISLAND_RADIUS = 25

/**
 * 岸線往內幾格是沙灘
 *
 * 沙灘與湖面齊平，再往內才是高出一格的草地。
 * 那一格的落差就是水鏡池木座的邊：草地是被「端起來」的
 */
export const BEACH_WIDTH = 3

/** 島上草地那一層方塊的高度，比湖面高一格 */
export const ISLAND_GROUND_Y = LAKE_WATER_Y + 1

/** 淺灘延伸到岸線外多遠，這一圈清澈見底、看得到焦散 */
export const SHALLOW_WIDTH = 8

/** 深水的湖底高度，水深七格 */
export const DEEP_FLOOR_Y = 3

/**
 * 島中央那一池水的半徑（格）
 *
 * 直徑約二十格，岸線同樣吃噪音。水面與草地齊平，比外面的湖高一格
 */
export const ISLAND_POND_RADIUS = 10

/**
 * 島形
 *
 * 岸線吃兩層噪音（正負三格上下），回程門立在島北緣草地的最外一排，門洞沿 X 軸攤開、面朝北邊的湖。
 * 從大廳往南穿過門，到這裡時人在門的南側、面朝島中央的池子，等於一路往前走進島裡。
 * 門前左右五格、往內兩排到沙灘外一排的岸線拉直，門框、西側三格的木牌與東側四格的燈籠
 * 才會落在同一排草地上（見 island-shape 的 apron）
 */
const LAKE_ISLAND = createIslandShape({
  center: LAKE_CENTER,
  radius: ISLAND_RADIUS,
  beachWidth: BEACH_WIDTH,
  noiseList: [
    { frequency: 0.06, octaveCount: 3, amplitude: 4 },
    { frequency: 0.13, octaveCount: 2, amplitude: 1.2 },
  ],
  portalSide: 'north',
  apron: { halfWidth: 5, inlandDepth: 2, blend: 2 },
})

/** 回程的傳送門，見 LAKE_ISLAND */
export const LAKE_PORTAL_POINT = LAKE_ISLAND.portalPoint

/**
 * 島上某一點離湖心的「岸線距離」
 *
 * 小於 ISLAND_RADIUS 是島，再減掉 BEACH_WIDTH 以內是草地。
 * 門前那一段改成以門的那一排為界的直線：門那一排以內是草地，往北三排沙灘，再往北是水
 */
export const measureShoreDistance = LAKE_ISLAND.measureShoreDistance

/**
 * 池裡的半磚木棧
 *
 * 照水鏡池那條放大一倍：從池子南岸斜斜伸進水裡，往東北收在池子東側，
 * 盡頭一根木柱頂著紙燈。座標都是相對池心（湖心）的偏移；
 * 每一步往東一格、往北一格，兩排並著走，人沿對角線走得過去
 */
export const BOARDWALK = {
  /** 從這一格開始（池子南岸的草地上），往東北走 */
  startOffsetX: -1,
  startOffsetZ: 13,
  /** 走幾步 */
  stepCount: 10,
  /** 甲板是下半磚，鋪在池面上一格 */
  deckY: ISLAND_GROUND_Y + 1,
} as const

/**
 * 邊界
 *
 * 淺灘外緣再往外幾格開始游不快，過了推回線就被輕輕推回岸邊。
 * 推回線離世界邊界還有八十格，夾在世界邊上的那道保險永遠碰不到，
 * 世界外湖面的接縫也總在幾十格之外（見 backdrop 的 LAKE_PLANE_FEATHER_WIDTH）
 */
export const LAKE_SLOW_RADIUS = ISLAND_RADIUS + SHALLOW_WIDTH + 4
export const LAKE_PUSH_RADIUS = LAKE_SLOW_RADIUS + 20

/**
 * 細節那一層的定點（見 lake-detail）
 *
 * 放在這裡而不是 lake-detail：神遊的特色清單也要讀，而 lake-detail 引用場景定義，
 * 特色清單再引用 lake-detail 會繞成一圈
 */

/** 池畔長椅：池子西岸，椅背朝西，坐著往東看整池水與木棧盡頭的紙燈 */
export const LAKE_BENCH_POINT = { x: LAKE_CENTER.x - 12, z: LAKE_CENTER.z + 1 }

/**
 * 東岸的短棧與小舟
 *
 * 短棧從沙灘往東伸進湖裡，小舟橫靠在棧的南側。座標是棧根（最後一格沙灘的下一格）
 */
const JETTY_Z = LAKE_CENTER.z + 12
export const LAKE_JETTY_LENGTH = 5

/** 從湖心沿 +X 找出 JETTY_Z 那一排的岸線：第一格水 */
function findJettyStartX(): number {
  for (let x = LAKE_CENTER.x; x < LAKE_CENTER.x + ISLAND_RADIUS + 8; x++) {
    if (measureShoreDistance(x, JETTY_Z) >= ISLAND_RADIUS)
      return x
  }
  return LAKE_CENTER.x + ISLAND_RADIUS
}

export const LAKE_JETTY_POINT = { x: findJettyStartX(), z: JETTY_Z }
/** 小舟的中心：棧的中段、南側兩格 */
export const LAKE_BOAT_POINT = { x: LAKE_JETTY_POINT.x + 3, z: JETTY_Z + 2 }

/** 西南淺灘裡的三顆石：從湖心往西南走到岸線外幾格 */
function findOffshorePoint(directionX: number, directionZ: number, offshore: number): { x: number; z: number } {
  const length = Math.hypot(directionX, directionZ)
  for (let step = ISLAND_RADIUS - 6; step < ISLAND_RADIUS + SHALLOW_WIDTH + 6; step += 0.5) {
    const x = Math.round(LAKE_CENTER.x + (directionX / length) * step)
    const z = Math.round(LAKE_CENTER.z + (directionZ / length) * step)
    if (measureShoreDistance(x, z) >= ISLAND_RADIUS + offshore)
      return { x, z }
  }
  return { x: LAKE_CENTER.x, z: LAKE_CENTER.z + ISLAND_RADIUS + offshore }
}

export const LAKE_ROCK_ISLET_POINT = findOffshorePoint(-1, 0.75, 4)
/** 南灘的疊石：島的最南端，沙灘上 */
export const LAKE_CAIRN_POINT = findOffshorePoint(0.15, 1, -2)
