import { fbm2D } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 溪谷的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 溪谷是遣水的放大版：遣水是一方草地木座，一道彎的水道貫穿整座木座，
 * 兩側礫石灘，上游一座吃噪音的岩丘，水從岩頂的蓄水池翻下來落進水潭；
 * 水道上一座半磚木橋、一座鹿威，草地上蕨、高草、紙莎草與堇，水面幾片睡蓮，兩棵橡樹、一盞石燈籠。
 * 這裡把木座換成一道東西向的溪谷：西頭是一面高崖，瀑布從崖頂落進潭裡，
 * 溪水往東彎彎曲曲流過整片谷底，半途一道小跌水，下游收進一道窄峽；
 * 南北兩側是長著青苔的谷壁，人走不上去
 */

/** 世界中心，遠景的中心 */
export const RIVER_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/**
 * 谷底那一層方塊的高度（頂面那一格）
 *
 * 下游（東半）是這一層，上游（西半）高一格；溪水與草地齊平，照遣水的作法往下挖
 */
export const VALLEY_FLOOR_Y = 12

/** 上游那一段谷底高一格，溪水在兩段之間跌一格 */
export const UPPER_FLOOR_Y = VALLEY_FLOOR_Y + 1

/** 瀑布那面崖的崖腳：這一排是谷底的最西一排，再往西是崖 */
export const VALLEY_HEAD_X = 84

/** 窄峽的盡頭：溪水從這裡鑽進岩縫，人過不去 */
export const VALLEY_END_X = 204

/** 跌水那一道坎大約在哪一排，坎線吃一點噪音 */
export const CASCADE_X = 130

/**
 * 谷壁頂上那一圈的高度（頂面那一格）
 *
 * 再往外是看不到的地方，換成不畫的 LAKE_BED（見 HIDDEN_TOP_Y）。
 * 稜線最低也有這麼高，從谷底任何一點往外看，視線都先碰到稜線
 */
export const RIM_MIN_Y = 29
export const RIM_MAX_Y = 37

/**
 * 稜線外面那一大片不畫的方塊頂到這一層
 *
 * 比最矮的稜線再矮一格：人站在谷底，眼睛約在十四格高，越過二十九格高的稜線往外看，
 * 視線到了外面早就高過二十八格，永遠看不到這一層的頂面。
 * 稜線背面在這一層以下的崖壁也因此不必畫（隱藏方塊對鄰居仍算實心）
 */
export const HIDDEN_TOP_Y = RIM_MIN_Y - 1

/** 谷壁每往外一格高幾格：兩格多一階，爬不上去 */
export const WALL_SLOPE = 2.4

/** 谷底的中線，緩緩地彎 */
export function measureValleyCenterZ(x: number): number {
  return RIVER_CENTER.z + fbm2D(x * 0.018 + 3, 1.7, 2, 0.5) * 7
}

function smoothStep(from: number, to: number, value: number): number {
  const ratio = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return ratio * ratio * (3 - 2 * ratio)
}

/**
 * 谷底的半寬（格）
 *
 * 中段寬、兩頭窄：瀑布那頭收成一個圍著水潭的半圓（半寬十三格，主瀑布與兩旁的小瀑布都要放得下），下游收成四格寬的窄峽
 */
export function measureValleyHalfWidth(x: number): number {
  const base = 17 + fbm2D(x * 0.035, 4.2, 2, 0.5) * 4
  const headRatio = smoothStep(VALLEY_HEAD_X, VALLEY_HEAD_X + 16, x)
  const gorgeRatio = smoothStep(VALLEY_END_X - 24, VALLEY_END_X - 6, x)
  const withHead = 13 + (base - 13) * headRatio
  return withHead + (4 - withHead) * gorgeRatio
}

/**
 * 溪水的中線
 *
 * 在谷底裡彎，彎的幅度不超過谷底的一半；下游門前那一段貼著南邊的谷壁流，
 * 北岸留出一大片草地給回程的門，再一起收進窄峽
 */
export function measureStreamZ(x: number): number {
  const halfWidth = measureValleyHalfWidth(x)
  const meander = fbm2D(x * 0.045 + 8, 0.6, 2, 0.5) * 0.9 * Math.max(0, halfWidth - 7)
  const southRatio = smoothStep(158, 174, x) * (1 - smoothStep(184, 196, x))
  return measureValleyCenterZ(x) + meander * (1 - southRatio) + southRatio * (halfWidth - 6)
}

/** 溪水的半寬，兩到四格 */
export function measureStreamHalfWidth(x: number): number {
  if (x >= VALLEY_END_X - 10)
    return 1.6
  return 2.2 + fbm2D(x * 0.08 - 4, 2.9, 2, 0.5) * 1.2
}

/** 瀑布落下來的那一段溪心 */
export const WATERFALL_POINT = { x: VALLEY_HEAD_X, z: Math.round(measureStreamZ(VALLEY_HEAD_X + 5)) }

/**
 * 瀑布從崖頂哪一層開始落
 *
 * 離上游的潭面二十二格。崖頂再高三格（世界頂下一格），缺口夾在崖頂中間，看起來像是被水切開的
 */
export const WATERFALL_TOP_Y = UPPER_FLOOR_Y + 22

/** 瀑布底下的水潭：圓心在崖腳往東幾格，半徑與深度；中心最深，往外兩圈各淺一格 */
export const PLUNGE_POOL = { offsetX: 7, radius: 9, depth: 4 } as const

/**
 * 回程的傳送門
 *
 * 立在下游北岸那片草地的最東一排，門洞沿 Z 軸攤開、面朝東邊的窄峽。
 * 大廳那座立在遣水木座東緣，人往西穿過門走進木座；
 * 到這裡落在門的西側三格、仍面朝西，整條溪谷與谷底盡頭的瀑布就在正前方
 */
const PORTAL_X = 178
export const RIVER_PORTAL_POINT = {
  x: PORTAL_X,
  z: Math.round(measureValleyCenterZ(PORTAL_X) - 4),
}

/**
 * 邊界
 *
 * 溪谷四面都是爬不上去的谷壁，下游的窄峽也被岩縫收死，人本來就走不出去；
 * 這一圈只是保險，比谷底最遠的一點還外面，平常碰不到
 */
export const RIVER_BOUNDARY_CENTER = { x: (VALLEY_HEAD_X + VALLEY_END_X) / 2, z: RIVER_CENTER.z }
export const RIVER_SLOW_RADIUS = 66
export const RIVER_PUSH_RADIUS = 76
