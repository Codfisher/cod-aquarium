import { fbm2D } from '../../../utils/noise'
import { WORLD_HEIGHT, WORLD_SIZE } from '../../world/world-constants'

/**
 * 雪稜的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 雪稜是雪稜丘的放大版：雪稜丘是一方雪地木座，一道從西北往東南的岩稜隆起，
 * 稜頂積雪、山腰露岩，雪線底下撒一層薄雪；山腳一窪凍住的融雪池，
 * 幾株被風壓歪的矮松，雪上零星的石生植物與枯灌叢，角落兩盞石燈籠。
 * 這裡把木座換成雲海上的一座雪山：同一道西北往東南的岩稜放大成走得上去的山稜，
 * 兩側的雪坡往外緩緩落到一圈雪原，雪原外緣是斷崖，崖下是雲海；
 * 稜線兩頭拔起走不上去的岩峰，四周一圈積雪的遠山
 */

/** 雪山的中心，也是遠山與雲海的中心 */
export const ALPINE_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 雲海的那一層高度（格）
 *
 * 這一層以下的方塊全換成不畫的 LAKE_BED：斷崖插進雲裡，雲面以下的崖壁與地面沒有人看得到，
 * 照方塊畫只是白白多出幾萬個三角形。雲面本身由布景畫（見 alpine/cloud-sea）
 */
export const CLOUD_SEA_Y = 6

/** 雲面的世界高度：比最上面那一層不畫的方塊再高一點，崖腳插進雲裡、看不到切口 */
export const CLOUD_SEA_SURFACE_Y = CLOUD_SEA_Y + 0.6

/**
 * 稜線的基準高度（頂面那一格）
 *
 * 人站在稜上，眼睛離雲面二十來格，抬頭還有十來格給兩頭的岩峰
 */
export const CREST_Y = 27

/** 雪坡落到底的那一圈雪原（頂面那一格），比雲面高十一格 */
export const SNOWFIELD_Y = 17

/** 岩峰最高長到這裡，再上去就是世界頂 */
export const PEAK_TOP_Y = WORLD_HEIGHT - 1

/**
 * 稜線沿哪個方向走
 *
 * 與雪稜丘那道岩稜同一個走向：從西北往東南。
 * along 是沿著稜線的距離（往東南為正），across 是橫過稜線的距離（往東北為正）
 */
const RIDGE_AXIS_SCALE = Math.SQRT1_2

/** 稜線走到離中心幾格開始拔成岩峰，兩頭各一座，走不上去 */
export const PEAK_START_ALONG = 40

/**
 * 雪原外緣的斷崖離中心幾格
 *
 * 外緣吃噪音（正負四格上下），最近也在推回線外六格，
 * 衝刺著往外走被推回時停下來的位置離崖邊還有好幾步
 */
export const CLIFF_RADIUS = 64
export const CLIFF_NOISE_AMPLITUDE = 4

/**
 * 邊界
 *
 * 雪原外圈開始迎著崖下吹上來的風，越往外走越慢，過了推回線就被風往回推。
 * 斷崖在推回線外六格以上，人走不到崖邊；兩頭的岩峰本身就爬不上去
 */
export const ALPINE_SLOW_RADIUS = 46
export const ALPINE_PUSH_RADIUS = 54

/**
 * 回程的傳送門
 *
 * 立在雪山西側一片整平的雪台外緣，門洞沿 Z 軸攤開、面朝西邊的雲海。
 * 大廳那座立在雪稜丘木座西緣，人往東穿過門走進木座；
 * 到這裡落在門的東側三格、仍面朝東，岩稜就斜斜橫在正前方
 */
export const ALPINE_PORTAL_POINT = { x: ALPINE_CENTER.x - 34, z: ALPINE_CENTER.z }

/**
 * 門前那一片雪台的頂面高度
 *
 * 雪坡在這裡本來就差不多是這個高度，整平之後門柱、木牌與燈籠落在同一排雪上
 */
export const PORTAL_TERRACE_Y = 21

