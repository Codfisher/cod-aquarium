import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 百囀林苑的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 鳴禽庭是一方開滿花的草地木座：三株結果的矮橡樹、一根柱子頂著的鳥屋、
 * 一只石板圍起來的淺淺飲水盤，花草是野草、高草、大花、玫瑰、堇、蒲公英與鬱金香。
 * 它刻意什麼別的都不放——沒有風、沒有水聲、沒有蟲，底噪愈乾淨，旋律愈聽得出是旋律。
 * 這裡把它放大成一座被林子圍住的園子：中間是開滿花的草地，一叢一叢的矮橡樹、
 * 散在樹叢間的鳥屋與飲水盤；外圍一圈密密的橡樹把風擋在外面
 */

/** 園子的中心，也是遠景的中心 */
export const SONGBIRD_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 草地那一層的高度 */
export const SONGBIRD_GROUND_Y = 10

/**
 * 園子外面那一圈不畫的地面（LAKE_BED）與布景地面平面的高度，比草地矮兩格
 *
 * 布景的地面平面鋪滿整個世界，與草地同高（頂面 10.5）就比飲水盤的水面（矮八分之一格）還高，
 * 園子裡那幾格水會被一片草地蓋掉。壓低兩格，平面整片藏在地底，只在園子外露出來（同聽雨林）
 */
export const SONGBIRD_OUTER_FLOOR_Y = SONGBIRD_GROUND_Y - 2

/**
 * 開闊的草地有多大
 *
 * 這一圈以外樹越種越密、地面一路隆起，最外面是一圈枝葉相接的林子，
 * 從園子裡看出去只看得到樹，風吹不進來
 */
export const PARK_RADIUS = 38

/** 林子的外緣：這一圈以外不種樹，地面換成不畫的 LAKE_BED，由布景的地面平面代替 */
export const SONGBIRD_EDGE_RADIUS = 54

/**
 * 回程門
 *
 * 大廳那座門立在鳴禽庭的飲水盤東側、門洞朝東，人從禪庭中心那串飛石走上木座東緣，往西穿過門；
 * 這裡的門立在草地東側，門洞朝東，人到了之後仍是往西走，
 * 正前方是一只飲水盤與一叢矮橡樹
 */
export const SONGBIRD_PORTAL_POINT = { x: SONGBIRD_CENTER.x + 28, z: SONGBIRD_CENTER.z }

/**
 * 大廳那座門：門洞中心離鳴禽庭中心的偏移
 *
 * 鳴禽庭正中是那只飲水盤（中心往南一格的三格見方），門立在它東邊緊挨著，門洞朝東：
 * 站在木座東緣往西看，門洞框著的正是飲水盤，後面是兩株矮橡樹。
 * 三株橡樹的樹冠、東南角的鳥屋都在門框五格之外
 */
export const SONGBIRD_HUB_GATE_OFFSET = { x: 2, z: 1 }

/**
 * 飲水盤
 *
 * 鳴禽庭那一只：三格見方的石板、正中一格淺水。這裡散六只，
 * 第一只在落腳處正前方，其餘在樹叢之間，每一只旁邊都有一隻偶爾叫一聲的水鳥
 */
export const BASIN_LIST = [
  { x: SONGBIRD_PORTAL_POINT.x - 9, z: SONGBIRD_PORTAL_POINT.z + 1 },
  { x: SONGBIRD_CENTER.x - 2, z: SONGBIRD_CENTER.z - 4 },
  { x: SONGBIRD_CENTER.x - 18, z: SONGBIRD_CENTER.z + 12 },
  { x: SONGBIRD_CENTER.x + 8, z: SONGBIRD_CENTER.z + 20 },
  { x: SONGBIRD_CENTER.x - 14, z: SONGBIRD_CENTER.z - 20 },
  { x: SONGBIRD_CENTER.x + 14, z: SONGBIRD_CENTER.z - 18 },
] as const

/**
 * 鳥屋
 *
 * 鳴禽庭那一座：三格高的柵柱頂著木板、蜂箱做的小木盒、深色木半磚的屋頂。
 * 這裡十座，散在草地上，大多挨著樹叢
 */
