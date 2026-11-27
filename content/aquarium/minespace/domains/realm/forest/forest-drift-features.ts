import type { DriftFeature } from '../realm-definition'
import {
  ARRIVAL_CLEARING,
  FOREST_CENTER,
  FOREST_GROUND_Y,
  FOREST_PATH_POINT_LIST,
  FOREST_PORTAL_POINT,
  SHRINE_CLEARING,
  THICKET_START_RADIUS,
} from './forest-layout'

/** 小徑每隔幾個取樣點取一點當視線路徑（取樣點不到一格一個） */
const PATH_POINT_STEP = 12

/** 石板小徑上空一格：人走的高度，路徑點得是空氣 */
const PATH_WALK_Y = FOREST_GROUND_Y + 1

/** 神社空地裡鳥居的位置（見 forest-terrain 的 buildShrineClearing：跨在小徑走進空地的那一口） */
const TORII_Z = SHRINE_CLEARING.z + SHRINE_CLEARING.radius - 2

/**
 * 林海的神遊特色主體
 *
 * 林子往四面長下去，看得到的亮點不多：小徑盡頭的神社空地（鳥居、老橡樹、石燈籠）是招牌，
 * 落腳的空地、沿路的石燈籠與整條石板小徑是前半段的風景，
 * 林子外圈的林稜隔著樹冠遠遠看得到，用 vista 讓鏡頭抬高看出去
 */
export const FOREST_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '林間鳥居',
    x: SHRINE_CLEARING.x,
    y: FOREST_GROUND_Y + 4,
    z: TORII_Z,
    size: 8,
    weight: 0.95,
    viewDistance: [8, 20],
  },
  {
    kind: 'tree',
    name: '空地老橡樹',
    x: SHRINE_CLEARING.x,
    y: FOREST_GROUND_Y + 8,
    z: SHRINE_CLEARING.z - 2,
    size: 12,
    weight: 1,
    viewDistance: [10, 26],
  },
  {
    kind: 'light',
    name: '神社石燈籠',
    x: SHRINE_CLEARING.x + 3,
    y: FOREST_GROUND_Y + 2,
    z: SHRINE_CLEARING.z + 1,
    size: 3,
    weight: 0.45,
    viewDistance: [5, 12],
  },
  {
    kind: 'landmark',
    name: '落腳空地',
    x: ARRIVAL_CLEARING.x,
    y: FOREST_GROUND_Y + 4,
    z: ARRIVAL_CLEARING.z,
    size: ARRIVAL_CLEARING.radius * 2,
    weight: 0.55,
    viewDistance: [10, 24],
  },
  {
    kind: 'structure',
    name: '石板小徑',
    x: FOREST_CENTER.x + 2,
    y: PATH_WALK_Y + 2,
    z: FOREST_CENTER.z,
    size: 20,
    weight: 0.7,
    viewDistance: [8, 22],
    pathList: FOREST_PATH_POINT_LIST
      .filter((_, index) => index % PATH_POINT_STEP === 0)
      .map((point) => ({ x: Math.round(point.x), y: PATH_WALK_Y, z: Math.round(point.z) })),
  },
  {
    kind: 'gate',
    name: '回程門',
    x: FOREST_PORTAL_POINT.x,
    y: FOREST_GROUND_Y + 3,
    z: FOREST_PORTAL_POINT.z,
    size: 6,
    weight: 0.3,
    viewDistance: [8, 18],
  },
  {
    kind: 'vista',
    name: '林海稜線（北）',
    x: FOREST_CENTER.x + 6,
    y: FOREST_GROUND_Y + 22,
    z: FOREST_CENTER.z - THICKET_START_RADIUS - 60,
    size: 70,
    weight: 0.7,
    viewDistance: [20, 45],
  },
  {
    kind: 'vista',
    name: '林海稜線（東）',
    x: FOREST_CENTER.x + THICKET_START_RADIUS + 60,
    y: FOREST_GROUND_Y + 22,
    z: FOREST_CENTER.z - 8,
    size: 70,
    weight: 0.6,
    viewDistance: [20, 45],
  },
]
