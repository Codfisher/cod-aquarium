import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 聽雨林的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、邊界、音源、鏡面）都讀這一份，所以只放純資料。
 *
 * 聽雨亭的用意：雨聲的質地由它打在什麼上面決定——葉子是柔的、木頭是脆的、水面是悶的，
 * 所以一座箱庭裡擺齊三樣：幾棵濃綠的闊葉樹、一窪積水、一座只坐得下一個人的木亭。
 * 這裡把木座拿掉，三樣東西鋪成一整片下著雨的闊葉林：林下一窪一窪積水，
 * 幾座同樣的小亭子各守著一窪，走累了就躲進去聽
 */

/** 林子的中心 */
export const RAINVALE_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 林地那一層草的頂面高度，與林海同一個高度 */
export const RAINVALE_GROUND_Y = 10

/** 一窪積水：中心與半徑（吃噪音，實際岸線會凹凸） */
export interface RainvalePond {
  x: number;
  z: number;
  radius: number;
}

/** 亭子的座椅朝哪邊：人面朝那一側坐 */
export type PavilionFacing = 'north' | 'south' | 'east' | 'west'

export interface RainvalePavilion {
  x: number;
  z: number;
  facing: PavilionFacing;
}

/**
 * 回程門
 *
 * 大廳那座門立在聽雨亭積水的東邊、門洞朝東，人往西穿過去；
 * 這裡同一個構圖放大：門立在落腳那一窪大池的東岸外，門洞朝東，
 * 人到了之後仍是往西走，眼前是那一池水與池西岸的亭子
 */
export const RAINVALE_PORTAL_POINT = { x: RAINVALE_CENTER.x + 24, z: RAINVALE_CENTER.z + 2 }

/**
 * 落腳那一窪大池
 *
 * 聽雨亭那窪積水放大，半徑五格、一格深、黏土底。
 * 這一池會映出天空與四周（見 rainvale-realm 的 mirrorTargetList），與箱庭那一窪一樣
 */
export const ARRIVAL_POND: RainvalePond = {
  x: RAINVALE_CENTER.x + 13,
  z: RAINVALE_CENTER.z + 1,
  radius: 5,
}

/** 林下的積水，大小不一，散在林子各處；第一窪是落腳那一池 */
export const POND_LIST: RainvalePond[] = [
  ARRIVAL_POND,
  { x: RAINVALE_CENTER.x - 6, z: RAINVALE_CENTER.z - 14, radius: 3.6 },
  { x: RAINVALE_CENTER.x - 18, z: RAINVALE_CENTER.z + 10, radius: 4.2 },
  { x: RAINVALE_CENTER.x + 6, z: RAINVALE_CENTER.z + 20, radius: 3 },
  { x: RAINVALE_CENTER.x + 16, z: RAINVALE_CENTER.z - 20, radius: 2.6 },
  { x: RAINVALE_CENTER.x - 26, z: RAINVALE_CENTER.z - 12, radius: 2.4 },
  { x: RAINVALE_CENTER.x - 4, z: RAINVALE_CENTER.z + 2, radius: 2.2 },
  { x: RAINVALE_CENTER.x + 26, z: RAINVALE_CENTER.z + 18, radius: 2.2 },
]

/**
 * 小亭子
 *
 * 聽雨亭那座：四根圍籬細柱、榻榻米地板、深色木頂、一張木階梯當椅子、頂下一盞吊燈、簷角一個風鈴。
 * 每座守著一窪積水，椅子朝著水，人坐進去面對的就是雨落進水裡的那一片。
 * 第一座在落腳那一池的西岸，與箱庭一樣「亭子在水西、面朝東」
 */
export const PAVILION_LIST: RainvalePavilion[] = [
  { x: ARRIVAL_POND.x - 9, z: ARRIVAL_POND.z + 1, facing: 'east' },
  { x: RAINVALE_CENTER.x - 6, z: RAINVALE_CENTER.z - 21, facing: 'south' },
  { x: RAINVALE_CENTER.x - 26, z: RAINVALE_CENTER.z + 11, facing: 'east' },
  { x: RAINVALE_CENTER.x + 12, z: RAINVALE_CENTER.z + 21, facing: 'west' },
]

/**
 * 林子在哪裡開始密成一堵牆（離中心的格數）
 *
 * 這一圈以外樹越種越密、地面一格一格隆起成坡，雨霧裡望出去是一層一層的樹幹
 */
export const THICKET_START_RADIUS = 40

/** 林子的外緣：這一圈以外不種樹，地面換成不畫的 LAKE_BED，由布景的地面平面代替 */
export const RAINVALE_EDGE_RADIUS = 52

/** 邊界：鑽進密林越走越慢，過了推回線被推回林子裡 */
export const RAINVALE_SLOW_RADIUS = THICKET_START_RADIUS + 2
export const RAINVALE_PUSH_RADIUS = RAINVALE_SLOW_RADIUS + 8

/**
 * 大廳那座門在聽雨亭裡的位置（相對箱庭中心）
 *
 * 那窪積水在中央偏東北一格（1, -1），亭子在它西邊（-3, 1）、椅子朝東。
 * 門立在積水東南（3, 2），門洞朝東：坐在亭子裡隔著那窪水看出去，正好看到門；
 * 從禪庭中心過來的人由東邊踏上木座，走三四步就到門前
 */
export const RAINVALE_HUB_GATE_OFFSET = { x: 3, z: 2 } as const
