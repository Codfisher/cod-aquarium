import { fbm2D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 野花原的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 這裡是草苑的放大版：草苑是一方草地，滿地高草與花（蒲公英、鬱金香、堇、大花、白蒲公英），
 * 角落一棵孤零零的橡樹、樹下一張長凳，剩下的就是空——草原的風之所以柔，是因為沒有東西反射它。
 * 這裡把木座拿掉，草與花一路鋪過一座接一座圓圓的丘，丘頂偶爾一棵孤樹與一張長凳，
 * 樹與樹隔得很遠，中間什麼都沒有
 */

/** 原野的中心，也是遠景與邊界的中心 */
export const MEADOW_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 最低那一層草的高度，丘從這裡往上隆起 */
export const MEADOW_GROUND_Y = 8

/**
 * 回程門
 *
 * 大廳那座門立在草苑中央偏東，門洞朝西，人從西邊走過來、往東穿過去；
 * 這裡的門立在原野西半邊一塊拉平的草地上，門洞朝西，人到了之後仍是往東走，
 * 眼前是一路起伏到天邊的丘
 */
export const MEADOW_PORTAL_POINT = { x: MEADOW_CENTER.x - 26, z: MEADOW_CENTER.z }

/**
 * 大廳那座門離草苑中心的偏移
 *
 * 草苑唯一的造景是西北角的孤樹與樹下那張面朝東的長凳。門立在中央偏東兩格、偏南一格，
 * 門洞朝西：坐在長凳上往前看就是那道門，人從西邊的飛石走進花叢，孤樹在左手邊，門在正前方
 */
export const MEADOW_HUB_GATE_OFFSET = { x: 2, z: 1 } as const

/**
 * 丘陵的剖面
 *
 * 裡面是一座接一座的圓丘（最高七格上下），到 RISE_START 開始整體往上抬，
 * 到 CREST 最高再高出十格，再往外落回最低那一層
 */
const RISE_START_RADIUS = 66
export const MEADOW_CREST_RADIUS = 98
const CREST_HEIGHT = 10
/** 超過這個半徑就是不畫的底層（LAKE_BED），由布景的地面平面代替 */
export const MEADOW_OUTER_RADIUS = 112

/**
 * 邊界：走上外圍的坡越走越慢，過了推回線被推回原野
 *
 * 推回線在坡的半腰，坡頂還在十幾格外，人永遠看不到坡後面
 */
export const MEADOW_SLOW_RADIUS = 70
export const MEADOW_PUSH_RADIUS = 84

/** 從 from 到 to 平滑地由零升到一 */
function smoothRange(value: number, from: number, to: number): number {
  return smoothStep((value - from) / (to - from))
}

/** 外圍坡用的半徑，吃一層低頻噪音，坡腳不是一個正圓 */
export function measureMeadowRadius(x: number, z: number): number {
  return Math.hypot(x - MEADOW_CENTER.x, z - MEADOW_CENTER.z)
    + fbm2D(x * 0.03 + 23, z * 0.03 - 9, 2, 0.5) * 9
}

/**
 * 沒有拉平門前之前的高度（可以是小數）
 *
 * 圓丘是兩層噪音：一層三十來格一個起伏的大丘，一層十幾格的小丘疊在上面，
 * 只取正的那一半再開根號，丘頂圓、丘間平，像一個一個鼓起來的饅頭，不是一道一道的稜
 */
function measureRawHeight(x: number, z: number): number {
  const radius = measureMeadowRadius(x, z)
  if (radius >= MEADOW_OUTER_RADIUS)
    return 0

  const knoll = Math.sqrt(Math.max(0, fbm2D(x * 0.032 - 5, z * 0.032 + 14, 3, 0.45) + 0.15)) * 6.5
  const hummock = Math.max(0, fbm2D(x * 0.075 + 9, z * 0.075 - 2, 2, 0.5)) * 2
  const innerFade = 1 - smoothRange(radius, MEADOW_CREST_RADIUS - 6, MEADOW_OUTER_RADIUS)
  const rise = Math.min(
    smoothRange(radius, RISE_START_RADIUS, MEADOW_CREST_RADIUS),
    1 - smoothRange(radius, MEADOW_CREST_RADIUS + 2, MEADOW_OUTER_RADIUS),
  )
  return Math.max(0, (knoll + hummock) * innerFade + CREST_HEIGHT * rise)
}

/** 回程門那一小塊平地高出最低那一層幾格 */
export const MEADOW_PORTAL_LEVEL = Math.round(measureRawHeight(MEADOW_PORTAL_POINT.x, MEADOW_PORTAL_POINT.z))

/** 地面在這一格高出最低那一層幾格（零以上的整數）；回程門四周拉平到門的那一層 */
export function measureMeadowHeight(x: number, z: number): number {
  const raw = measureRawHeight(x, z)
  const portalDistance = Math.hypot(x - MEADOW_PORTAL_POINT.x, z - MEADOW_PORTAL_POINT.z)
  const flatten = 1 - smoothRange(portalDistance, 5, 11)
  return Math.round(raw + (MEADOW_PORTAL_LEVEL - raw) * flatten)
}
