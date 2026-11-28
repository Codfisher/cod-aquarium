import type { DriftFeature } from '../realm-definition'
import { CICADA_CLOUD_TOWER_ANCHOR, createSkyDriftFeature } from '../realm-signature-direction'
import { CICADA_DETAIL_DRIFT_FEATURE_LIST } from './cicada-detail-features'
import {
  ARRIVAL_CLEARING,
  CICADA_CENTER,
  CICADA_GROUND_Y,
  CICADA_PORTAL_POINT,
  SUN_CLEARING_LIST,
  VERANDA_LIST,
} from './cicada-layout'

/**
 * 蟬雨深林的神遊特色主體
 *
 * 緣廊、空地與回程門由 cicada-layout 的常數推算（這些地方的地面都不隆起，高度就是 CICADA_GROUND_Y）。
 * 老樹是亂數種的，座標是照生成結果掃出來的（改了種子或數量要重掃）：
 * 取兩格粗的樹幹正中，y 取樹幹中段偏上，視線對準樹幹與樹冠的交界
 */

/** 人站在地面那一層上的腳底高度 */
const STAND_Y = CICADA_GROUND_Y + 1

const VERANDA_NAME_LIST = ['落腳空地的緣廊', '土徑盡頭的緣廊'] as const

const VERANDA_FEATURE_LIST: DriftFeature[] = VERANDA_LIST.map((veranda, index) => ({
  kind: 'structure',
  name: VERANDA_NAME_LIST[index]!,
  x: veranda.x,
  /** 廊板上面的坐墊與簷下吊燈，視線落在簷下 */
  y: STAND_Y + 1.5,
  z: veranda.z,
  size: 8,
  weight: index === 0 ? 0.9 : 0.8,
  viewDistance: [8, 20],
}))

const SUN_CLEARING_NAME_LIST = ['東邊的陽光空地', '西邊的陽光空地'] as const

const SUN_CLEARING_FEATURE_LIST: DriftFeature[] = SUN_CLEARING_LIST.map((clearing, index) => ({
  kind: 'light',
  name: SUN_CLEARING_NAME_LIST[index]!,
  x: clearing.x,
  y: STAND_Y + 1,
  z: clearing.z,
  size: clearing.radius * 2,
  weight: index === 0 ? 0.8 : 0.7,
  viewDistance: [8, 22],
}))

/** 老樹的樹幹中心（兩格粗，取四格的中點）與它是第幾棵 */
const OLD_TREE_LIST = [
  { name: '落腳處旁的老樹', x: 162, z: 166, weight: 0.8 },
  { name: '林心東側的老樹', x: 153, z: 153, weight: 0.75 },
  { name: '林心西側的老樹', x: 129, z: 137, weight: 0.7 },
  { name: '北林的老樹', x: 128, z: 113, weight: 0.65 },
] as const

const OLD_TREE_FEATURE_LIST: DriftFeature[] = OLD_TREE_LIST.map((tree) => ({
  kind: 'tree',
  name: tree.name,
  x: tree.x,
  y: STAND_Y + 8,
  z: tree.z,
  size: 14,
  weight: tree.weight,
  viewDistance: [10, 28],
}))

export const CICADA_DRIFT_FEATURE_LIST: DriftFeature[] = [
  ...VERANDA_FEATURE_LIST,
  ...SUN_CLEARING_FEATURE_LIST,
  ...OLD_TREE_FEATURE_LIST,
  {
    kind: 'gate',
    name: '回程門',
    x: CICADA_PORTAL_POINT.x,
    y: STAND_Y + 2,
    z: CICADA_PORTAL_POINT.z,
    size: 6,
    weight: 0.4,
    viewDistance: [8, 20],
  },
  {
    kind: 'light',
    name: '落腳空地的石燈籠',
    x: ARRIVAL_CLEARING.x + 5,
    y: STAND_Y + 1.5,
    z: ARRIVAL_CLEARING.z - 4,
    size: 3,
    weight: 0.35,
    viewDistance: [6, 16],
  },
  {
    kind: 'vista',
    name: '林冠外的深綠林稜',
    x: CICADA_CENTER.x + 85,
    y: STAND_Y + 14,
    z: CICADA_CENTER.z - 10,
    size: 80,
    weight: 0.4,
    viewDistance: [30, 70],
  },
  /** 細節小景那一輪補的幾處（見 cicada-detail-features） */
  ...CICADA_DETAIL_DRIFT_FEATURE_LIST,
  /** 招牌景象：白天東邊林稜後面的積雨雲（見 cicada-cloud-tower） */
  createSkyDriftFeature({ name: '東邊的積雨雲', anchor: CICADA_CLOUD_TOWER_ANCHOR, center: CICADA_CENTER, groundY: CICADA_GROUND_Y, weight: 0.6 }),
]
