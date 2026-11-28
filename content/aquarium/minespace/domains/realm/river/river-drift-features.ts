import type { DriftFeature } from '../realm-definition'
import {
  CASCADE_X,
  measureStreamHalfWidth,
  measureStreamZ,
  PLUNGE_POOL,
  RIVER_FISHING_POINT,
  RIVER_LOG_BRIDGE_POINT,
  RIVER_PORTAL_POINT,
  UPPER_FLOOR_Y,
  VALLEY_END_X,
  VALLEY_FLOOR_Y,
  VALLEY_HEAD_X,
  WATERFALL_POINT,
  WATERFALL_TOP_Y,
} from './river-layout'

/** 木橋的 X，與 river-terrain 的 BRIDGE_X 同一個數字（那邊沒有匯出） */
const BRIDGE_X = 158

/** 某一排溪心的 Z（取整，落在方塊中心） */
function getStreamZ(x: number): number {
  return Math.round(measureStreamZ(x))
}

/** 沿溪流每隔幾格取一點，y 取水面上方，線狀主體的路徑 */
function createStreamPath(fromX: number, toX: number, step: number, y: number): { x: number; y: number; z: number }[] {
  const pointList: { x: number; y: number; z: number }[] = []
  for (let x = fromX; x <= toX; x += step)
    pointList.push({ x, y, z: getStreamZ(x) })
  return pointList
}

const WATERFALL_MIDDLE_Y = Math.round((UPPER_FLOOR_Y + WATERFALL_TOP_Y) / 2)
const POOL_CENTER_X = VALLEY_HEAD_X + PLUNGE_POOL.offsetX
const STEPPING_STONE_X = POOL_CENTER_X + PLUNGE_POOL.radius + 4

/**
 * 溪谷的神遊特色主體
 *
 * 座標全由 river-layout 的常數算出：主瀑布與水潭在谷底西頭，
 * 跌水在半途，木橋在下游，窄峽收在最東邊
 */
export const RIVER_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'waterfall',
    name: '主瀑布',
    x: VALLEY_HEAD_X + 1,
    y: WATERFALL_MIDDLE_Y,
    z: WATERFALL_POINT.z,
    size: 22,
    weight: 1,
    viewDistance: [14, 34],
    viewpointList: [{ x: STEPPING_STONE_X, z: getStreamZ(STEPPING_STONE_X) }],
  },
  {
    kind: 'water',
    name: '瀑布潭',
    x: POOL_CENTER_X,
    y: UPPER_FLOOR_Y,
    z: WATERFALL_POINT.z,
    size: PLUNGE_POOL.radius * 2,
    weight: 0.8,
    viewDistance: [10, 26],
  },
  {
    kind: 'waterfall',
    name: '側崖小瀑布',
    x: VALLEY_HEAD_X + 4,
    y: UPPER_FLOOR_Y + 4,
    z: WATERFALL_POINT.z + 7,
    size: 12,
    weight: 0.5,
    viewDistance: [10, 24],
  },
  {
    kind: 'water',
    name: '中段跌水',
    x: CASCADE_X,
    y: VALLEY_FLOOR_Y + 1,
    z: getStreamZ(CASCADE_X),
    size: 8,
    weight: 0.6,
    viewDistance: [8, 20],
  },
  {
    kind: 'water',
    name: '蜿蜒溪流',
    x: 110,
    y: UPPER_FLOOR_Y,
    z: getStreamZ(110),
    size: 16,
    weight: 0.7,
    viewDistance: [10, 28],
    pathList: createStreamPath(VALLEY_HEAD_X + 24, BRIDGE_X - 4, 12, UPPER_FLOOR_Y),
  },
  {
    kind: 'structure',
    name: '溪上木橋',
    x: BRIDGE_X + 0.5,
    y: VALLEY_FLOOR_Y + 2,
    z: getStreamZ(BRIDGE_X),
    size: Math.ceil(measureStreamHalfWidth(BRIDGE_X)) * 2 + 6,
    weight: 0.6,
    viewDistance: [8, 20],
  },
  {
    kind: 'structure',
    name: '鹿威',
    x: RIVER_PORTAL_POINT.x - 6,
    y: VALLEY_FLOOR_Y + 3,
    z: RIVER_PORTAL_POINT.z + 4,
    size: 4,
    weight: 0.4,
    viewDistance: [5, 12],
  },
  {
    kind: 'structure',
    name: '橫在溪上的倒木',
    x: RIVER_LOG_BRIDGE_POINT.x,
    y: VALLEY_FLOOR_Y + 2,
    z: RIVER_LOG_BRIDGE_POINT.z,
    size: 7,
    weight: 0.6,
    viewDistance: [6, 16],
  },
  {
    kind: 'structure',
    name: '溪畔釣點',
    x: RIVER_FISHING_POINT.x,
    y: UPPER_FLOOR_Y + 1,
    z: RIVER_FISHING_POINT.z,
    size: 4,
    weight: 0.4,
    viewDistance: [5, 13],
  },
  {
    kind: 'water',
    name: '下游窄峽',
    x: VALLEY_END_X - 8,
    y: VALLEY_FLOOR_Y + 1,
    z: getStreamZ(VALLEY_END_X - 8),
    size: 10,
    weight: 0.5,
    viewDistance: [8, 22],
    pathList: createStreamPath(VALLEY_END_X - 24, VALLEY_END_X - 4, 5, VALLEY_FLOOR_Y + 1),
  },
]
