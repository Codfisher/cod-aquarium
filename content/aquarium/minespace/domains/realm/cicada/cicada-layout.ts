import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 蟬雨深林的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 蟬時雨是盛夏正午的一片櫸樹下：四棵橡樹擠在一起，最高處再補一整片葉子，
 * 樹冠合成一張沒有縫的蓋子，只留兩成不到的葉縫漏下光點；底下是曬不到太陽的土與苔，
 * 地上只有蕨、腐葉、高草與石生植物，不放開花的東西；南緣一道朝北的緣廊，
 * 廊上坐墊、簷下吊燈，樹下一盞石燈籠。聲音很大，卻一隻蟬都看不見。
 * 這裡把那張蓋子撐開成一整片林子：走到哪裡頭頂都是一層葉，四面都是樹幹
 */

/** 林子的中心，也是遠景的中心 */
export const CICADA_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 林地那一層的高度 */
export const CICADA_GROUND_Y = 10

/**
 * 樹冠那一層蓋子的高度
 *
 * 蟬時雨的蓋子在腳底以上八格；這裡的樹高一點（光禿禿的樹幹九格），
 * 蓋子壓在腳底以上九格，抬頭是一整片綠，樹幹一根根撐上去
 */
export const CANOPY_Y = CICADA_GROUND_Y + 10

/**
 * 林子裡走得到的那一圈
 *
 * 這一圈以外樹幹越來越密、地面一路隆起，最外面是一堵樹幹的牆
 */
export const WOOD_RADIUS = 40

/** 頭頂那層蓋子鋪到哪（吃噪音，正負兩格上下） */
export const CANOPY_RADIUS = 50

/** 林子的外緣：這一圈以外不種樹，地面換成不畫的 LAKE_BED，由布景的地面平面代替 */
export const CICADA_EDGE_RADIUS = 52

/**
 * 回程門
 *
 * 大廳那座門立在蟬時雨四棵樹正中的空地上、門洞朝南，正對著南緣的緣廊；
 * 這裡的門立在落腳那片林間空地的南緣，門洞朝南，人到了之後仍是往北走，
 * 西邊一道緣廊面朝空地，正前方一條土徑鑽進林子
 */
export const CICADA_PORTAL_POINT = { x: CICADA_CENTER.x, z: CICADA_CENTER.z + 30 }

/**
 * 大廳那座門：門洞中心離蟬時雨中心的偏移
 *
 * 就在四棵樹圍出來的那片陰影正中，門洞朝南對著緣廊：坐在廊上，眼前就是樹下那道門
 */
export const CICADA_HUB_GATE_OFFSET = { x: 0, z: 0 }

export interface CicadaClearing {
  x: number;
  z: number;
  radius: number;
}

/** 落腳的林間空地，門在它的南緣；空地裡不種樹，頭頂照樣是那層蓋子 */
export const ARRIVAL_CLEARING: CicadaClearing = {
  x: CICADA_PORTAL_POINT.x,
  z: CICADA_PORTAL_POINT.z - 8,
  radius: 7,
}

/** 土徑盡頭的另一片空地，第二道緣廊在這裡 */
export const SHADE_CLEARING: CicadaClearing = {
  x: CICADA_CENTER.x - 6,
  z: CICADA_CENTER.z - 20,
  radius: 6,
}

/**
 * 緣廊
 *
 * 蟬時雨那一道：七格長的木板、兩端柵柱撐起深色木的短簷、廊上四個坐墊、簷下一盞吊燈，
 * 朝北坐，面對樹下的空地。兩道，一道在落腳的空地西南、一道在土徑盡頭的空地南緣。
 * 座標是廊板正中那一格
 */
export const VERANDA_LIST = [
  { x: ARRIVAL_CLEARING.x - 8, z: ARRIVAL_CLEARING.z + 5 },
  { x: SHADE_CLEARING.x, z: SHADE_CLEARING.z + SHADE_CLEARING.radius - 1 },
] as const

/** 緣廊的半長：廊板從正中往兩側各三格，與蟬時雨一樣七格 */
export const VERANDA_HALF_LENGTH = 3

/**
 * 土徑的骨架
 *
 * 從落腳的空地往北，在林子裡彎兩次，從東邊繞進第二片空地（南緣是緣廊，不從廊下穿過去）。
 * 地上本來就是土，土徑只是一條沒有草的路
 */
export const CICADA_PATH_CONTROL_POINT_LIST = [
  { x: ARRIVAL_CLEARING.x, z: ARRIVAL_CLEARING.z },
  { x: CICADA_CENTER.x + 5, z: CICADA_CENTER.z + 8 },
  { x: CICADA_CENTER.x - 2, z: CICADA_CENTER.z - 4 },
  { x: CICADA_CENTER.x + 2, z: CICADA_CENTER.z - 13 },
  { x: SHADE_CLEARING.x + 2, z: SHADE_CLEARING.z - 1 },
] as const

/**
 * 邊界：鑽進外圍的樹幹牆越走越慢，過了推回線被推回林子裡
 *
 * 減速線在樹幹開始變密那一圈再兩格，推回線再十格，外面還有幾格樹擋著
 */
export const CICADA_SLOW_RADIUS = WOOD_RADIUS + 2
export const CICADA_PUSH_RADIUS = CICADA_SLOW_RADIUS + 9
