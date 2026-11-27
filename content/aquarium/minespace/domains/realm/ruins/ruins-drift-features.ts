import type { DriftFeature } from '../realm-definition'
import { SITE_LIST } from './ruins-colossi-shape'
import {
  ARCH_Z,
  CHAMBER_RECT,
  CHAMBER_SEEP_POINT,
  COLONNADE_COLUMN_Z_FROM,
  COLONNADE_RECT,
  HALL_RECT,
  HALL_STELE_POINT,
  RUINS_CENTER,
  RUINS_FOOT_Y,
  RUINS_GROUND_Y,
  RUINS_PORTAL_POINT,
  RUINS_RIM_HEIGHT,
  STELE_RING_RADIUS,
} from './ruins-layout'

/**
 * 石殿遺址的神遊特色主體
 *
 * 殿內的座標從版面常數算；遠處的巨像取自遠景的 SITE_LIST（方位、距離、縮放與方盒），
 * 它們在世界之外，所以標成 vista。高度是目測的視覺中心，已用地形檢查腳本驗證不埋在方塊裡
 */

/** 視線高度：殿基腳底（11）上方兩格，約是人眼的高度 */
const EYE_Y = RUINS_FOOT_Y + 2

/** 巨像的腳底高度，與 ruins-colossi 的 FOOT_Y 一致（坡頂高度） */
const COLOSSUS_FOOT_Y = RUINS_GROUND_Y + RUINS_RIM_HEIGHT + 0.5

/** 世界高度只有四十格，再高的巨像視線也只能對到這裡 */
const COLOSSUS_LOOK_Y_MAX = 36

/** 取遠景的第幾處巨像，轉成遠景特色（座標由方位與距離算出，視線落在像身一半高） */
function createColossusFeature(siteIndex: number, name: string, weight: number): DriftFeature {
  const site = SITE_LIST[siteIndex]!
  const radian = (site.degree / 180) * Math.PI
  const top = Math.max(...site.boxList.map((item) => item.to[1])) * site.scale
  return {
    kind: 'vista',
    name,
    x: Math.round(RUINS_CENTER.x + Math.cos(radian) * site.distance),
    y: Math.min(COLOSSUS_LOOK_Y_MAX, Math.round(COLOSSUS_FOOT_Y + top * 0.5)),
    z: Math.round(RUINS_CENTER.z + Math.sin(radian) * site.distance),
    size: Math.round(top),
    weight,
    viewDistance: [70, 190],
  }
}

const colonnadeZFrom = COLONNADE_RECT.maxZ - 2
const colonnadeZTo = COLONNADE_RECT.minZ + 2
const hallCenterZ = (HALL_RECT.minZ + HALL_RECT.maxZ) / 2
const chamberCenterZ = (CHAMBER_RECT.minZ + CHAMBER_RECT.maxZ) / 2

export const RUINS_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '石柱長廊',
    x: RUINS_CENTER.x,
    y: EYE_Y,
    z: Math.round((colonnadeZFrom + colonnadeZTo) / 2),
    size: 40,
    weight: 0.95,
    viewDistance: [10, 36],
    viewpointList: [{ x: RUINS_PORTAL_POINT.x, z: RUINS_PORTAL_POINT.z - 8 }],
    pathList: [
      { x: RUINS_CENTER.x, y: EYE_Y, z: colonnadeZFrom },
      { x: RUINS_CENTER.x, y: EYE_Y, z: COLONNADE_COLUMN_Z_FROM + 16 },
      { x: RUINS_CENTER.x, y: EYE_Y, z: COLONNADE_COLUMN_Z_FROM },
      { x: RUINS_CENTER.x, y: EYE_Y, z: colonnadeZTo },
    ],
  },
  {
    kind: 'gate',
    name: '塌半的拱門',
    x: RUINS_CENTER.x,
    y: RUINS_FOOT_Y + 5,
    z: ARCH_Z,
    size: 9,
    weight: 0.8,
    viewDistance: [10, 30],
  },
  {
    kind: 'landmark',
    name: '斷柱圈與石碑',
    x: HALL_STELE_POINT.x,
    y: RUINS_FOOT_Y + 2,
    z: HALL_STELE_POINT.z,
    size: STELE_RING_RADIUS * 2 + 2,
    weight: 0.85,
    viewDistance: [8, 26],
  },
  {
    kind: 'structure',
    name: '無頂大殿',
    x: RUINS_CENTER.x,
    y: RUINS_FOOT_Y + 4,
    z: Math.round(hallCenterZ),
    size: 44,
    weight: 0.7,
    viewDistance: [20, 50],
  },
  {
    kind: 'structure',
    name: '北端石室',
    x: RUINS_CENTER.x,
    y: RUINS_FOOT_Y + 4,
    z: Math.round(chamberCenterZ),
    size: 16,
    weight: 0.55,
    viewDistance: [10, 30],
  },
  {
    kind: 'water',
    name: '石室滲水',
    x: CHAMBER_SEEP_POINT.x,
    y: RUINS_FOOT_Y,
    z: CHAMBER_SEEP_POINT.z,
    size: 3,
    weight: 0.4,
    viewDistance: [5, 14],
  },
  createColossusFeature(0, '北方坐像巨像', 0.95),
  createColossusFeature(1, '守衛之門', 0.8),
  createColossusFeature(2, '倒臥的巨首', 0.7),
  createColossusFeature(5, '遠方階梯塔', 0.5),
]