export const BIRDHOUSE_LIST = [
  { x: SONGBIRD_PORTAL_POINT.x - 6, z: SONGBIRD_PORTAL_POINT.z - 5 },
  { x: SONGBIRD_CENTER.x + 4, z: SONGBIRD_CENTER.z + 5 },
  { x: SONGBIRD_CENTER.x - 9, z: SONGBIRD_CENTER.z - 6 },
  { x: SONGBIRD_CENTER.x - 24, z: SONGBIRD_CENTER.z + 2 },
  { x: SONGBIRD_CENTER.x - 6, z: SONGBIRD_CENTER.z + 24 },
  { x: SONGBIRD_CENTER.x + 18, z: SONGBIRD_CENTER.z + 12 },
  { x: SONGBIRD_CENTER.x + 22, z: SONGBIRD_CENTER.z - 10 },
  { x: SONGBIRD_CENTER.x + 2, z: SONGBIRD_CENTER.z - 26 },
  { x: SONGBIRD_CENTER.x - 22, z: SONGBIRD_CENTER.z - 16 },
  { x: SONGBIRD_CENTER.x - 26, z: SONGBIRD_CENTER.z + 18 },
] as const

/**
 * 邊界：鑽進外圍的林子越走越慢，過了推回線被推回園子裡
 *
 * 減速線在草地外緣再兩格，推回線再九格，外面還有幾格樹擋著
 */
export const SONGBIRD_SLOW_RADIUS = PARK_RADIUS + 2
export const SONGBIRD_PUSH_RADIUS = SONGBIRD_SLOW_RADIUS + 9

/**
 * 細節小景的定點
 *
 * 地形 worker 照這幾個點蓋，神遊的特色主體也讀同一份
 */

/**
 * 飛石小徑的骨架
 *
 * 主線從回程門前出發，貼著落腳那一口飲水盤的北邊、園子正中那一口的南邊，往西南走到西邊那一口；
 * 兩條岔路各通到南邊與北邊的飲水盤。石頭只鋪在草上，碰到飲水盤的石板就斷開
 */
export const STEPPING_PATH_LIST = [
  [
    { x: SONGBIRD_PORTAL_POINT.x - 5, z: SONGBIRD_PORTAL_POINT.z },
    { x: SONGBIRD_CENTER.x + 20, z: SONGBIRD_CENTER.z - 2 },
    { x: SONGBIRD_CENTER.x + 10, z: SONGBIRD_CENTER.z - 3 },
    { x: SONGBIRD_CENTER.x, z: SONGBIRD_CENTER.z - 1 },
    { x: SONGBIRD_CENTER.x - 9, z: SONGBIRD_CENTER.z + 5 },
    { x: SONGBIRD_CENTER.x - 16, z: SONGBIRD_CENTER.z + 10 },
  ],
  [
    { x: SONGBIRD_CENTER.x + 1, z: SONGBIRD_CENTER.z },
    { x: SONGBIRD_CENTER.x + 4, z: SONGBIRD_CENTER.z + 9 },
    { x: SONGBIRD_CENTER.x + 7, z: SONGBIRD_CENTER.z + 17 },
  ],
  [
    { x: SONGBIRD_CENTER.x - 4, z: SONGBIRD_CENTER.z - 7 },
    { x: SONGBIRD_CENTER.x - 9, z: SONGBIRD_CENTER.z - 13 },
    { x: SONGBIRD_CENTER.x - 12, z: SONGBIRD_CENTER.z - 17 },
  ],
] as const

/** 觀鳥小屋：園子南緣，三面木板牆、朝北對著草地開一道觀察的縫 */
export const BIRD_HIDE_POINT = { x: SONGBIRD_CENTER.x - 5, z: SONGBIRD_CENTER.z + 29 }

/** 餵鳥台：一張架在樁上的木盤，腳邊一簍穀子，都在飛石小徑旁邊 */
export const FEEDER_LIST = [
  { x: SONGBIRD_CENTER.x + 16, z: SONGBIRD_CENTER.z - 6 },
  { x: SONGBIRD_CENTER.x + 3, z: SONGBIRD_CENTER.z + 3 },
  { x: SONGBIRD_CENTER.x - 12, z: SONGBIRD_CENTER.z + 3 },
  { x: SONGBIRD_CENTER.x + 8, z: SONGBIRD_CENTER.z + 12 },
  { x: SONGBIRD_CENTER.x - 5, z: SONGBIRD_CENTER.z - 12 },
] as const
