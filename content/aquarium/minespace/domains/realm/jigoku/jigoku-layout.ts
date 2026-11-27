import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 湯煙谷的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（蒸氣與氣泡、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 湯煙谷是地獄谷的放大版。地獄谷是一方燒過的木座：一道橫貫的熔岩裂縫、兩側烤黑的岩往上堆成谷壁，
 * 地面由外往內是石板、圓石、黑曜石磚，裂縫四周零星透出地表的餘燼，幾株站著死掉的炭黑枯木、兩塊白骨，
 * 只剩枯草、枯灌與石生植物；南岸一座鳥居、鳥居後一塊刻紋石碑與一對石燈籠；整座籠在一片入夜不暗的橘紅熱氣裡。
 * 這裡把它放大成一整道地熱谷：谷底正中是那道熔岩裂縫，兩側是冒著蒸氣的噴氣孔、滾著的熱泉與泥池，
 * 硫磺把岩染黃；一條圍著柵欄的木棧繞著裂縫走一圈，從不跨過它（地獄谷：「這裡不能過，也不該過」）
 */

/** 谷的中心，也是遠景的中心 */
export const JIGOKU_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 谷底那一層的高度，熔岩面與它齊平 */
export const JIGOKU_FLOOR_Y = 9

/** 站在谷底的腳底高度 */
export const JIGOKU_FOOT_Y = JIGOKU_FLOOR_Y + 1

/**
 * 谷底的半徑（東西長、南北窄的橢圓，吃噪音）
 *
 * 熔岩縫沿著長軸走，兩側各留二十來格給熱泉、噴氣孔與木棧
 */
export const VALLEY_RADIUS_X = 60
export const VALLEY_RADIUS_Z = 33

/**
 * 谷壁：每往外一格高兩格，爬不上去；高出谷底 VALLEY_WALL_HEIGHT 格之後是不畫的 LAKE_BED
 *
 * 與地獄谷那兩道谷壁同一種岩（黑曜石磚、圓石、石），夾著幾道硫磺的黃
 */
export const VALLEY_WALL_HEIGHT = 14

/** 熔岩縫從哪裡到哪裡（離中心的 X 偏移），兩端照地獄谷收成尖 */
export const RIFT_HALF_LENGTH = 40
export const RIFT_TAPER = 9

/**
 * 熔岩縫在某個 X 偏移上的中心線與半寬
 *
 * 照地獄谷 measureRiftShape：中心線跟著兩道正弦擺、寬度也跟著變，時寬時窄、微微彎曲，
 * 筆直的溝看起來是人挖的水道。尺度放大：擺幅與寬度都大一號
 */
export function measureRiftShape(offsetX: number): { center: number; halfWidth: number } {
  const fromEnd = RIFT_HALF_LENGTH - Math.abs(offsetX)
  const taper = Math.max(0, Math.min(1, fromEnd / RIFT_TAPER))
  return {
    center: JIGOKU_CENTER.z + Math.sin(offsetX * 0.085) * 4.5 + Math.sin(offsetX * 0.031 + 1) * 2.5,
    halfWidth: (1.5 + Math.sin(offsetX * 0.13 + 1.7) * 0.7) * taper,
  }
}

/** 一池熱泉或泥池 */
export interface HotPool {
  x: number;
  z: number;
  radius: number;
  /** 泥池只有一格深、滿是灰泥；熱泉兩格深、清的，池緣一圈硫磺 */
  kind: 'spring' | 'mud';
}

/**
 * 熱泉與泥池
 *
 * 熱泉在南北兩條帶子上（木棧與谷壁之間），泥池小，夾在木棧與熔岩縫之間。
 * 位置手排，木棧從它們中間繞過去
 */
export const HOT_POOL_LIST: HotPool[] = [
  { x: JIGOKU_CENTER.x - 28, z: JIGOKU_CENTER.z + 22, radius: 5, kind: 'spring' },
  { x: JIGOKU_CENTER.x + 24, z: JIGOKU_CENTER.z + 23, radius: 4.5, kind: 'spring' },
  { x: JIGOKU_CENTER.x - 14, z: JIGOKU_CENTER.z - 23, radius: 5.5, kind: 'spring' },
  { x: JIGOKU_CENTER.x + 20, z: JIGOKU_CENTER.z - 24, radius: 4, kind: 'spring' },
  { x: JIGOKU_CENTER.x + 10, z: JIGOKU_CENTER.z + 22, radius: 2.5, kind: 'mud' },
  { x: JIGOKU_CENTER.x - 42, z: JIGOKU_CENTER.z - 16, radius: 3, kind: 'mud' },
  { x: JIGOKU_CENTER.x + 30, z: JIGOKU_CENTER.z - 23, radius: 2.5, kind: 'mud' },
  { x: JIGOKU_CENTER.x - 4, z: JIGOKU_CENTER.z - 21, radius: 2, kind: 'mud' },
]

