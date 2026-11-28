import { fbm2D, fbm3D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 地底洞窟的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 洞窟是岩響窟的放大版：岩響窟是碎石木座上一座中空的山，
 * 從洞口沿一條三格高的通道低頭鑽進去，走到底空間忽然打開，洞室底下一池地底湖，
 * 四周石筍、岩壁上的礦脈、最深處兩點鑽石的微光、洞頂的蛛網、幾盞燈籠指路。
 * 這裡把那一間洞室放大成一座大廳：碎石鋪地的前室（門在這裡）、一段低矮的通道、
 * 豁然開朗的大廳，大廳西側一池地底湖，石筍、鐘乳石與幾根頂天的石柱。
 *
 * 整個世界是實心的岩，看不到天。岩體絕大部分換成不畫的 LAKE_BED，
 * 只有貼著洞裡空氣（與水）的那一層才是畫得出來的岩壁，見 cave-terrain 的 exposeRockLining
 */

/** 世界中心 */
export const CAVE_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 洞底那一層方塊的高度，站在洞底的腳底整數高度是它再加一
 *
 * 底下留八格給地底湖與岩層，上面到世界頂（三十九）還有三十格給大廳的穹頂
 */
export const CAVE_FLOOR_Y = 8

/** 站在洞底的腳底整數高度 */
export const CAVE_GROUND_Y = CAVE_FLOOR_Y + 1

/**
 * 大廳：一個吃噪音的橢圓
 *
 * 東西四十四格、南北三十六格的半徑，中央穹頂離地二十格上下，往四周收到四五格高，
 * 牆腳是一圈往內傾的岩壁，不是一道直上直下的牆
 */
export const HALL_CENTER = { x: CAVE_CENTER.x - 8, z: CAVE_CENTER.z }
export const HALL_RADIUS_X = 44
export const HALL_RADIUS_Z = 36
/** 穹頂正中比洞底高幾格（不含噪音） */
const HALL_DOME_HEIGHT = 18
/** 牆腳那一圈還剩幾格高 */
const HALL_EDGE_HEIGHT = 4

/**
 * 前室：碎石鋪地的一間小洞，回程門立在它東邊
 *
 * 岩響窟的木座鋪的是碎石，前室就是那一方木座：從大廳回頭看，
 * 一盞一盞燈籠指向一間鋪著碎石的小室，門在最裡面
 */
export const GROTTO_CENTER = { x: CAVE_CENTER.x + 60, z: CAVE_CENTER.z }
export const GROTTO_RADIUS_X = 9
export const GROTTO_RADIUS_Z = 7
/** 前室的頂有多高：門框五格高，頂要再高一兩格才不壓著門 */
export const GROTTO_HEIGHT = 7

/**
 * 回程的傳送門
 *
 * 立在前室碎石地的東緣，門洞沿 Z 軸攤開、面朝東（與大廳那座立在岩響窟木座東緣同一個構圖）。
 * 從大廳往西穿過門鑽進山裡，到這裡仍是往西走：通道口與兩盞石燈籠在正前方
 */
export const CAVE_PORTAL_POINT = {
  x: GROTTO_CENTER.x + GROTTO_RADIUS_X - 3,
  z: GROTTO_CENTER.z,
}

/**
 * 門後那一段坍掉的舊洞口
 *
 * 門洞朝東，門後不能直接是岩壁（霧面後面一片灰牆很怪），
 * 往東挖一段三格寬的短坑道，盡頭是一堆坍下來的碎石與圓石，洞口風聲從那裡漏進來
 */
export const OLD_MOUTH = {
  startX: CAVE_PORTAL_POINT.x + 1,
  endX: CAVE_PORTAL_POINT.x + 9,
  z: CAVE_PORTAL_POINT.z,
}

/**
 * 前室到大廳的通道
 *
 * 照岩響窟：淨高三格、低著頭走，沿著折線彎進去；地面只往上起伏一格。
 * 座標是折線的節點，從前室西緣到大廳東緣
 */
export const TUNNEL_POINT_LIST = [
  { x: GROTTO_CENTER.x - GROTTO_RADIUS_X + 1, z: GROTTO_CENTER.z },
  { x: GROTTO_CENTER.x - 15, z: GROTTO_CENTER.z - 4 },
  { x: GROTTO_CENTER.x - 22, z: GROTTO_CENTER.z - 1 },
  { x: HALL_CENTER.x + HALL_RADIUS_X - 10, z: HALL_CENTER.z + 2 },
] as const

/** 通道中段，滴水聲擺在這裡 */
export const TUNNEL_MIDDLE = TUNNEL_POINT_LIST[2]

/**
 * 地底湖
 *
 * 偏在大廳西側，岸線吃噪音；水面與洞底齊平，深的一窪在湖心偏北
 */
export const UNDERGROUND_LAKE_CENTER = { x: HALL_CENTER.x - 20, z: HALL_CENTER.z + 6 }
export const UNDERGROUND_LAKE_RADIUS = 13

/**
 * 頂天的石柱（相對大廳中心）
 *
 * 大廳一眼望穿的話就只是一個大碗。幾根從地面一路接到穹頂的石柱把空間切開，
 * 燈籠的光打在柱子上，才看得出前後
 */
export const PILLAR_LIST = [
  { offsetX: 14, offsetZ: -12, radius: 2.4 },
  { offsetX: -4, offsetZ: 15, radius: 1.8 },
  { offsetX: 22, offsetZ: 14, radius: 1.6 },
  { offsetX: -30, offsetZ: -14, radius: 2.2 },
] as const

/**
 * 某一點在大廳橢圓裡的「正規化距離」，零是正中、一是牆腳
 *
 * 吃兩層噪音：低頻的讓牆有凹進去的龕、凸出來的岩鼻，高頻的讓牆面不平整
 */
export function measureHallDistance(x: number, z: number): number {
  const ratio = Math.hypot((x - HALL_CENTER.x) / HALL_RADIUS_X, (z - HALL_CENTER.z) / HALL_RADIUS_Z)
  const noise = fbm2D(x * 0.05 + 7, z * 0.05 - 3, 3, 0.5) * 0.14
    + fbm2D(x * 0.16 - 11, z * 0.16 + 5, 2, 0.5) * 0.04
  return ratio + noise
}

/**
 * 大廳這一格的洞頂比洞底高幾格
 *
 * 拋物面的穹頂，與岩響窟的山體同一種外形（中間高、邊緣自然收）；
 * 再疊一層噪音，穹頂才是凹凸的岩，不是一個光滑的碗
 */
export function measureHallHeight(x: number, z: number, distance: number): number {
  const dome = HALL_DOME_HEIGHT * (1 - Math.min(1, distance) ** 2)
  const roughness = fbm2D(x * 0.09 + 23, z * 0.09 + 41, 3, 0.5) * 3
  return Math.max(3, Math.round(HALL_EDGE_HEIGHT + dome + roughness))
}

/**
 * 洞底的起伏，零到二格
 *
 * 湖邊與通道口是平的：湖面要與洞底齊平，通道接進來的那一格也不能有坎。
 * 其餘的地方用低頻噪音推起一片一片的岩棚，大廳才不是一整塊平地
 */
export function measureFloorRise(x: number, z: number): number {
  const lakeDistance = Math.hypot(x - UNDERGROUND_LAKE_CENTER.x, z - UNDERGROUND_LAKE_CENTER.z)
  const lakeCalm = smoothStep((lakeDistance - UNDERGROUND_LAKE_RADIUS - 3) / 8)
  const lastTunnelPoint = TUNNEL_POINT_LIST[TUNNEL_POINT_LIST.length - 1]!
  const tunnelDistance = Math.hypot(x - lastTunnelPoint.x, z - lastTunnelPoint.z)
  const tunnelCalm = smoothStep((tunnelDistance - 4) / 8)
  const rise = (fbm2D(x * 0.06 - 17, z * 0.06 + 29, 2, 0.5) + 0.15) * 3.2
  return Math.max(0, Math.min(2, Math.round(rise * lakeCalm * tunnelCalm)))
}

/**
 * 螢光最密的幾叢（相對大廳中心）
 *
 * 洞頂的螢光蟲與地衣用噪音決定哪裡成片，這幾處另外加密：湖的正上方（倒影落在湖裡）、
 * 大廳中央偏北、東半邊一處。每一叢底下掛一盞冷色的真光，那一片岩與湖面才被染上藍綠
 */
export const GLOW_CLUSTER_LIST = [
  { offsetX: UNDERGROUND_LAKE_CENTER.x - HALL_CENTER.x, offsetZ: UNDERGROUND_LAKE_CENTER.z - HALL_CENTER.z - 1, radius: 11 },
  { offsetX: 4, offsetZ: -10, radius: 9 },
  { offsetX: 24, offsetZ: 9, radius: 8 },
] as const

/**
 * 某一點的螢光濃度，零到一
 *
 * 一層低頻噪音讓螢光一片一片的，再疊上幾處密叢；
 * 洞頂的螢光蟲（渲染端）與地衣（地形）讀同一份，兩者才會長在同一片
 */
export function measureGlowDensity(x: number, z: number): number {
  const patch = smoothStep((fbm2D(x * 0.07 - 31, z * 0.07 + 17, 3, 0.5) + 0.05) * 2.2)
  let cluster = 0
  for (const point of GLOW_CLUSTER_LIST) {
    const distance = Math.hypot(x - HALL_CENTER.x - point.offsetX, z - HALL_CENTER.z - point.offsetZ)
    cluster = Math.max(cluster, 1 - smoothStep(distance / point.radius))
  }
  return Math.min(1, patch * 0.7 + cluster)
}

/**
 * 某一格岩面上的螢光脈絡，零到一
 *
 * 螢光不是均勻鋪在洞頂：它長在岩縫裡（三維噪音的零值面切過岩面，是一條一條彎曲的細線，
 * 線心最亮、往兩側漸暗），再加一些散落的小叢（高頻噪音的尖峰）。其餘的光禿岩面是零。
 * 地衣方塊（地形）與螢光蟲（渲染端）都乘上它，兩者才長在同一條縫上、同一小叢裡，
 * 而且不是一整片貼滿，是疏疏落落、有核心有邊緣
 */
export function measureGlowVein(x: number, y: number, z: number): number {
  const crack = fbm3D(x * 0.13 + 5, y * 0.13 - 9, z * 0.13 + 2, 2, 0.5)
  const line = 1 - smoothStep(Math.abs(crack) / 0.09)
  const blob = smoothStep((fbm3D(x * 0.34 - 3, y * 0.34 + 8, z * 0.34 - 6, 2, 0.5) - 0.1) / 0.22)
  return Math.max(line * 0.95, blob * 0.8)
}

/**
 * 細節那一層的定點（見 cave-detail）
 *
 * 放在這裡而不是 cave-detail：神遊的特色清單也要讀，而 cave-detail 引用場景定義，
 * 特色清單再引用它會繞成一圈
 */

/** 大廳東北那盞燈籠底下的礦工舊營地：鋪蓋、木箱木桶、一圈熄了的火與躺在地上的鎬 */
export const CAVE_CAMP_POINT = { x: HALL_CENTER.x + 32, z: HALL_CENTER.z - 20 }

/** 地底湖東南岸邊浮著的舊舟：有人划到湖對岸去看過那兩顆鑽石 */
export const CAVE_BOAT_POINT = { x: UNDERGROUND_LAKE_CENTER.x + 7, z: UNDERGROUND_LAKE_CENTER.z + 5 }

/** 湖心偏西南的幾顆出水岩：最高那顆頂上長苔 */
export const CAVE_LAKE_ROCK_POINT = { x: UNDERGROUND_LAKE_CENTER.x - 6, z: UNDERGROUND_LAKE_CENTER.z + 4 }
