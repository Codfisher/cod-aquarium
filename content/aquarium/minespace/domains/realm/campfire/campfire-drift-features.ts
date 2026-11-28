import type { DriftFeature } from '../realm-definition'
import { CAMPFIRE_COMET_ANCHOR, createSkyDriftFeature } from '../realm-signature-direction'
import { CAMPFIRE_DETAIL_DRIFT_FEATURE_LIST } from './campfire-detail-features'
import {
  CAMP_CENTER,
  CAMP_FOOT_Y,
  COOK_FIRE_POINT,
  GRAVE_POINT,
  HOMESTEAD_POINT,
  OUTCROP_LIST,
  OUTRIDER_CAMP_LIST,
  PRAIRIE_RADIUS,
  WAGON_CIRCLE_RADIUS,
  WAGON_TRAIL_POINT_LIST,
  WINDMILL_POINT,
} from './campfire-layout'

/**
 * 拓荒原的神遊特色主體
 *
 * 座標全從版面常數算；高度是原野腳底（10）往上量到主體視覺中心的目測值，
 * 紅岩丘取丘頂上方一格，已用地形檢查腳本驗證不埋在方塊裡
 */

/** 視線高度：腳底上方兩格，約是篷車與火堆的高度 */
const LOW_VIEW_Y = CAMP_FOOT_Y + 2

/** 紅岩丘的特色：視線落在丘頂上方，丘身是實心的 */
function createOutcropFeature(outcropIndex: number, name: string, weight: number): DriftFeature {
  const outcrop = OUTCROP_LIST[outcropIndex]!
  return {
    kind: 'landmark',
    name,
    x: outcrop.x,
    y: CAMP_FOOT_Y + outcrop.height,
    z: outcrop.z,
    size: outcrop.radius * 2,
    weight,
    viewDistance: [12, 36],
  }
}

export const CAMPFIRE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '篷車圈',
    x: CAMP_CENTER.x,
    y: LOW_VIEW_Y,
    z: CAMP_CENTER.z,
    size: WAGON_CIRCLE_RADIUS * 2 + 4,
    weight: 0.95,
    viewDistance: [14, 40],
  },
  {
    kind: 'light',
    name: '煮飯的小火',
    x: COOK_FIRE_POINT.x,
    y: LOW_VIEW_Y,
    z: COOK_FIRE_POINT.z,
    size: 4,
    weight: 0.7,
    viewDistance: [6, 20],
  },
  {
    kind: 'structure',
    name: '蓋到一半的木屋',
    x: HOMESTEAD_POINT.x,
    y: CAMP_FOOT_Y + 3,
    z: HOMESTEAD_POINT.z,
    size: 12,
    weight: 0.85,
    viewDistance: [12, 34],
  },
  {
    kind: 'structure',
    name: '風車抽水機',
    x: WINDMILL_POINT.x,
    y: CAMP_FOOT_Y + 5,
    z: WINDMILL_POINT.z,
    size: 12,
    weight: 0.9,
    viewDistance: [12, 36],
  },
  {
    kind: 'structure',
    name: '車轍路',
    x: CAMP_CENTER.x - 12,
    y: LOW_VIEW_Y,
    z: CAMP_CENTER.z + 1,
    size: 70,
    weight: 0.5,
    viewDistance: [10, 36],
    pathList: WAGON_TRAIL_POINT_LIST.map((point) => ({ x: point.x, y: LOW_VIEW_Y, z: point.z })),
  },
  {
    kind: 'light',
    name: '守夜人的小火',
    x: OUTRIDER_CAMP_LIST[0]!.x,
    y: LOW_VIEW_Y,
    z: OUTRIDER_CAMP_LIST[0]!.z,
    size: 4,
    weight: 0.5,
    viewDistance: [8, 26],
  },
  createOutcropFeature(0, '西北岩丘', 0.7),
  createOutcropFeature(2, '北方高岩丘', 0.75),
  {
    kind: 'landmark',
    name: '小丘上的墳',
    x: GRAVE_POINT.x,
    y: CAMP_FOOT_Y + 2,
    z: GRAVE_POINT.z,
    size: 5,
    weight: 0.5,
    viewDistance: [8, 24],
  },
  {
    kind: 'vista',
    name: '西方紅岩台地',
    x: CAMP_CENTER.x - PRAIRIE_RADIUS - 70,
    y: 24,
    z: CAMP_CENTER.z + 11,
    size: 80,
    weight: 0.8,
    viewDistance: [30, 90],
  },
  {
    kind: 'vista',
    name: '北方紅岩台地',
    x: CAMP_CENTER.x + 10,
    y: 24,
    z: CAMP_CENTER.z - PRAIRIE_RADIUS - 70,
    size: 80,
    weight: 0.6,
    viewDistance: [30, 90],
  },
  /** 細節小景那一輪補的幾處（見 campfire-detail-features） */
  ...CAMPFIRE_DETAIL_DRIFT_FEATURE_LIST,
  /** 招牌景象：晴朗夜裡西南低空的彗星（見 campfire-comet） */
  createSkyDriftFeature({ name: '西南低空的彗星', anchor: CAMPFIRE_COMET_ANCHOR, center: CAMP_CENTER, groundY: CAMP_FOOT_Y, weight: 0.45 }),
]