/** 雪台的範圍：門那一排往東（往山裡）幾格、左右各幾格，外面再兩格混回原本的坡 */
export const PORTAL_TERRACE = {
  inlandDepth: 6,
  halfWidth: 6,
  blend: 3,
} as const

/** 橫過稜線的位置被噪音推移幾格：只用到直線的距離，稜線就是一道筆直的屋脊 */
function measureRidgeShift(x: number, z: number): number {
  return fbm2D(x * 0.028 + 11, z * 0.028 - 7, 3, 0.5) * 9
}

/** 某一點相對稜線的座標，見 RIDGE_AXIS_SCALE */
export function measureRidgeCoordinate(x: number, z: number): { along: number; across: number } {
  const offsetX = x - ALPINE_CENTER.x
  const offsetZ = z - ALPINE_CENTER.z
  return {
    along: (offsetX + offsetZ) * RIDGE_AXIS_SCALE,
    across: (offsetX - offsetZ) * RIDGE_AXIS_SCALE - measureRidgeShift(x, z),
  }
}

/** 從稜線座標換回世界座標（不含稜線的噪音推移，只拿來擺東西） */
export function toRidgeWorldPoint(along: number, across: number): { x: number; z: number } {
  return {
    x: Math.round(ALPINE_CENTER.x + (along + across) * RIDGE_AXIS_SCALE),
    z: Math.round(ALPINE_CENTER.z + (along - across) * RIDGE_AXIS_SCALE),
  }
}

/**
 * 融雪池
 *
 * 雪稜丘的那一窪在山腳，外圈壓實的冰、中間半透明的冰，與雪地齊平，冰面映著天。
 * 這裡在兩側雪原各擺一窪大一點的，一窪在西南、出生點看得到，一窪在稜線另一側的東北。
 * 地形 worker 挖池、渲染端在冰面上鋪倒影（alpine-realm 的 mirrorTargetList）都讀這一份
 */
export const ALPINE_POND_LIST = [
  { id: 'alpine-pond-west', ...toRidgeWorldPoint(8, -37), radius: 5.5 },
  { id: 'alpine-pond-east', ...toRidgeWorldPoint(-12, 35), radius: 4.5 },
] as const

/** 某一點離中心的距離減掉這個方位的崖邊半徑，正值就是崖外（雲海上） */
export function measureCliffOvershoot(x: number, z: number): number {
  const distance = Math.hypot(x - ALPINE_CENTER.x, z - ALPINE_CENTER.z)
  const edge = CLIFF_RADIUS + fbm2D(x * 0.045 - 31, z * 0.045 + 17, 3, 0.5) * CLIFF_NOISE_AMPLITUDE
  return distance - edge
}

/**
 * 細節那一層的定點（見 alpine-detail）
 *
 * 放在這裡而不是 alpine-detail：神遊的特色清單也要讀，而 alpine-detail 引用場景定義，
 * 特色清單再引用它會繞成一圈
 */

/**
 * 冰柱岩門：回程門與西南融雪池之間的雪原上，兩根岩柱頂著一道橫岩，橫岩底下垂著冰柱
 *
 * 座標是西側那根岩柱，橫岩沿 X 軸攤開，人從底下南北向穿過去
 */
export const ALPINE_ICE_ARCH_POINT = toRidgeWorldPoint(0, -30)
/** 兩根岩柱隔幾格（門洞淨寬是這個數字減一） */
export const ALPINE_ICE_ARCH_SPAN = 3
/** 橫岩比雪面高幾格：門洞淨高三格 */
export const ALPINE_ICE_ARCH_HEIGHT = 4

/** 西南融雪池冰面上的釣洞：鑿開一格冰露出底下的水，旁邊一只竹簍與一截當釣竿的枯枝 */
export const ALPINE_ICE_HOLE_POINT = { x: ALPINE_POND_LIST[0].x - 1, z: ALPINE_POND_LIST[0].z + 1 }

/** 稜線上的疊石：沿著稜線每隔十來格一座，鞍部那一格已經有石燈籠所以跳過 */
export const ALPINE_CAIRN_ALONG_LIST = [-30, -20, -10, 10, 20, 30] as const
