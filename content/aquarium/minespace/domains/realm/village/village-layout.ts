import { fbm2D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 村落的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 村落是市井坊的放大版：市井坊是一方草地木座，中央石板廣場與一口井，
 * 三間小屋圍著廣場、西南角一座鐘樓、一圈紙燈柱、市集的雜物與花盆。
 * 這裡把木座換成一塊高出田地一格的台地（村子），台地上一條東西向的市街穿過廣場，
 * 南北一條小巷；台地外是花田與草坡，再往外是一圈緩緩隆起的丘陵
 */

/** 村子中心，也是廣場的井、遠景山稜環與邊界的中心 */
export const VILLAGE_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 田地那一層草的高度
 *
 * 底下留三格土石、上面三十格給鐘樓與丘陵，與湖中島的湖面同一個量級
 */
export const FIELD_Y = 8

/**
 * 村子台地那一層草的高度，比田地高一格
 *
 * 那一格的落差就是市井坊木座的邊：村子是被「端起來」的，門立在它的邊上
 */
export const TERRACE_Y = FIELD_Y + 1

/** 站在台地上的腳底整數高度，屋子、攤子、燈柱都從這裡往上長 */
export const TERRACE_GROUND_Y = TERRACE_Y + 1

/**
 * 台地的半徑（格）
 *
 * 用四次方的超橢圓量距離：比圓方正、四角又是圓的，像一塊放大的木座，
 * 卻不是一個一眼就看得出的正方形。正東西南北的邊在三十四格
 */
export const TERRACE_RADIUS = 34

/** 超橢圓的次方，越大越方 */
const TERRACE_POWER = 4

/** 台地邊緣吃的噪音幅度（格），門前那一段不吃，見 measureTerraceDistance */
const TERRACE_NOISE_AMPLITUDE = 1.6

/** 東西向的市街從中心往南北各幾格，七格寬：中間走人、兩側擺攤 */
export const MAIN_STREET_HALF_WIDTH = 3

/** 南北向的小巷往東西各幾格，三格寬 */
export const LANE_HALF_WIDTH = 1

/** 中央石板廣場的半徑，市井坊是七格半 */
export const PLAZA_RADIUS = 9.5

/**
 * 回程的傳送門
 *
 * 立在台地西緣、石砌邊往內一格（與大廳那座立在木座最外圈往內一格同一個規矩），
 * 正對市街的西端，門洞沿 Z 軸攤開、面朝西。
 * 從大廳往東穿過門，到這裡仍是往東走：市街、攤子與廣場的井在正前方
 */
export const VILLAGE_PORTAL_POINT = {
  x: VILLAGE_CENTER.x - TERRACE_RADIUS + 2,
  z: VILLAGE_CENTER.z,
}

/**
 * 門前不吃噪音的範圍
 *
 * 台地邊緣吃噪音的話，門柱可能一根在台地上、一根掉到田裡；
 * 門南側三格的木牌也一樣。門前左右這幾格的邊拉直，再往外慢慢混回噪音
 */
const PORTAL_APRON_HALF_WIDTH = 7
const PORTAL_APRON_BLEND = 4

/** 花田從台地外一直鋪到這個半徑，再往外是草坡與丘陵 */
export const FIELD_OUTER_RADIUS = 58

/**
 * 丘陵
 *
 * 從田地外緣開始緩緩隆起，到稜線最高約十格，過了稜線再慢慢落回田地的高度。
 * 稜線之外整片換成不畫的底層（LAKE_BED），由布景的地面平面代替：
 * 從村子裡望出去只看得到內側的坡與稜線，稜線後面是更遠的布景山
 */
export const HILL_CREST_RADIUS = 94
/** 稜線最高高出田地幾格 */
export const HILL_PEAK_HEIGHT = 10
/** 過了稜線再幾格落回田地的高度 */
const HILL_OUTER_SLOPE_WIDTH = 16
/** 超過這個半徑就是不畫的底層 */
export const HILL_OUTER_RADIUS = HILL_CREST_RADIUS + HILL_OUTER_SLOPE_WIDTH

/**
 * 邊界
 *
 * 走上草坡就越走越慢，再往上過了推回線就被輕輕推回田裡。
 * 推回線落在坡的半腰，稜線還在十格外：人永遠看不到稜線後面那一片平面
 */
export const VILLAGE_SLOW_RADIUS = 66
export const VILLAGE_PUSH_RADIUS = 82

/** 從 from 到 to 平滑地由零升到一 */
function smoothRange(value: number, from: number, to: number): number {
  return smoothStep((value - from) / (to - from))
}

/**
 * 某一點離村子中心的「台地距離」
 *
 * 小於 TERRACE_RADIUS 是台地，最外一圈（減一以內）是石砌的邊。
 * 門前左右 PORTAL_APRON_HALF_WIDTH 格不吃噪音，邊是一條直線，門柱與木牌一定落在台地上
 */
export function measureTerraceDistance(x: number, z: number): number {
  const offsetX = Math.abs(x - VILLAGE_CENTER.x)
  const offsetZ = Math.abs(z - VILLAGE_CENTER.z)
  const shape = (offsetX ** TERRACE_POWER + offsetZ ** TERRACE_POWER) ** (1 / TERRACE_POWER)
  const noise = fbm2D(x * 0.07 + 31, z * 0.07 - 7, 3, 0.5) * TERRACE_NOISE_AMPLITUDE

  /** 門前那一段：西側、沿 Z 離門不到幾格的地方，噪音照比例收掉 */
  const isWestSide = x < VILLAGE_CENTER.x
  const along = Math.abs(z - VILLAGE_PORTAL_POINT.z) - PORTAL_APRON_HALF_WIDTH
  const apronWeight = isWestSide ? 1 - smoothRange(along, 0, PORTAL_APRON_BLEND) : 0

  return shape + noise * (1 - apronWeight)
}

/** 這一格是不是台地上（含石砌的邊） */
export function isOnTerrace(x: number, z: number): boolean {
  return measureTerraceDistance(x, z) < TERRACE_RADIUS
}

/**
 * 丘陵剖面用的半徑
 *
 * 吃一層很低頻的噪音：田地有的方位寬、有的方位窄，丘陵的腳不是一個正圓。
 * 超過 HILL_OUTER_RADIUS 的就是稜線後面那一片不畫的底層
 */
export function measureHillRadius(x: number, z: number): number {
  return Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z)
    + fbm2D(x * 0.03 + 5, z * 0.03 + 11, 2, 0.5) * 10
}

