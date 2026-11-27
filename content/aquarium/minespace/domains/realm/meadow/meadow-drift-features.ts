import type { DriftFeature } from '../realm-definition'
import {
  MEADOW_CENTER,
  MEADOW_CREST_RADIUS,
  MEADOW_GROUND_Y,
  MEADOW_HOLLOW_LIST,
  MEADOW_PATH_CONTROL_POINT_LIST,
  MEADOW_PORTAL_POINT,
  MEADOW_ZONE_LIST,
} from './meadow-layout'

/**
 * 風露原的神遊特色主體
 *
 * 花帶與窪地從版面常數算。丘頂的孤樹是地形 worker 依丘頂噪音挑出來的，
 * 版面沒有常數（findHilltopList 不輸出），座標是用地形檢查腳本掃橡木幹掃出來的，視線高度取樹冠下緣的樹幹（樹冠的葉子是實心方塊，不能瞄在裡面）；
 * 改了丘的噪音或孤樹的種子要重掃。
 * 高度：花帶取地面往上兩格（草與花的上方），已用地形檢查腳本驗證不埋在方塊裡
 */

/** 取某一種花帶，找不到就丟錯（版面改名時在載入就發現，不要默默少一個特色） */
function findZone(kind: (typeof MEADOW_ZONE_LIST)[number]['kind']): (typeof MEADOW_ZONE_LIST)[number] {
  const zone = MEADOW_ZONE_LIST.find((item) => item.kind === kind)
  if (!zone) {
    throw new Error(`風露原找不到花帶 ${kind}`)
  }
  return zone
}

const moonZone = findZone('moon')
const goldenZone = findZone('golden')
const violetZone = findZone('violet')
const emberZone = findZone('ember')
const firstHollow = MEADOW_HOLLOW_LIST[0]!

export const MEADOW_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'tree',
    name: '丘心孤樹',
    x: 139,
    y: 18,
    z: 133,
    size: 8,
    weight: 1,
    viewDistance: [10, 32],
  },
  {
    kind: 'tree',
    name: '東南丘頂孤樹',
    x: 163,
    y: 18,
    z: 163,
    size: 8,
    weight: 0.8,
    viewDistance: [10, 32],
  },
  {
    kind: 'tree',
    name: '西南丘頂孤樹',
    x: 109,
    y: 19,
    z: 163,
    size: 8,
    weight: 0.75,
    viewDistance: [10, 32],
  },
  {
    kind: 'tree',
    name: '西北丘頂孤樹',
    x: 85,
    y: 16,
    z: 115,
    size: 8,
    weight: 0.55,
    viewDistance: [10, 32],
  },
  {
    kind: 'landmark',
    name: '月見草原',
    x: moonZone.x,
    y: MEADOW_GROUND_Y + 5,
    z: moonZone.z,
    size: 22,
    weight: 0.8,
    viewDistance: [10, 34],
  },
  {
    kind: 'landmark',
    name: '金芒原',
    x: goldenZone.x,
    y: MEADOW_GROUND_Y + 8,
    z: goldenZone.z,
    size: 22,
    weight: 0.6,
    viewDistance: [10, 34],
  },
  {
    kind: 'landmark',
    name: '堇色坡',
    x: violetZone.x,
    y: MEADOW_GROUND_Y + 4,
    z: violetZone.z,
    size: 20,
    weight: 0.55,
    viewDistance: [10, 34],
  },
  {
    kind: 'landmark',
    name: '火燒坡',
    x: emberZone.x,
    y: MEADOW_GROUND_Y + 2,
    z: emberZone.z,
    size: 20,
    weight: 0.5,
    viewDistance: [10, 34],
  },
  {
    kind: 'landmark',
    name: '乾土窪地',
    x: firstHollow.x,
    y: MEADOW_GROUND_Y + 2,
    z: firstHollow.z,
    size: firstHollow.radius * 2,
    weight: 0.4,
    viewDistance: [8, 24],
  },
  {
    kind: 'structure',
    name: '草間小徑',
    x: MEADOW_CENTER.x - 14,
    y: MEADOW_GROUND_Y + 5,
    z: MEADOW_CENTER.z + 6,
    size: 30,
    weight: 0.4,
    viewDistance: [8, 24],
    viewpointList: [{ x: MEADOW_PORTAL_POINT.x + 6, z: MEADOW_PORTAL_POINT.z }],
    pathList: MEADOW_PATH_CONTROL_POINT_LIST.map((point) => ({ x: point.x, y: MEADOW_GROUND_Y + 5, z: point.z })),
  },
  {
    kind: 'vista',
    name: '東方遠丘',
    x: MEADOW_CENTER.x + MEADOW_CREST_RADIUS + 50,
    y: 24,
    z: MEADOW_CENTER.z,
    size: 90,
    weight: 0.7,
    viewDistance: [30, 90],
  },
  {
    kind: 'vista',
    name: '北方遠丘',
    x: MEADOW_CENTER.x,
    y: 24,
    z: MEADOW_CENTER.z - MEADOW_CREST_RADIUS - 50,
    size: 90,
    weight: 0.6,
    viewDistance: [30, 90],
  },
]
