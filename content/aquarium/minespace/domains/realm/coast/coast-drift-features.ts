import type { DriftFeature } from '../realm-definition'
import {
  COAST_CENTER,
  COAST_PORTAL_POINT,
  DUNE_GROUND_Y,
  measureCoastShoreDistance,
  REEF_WIDTH,
  SAND_ISLAND_RADIUS,
  SEA_TORII_POINT,
  SEA_WATER_Y,
  TIDAL_FLAT_WIDTH,
} from './coast-layout'

/**
 * 從島心往某個方位走，灘中間那一格
 *
 * 與 coast-terrain 的 findTidalFlatPoint 同一套算法（那邊沒有匯出），擱淺的小舟就躺在這裡
 */
function findTidalFlatPoint(degree: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  const target = SAND_ISLAND_RADIUS - TIDAL_FLAT_WIDTH / 2
  for (let step = 0; step < SAND_ISLAND_RADIUS * 2; step += 0.5) {
    const x = Math.round(COAST_CENTER.x + Math.cos(radian) * step)
    const z = Math.round(COAST_CENTER.z + Math.sin(radian) * step)
    if (measureCoastShoreDistance(x, z) >= target)
      return { x, z }
  }
  return { x: COAST_CENTER.x, z: COAST_CENTER.z }
}

const BOAT_POINT = findTidalFlatPoint(8)

/**
 * 海中沙島的神遊特色主體
 *
 * 海中的鳥居是整座場景的招牌；島上有被海風壓扁的相思樹、擱淺的小舟與石燈籠，
 * 島外一圈珊瑚淺海，再往外是看不到邊的海與遠方的小島（vista）
 */
export const COAST_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'landmark',
    name: '海中鳥居',
    x: SEA_TORII_POINT.x,
    y: SEA_WATER_Y + 3,
    z: SEA_TORII_POINT.z,
    size: 8,
    weight: 1,
    viewDistance: [10, 26],
  },
  {
    kind: 'tree',
    name: '沙丘相思樹',
    x: COAST_CENTER.x + 7,
    y: DUNE_GROUND_Y + 5,
    z: COAST_CENTER.z - 6,
    size: 8,
    weight: 0.6,
    viewDistance: [8, 20],
  },
  {
    kind: 'tree',
    name: '東丘相思樹',
    x: COAST_CENTER.x + 11,
    y: DUNE_GROUND_Y + 4,
    z: COAST_CENTER.z + 3,
    size: 7,
    weight: 0.5,
    viewDistance: [8, 18],
  },
  {
    kind: 'structure',
    name: '擱淺的小舟',
    x: BOAT_POINT.x,
    y: SEA_WATER_Y + 2,
    z: BOAT_POINT.z,
    size: 5,
    weight: 0.55,
    viewDistance: [6, 16],
  },
  {
    kind: 'light',
    name: '相思樹下的石燈籠',
    x: COAST_CENTER.x - 6,
    y: DUNE_GROUND_Y + 2,
    z: COAST_CENTER.z - 6,
    size: 3,
    weight: 0.35,
    viewDistance: [5, 12],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: COAST_PORTAL_POINT.x,
    y: DUNE_GROUND_Y + 2,
    z: COAST_PORTAL_POINT.z,
    size: 6,
    weight: 0.3,
    viewDistance: [8, 18],
  },
  {
    kind: 'water',
    name: '珊瑚淺海',
    x: COAST_CENTER.x,
    y: SEA_WATER_Y + 1,
    z: SEA_TORII_POINT.z + REEF_WIDTH / 2,
    size: REEF_WIDTH * 2,
    weight: 0.7,
    viewDistance: [10, 28],
  },
  {
    kind: 'vista',
    name: '外海遠島（東）',
    x: COAST_CENTER.x + 110,
    y: SEA_WATER_Y + 10,
    z: COAST_CENTER.z - 10,
    size: 60,
    weight: 0.85,
    viewDistance: [20, 45],
  },
  {
    kind: 'vista',
    name: '外海遠島（西）',
    x: COAST_CENTER.x - 110,
    y: SEA_WATER_Y + 10,
    z: COAST_CENTER.z + 10,
    size: 60,
    weight: 0.85,
    viewDistance: [20, 45],
  },
]