/**
 * 丘陵在這一格隆起幾格（零以上的整數）
 *
 * 半徑方向是一條先升後降的剖面，再疊一層低頻噪音讓稜線有起伏、
 * 一層較高頻的讓坡面有一個一個的小丘，丘陵才不是一圈車床車出來的環
 */
export function measureHillHeight(x: number, z: number): number {
  const radius = measureHillRadius(x, z)
  if (radius <= FIELD_OUTER_RADIUS || radius >= HILL_OUTER_RADIUS)
    return 0

  const rise = smoothRange(radius, FIELD_OUTER_RADIUS, HILL_CREST_RADIUS)
  const fall = 1 - smoothRange(radius, HILL_CREST_RADIUS + 2, HILL_OUTER_RADIUS)
  const swell = 0.75 + fbm2D(x * 0.045 - 13, z * 0.045 + 3, 3, 0.5) * 0.6
  const knoll = fbm2D(x * 0.11 + 2, z * 0.11 - 9, 2, 0.5) * 1.6 * rise
  return Math.max(0, Math.round(HILL_PEAK_HEIGHT * Math.min(rise, fall) * swell + knoll))
}

/**
 * 市街西段兩側的攤子（相對村子中心，攤子正中那一格）
 *
 * 一攤三格寬、兩格深，靠街那一排是櫃台、裡面一排是貨；side 是攤子在街的哪一側（-1 北、1 南）。
 * 回程門到廣場這一段是市集；廣場東邊另有一座市場棚
 */
export const MARKET_STALL_LIST = [
  { offsetX: -27, side: -1 },
  { offsetX: -20, side: -1 },
  { offsetX: -13, side: -1 },
  { offsetX: -24, side: 1 },
  { offsetX: -17, side: 1 },
] as const

/** 北邊那條東西向的後巷（兩格寬），神社、高倉、陶房與望樓都面向它 */
export const BACK_ALLEY_Z = -20

