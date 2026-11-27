import type { DriftFeature } from '../realm-definition'
import {
  BOARDWALK_POINT_LIST,
  PLATFORM_LIST,
  SWAMP_CENTER,
  SWAMP_PORTAL_POINT,
  SWAMP_WATER_SURFACE_Y,
  SWAMP_WATER_Y,
} from './swamp-layout'

/**
 * 千蛙沼的神遊特色主體
 *
 * 座標都由 swamp-layout 的常數推算：木棧與平台的甲板在水面上一格（SWAMP_WATER_Y + 1），
 * 欄杆與紙燈再高一格。枯木是亂數種的、沒有常數可推，座標是照生成結果掃出來的
 * （改了枯木的種子或數量要重掃）
 */

/** 木棧甲板上方的行走高度：甲板是下半磚，人站在上面約高一格半 */
const DECK_WALK_Y = SWAMP_WATER_Y + 2

/** 沼澤中心加上偏移 */
function atMarsh(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: SWAMP_CENTER.x + offsetX, z: SWAMP_CENTER.z + offsetZ }
}

const PLATFORM_NAME_LIST = ['北側歇腳平台', '南側歇腳平台', '東端歇腳平台'] as const

/** 木棧轉折點，起點是回程門東側那一格 */
const BOARDWALK_PATH = [
  { x: SWAMP_PORTAL_POINT.x + 1, y: DECK_WALK_Y, z: SWAMP_PORTAL_POINT.z },
  ...BOARDWALK_POINT_LIST.map((point) => ({ ...atMarsh(point.offsetX, point.offsetZ), y: DECK_WALK_Y })),
]

const PLATFORM_FEATURE_LIST: DriftFeature[] = PLATFORM_LIST.map((platform, index) => {
  const center = atMarsh((platform.minX + platform.maxX) / 2, (platform.minZ + platform.maxZ) / 2)
  return {
    kind: 'structure',
    name: PLATFORM_NAME_LIST[index]!,
    x: center.x,
    y: SWAMP_WATER_Y + 2.5,
    z: center.z,
    size: 7,
    weight: index === 2 ? 0.6 : 0.5,
    viewDistance: [8, 22],
  }
})

const EAST_LAMP = atMarsh(PLATFORM_LIST[2].lampX, PLATFORM_LIST[2].lampZ)

export const SWAMP_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '蜿蜒木棧',
    x: SWAMP_CENTER.x + 2,
    y: DECK_WALK_Y,
    z: SWAMP_CENTER.z,
    size: 60,
    weight: 1,
    viewDistance: [10, 30],
    pathList: BOARDWALK_PATH,
  },
  ...PLATFORM_FEATURE_LIST,
  {
    kind: 'light',
    name: '東端平台的紙燈',
    x: EAST_LAMP.x,
    y: SWAMP_WATER_Y + 2,
    z: EAST_LAMP.z,
    size: 3,
    weight: 0.4,
    viewDistance: [6, 18],
  },
  {
    kind: 'water',
    name: '東北的開闊水面',
    x: 152,
    y: SWAMP_WATER_SURFACE_Y,
    z: 104,
    size: 24,
    weight: 0.7,
    viewDistance: [14, 40],
  },
  {
    kind: 'tree',
    name: '灰白枯木',
    x: 138,
    y: SWAMP_WATER_Y + 4,
    z: 143,
    size: 6,
    weight: 0.55,
    viewDistance: [8, 24],
  },
  {
    kind: 'tree',
    name: '霧中枯木',
    x: 156,
    y: SWAMP_WATER_Y + 4,
    z: 164,
    size: 6,
    weight: 0.45,
    viewDistance: [8, 24],
  },
  {
    kind: 'vista',
    name: '東邊水天與林線',
    x: SWAMP_CENTER.x + 75,
    y: SWAMP_WATER_Y + 5,
    z: SWAMP_CENTER.z,
    size: 80,
    weight: 0.6,
    viewDistance: [30, 70],
  },
]
