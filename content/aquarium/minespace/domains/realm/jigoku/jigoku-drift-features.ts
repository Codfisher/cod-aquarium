import type { DriftFeature, RealmDriftViewpoint } from '../realm-definition'
import { createSkyDriftFeature } from '../realm-signature-direction'
import { JIGOKU_DETAIL_DRIFT_FEATURE_LIST } from './jigoku-detail-features'
import {
  BASALT_STACK_LIST,
  CAUSEWAY_END_Z,
  CAUSEWAY_START_Z,
  CAUSEWAY_Y,
  EAST_LOOKOUT,
  FAR_CONE,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  LAKE_ISLAND,
  LAKE_Y,
  LAVA_RIVER_LIST,
  LAVA_TORII,
  MAIN_FALL,
  OVERLOOK_EDGE_Z,
  SHRINE_PLATFORM,
  STAIR_LENGTH,
  WEST_LOOKOUT,
} from './jigoku-layout'

/**
 * 湯煙谷的神遊特色主體
 *
 * 座標全從版面常數算。高度：熔岩面在 3.4，參道的石板頂面 4.5（人站在上面眼睛約 6），
 * 台地頂面 13.5（眼睛約 15）；熔岩上方的點取湖面上兩格，飛過湖面時鏡頭離熔岩只有幾格。
 * 已用地形檢查腳本驗證不埋在方塊裡、站點都從出生點走得到
 */

/** 熔岩面上方的視線高度 */
const LAVA_VIEW_Y = LAKE_Y + 2

/** 站在參道與祠台上的視線高度 */
const CAUSEWAY_VIEW_Y = CAUSEWAY_Y + 3

/** 站在台地上的視線高度 */
const TERRACE_VIEW_Y = JIGOKU_FOOT_Y + 2

/** 幾個站點：到著台的崖邊、祠台北緣（碑前）、東西兩座展望台的前緣 */
const OVERLOOK_VIEWPOINT = { x: JIGOKU_CENTER.x, z: OVERLOOK_EDGE_Z + 1 }
const SHRINE_VIEWPOINT = { x: SHRINE_PLATFORM.x, z: SHRINE_PLATFORM.z - SHRINE_PLATFORM.halfSize + 4 }
const WEST_VIEWPOINT = { x: WEST_LOOKOUT.x, z: WEST_LOOKOUT.z - WEST_LOOKOUT.northReach + 2 }
const EAST_VIEWPOINT = { x: EAST_LOOKOUT.x, z: EAST_LOOKOUT.z - EAST_LOOKOUT.northReach + 2 }

const mainRiver = LAVA_RIVER_LIST[0]!
const eastStack = BASALT_STACK_LIST[1]!
const bigSpring = HOT_POOL_LIST[2]!

/** 遠火山的方位上、世界邊緣外一點的靶：世界只有四十格高，靶立在稜線的高度，鏡頭朝那個方位平平望出去 */
const FAR_CONE_TARGET_DISTANCE = 150

