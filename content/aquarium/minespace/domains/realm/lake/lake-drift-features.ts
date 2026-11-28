import type { DriftFeature } from '../realm-definition'
import {
  BOARDWALK,
  ISLAND_GROUND_Y,
  ISLAND_POND_RADIUS,
  ISLAND_RADIUS,
  LAKE_BOAT_POINT,
  LAKE_CENTER,
  LAKE_PORTAL_POINT,
  LAKE_ROCK_ISLET_POINT,
  LAKE_WATER_Y,
} from './lake-layout'

/** 木棧每一步往東一格、往北一格（見 lake-terrain 的 buildBoardwalk） */
const BOARDWALK_START = {
  x: LAKE_CENTER.x + BOARDWALK.startOffsetX,
  z: LAKE_CENTER.z + BOARDWALK.startOffsetZ,
}
const BOARDWALK_LAST_STEP = BOARDWALK.stepCount - 1
/** 木棧盡頭那根頂著紙燈的柱子 */
const BOARDWALK_END = {
  x: BOARDWALK_START.x + BOARDWALK_LAST_STEP,
  z: BOARDWALK_START.z - BOARDWALK_LAST_STEP,
}

/** 站在甲板上看的高度：甲板上一格，盡頭紙燈也在這一層（最後一步是燈柱，路徑不走到） */
const DECK_WALK_Y = BOARDWALK.deckY + 1

/**
 * 湖中島的神遊特色主體
 *
 * 島中池、池裡的半磚木棧與盡頭的紙燈是核心；島上的盆景松、青苔立石與石燈籠是點綴，
 * 湖面往外是遠山，用 vista 讓鏡頭越過水面看出去
 */
export const LAKE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'water',
    name: '島中池',
    x: LAKE_CENTER.x,
    y: ISLAND_GROUND_Y,
    z: LAKE_CENTER.z,
    size: ISLAND_POND_RADIUS * 2,
    weight: 0.95,
    viewDistance: [12, 30],
  },
  {
    kind: 'structure',
    name: '池中木棧',
    x: (BOARDWALK_START.x + BOARDWALK_END.x) / 2,
    y: DECK_WALK_Y,
    z: (BOARDWALK_START.z + BOARDWALK_END.z) / 2,
    size: 14,
    weight: 0.8,
    viewDistance: [8, 22],
    pathList: Array.from({ length: BOARDWALK_LAST_STEP }, (_, step) => ({
      x: BOARDWALK_START.x + step,
      y: DECK_WALK_Y,
      z: BOARDWALK_START.z - step,
    })),
  },
  {
    kind: 'light',
    name: '木棧盡頭的紙燈',
    x: BOARDWALK_END.x,
    y: DECK_WALK_Y,
    z: BOARDWALK_END.z,
    size: 4,
    weight: 0.6,
    viewDistance: [6, 16],
  },
  {
    kind: 'tree',
    name: '池畔盆景松',
    x: LAKE_CENTER.x - 13,
    y: ISLAND_GROUND_Y + 3,
    z: LAKE_CENTER.z + 9,
    size: 6,
    weight: 0.5,
    viewDistance: [6, 16],
  },
  {
    kind: 'landmark',
    name: '青苔立石',
    x: LAKE_CENTER.x - 13,
    y: ISLAND_GROUND_Y + 2,
    z: LAKE_CENTER.z - 3,
    size: 4,
    weight: 0.4,
    viewDistance: [6, 14],
  },
  {
    kind: 'light',
    name: '島北石燈籠',
    x: LAKE_CENTER.x + 8,
    y: ISLAND_GROUND_Y + 2,
    z: LAKE_CENTER.z - 12,
    size: 3,
    weight: 0.3,
    viewDistance: [5, 12],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: LAKE_PORTAL_POINT.x,
    y: ISLAND_GROUND_Y + 2,
    z: LAKE_PORTAL_POINT.z,
    size: 6,
    weight: 0.3,
    viewDistance: [8, 18],
  },
  {
    kind: 'water',
    name: '環島淺灘',
    x: LAKE_CENTER.x + ISLAND_RADIUS + 5,
    y: LAKE_WATER_Y + 1,
    z: LAKE_CENTER.z,
    size: 16,
    weight: 0.4,
    viewDistance: [10, 24],
  },
  {
    kind: 'structure',
    name: '東岸短棧與小舟',
    x: LAKE_BOAT_POINT.x,
    y: LAKE_WATER_Y + 2,
    z: LAKE_BOAT_POINT.z,
    size: 8,
    weight: 0.6,
    viewDistance: [7, 18],
  },
  {
    kind: 'landmark',
    name: '淺灘三石',
    x: LAKE_ROCK_ISLET_POINT.x,
    y: LAKE_WATER_Y + 2,
    z: LAKE_ROCK_ISLET_POINT.z,
    size: 4,
    weight: 0.5,
    viewDistance: [6, 16],
  },
  {
    kind: 'vista',
    name: '湖面遠山（東）',
    x: LAKE_CENTER.x + 110,
    y: LAKE_WATER_Y + 12,
    z: LAKE_CENTER.z - 10,
    size: 60,
    weight: 0.85,
    viewDistance: [20, 45],
  },
  {
    kind: 'vista',
    name: '湖面遠山（西）',
    x: LAKE_CENTER.x - 110,
    y: LAKE_WATER_Y + 12,
    z: LAKE_CENTER.z + 10,
    size: 60,
    weight: 0.85,
    viewDistance: [20, 45],
  },
]
