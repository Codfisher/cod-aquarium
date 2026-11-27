import type { DriftFeature } from '../realm-definition'
import {
  WHEATFIELD_CENTER,
  WHEATFIELD_CREST_RADIUS,
  WHEATFIELD_PORTAL_POINT,
  WHEATFIELD_SLOW_RADIUS,
} from './wheatfield-layout'

/**
 * 千頃麥浪的神遊特色主體
 *
 * 路與十字路口從版面常數算。稻草人是地形 worker 依種子隨機立在田裡的，版面沒有常數可用，
 * 座標是用地形檢查腳本掃出來的（竹竿頂的草束位置）；改了稻草人的種子或田塊切法要重掃。
 * 高度：路面最高約 11，視線一律取路面上方兩三格，高過麥穗
 */

/** 路上的視線高度：碎石路最高 11，再上去兩格 */
const ROAD_VIEW_Y = 13

/** 遠景的視線高度：緩坡坡頂約十二格，往上抬一點才越過去看到天邊 */
const HORIZON_VIEW_Y = 16

/** 南北向碎石路取景的兩端，離十字路口各多遠 */
const ROAD_VIEW_HALF_LENGTH = 50

export const WHEATFIELD_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '南北碎石路',
    x: WHEATFIELD_CENTER.x,
    y: ROAD_VIEW_Y,
    z: WHEATFIELD_CENTER.z,
    size: ROAD_VIEW_HALF_LENGTH * 2,
    weight: 0.8,
    viewDistance: [12, 40],
    pathList: [
      { x: WHEATFIELD_CENTER.x, y: ROAD_VIEW_Y, z: WHEATFIELD_CENTER.z + ROAD_VIEW_HALF_LENGTH },
      { x: WHEATFIELD_CENTER.x, y: ROAD_VIEW_Y, z: WHEATFIELD_CENTER.z + ROAD_VIEW_HALF_LENGTH / 2 },
      { x: WHEATFIELD_CENTER.x, y: ROAD_VIEW_Y, z: WHEATFIELD_CENTER.z },
      { x: WHEATFIELD_CENTER.x, y: ROAD_VIEW_Y, z: WHEATFIELD_CENTER.z - ROAD_VIEW_HALF_LENGTH / 2 },
      { x: WHEATFIELD_CENTER.x, y: ROAD_VIEW_Y, z: WHEATFIELD_CENTER.z - ROAD_VIEW_HALF_LENGTH },
    ],
  },
  {
    kind: 'light',
    name: '十字路口的石燈籠',
    x: WHEATFIELD_CENTER.x,
    y: ROAD_VIEW_Y,
    z: WHEATFIELD_CENTER.z,
    size: 8,
    weight: 0.7,
    viewDistance: [8, 26],
  },
  {
    kind: 'structure',
    name: '東西碎石路',
    x: Math.round((WHEATFIELD_CENTER.x + WHEATFIELD_PORTAL_POINT.x) / 2),
    y: ROAD_VIEW_Y,
    z: WHEATFIELD_CENTER.z,
    size: WHEATFIELD_PORTAL_POINT.x - WHEATFIELD_CENTER.x,
    weight: 0.45,
    viewDistance: [8, 24],
  },
  {
    kind: 'structure',
    name: '東北田裡的稻草人',
    x: 190,
    y: 14,
    z: 129,
    size: 4,
    weight: 0.6,
    viewDistance: [6, 20],
  },
  {
    kind: 'structure',
    name: '北邊田裡的稻草人',
    x: 172,
    y: 12,
    z: 102,
    size: 4,
    weight: 0.55,
    viewDistance: [6, 20],
  },
  {
    kind: 'structure',
    name: '南邊田裡的稻草人',
    x: 155,
    y: 13,
    z: 180,
    size: 4,
    weight: 0.55,
    viewDistance: [6, 20],
  },
  {
    kind: 'vista',
    name: '西方麥浪天邊',
    x: WHEATFIELD_CENTER.x - WHEATFIELD_CREST_RADIUS - 40,
    y: HORIZON_VIEW_Y,
    z: WHEATFIELD_CENTER.z,
    size: 90,
    weight: 0.9,
    viewDistance: [30, WHEATFIELD_SLOW_RADIUS + 60],
  },
  {
    kind: 'vista',
    name: '北方麥浪天邊',
    x: WHEATFIELD_CENTER.x,
    y: HORIZON_VIEW_Y,
    z: WHEATFIELD_CENTER.z - WHEATFIELD_CREST_RADIUS - 40,
    size: 90,
    weight: 0.7,
    viewDistance: [30, WHEATFIELD_SLOW_RADIUS + 60],
  },
  {
    kind: 'vista',
    name: '南方麥浪天邊',
    x: WHEATFIELD_CENTER.x,
    y: HORIZON_VIEW_Y,
    z: WHEATFIELD_CENTER.z + WHEATFIELD_CREST_RADIUS + 40,
    size: 90,
    weight: 0.6,
    viewDistance: [30, WHEATFIELD_SLOW_RADIUS + 60],
  },
]
