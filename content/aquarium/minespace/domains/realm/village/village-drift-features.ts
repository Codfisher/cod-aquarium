import type { DriftFeature } from '../realm-definition'
import {
  BELL_TOWER_POINT,
  COVERED_GATE_POINT,
  FIELD_Y,
  INN_POINT,
  SHRINE_POINT,
  STREAM_Z,
  VILLAGE_CENTER,
  VILLAGE_HAYSTACK_POINT,
  VILLAGE_PORTAL_POINT,
  WATCH_TOWER_POINT,
  WATERMILL_POINT,
} from './village-layout'

/**
 * 市聲村的神遊特色主體
 *
 * 座標都從版面常數算出來（相對村子中心的偏移加上中心）；
 * 高度是台地腳底（10）往上量到那棟建物視覺中心的目測值，已用地形檢查腳本驗證不埋在方塊裡
 */

/** 把相對村子中心的偏移換成世界座標 */
function atVillage(point: { offsetX: number; offsetZ: number }): { x: number; z: number } {
  return { x: VILLAGE_CENTER.x + point.offsetX, z: VILLAGE_CENTER.z + point.offsetZ }
}

const bellTower = atVillage(BELL_TOWER_POINT)
const shrine = atVillage(SHRINE_POINT)
const watermill = atVillage(WATERMILL_POINT)
const watchTower = atVillage(WATCH_TOWER_POINT)
const coveredGate = atVillage(COVERED_GATE_POINT)
const inn = atVillage(INN_POINT)

/** 水道水面那一層（水面比方塊頂面矮八分之一格，鏡頭貼著水面上方一點） */
const STREAM_VIEW_Y = 10
const streamZ = VILLAGE_CENTER.z + STREAM_Z

/** 市街的視線高度：台地腳底（10）上方，攤子的簷之下 */
const STREET_VIEW_Y = 12

export const VILLAGE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '鐘樓',
    x: bellTower.x,
    y: 16,
    z: bellTower.z,
    size: 12,
    weight: 1,
    viewDistance: [14, 40],
    viewpointList: [
      { x: VILLAGE_CENTER.x - 6, z: VILLAGE_CENTER.z + 2 },
    ],
  },
  {
    kind: 'structure',
    name: '神社',
    x: shrine.x,
    y: 13,
    z: shrine.z,
    size: 10,
    weight: 0.85,
    viewDistance: [12, 32],
  },
  {
    kind: 'structure',
    name: '水車小屋',
    x: watermill.x,
    y: 12,
    z: watermill.z,
    size: 9,
    weight: 0.85,
    viewDistance: [10, 30],
  },
  {
    kind: 'water',
    name: '村南水道',
    x: VILLAGE_CENTER.x + 17,
    y: STREAM_VIEW_Y,
    z: streamZ,
    size: 26,
    weight: 0.6,
    viewDistance: [8, 26],
    pathList: [
      { x: VILLAGE_CENTER.x + 5, y: STREAM_VIEW_Y, z: streamZ },
      { x: VILLAGE_CENTER.x + 14, y: STREAM_VIEW_Y, z: streamZ },
      { x: VILLAGE_CENTER.x + 24, y: STREAM_VIEW_Y, z: streamZ },
      { x: VILLAGE_CENTER.x + 30, y: STREAM_VIEW_Y, z: streamZ },
    ],
  },
  {
    kind: 'structure',
    name: '市街攤集',
    x: VILLAGE_CENTER.x - 20,
    y: STREET_VIEW_Y,
    z: VILLAGE_CENTER.z,
    size: 28,
    weight: 0.6,
    viewDistance: [8, 30],
    viewpointList: [{ x: VILLAGE_PORTAL_POINT.x + 6, z: VILLAGE_PORTAL_POINT.z }],
    pathList: [
      { x: VILLAGE_PORTAL_POINT.x + 6, y: STREET_VIEW_Y, z: VILLAGE_CENTER.z },
      { x: VILLAGE_CENTER.x - 20, y: STREET_VIEW_Y, z: VILLAGE_CENTER.z },
      { x: VILLAGE_CENTER.x - 10, y: STREET_VIEW_Y, z: VILLAGE_CENTER.z },
    ],
  },
  {
    kind: 'structure',
    name: '望樓',
    x: watchTower.x,
    y: 20,
    z: watchTower.z,
    size: 14,
    weight: 0.7,
    viewDistance: [14, 36],
  },
  {
    kind: 'gate',
    name: '市街東端屋根門',
    x: coveredGate.x,
    y: 13,
    z: coveredGate.z,
    size: 8,
    weight: 0.5,
    viewDistance: [8, 24],
  },
  {
    kind: 'structure',
    name: '旅籠',
    x: inn.x,
    y: 14,
    z: inn.z,
    size: 12,
    weight: 0.5,
    viewDistance: [12, 30],
  },
  {
    kind: 'structure',
    name: '村西草垛場與稻草人',
    x: VILLAGE_HAYSTACK_POINT.x,
    y: FIELD_Y + 2,
    z: VILLAGE_HAYSTACK_POINT.z,
    size: 8,
    weight: 0.55,
    viewDistance: [6, 16],
  },
  {
    kind: 'vista',
    name: '北方綠丘',
    x: VILLAGE_CENTER.x,
    y: 22,
    z: VILLAGE_CENTER.z - 130,
    size: 80,
    weight: 0.6,
    viewDistance: [20, 60],
  },
  {
    kind: 'vista',
    name: '東南綠丘',
    x: VILLAGE_CENTER.x + 95,
    y: 22,
    z: VILLAGE_CENTER.z + 95,
    size: 80,
    weight: 0.45,
    viewDistance: [20, 60],
  },
  /** 招牌景象：晴朗夜裡從廣場升起的天燈（見 village-sky-lanterns），被風帶往東北 */
  {
    kind: 'light',
    name: '廣場上空的天燈',
    x: VILLAGE_CENTER.x + 8,
    y: 30,
    z: VILLAGE_CENTER.z - 5,
    size: 30,
    weight: 0.5,
    viewDistance: [25, 60],
  },
]