/**
 * 噴氣孔
 *
 * 一圈一格高的圓石圍著一個往下的洞，四周的岩被硫磺染黃，蒸氣一直從洞裡往上冒
 */
export const STEAM_VENT_LIST: { x: number; z: number }[] = [
  { x: JIGOKU_CENTER.x - 34, z: JIGOKU_CENTER.z + 9 },
  { x: JIGOKU_CENTER.x - 18, z: JIGOKU_CENTER.z + 10 },
  { x: JIGOKU_CENTER.x + 6, z: JIGOKU_CENTER.z + 10 },
  { x: JIGOKU_CENTER.x + 28, z: JIGOKU_CENTER.z + 10 },
  { x: JIGOKU_CENTER.x - 8, z: JIGOKU_CENTER.z + 25 },
  { x: JIGOKU_CENTER.x + 36, z: JIGOKU_CENTER.z + 20 },
  { x: JIGOKU_CENTER.x - 44, z: JIGOKU_CENTER.z + 18 },
  { x: JIGOKU_CENTER.x - 28, z: JIGOKU_CENTER.z - 9 },
  { x: JIGOKU_CENTER.x - 2, z: JIGOKU_CENTER.z - 10 },
  { x: JIGOKU_CENTER.x + 18, z: JIGOKU_CENTER.z - 11 },
  { x: JIGOKU_CENTER.x + 34, z: JIGOKU_CENTER.z - 8 },
  { x: JIGOKU_CENTER.x + 4, z: JIGOKU_CENTER.z - 26 },
  { x: JIGOKU_CENTER.x - 30, z: JIGOKU_CENTER.z - 24 },
  { x: JIGOKU_CENTER.x + 50, z: JIGOKU_CENTER.z + 4 },
]

/**
 * 回程門
 *
 * 大廳那座門立在地獄谷鳥居與熔岩縫之間、原本石碑的位置，門洞朝南，人往北穿過去；
 * 這裡的門立在谷的南緣、木棧的起點，門洞同樣朝南，人到了之後仍是往北走：
 * 先穿過鳥居，然後才看見前面那條發光的縫（地獄谷的走法）
 */
export const JIGOKU_PORTAL_POINT = { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z + 28 }

/** 鳥居：跨在木棧上，回程門往北七格 */
export const JIGOKU_TORII_Z = JIGOKU_PORTAL_POINT.z - 7

/**
 * 木棧那一圈的骨架
 *
 * 從回程門往北的那一小段接上這一圈：南岸往東、繞過熔岩縫東端、北岸往西、繞過西端再回來。
 * 中間用平滑曲線串起來（見 jigoku-terrain 的 sampleBoardwalk）
 */
export const BOARDWALK_LOOP_POINT_LIST = [
  { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z + 16 },
  { x: JIGOKU_CENTER.x + 18, z: JIGOKU_CENTER.z + 15 },
  { x: JIGOKU_CENTER.x + 38, z: JIGOKU_CENTER.z + 13 },
  { x: JIGOKU_CENTER.x + 50, z: JIGOKU_CENTER.z + 2 },
  { x: JIGOKU_CENTER.x + 40, z: JIGOKU_CENTER.z - 12 },
  { x: JIGOKU_CENTER.x + 18, z: JIGOKU_CENTER.z - 15 },
  { x: JIGOKU_CENTER.x - 6, z: JIGOKU_CENTER.z - 14 },
  { x: JIGOKU_CENTER.x - 30, z: JIGOKU_CENTER.z - 15 },
  { x: JIGOKU_CENTER.x - 50, z: JIGOKU_CENTER.z - 4 },
  { x: JIGOKU_CENTER.x - 44, z: JIGOKU_CENTER.z + 12 },
  { x: JIGOKU_CENTER.x - 22, z: JIGOKU_CENTER.z + 15 },
] as const

/**
 * 邊界：谷壁本身就是屏障（兩格一階，爬不上去），這一圈只是保險
 *
 * 比谷底最遠的一點（長軸兩端）還外面，人碰不到
 */
export const JIGOKU_SLOW_RADIUS = VALLEY_RADIUS_X + 6
export const JIGOKU_PUSH_RADIUS = JIGOKU_SLOW_RADIUS + 8
