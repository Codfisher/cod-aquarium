import type { DriftFeature } from '../realm-definition'
import { createSkyDriftFeature, SONGBIRD_MURMURATION_ANCHOR } from '../realm-signature-direction'
import { SONGBIRD_DETAIL_DRIFT_FEATURE_LIST } from './songbird-detail-features'
import {
  BASIN_LIST,
  BIRDHOUSE_LIST,
  SONGBIRD_CENTER,
  SONGBIRD_GROUND_Y,
  SONGBIRD_PORTAL_POINT,
} from './songbird-layout'

/**
 * 百囀林苑的神遊特色主體
 *
 * 飲水盤與鳥屋都由 songbird-layout 的清單推算（它們四周的地面不隆起，高度就是 SONGBIRD_GROUND_Y）。
 * 樹叢是亂數撒的，座標是照生成結果掃出來的（改了種子或數量要重掃）
 */

/** 鳥屋的盒身（蜂箱）離地面那一層的高度：柵柱三格、木板一格，盒身在第五格 */
const BIRDHOUSE_BOX_Y = SONGBIRD_GROUND_Y + 5

const BASIN_NAME_LIST = ['落腳處的飲水盤', '園心的飲水盤', '南側的飲水盤'] as const

const BASIN_FEATURE_LIST: DriftFeature[] = [BASIN_LIST[0], BASIN_LIST[1], BASIN_LIST[3]].map((basin, index) => ({
  kind: 'water',
  name: BASIN_NAME_LIST[index]!,
  x: basin.x,
  y: SONGBIRD_GROUND_Y + 0.4,
  z: basin.z,
  size: 4,
  weight: index === 0 ? 0.8 : 0.6,
  viewDistance: [6, 16],
}))

const BIRDHOUSE_NAME_LIST = ['落腳處的鳥屋', '園心的鳥屋', '西側的鳥屋'] as const

const BIRDHOUSE_FEATURE_LIST: DriftFeature[] = [BIRDHOUSE_LIST[0], BIRDHOUSE_LIST[1], BIRDHOUSE_LIST[3]].map((house, index) => ({
  kind: 'structure',
  name: BIRDHOUSE_NAME_LIST[index]!,
  x: house.x,
  y: BIRDHOUSE_BOX_Y,
  z: house.z,
  size: 6,
  weight: index === 0 ? 0.9 : 0.7,
  viewDistance: [7, 18],
}))

export const SONGBIRD_DRIFT_FEATURE_LIST: DriftFeature[] = [
  ...BASIN_FEATURE_LIST,
  ...BIRDHOUSE_FEATURE_LIST,
  {
    kind: 'tree',
    name: '橡樹叢（近落腳處）',
    x: 150,
    y: SONGBIRD_GROUND_Y + 7,
    z: 149,
    size: 9,
    weight: 0.6,
    viewDistance: [9, 24],
  },
  {
    kind: 'tree',
    name: '橡樹叢（園北）',
    x: 143,
    y: SONGBIRD_GROUND_Y + 7,
    z: 129,
    size: 9,
    weight: 0.6,
    viewDistance: [9, 24],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: SONGBIRD_PORTAL_POINT.x,
    y: SONGBIRD_GROUND_Y + 3,
    z: SONGBIRD_PORTAL_POINT.z,
    size: 6,
    weight: 0.4,
    viewDistance: [8, 20],
  },
  {
    kind: 'vista',
    name: '林冠外的圓頂林丘',
    x: SONGBIRD_CENTER.x - 85,
    y: SONGBIRD_GROUND_Y + 14,
    z: SONGBIRD_CENTER.z - 10,
    size: 80,
    weight: 0.4,
    viewDistance: [30, 70],
  },
  /** 細節小景那一輪補的幾處（見 songbird-detail-features） */
  ...SONGBIRD_DETAIL_DRIFT_FEATURE_LIST,
  /** 招牌景象：晨昏在北邊樹冠上空翻捲的椋鳥群（見 songbird-murmuration） */
  createSkyDriftFeature({ name: '北邊樹冠上的椋鳥群', anchor: SONGBIRD_MURMURATION_ANCHOR, center: SONGBIRD_CENTER, groundY: SONGBIRD_GROUND_Y, weight: 0.5 }),
]
