import type { DriftFeature } from '../realm-definition'
import {
  CAVE_GROUND_Y,
  CAVE_PORTAL_POINT,
  GLOW_CLUSTER_LIST,
  GROTTO_CENTER,
  HALL_CENTER,
  HALL_RADIUS_X,
  PILLAR_LIST,
  TUNNEL_POINT_LIST,
  UNDERGROUND_LAKE_CENTER,
  UNDERGROUND_LAKE_RADIUS,
} from './cave-layout'

/** 通道淨高三格、地面最多起伏一格：路徑點取洞底上兩格，一定是空氣 */
const TUNNEL_WALK_Y = CAVE_GROUND_Y + 1

/** 大廳那條燈籠路的幾個點（見 cave-terrain 的 placeLanternList：從通道口一路彎向西南的湖） */
const HALL_LANTERN_PATH_OFFSET_LIST = [
  { x: 36, z: 5 },
  { x: 26, z: 2 },
  { x: 15, z: 4 },
  { x: 5, z: 1 },
  { x: -4, z: 5 },
] as const

/**
 * 地底洞窟的神遊特色主體
 *
 * 整個世界是實心的岩，能看的全在洞裡：西側的地底湖與頭頂的螢光是招牌，
 * 大廳裡頂天的石柱與沿路的燈籠把空間切開，前室到大廳的低矮通道是進洞的第一段，
 * 大廳盡頭用 vista 讓鏡頭越過湖面看向洞的深處
 */
export const CAVE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'water',
    name: '地底湖',
    x: UNDERGROUND_LAKE_CENTER.x,
    y: CAVE_GROUND_Y,
    z: UNDERGROUND_LAKE_CENTER.z,
    size: UNDERGROUND_LAKE_RADIUS * 2,
    weight: 1,
    viewDistance: [12, 30],
  },
  {
    kind: 'light',
    name: '湖上螢光穹頂',
    x: HALL_CENTER.x + GLOW_CLUSTER_LIST[0].offsetX,
    y: CAVE_GROUND_Y + 14,
    z: HALL_CENTER.z + GLOW_CLUSTER_LIST[0].offsetZ,
    size: GLOW_CLUSTER_LIST[0].radius * 2,
    weight: 0.9,
    viewDistance: [14, 34],
  },
  {
    kind: 'light',
    name: '大廳中央螢光',
    x: HALL_CENTER.x + GLOW_CLUSTER_LIST[1].offsetX,
    y: CAVE_GROUND_Y + 14,
    z: HALL_CENTER.z + GLOW_CLUSTER_LIST[1].offsetZ,
    size: GLOW_CLUSTER_LIST[1].radius * 2,
    weight: 0.6,
    viewDistance: [14, 32],
  },
  {
    kind: 'landmark',
    // 石柱本體整根埋在實心裡，視線對準貼著它的那一格空氣（柱心往東半徑加一格）
    name: '頂天石柱',
    x: HALL_CENTER.x + PILLAR_LIST[0].offsetX + Math.ceil(PILLAR_LIST[0].radius) + 1,
    y: CAVE_GROUND_Y + 10,
    z: HALL_CENTER.z + PILLAR_LIST[0].offsetZ,
    size: 20,
    weight: 0.75,
    viewDistance: [10, 28],
  },
  {
    kind: 'landmark',
    name: '湖畔石柱',
    x: HALL_CENTER.x + PILLAR_LIST[3].offsetX + Math.ceil(PILLAR_LIST[3].radius) + 1,
    y: CAVE_GROUND_Y + 10,
    z: HALL_CENTER.z + PILLAR_LIST[3].offsetZ,
    size: 20,
    weight: 0.65,
    viewDistance: [10, 28],
  },
  {
    kind: 'light',
    name: '大廳燈籠路',
    x: HALL_CENTER.x + 15,
    y: CAVE_GROUND_Y + 2,
    z: HALL_CENTER.z + 4,
    size: 30,
    weight: 0.5,
    viewDistance: [8, 24],
    pathList: HALL_LANTERN_PATH_OFFSET_LIST.map((offset) => ({
      x: HALL_CENTER.x + offset.x,
      y: CAVE_GROUND_Y + 2,
      z: HALL_CENTER.z + offset.z,
    })),
  },
  {
    kind: 'structure',
    name: '低矮通道',
    x: TUNNEL_POINT_LIST[1].x,
    y: TUNNEL_WALK_Y,
    z: TUNNEL_POINT_LIST[1].z,
    size: 10,
    weight: 0.45,
    viewDistance: [5, 14],
    pathList: TUNNEL_POINT_LIST.map((point) => ({ x: point.x, y: TUNNEL_WALK_Y, z: point.z })),
  },
  {
    kind: 'gate',
    name: '前室回程門',
    x: CAVE_PORTAL_POINT.x,
    y: CAVE_GROUND_Y + 2,
    z: CAVE_PORTAL_POINT.z,
    size: 6,
    weight: 0.3,
    viewDistance: [6, 14],
    viewpointList: [{ x: GROTTO_CENTER.x - 3, z: GROTTO_CENTER.z }],
  },
  {
    kind: 'vista',
    name: '湖對岸的洞深處',
    x: HALL_CENTER.x - HALL_RADIUS_X + 8,
    y: CAVE_GROUND_Y + 6,
    z: HALL_CENTER.z + 2,
    size: 40,
    weight: 0.7,
    viewDistance: [20, 45],
  },
]
