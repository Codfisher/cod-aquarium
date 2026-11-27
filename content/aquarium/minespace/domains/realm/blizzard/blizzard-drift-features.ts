import type { DriftFeature } from '../realm-definition'
import {
  BLIZZARD_CENTER,
  BLIZZARD_GROUND_Y,
  BLIZZARD_PORTAL_POINT,
  POST_TRAIL_POINT_LIST,
} from './blizzard-layout'

/**
 * 白矇雪原的神遊特色主體
 *
 * 木樁小徑與正中那一方由 blizzard-layout 的常數推算（這兩處都被吹平，地面就是 BLIZZARD_GROUND_Y）；
 * 正中那一方的燈籠、松、石的相對位置與 blizzard-terrain 的 buildHeart 一致。
 * 雪丘是噪音堆出來的，座標是照生成結果掃出來的（改了雪丘噪音要重掃）
 */

/** 人站在雪地上的腳底高度 */
const STAND_Y = BLIZZARD_GROUND_Y + 1

/** 相對雪原中心的格子 */
function atCenter(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: BLIZZARD_CENTER.x + offsetX, z: BLIZZARD_CENTER.z + offsetZ }
}

/** 木樁小徑：從門前往南走到正中，點在樁子旁的行走高度 */
const TRAIL_PATH = POST_TRAIL_POINT_LIST.map((point) => ({
  ...atCenter(point.x, point.z),
  y: STAND_Y + 1,
}))

/** 正中那一方的三盞石燈籠 */
const HEART_LANTERN_PATH = [atCenter(-4, 4), atCenter(1, 5), atCenter(4, -3)].map((point) => ({
  ...point,
  y: STAND_Y + 4,
}))

export const BLIZZARD_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '木樁小徑',
    ...atCenter(0, -16),
    y: STAND_Y + 1,
    size: 20,
    weight: 0.9,
    viewDistance: [8, 24],
    pathList: TRAIL_PATH,
  },
  {
    kind: 'light',
    name: '正中的三盞石燈籠',
    ...atCenter(0, 2),
    y: STAND_Y + 1.5,
    size: 10,
    weight: 1,
    viewDistance: [8, 22],
    pathList: HEART_LANTERN_PATH,
  },
  {
    kind: 'tree',
    name: '被風壓彎的矮松',
    ...atCenter(3, 2),
    y: STAND_Y + 2,
    size: 5,
    weight: 0.7,
    viewDistance: [7, 18],
  },
  {
    kind: 'landmark',
    name: '高立石',
    ...atCenter(3, -2),
    y: STAND_Y + 2,
    size: 3,
    weight: 0.5,
    viewDistance: [6, 16],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: BLIZZARD_PORTAL_POINT.x,
    y: STAND_Y + 2,
    z: BLIZZARD_PORTAL_POINT.z,
    size: 6,
    weight: 0.6,
    viewDistance: [8, 20],
  },
  {
    kind: 'landmark',
    name: '正中南側的長雪丘',
    x: 138,
    y: BLIZZARD_GROUND_Y + 8,
    z: 151,
    size: 14,
    weight: 0.55,
    viewDistance: [10, 26],
  },
  {
    kind: 'landmark',
    name: '西北的雪丘',
    x: 125,
    y: BLIZZARD_GROUND_Y + 8,
    z: 123,
    size: 14,
    weight: 0.45,
    viewDistance: [10, 26],
  },
  {
    kind: 'vista',
    name: '白茫茫的雪原盡頭',
    x: BLIZZARD_CENTER.x + 85,
    y: BLIZZARD_GROUND_Y + 12,
    z: BLIZZARD_CENTER.z + 10,
    size: 80,
    weight: 0.4,
    viewDistance: [30, 70],
  },
]