export const JIGOKU_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'light',
    name: '熔岩湖',
    x: JIGOKU_CENTER.x,
    y: LAVA_VIEW_Y,
    z: JIGOKU_CENTER.z - 34,
    size: 110,
    weight: 1,
    viewDistance: [20, 70],
    viewpointList: [OVERLOOK_VIEWPOINT, SHRINE_VIEWPOINT],
    /** 一道橫過湖面的弧，視線沿著它掃過整片熔岩 */
    pathList: [
      { x: 98, y: LAVA_VIEW_Y, z: 134 },
      { x: 118, y: LAVA_VIEW_Y, z: 112 },
      { x: JIGOKU_CENTER.x, y: LAVA_VIEW_Y, z: 106 },
      { x: 162, y: LAVA_VIEW_Y, z: 118 },
      { x: 186, y: LAVA_VIEW_Y, z: 130 },
    ],
  },
  {
    kind: 'waterfall',
    name: '熔岩瀑',
    x: MAIN_FALL.x,
    y: Math.round((LAKE_Y + MAIN_FALL.topY) / 2),
    z: MAIN_FALL.z + 3,
    size: MAIN_FALL.topY - LAKE_Y,
    weight: 1,
    viewDistance: [24, 80],
    viewpointList: [SHRINE_VIEWPOINT, OVERLOOK_VIEWPOINT],
  },
  {
    kind: 'waterfall',
    name: '西瀑',
    x: 65,
    y: LAKE_Y + 9,
    z: 91,
    size: 20,
    weight: 0.75,
    viewDistance: [14, 50],
    viewpointList: [WEST_VIEWPOINT],
  },
  {
    kind: 'light',
    name: '黑岩原上的熔岩河',
    x: mainRiver[2]!.x,
    y: LAVA_VIEW_Y,
    z: mainRiver[2]!.z,
    size: 50,
    weight: 0.8,
    viewDistance: [12, 40],
    viewpointList: [WEST_VIEWPOINT],
    pathList: mainRiver.map((point) => ({ x: point.x, y: LAVA_VIEW_Y, z: point.z })),
  },
  {
    kind: 'landmark',
    name: '湖心島的玄武岩柱',
    x: LAKE_ISLAND.x,
    /** 島頂那株枯木的樹幹 */
    y: LAKE_Y + LAKE_ISLAND.height + 2,
    z: LAKE_ISLAND.z,
    size: LAKE_ISLAND.radius * 2,
    weight: 0.85,
    viewDistance: [16, 50],
    viewpointList: [SHRINE_VIEWPOINT],
  },
  {
    kind: 'gate',
    name: '熔岩裡的大鳥居',
    x: LAVA_TORII.x,
    y: LAKE_Y + LAVA_TORII.height - 1,
    z: LAVA_TORII.z,
    size: LAVA_TORII.halfWidth * 2 + 3,
    weight: 0.95,
    viewDistance: [8, 30],
    viewpointList: [{ x: SHRINE_PLATFORM.x, z: SHRINE_PLATFORM.z + 2 }],
  },
  {
    kind: 'structure',
    name: '石階、參道與祠台',
    x: JIGOKU_CENTER.x,
    y: CAUSEWAY_VIEW_Y,
    z: Math.round((CAUSEWAY_START_Z + CAUSEWAY_END_Z) / 2),
    size: 44,
    weight: 0.7,
    viewDistance: [10, 40],
    /** 從崖邊一路走到祠台：石階上的點跟著踏面往下降 */
    pathList: [
      { x: JIGOKU_CENTER.x, y: TERRACE_VIEW_Y, z: OVERLOOK_EDGE_Z + 2 },
      { x: JIGOKU_CENTER.x, y: TERRACE_VIEW_Y - STAIR_LENGTH / 4, z: OVERLOOK_EDGE_Z - STAIR_LENGTH / 2 },
      { x: JIGOKU_CENTER.x, y: CAUSEWAY_VIEW_Y, z: CAUSEWAY_START_Z },
      { x: JIGOKU_CENTER.x, y: CAUSEWAY_VIEW_Y, z: CAUSEWAY_END_Z },
      { x: SHRINE_PLATFORM.x, y: CAUSEWAY_VIEW_Y, z: SHRINE_PLATFORM.z + 1 },
    ],
  },
  {
    kind: 'landmark',
    name: '東北灣的玄武岩柱群',
    x: eastStack.x,
    y: LAKE_Y + eastStack.height + 2,
    z: eastStack.z,
    size: 34,
    weight: 0.7,
    viewDistance: [14, 50],
    viewpointList: [EAST_VIEWPOINT],
  },
  {
    kind: 'vista',
    name: '稜線外的遠火山',
    x: Math.round(JIGOKU_CENTER.x + Math.sin(FAR_CONE.azimuth) * FAR_CONE_TARGET_DISTANCE),
    y: 36,
    z: Math.round(JIGOKU_CENTER.z - Math.cos(FAR_CONE.azimuth) * FAR_CONE_TARGET_DISTANCE),
    size: 100,
    weight: 0.9,
    viewDistance: [50, 220],
    viewpointList: [EAST_VIEWPOINT, OVERLOOK_VIEWPOINT],
  },
  {
    kind: 'gate',
    name: '進谷的鳥居',
    x: JIGOKU_PORTAL_POINT.x,
    y: JIGOKU_FOOT_Y + 3,
    z: JIGOKU_PORTAL_POINT.z - 9,
    size: 8,
    weight: 0.5,
    viewDistance: [8, 26],
    viewpointList: [{ x: JIGOKU_PORTAL_POINT.x, z: JIGOKU_PORTAL_POINT.z - 4 }],
  },
  {
    kind: 'water',
    name: '台地西邊的大熱泉',
    x: bigSpring.x,
    y: JIGOKU_FOOT_Y,
    z: bigSpring.z,
    size: bigSpring.radius * 2,
    weight: 0.55,
    viewDistance: [8, 24],
  },
  /** 細節小景：足湯與賽之河原（見 jigoku-detail-features） */
  ...JIGOKU_DETAIL_DRIFT_FEATURE_LIST,
  /** 招牌景象：北邊稜線上的火映與火山雷（見 jigoku-sky-glow），與遠火山同一個方位 */
  createSkyDriftFeature({ name: '北邊稜線上的火映', anchor: { azimuth: FAR_CONE.azimuth, elevation: 0.2 }, center: JIGOKU_CENTER, groundY: JIGOKU_FOOT_Y, weight: 0.4 }),
]

/**
 * 神遊額外的觀景點：鏡頭站在這幾處，面向各自最好看的那一樣
 *
 * 到著台看湖心島與熔岩瀑那條軸線、祠台看熔岩瀑、西展望台看西瀑與熔岩河、東展望台看玄武岩柱群
 */
export const JIGOKU_DRIFT_VIEWPOINT_LIST: RealmDriftViewpoint[] = [
  { ...OVERLOOK_VIEWPOINT, lookX: LAKE_ISLAND.x, lookZ: LAKE_ISLAND.z },
  { ...SHRINE_VIEWPOINT, lookX: MAIN_FALL.x, lookZ: MAIN_FALL.z },
  { ...WEST_VIEWPOINT, lookX: 70, lookZ: 94 },
  { ...EAST_VIEWPOINT, lookX: eastStack.x, lookZ: eastStack.z },
]
