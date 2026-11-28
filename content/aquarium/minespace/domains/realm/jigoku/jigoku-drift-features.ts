import type { DriftFeature } from '../realm-definition'
import { createSkyDriftFeature } from '../realm-signature-direction'
import { JIGOKU_DETAIL_DRIFT_FEATURE_LIST } from './jigoku-detail-features'
import {
  BOARDWALK_LOOP_POINT_LIST,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  JIGOKU_TORII_Z,
  measureRiftShape,
  RIFT_HALF_LENGTH,
  STEAM_VENT_LIST,
  VALLEY_RADIUS_X,
} from './jigoku-layout'

/**
 * 湯煙谷的神遊特色主體
 *
 * 熔岩縫、熱泉、噴氣孔與木棧的座標全從版面常數算；
 * 高度：谷底那一層是 9，熔岩與熱泉的水面在 9 附近，木棧鋪在 10、人站在 11，視線取木棧上方一格。
 * 已用地形檢查腳本驗證不埋在方塊裡
 */

/** 木棧上方的視線高度 */
const WALK_VIEW_Y = JIGOKU_FOOT_Y + 2

/** 熔岩面上方的視線高度（熔岩頂面 9.875，貼著它剛好） */
const LAVA_VIEW_Y = JIGOKU_FOOT_Y

/** 沿熔岩縫每隔十二格取一點，中心線隨縫身彎曲 */
const riftPathList = [-36, -24, -12, 0, 12, 24, 36].map((offsetX) => ({
  x: JIGOKU_CENTER.x + offsetX,
  y: LAVA_VIEW_Y,
  z: Math.round(measureRiftShape(offsetX).center),
}))

/** 木棧繞一圈，頭尾相接 */
const boardwalkPathList = [...BOARDWALK_LOOP_POINT_LIST, BOARDWALK_LOOP_POINT_LIST[0]].map((point) => ({
  x: point.x,
  y: WALK_VIEW_Y,
  z: point.z,
}))

const springList = HOT_POOL_LIST.filter((pool) => pool.kind === 'spring')
const mudList = HOT_POOL_LIST.filter((pool) => pool.kind === 'mud')

export const JIGOKU_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'light',
    name: '熔岩裂縫',
    x: JIGOKU_CENTER.x,
    y: LAVA_VIEW_Y,
    z: Math.round(measureRiftShape(0).center),
    size: RIFT_HALF_LENGTH * 2,
    weight: 1,
    viewDistance: [10, 40],
    viewpointList: [{ x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z + 16 }],
    pathList: riftPathList,
  },
  {
    kind: 'gate',
    name: '鳥居',
    x: JIGOKU_CENTER.x,
    y: JIGOKU_FOOT_Y + 3,
    z: JIGOKU_TORII_Z,
    size: 8,
    weight: 0.85,
    viewDistance: [8, 26],
    viewpointList: [{ x: JIGOKU_PORTAL_POINT.x, z: JIGOKU_PORTAL_POINT.z - 6 }],
  },
  {
    kind: 'water',
    name: '北岸大熱泉',
    x: springList[2]!.x,
    y: JIGOKU_FOOT_Y,
    z: springList[2]!.z,
    size: springList[2]!.radius * 2,
    weight: 0.8,
    viewDistance: [8, 24],
  },
  {
    kind: 'water',
    name: '西南熱泉',
    x: springList[0]!.x,
    y: JIGOKU_FOOT_Y,
    z: springList[0]!.z,
    size: springList[0]!.radius * 2,
    weight: 0.7,
    viewDistance: [8, 24],
  },
  {
    kind: 'water',
    name: '東南熱泉',
    x: springList[1]!.x,
    y: JIGOKU_FOOT_Y,
    z: springList[1]!.z,
    size: springList[1]!.radius * 2,
    weight: 0.6,
    viewDistance: [8, 22],
  },
  {
    kind: 'water',
    name: '灰泥池',
    x: mudList[0]!.x,
    y: JIGOKU_FOOT_Y,
    z: mudList[0]!.z,
    size: mudList[0]!.radius * 2,
    weight: 0.4,
    viewDistance: [6, 18],
  },
  {
    kind: 'landmark',
    name: '噴氣孔',
    x: STEAM_VENT_LIST[2]!.x,
    y: JIGOKU_FOOT_Y + 2,
    z: STEAM_VENT_LIST[2]!.z,
    size: 6,
    weight: 0.6,
    viewDistance: [6, 20],
  },
  {
    kind: 'structure',
    name: '環谷木棧',
    x: JIGOKU_CENTER.x,
    y: WALK_VIEW_Y,
    z: JIGOKU_CENTER.z + 15,
    size: 60,
    weight: 0.55,
    viewDistance: [10, 36],
    pathList: boardwalkPathList,
  },
  {
    kind: 'vista',
    name: '谷東的火山稜',
    x: JIGOKU_CENTER.x + VALLEY_RADIUS_X + 50,
    y: 26,
    z: JIGOKU_CENTER.z,
    size: 70,
    weight: 0.5,
    viewDistance: [30, 80],
  },
  {
    kind: 'vista',
    name: '谷西的火山稜',
    x: JIGOKU_CENTER.x - VALLEY_RADIUS_X - 50,
    y: 26,
    z: JIGOKU_CENTER.z,
    size: 70,
    weight: 0.5,
    viewDistance: [30, 80],
  },
  /** 細節小景那一輪補的幾處（見 jigoku-detail-features） */
  ...JIGOKU_DETAIL_DRIFT_FEATURE_LIST,
  /** 招牌景象：熔岩縫東頭谷稜上的火映與火山雷（見 jigoku-sky-glow），西頭已有上面那一筆火山稜 */
  createSkyDriftFeature({ name: '谷東的火映', anchor: { azimuth: Math.PI / 2, elevation: 0.2 }, center: JIGOKU_CENTER, groundY: JIGOKU_FOOT_Y, weight: 0.45 }),
]