/** 南邊那條東西向的水道（兩格寬、兩格深），水車架在上面，小巷用一座木橋跨過去 */
export const STREAM_Z = 18

/**
 * 一般的民家（相對村子中心）
 *
 * 每一塊地的屋型由 village-terrain 從一組各不相同的樣式裡挑（層數、牆、屋頂、門廊、露台、煙囪、小棚、小院），
 * 這裡只給地的大小與門朝哪條路
 */
export const HOUSE_LOT_LIST = [
  { offsetX: -27, offsetZ: -11, halfWidth: 4, halfDepth: 4, doorSide: 'south' },
  { offsetX: -17, offsetZ: -10, halfWidth: 3, halfDepth: 3, doorSide: 'south' },
  { offsetX: -9, offsetZ: -12, halfWidth: 3, halfDepth: 3, doorSide: 'south' },
  { offsetX: -27, offsetZ: 11, halfWidth: 4, halfDepth: 4, doorSide: 'north' },
  { offsetX: 26, offsetZ: 10, halfWidth: 3, halfDepth: 4, doorSide: 'north' },
  { offsetX: 8, offsetZ: 26, halfWidth: 3, halfDepth: 3, doorSide: 'north' },
  { offsetX: -4, offsetZ: 27, halfWidth: 2, halfDepth: 3, doorSide: 'east' },
] as const

/** 旅籠（茶屋兼旅店），全村最大的屋子；食肆的人聲從它門口出來 */
export const INN_POINT = { offsetX: 11, offsetZ: -13 }
/** 鍛冶屋，臨街一面敞開 */
export const SMITHY_POINT = { offsetX: 25, offsetZ: -10 }
/** 市場棚，廣場東邊 */
export const MARKET_HALL_POINT = { offsetX: 14, offsetZ: 9 }
/** 神社（石壇中心） */
export const SHRINE_POINT = { offsetX: -17, offsetZ: -25 }
/** 高倉 */
export const GRANARY_POINT = { offsetX: -6, offsetZ: -27 }
/** 陶房 */
export const POTTERY_POINT = { offsetX: 10, offsetZ: -27 }
/** 望樓，村子東北角 */
export const WATCH_TOWER_POINT = { offsetX: 25, offsetZ: -26 }
/** 湯屋 */
export const BATHHOUSE_POINT = { offsetX: -20, offsetZ: 25 }
/** 水車小屋；水車立在它北邊的水道裡 */
export const WATERMILL_POINT = { offsetX: 22, offsetZ: 24 }
/** 市街東端的屋根門 */
export const COVERED_GATE_POINT = { offsetX: 31, offsetZ: 0 }

/** 食肆的人聲擺在旅籠門口 */
export const EATERY_POINT = { offsetX: INN_POINT.offsetX, offsetZ: INN_POINT.offsetZ + 6 }

/** 鐘樓（相對村子中心），照市井坊擺在廣場西南角 */
export const BELL_TOWER_POINT = { offsetX: -13, offsetZ: 12 }

/** 鐘樓的尺寸：柱子離中心兩格、十格高，比兩層樓的屋頂高出一截 */
export const BELL_TOWER_SIZE = { postOffset: 2, height: 10, roofHalfSize: 3, spireLevelCount: 2 } as const

/** 灶：廣場西南邊的爐子與鍋（相對村子中心） */
export const HEARTH_POINT = { offsetX: -6, offsetZ: 6 }

/**
 * 細節那一層的定點（見 village-detail）
 *
 * 放在這裡而不是 village-detail：神遊的特色清單也要讀，而 village-detail 引用場景定義，
 * 特色清單再引用它會繞成一圈
 */

/** 村西田裡的草垛場：回程門外那條田間小路的南邊，一座大草垛、兩捆散的、一個稻草人與忘在田邊的鋤頭 */
export const VILLAGE_HAYSTACK_POINT = { x: VILLAGE_CENTER.x - 46, z: VILLAGE_CENTER.z + 9 }

/** 南丘上的見晴長椅：從村南的田往上走到丘腰，回頭看整座村子與鐘樓 */
export const VILLAGE_LOOKOUT_POINT = { x: VILLAGE_CENTER.x + 8, z: VILLAGE_CENTER.z + 71 }
