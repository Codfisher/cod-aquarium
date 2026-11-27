import { fbm2D, smoothStep } from '../../../utils/noise'
import { WORLD_SIZE } from '../../world/world-constants'

/**
 * 羊鳴谷的尺寸與定點
 *
 * 地形 worker（生方塊）與渲染端（傳送門、布景、邊界、羊群、音源）都要讀同一批數字，
 * 所以抽成純資料，不引用 Babylon 也不引用造景程式。
 *
 * 這裡是牧野的放大版：牧野是一方草地，柵欄圍一圈、朝一側留一道門，
 * 裡面幾隻羊低頭吃草，角落一堆乾草、一座飲水槽，草被啃得稀稀的。
 * 這裡把木座換成一座東西向的山谷：平坦的谷底圍著一大片放羊的柵欄，
 * 兩側的坡上一塊一塊用柵欄隔開的草場，坡越往外越陡，最外面是一圈山
 */

/** 谷底的中心，也是遠景與邊界的中心 */
export const PASTURE_REALM_CENTER = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 }

/** 谷底那一層草的高度 */
export const PASTURE_GROUND_Y = 8

/**
 * 山谷的剖面
 *
 * 用橢圓量距離（東西長、南北短），谷底在 FLOOR 以內是平的，
 * 往外一路升到 CREST、高出谷底 FELL_HEIGHT 格，再往外落回谷底的高度（布景平面接手）
 */
const VALLEY_STRETCH_X = 0.9
const VALLEY_STRETCH_Z = 1.15
const FLOOR_RADIUS = 32
export const PASTURE_CREST_RADIUS = 86
const FELL_HEIGHT = 16
/** 超過這個「橢圓半徑」就是不畫的底層（LAKE_BED），由布景的地面平面代替 */
export const PASTURE_OUTER_RADIUS = 100

/**
 * 邊界：爬上坡越走越慢，過了推回線被推回谷裡
 *
 * 邊界是圓，山谷是橢圓：往南北爬，推回線在坡的上半段，山頂還在十來格外；
 * 往東西走，推回線還在坡腳。兩頭都看不到山頂後面
 */
export const PASTURE_SLOW_RADIUS = 48
export const PASTURE_PUSH_RADIUS = 60

/** 一圈柵欄圍起來的草場（世界座標），opening 是留門的那一邊與門的半寬 */
export interface PasturePaddock {
  centerX: number;
  centerZ: number;
  halfSizeX: number;
  halfSizeZ: number;
  opening: { side: 'north' | 'south' | 'east' | 'west'; halfWidth: number };
}

/**
 * 放羊的那一圈
 *
 * 牧野的柵欄十一格見方；這裡二十九格見方，落在谷底正中偏南，北邊留一道三格寬的門，
 * 正對著回程門。羊群在裡面走（見 PASTURE_SHEEP_FLOCK）
 */
export const SHEEP_PADDOCK: PasturePaddock = {
  centerX: PASTURE_REALM_CENTER.x,
  centerZ: PASTURE_REALM_CENTER.z + 6,
  halfSizeX: 14,
  halfSizeZ: 14,
  opening: { side: 'north', halfWidth: 1 },
}

/** 谷底東西兩頭、坡腳上的兩圈小草場，空著，各一堆乾草與一座飲水槽 */
export const SIDE_PADDOCK_LIST: PasturePaddock[] = [
  {
    centerX: PASTURE_REALM_CENTER.x - 38,
    centerZ: PASTURE_REALM_CENTER.z - 2,
    halfSizeX: 9,
    halfSizeZ: 8,
    opening: { side: 'east', halfWidth: 1 },
  },
  {
    centerX: PASTURE_REALM_CENTER.x + 37,
    centerZ: PASTURE_REALM_CENTER.z + 10,
    halfSizeX: 10,
    halfSizeZ: 9,
    opening: { side: 'west', halfWidth: 1 },
  },
]

/**
 * 羊群走動的範圍
 *
 * 牧野是比柵欄縮兩格，免得卡在欄杆上；這裡縮四格：柵欄裡面那三格擺著乾草堆與水槽，
 * 羊走得到的話會一腳踩上槽邊、站到水槽頂上去（羊只貼地面，不認方塊）。
 * 八隻：牧野四隻在七格見方裡走，這裡二十一格見方、大了九倍，羊卻不能跟著多九倍，再多就是每幀多畫上百個方盒（一隻十三塊、還要進陰影）
 */
export const PASTURE_SHEEP_FLOCK = {
  centerX: SHEEP_PADDOCK.centerX,
  centerZ: SHEEP_PADDOCK.centerZ,
  halfSize: SHEEP_PADDOCK.halfSizeX - 4,
  count: 8,
} as const

/**
 * 回程門
 *
 * 大廳那座門立在牧野柵欄的北門裡面，門洞朝北，人從北邊走進來、往南穿過去；
 * 這裡的門立在放羊那一圈的北門外五格，門洞朝北，人到了之後仍是往南走：
 * 眼前就是那道柵欄門，門裡是羊群，再過去是南坡一塊一塊的草場
 */
export const PASTURE_PORTAL_POINT = {
  x: SHEEP_PADDOCK.centerX,
  z: SHEEP_PADDOCK.centerZ - SHEEP_PADDOCK.halfSizeZ - 6,
}

/**
 * 大廳那座門離牧野中心的偏移
 *
 * 牧野的正中是羊群（四隻羊在中心三格內來回），門立在那裡羊會從門柱裡穿過去。
 * 所以立在北邊柵欄門的裡面一格，門洞朝北對著那道門：人從柵欄門走進來就是傳送門，
 * 羊群在門後吃草
 */
export const PASTURE_HUB_GATE_OFFSET = { x: 0, z: -4 } as const

/** 從 from 到 to 平滑地由零升到一 */
function smoothRange(value: number, from: number, to: number): number {
  return smoothStep((value - from) / (to - from))
}

/** 山谷剖面用的橢圓半徑，吃一層低頻噪音，坡腳不是一個正橢圓 */
export function measureValleyRadius(x: number, z: number): number {
  return Math.hypot((x - PASTURE_REALM_CENTER.x) * VALLEY_STRETCH_X, (z - PASTURE_REALM_CENTER.z) * VALLEY_STRETCH_Z)
    + fbm2D(x * 0.028 + 3, z * 0.028 + 31, 2, 0.5) * 6
}

/**
 * 地面在這一格高出谷底幾格（零以上的整數）
 *
 * 谷底是平的，羊與柵欄都站得穩；坡上疊一層起伏的小丘，越往上越明顯，
 * 坡才不是一面車床車出來的碗。山頂過後落回谷底的高度
 */
export function measurePastureHeight(x: number, z: number): number {
  const radius = measureValleyRadius(x, z)
  if (radius <= FLOOR_RADIUS || radius >= PASTURE_OUTER_RADIUS)
    return 0

  const rise = smoothRange(radius, FLOOR_RADIUS, PASTURE_CREST_RADIUS)
  const fall = 1 - smoothRange(radius, PASTURE_CREST_RADIUS + 2, PASTURE_OUTER_RADIUS)
  const knoll = fbm2D(x * 0.06 - 21, z * 0.06 + 8, 2, 0.5) * 3 * rise
  return Math.max(0, Math.round(FELL_HEIGHT * Math.min(rise, fall) + knoll * fall))
}
