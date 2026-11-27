import { fbm2D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 千頃麥浪的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 這裡是麥浪田的放大版：麥浪田是一方土色木座，麥子照壟一行一行種、每四行空一行，
 * 一條三格寬的碎石路從南到北穿過去，田裡一個稻草人、田邊幾捆草束、兩盞石燈籠，
 * 空著的壟上冒出幾株蒲公英與堇。這裡把木座拿掉，田一塊接一塊鋪到天邊：
 * 地面是又長又緩的起伏，風一吹，整片麥子從這頭倒到那頭
 */

/** 麥田的中心，也是十字路口、遠景與邊界的中心 */
export const WHEATFIELD_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 平地那一層土的高度
 *
 * 起伏只有幾格，底下留幾格土石就夠，上面還有三十格的天
 */
export const WHEATFIELD_GROUND_Y = 8

/** 碎石路往兩側各幾格：與麥浪田那條一樣三格寬 */
export const WHEATFIELD_ROAD_HALF_WIDTH = 1

/**
 * 回程門
 *
 * 大廳那座門立在麥浪田西半邊、碎石路往西岔出去的那一小段路的盡頭，門洞朝東，
 * 人從路上往西穿過去。這裡的門也立在一條路的東端，門洞朝東，
 * 人到了之後仍是往西走：腳下的東西向碎石路一路通到十字路口，兩側是看不到邊的麥子
 */
export const WHEATFIELD_PORTAL_POINT = { x: WHEATFIELD_CENTER.x + 24, z: WHEATFIELD_CENTER.z }

/**
 * 大廳那座門離麥浪田中心的偏移
 *
 * 麥浪田的正中是南北向的碎石路，出生點就在它南端外面、面朝北看著這條路，
 * 門立在路上會正好擋在那一眼的正中央。所以往西挪五格，立在路西側的麥子裡，
 * 門洞朝東對著路，路與門之間鋪一小段碎石（見 buildWheatGarden）；
 * 東邊五格是稻草人，一門一人分站路的兩側
 */
export const WHEATFIELD_HUB_GATE_OFFSET = { x: -5, z: 0 } as const

/**
 * 外圍的緩坡
 *
 * 平地的起伏到 RISE_START 開始往上抬，到 CREST 最高、高出平地 CREST_HEIGHT 格，
 * 再往外到 OUTER 落回平地的高度。坡做得很矮：這片田要的是「看得到天邊」，
 * 從田裡望出去，緩坡後面是一路鋪到地平線的麥色平面與幾道很淡的遠丘
 */
const RISE_START_RADIUS = 74
export const WHEATFIELD_CREST_RADIUS = 100
const CREST_HEIGHT = 4
/** 超過這個半徑就是不畫的底層（LAKE_BED），由布景的地面平面代替 */
export const WHEATFIELD_OUTER_RADIUS = 112

/**
 * 邊界：走上緩坡越走越慢，過了推回線被推回田裡
 *
 * 推回線在坡的半腰，人最遠到九十格上下，坡頂還在十格外
 */
export const WHEATFIELD_SLOW_RADIUS = 74
export const WHEATFIELD_PUSH_RADIUS = 88

/** 從 from 到 to 平滑地由零升到一 */
function smoothRange(value: number, from: number, to: number): number {
  return smoothStep((value - from) / (to - from))
}

/**
 * 外圍緩坡用的半徑
 *
 * 吃一層很低頻的噪音，坡腳不是一個正圓
 */
export function measureWheatfieldRadius(x: number, z: number): number {
  return Math.hypot(x - WHEATFIELD_CENTER.x, z - WHEATFIELD_CENTER.z)
    + fbm2D(x * 0.025 - 17, z * 0.025 + 5, 2, 0.5) * 8
}

/**
 * 沒有拉平門前之前的起伏（可以是小數）
 *
 * 一道起伏五十來格長、高兩格多，量化成一格一格的台階之後，
 * 站在田裡看出去是一層一層慢慢升起又沉下去的麥浪
 */
function measureRawHeight(x: number, z: number): number {
  const radius = measureWheatfieldRadius(x, z)
  if (radius >= WHEATFIELD_OUTER_RADIUS)
    return 0

  const swell = (fbm2D(x * 0.02 + 3, z * 0.02 - 11, 2, 0.5) + 1) * 2
  const swellFade = 1 - smoothRange(radius, WHEATFIELD_CREST_RADIUS - 8, WHEATFIELD_OUTER_RADIUS)
  const rise = Math.min(
    smoothRange(radius, RISE_START_RADIUS, WHEATFIELD_CREST_RADIUS),
    1 - smoothRange(radius, WHEATFIELD_CREST_RADIUS + 2, WHEATFIELD_OUTER_RADIUS),
  )
  return Math.max(0, swell * swellFade + CREST_HEIGHT * rise)
}

/** 回程門那一小塊平地高出平地幾格，門柱與木牌都要站在同一層 */
export const WHEATFIELD_PORTAL_LEVEL = Math.round(measureRawHeight(WHEATFIELD_PORTAL_POINT.x, WHEATFIELD_PORTAL_POINT.z))

/**
 * 地面在這一格高出平地幾格（零以上的整數）
 *
 * 回程門四周五格內拉平到門的那一層，再往外七格慢慢混回起伏
 */
export function measureWheatfieldHeight(x: number, z: number): number {
  const raw = measureRawHeight(x, z)
  const portalDistance = Math.hypot(x - WHEATFIELD_PORTAL_POINT.x, z - WHEATFIELD_PORTAL_POINT.z)
  const flatten = 1 - smoothRange(portalDistance, 5, 12)
  return Math.round(raw + (WHEATFIELD_PORTAL_LEVEL - raw) * flatten)
}

/** 這一格是不是碎石路：南北一條穿過十字路口，東西一條從回程門往西通到底 */
export function isWheatfieldRoad(x: number, z: number): boolean {
  const isNorthSouth = Math.abs(x - WHEATFIELD_CENTER.x) <= WHEATFIELD_ROAD_HALF_WIDTH
  const isEastWest = Math.abs(z - WHEATFIELD_CENTER.z) <= WHEATFIELD_ROAD_HALF_WIDTH
    && x <= WHEATFIELD_PORTAL_POINT.x + 1
  return isNorthSouth || isEastWest
}
