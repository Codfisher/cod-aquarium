import type { DriftFeature } from '../realm-definition'
import { RAINVALE_DETAIL_DRIFT_FEATURE_LIST } from './rainvale-detail-features'
import {
  ARRIVAL_POND,
  PAVILION_LIST,
  POND_LIST,
  RAINVALE_CENTER,
  RAINVALE_GROUND_Y,
  RAINVALE_PORTAL_POINT,
} from './rainvale-layout'

/**
 * 聽雨林的神遊特色主體
 *
 * 亭子與積水由 rainvale-layout 的清單推算（它們四周三格內的地面不隆起，高度就是 RAINVALE_GROUND_Y）。
 * 水面比草地頂面矮八分之一格，取 +0.4 是水面上方的視線高度
 */

/** 人站在地面那一層上的腳底高度 */
const STAND_Y = RAINVALE_GROUND_Y + 1

const PAVILION_NAME_LIST = ['池西岸的小亭', '北林的小亭', '西林的小亭', '南林的小亭'] as const

const PAVILION_FEATURE_LIST: DriftFeature[] = PAVILION_LIST.map((pavilion, index) => ({
  kind: 'structure',
  name: PAVILION_NAME_LIST[index]!,
  x: pavilion.x,
  /** 亭子三格高的圍籬細柱，吊燈在第二格 */
  y: STAND_Y + 1.5,
  z: pavilion.z,
  size: 6,
  weight: index === 0 ? 0.95 : 0.75,
  viewDistance: [8, 20],
}))

/** 挑四窪：落腳那一池（最大）與三窪中等的 */
const POND_PICK_LIST = POND_LIST.slice(1, 4)
const POND_NAME_LIST = ['北林的積水', '西林的積水', '南林的積水'] as const

const POND_FEATURE_LIST: DriftFeature[] = POND_PICK_LIST.map((pond, index) => ({
  kind: 'water',
  name: POND_NAME_LIST[index]!,
  x: pond.x,
  y: RAINVALE_GROUND_Y + 0.4,
  z: pond.z,
  size: pond.radius * 2,
  weight: 0.55,
  viewDistance: [7, 20],
}))

export const RAINVALE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'water',
    name: '落腳處的大池',
    x: ARRIVAL_POND.x,
    y: RAINVALE_GROUND_Y + 0.4,
    z: ARRIVAL_POND.z,
    size: ARRIVAL_POND.radius * 2,
    weight: 1,
    viewDistance: [8, 24],
  },
  ...PAVILION_FEATURE_LIST,
  ...POND_FEATURE_LIST,
  {
    kind: 'gate',
    name: '回程門',
    x: RAINVALE_PORTAL_POINT.x,
    y: STAND_Y + 2,
    z: RAINVALE_PORTAL_POINT.z,
    size: 6,
    weight: 0.4,
    viewDistance: [8, 20],
  },
  {
    kind: 'vista',
    name: '雨霧裡的林牆',
    x: RAINVALE_CENTER.x - 75,
    y: STAND_Y + 8,
    z: RAINVALE_CENTER.z + 5,
    size: 60,
    weight: 0.35,
    viewDistance: [25, 60],
  },
  /** 細節小景那一輪補的幾處（見 rainvale-detail-features） */
  ...RAINVALE_DETAIL_DRIFT_FEATURE_LIST,
]
