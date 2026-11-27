import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 蟲鳴夜原的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 蟲聲叢是一方種到滿的草地木座：草高到看不見地面（高草五成、乾草兩成、蕨、捲葉草、火焰花），
 * 幾根埋了半截的枯木樁、一堆圓石、角落一小片曬得到太陽的乾土，上面兩株仙人掌與幾叢枯灌。
 * 它要的是「蟲鳴從草叢的每一個縫隙裡出來，不是從某一個點」。
 * 這裡把木座拿掉，讓那片草一路長成起伏的草原，人走進去四面八方都是蟲聲
 */

/** 草原的中心，也是遠景的中心 */
export const INSECT_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 草原最低那一層草的高度 */
export const INSECT_GROUND_Y = 10

/**
 * 走得到的草原有多大（吃噪音，正負四格上下）
 *
 * 這一圈以外地面一路墊高成一道道兩格一階的草坡，跳不上去，從草原裡看出去是一圈低矮的丘
 */
export const MEADOW_RADIUS = 44

/**
 * 草坡一階多寬
 *
 * 最下面兩階各高一格、跳得上去，像是草原慢慢隆起來；再往外兩格一階，跳不上去
 */
export const DOWNS_STEP_WIDTH = 3
/** 草坡最高墊到幾格（從最低那一層草算），比這高的話從草原裡連遠處的丘都看不到 */
export const DOWNS_RISE_MAX = 8

/**
 * 草坡的外緣：再往外是不畫的 LAKE_BED，高度與坡頂齊平
 *
 * 沒有布景的地面平面：平面是整片鋪的，比草原高的話會變成蓋在草原上的一片天花板。
 * 從草原裡看不到坡頂後面，那裡畫不畫都一樣
 */
export const INSECT_EDGE_RADIUS = 60

/** 坡頂那一層的高度，遠景山稜的山腳插在這裡 */
export const INSECT_RIDGE_Y = INSECT_GROUND_Y + DOWNS_RISE_MAX

/**
 * 回程門
 *
 * 大廳那座門立在蟲聲叢正中、門洞朝東，人從禪庭中心那串飛石走上木座東緣，往西穿過門；
 * 這裡的門立在草原東側，門洞朝東，人到了之後仍是往西走，
 * 一條踩出來的小徑從腳下鑽進草裡
 */
export const INSECT_PORTAL_POINT = { x: INSECT_CENTER.x + 30, z: INSECT_CENTER.z }

/**
 * 大廳那座門：門洞中心離蟲聲叢中心的偏移
 *
 * 就立在正中央，四面都是草。蟲聲叢的造景（buildInsectGarden）從東緣到門前踩出一條小徑，
 * 大廳的門（INSECT_HUB_GATE）也用這個點
 */
export const INSECT_HUB_GATE_OFFSET = { x: 0, z: 0 }

/**
 * 踩出來的小徑
 *
 * 從回程門筆直往西走一段（一落地就看得到它鑽進草裡），再左右彎幾次，最後走進西邊那一大片乾土窪地。
 * 草原沒有別的路：小徑以外全是高到膝蓋的草，人要撥開草才走得過去
 */
export const INSECT_PATH_CONTROL_POINT_LIST = [
  { x: INSECT_PORTAL_POINT.x - 1, z: INSECT_PORTAL_POINT.z },
  { x: INSECT_CENTER.x + 22, z: INSECT_CENTER.z },
  { x: INSECT_CENTER.x + 15, z: INSECT_CENTER.z + 4 },
  { x: INSECT_CENTER.x + 6, z: INSECT_CENTER.z - 3 },
  { x: INSECT_CENTER.x - 6, z: INSECT_CENTER.z + 5 },
  { x: INSECT_CENTER.x - 17, z: INSECT_CENTER.z - 1 },
  { x: INSECT_CENTER.x - 25, z: INSECT_CENTER.z + 6 },
] as const

/**
 * 乾土窪地：蟲聲叢角落那片曬得到太陽的乾土，放大成幾處
 *
 * 第一處是小徑的盡頭，最大；其餘散在草原裡。每一處上面幾株仙人掌與枯灌，
 * 是整片草原最乾的地方
 */
export interface SandPatch {
  x: number;
  z: number;
  radius: number;
}

export const SAND_PATCH_LIST: SandPatch[] = [
  { x: INSECT_CENTER.x - 29, z: INSECT_CENTER.z + 8, radius: 5 },
  { x: INSECT_CENTER.x + 12, z: INSECT_CENTER.z + 19, radius: 3 },
  { x: INSECT_CENTER.x - 5, z: INSECT_CENTER.z - 22, radius: 3.5 },
  { x: INSECT_CENTER.x + 22, z: INSECT_CENTER.z - 15, radius: 3 },
  { x: INSECT_CENTER.x - 19, z: INSECT_CENTER.z + 27, radius: 3 },
]

/**
 * 邊界：走上草坡就走不快，過了推回線被推回草原裡
 *
 * 草坡兩格一階本來就跳不上去，這只是保險
 */
export const INSECT_SLOW_RADIUS = MEADOW_RADIUS - 2
export const INSECT_PUSH_RADIUS = MEADOW_RADIUS + 8
