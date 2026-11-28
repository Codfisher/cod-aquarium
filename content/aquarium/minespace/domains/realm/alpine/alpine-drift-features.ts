import type { DriftFeature } from '../realm-definition'
import {
  ALPINE_CENTER,
  ALPINE_ICE_ARCH_HEIGHT,
  ALPINE_ICE_ARCH_POINT,
  ALPINE_ICE_HOLE_POINT,
  ALPINE_POND_LIST,
  ALPINE_PORTAL_POINT,
  CLIFF_RADIUS,
  CLOUD_SEA_Y,
  CREST_Y,
  PEAK_START_ALONG,
  PEAK_TOP_Y,
  PORTAL_TERRACE_Y,
  SNOWFIELD_Y,
  toRidgeWorldPoint,
} from './alpine-layout'

/** 兩頭岩峰的峰頂：稜線座標往外再走五格（見 alpine-terrain 的 measureRibHeight，峰頂約 37～39，視線對準峰頂上方一格） */
const SOUTHEAST_PEAK = toRidgeWorldPoint(PEAK_START_ALONG + 5, 0)
const NORTHWEST_PEAK = toRidgeWorldPoint(-PEAK_START_ALONG - 5, 0)

/** 稜線中段：人走得上去的那一段最高處附近 */
const RIDGE_MIDDLE = toRidgeWorldPoint(0, 0)

/** 雲海 vista 放在斷崖外多遠（離中心的格數） */
const CLOUD_VISTA_DISTANCE = CLIFF_RADIUS + 40

/** 雪原邊緣的觀景站位離中心多遠（格）：神遊範圍的外圈，站在這裡正對著斷崖外的雲海 */
const RIM_VIEWPOINT_RADIUS = 38

/** 面向某個方向的雲海，雪原邊緣的兩個觀景站位（左右各錯開一些，構圖不會總是正對） */
function createRimViewpointList(directionX: number, directionZ: number): { x: number; z: number }[] {
  return [-10, 10].map((shift) => ({
    x: Math.round(ALPINE_CENTER.x + directionX * RIM_VIEWPOINT_RADIUS + directionZ * shift),
    z: Math.round(ALPINE_CENTER.z + directionZ * RIM_VIEWPOINT_RADIUS + directionX * shift),
  }))
}

/**
 * 雪稜的神遊特色主體
 *
 * 稜線與兩頭的岩峰是骨架，山腳兩窪冰封的融雪池映著天；
 * 雪原外緣是斷崖，崖下一整片雲海與遠處積雪的山稜，用 vista 讓鏡頭從雪原邊緣越過斷崖看出去；
 * 視線偏好是往外看（realm 的 driftLookBias: 'outward'），峰頂與稜線只是路過的配角，權重壓低
 */
export const ALPINE_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'landmark',
    name: '東南岩峰',
    x: SOUTHEAST_PEAK.x,
    y: PEAK_TOP_Y - 1,
    z: SOUTHEAST_PEAK.z,
    size: 22,
    weight: 0.12,
    viewDistance: [18, 42],
  },
  {
    kind: 'landmark',
    name: '西北岩峰',
    x: NORTHWEST_PEAK.x,
    y: PEAK_TOP_Y - 1,
    z: NORTHWEST_PEAK.z,
    size: 22,
    weight: 0.1,
    viewDistance: [18, 42],
  },
  {
    kind: 'landmark',
    name: '稜線鞍部',
    x: RIDGE_MIDDLE.x,
    y: CREST_Y,
    z: RIDGE_MIDDLE.z,
    size: 20,
    weight: 0.08,
    viewDistance: [12, 30],
  },
  {
    kind: 'water',
    name: '西南融雪池',
    x: ALPINE_POND_LIST[0].x,
    y: SNOWFIELD_Y,
    z: ALPINE_POND_LIST[0].z,
    size: ALPINE_POND_LIST[0].radius * 2,
    weight: 0.6,
    viewDistance: [8, 22],
  },
  {
    kind: 'water',
    name: '東北融雪池',
    x: ALPINE_POND_LIST[1].x,
    y: SNOWFIELD_Y,
    z: ALPINE_POND_LIST[1].z,
    size: ALPINE_POND_LIST[1].radius * 2,
    weight: 0.5,
    viewDistance: [8, 20],
  },
  {
    kind: 'landmark',
    name: '冰柱岩門',
    x: ALPINE_ICE_ARCH_POINT.x + 1,
    y: SNOWFIELD_Y + ALPINE_ICE_ARCH_HEIGHT,
    z: ALPINE_ICE_ARCH_POINT.z,
    size: 6,
    weight: 0.6,
    viewDistance: [6, 16],
  },
  {
    kind: 'structure',
    name: '冰上的釣洞',
    x: ALPINE_ICE_HOLE_POINT.x,
    y: SNOWFIELD_Y + 1,
    z: ALPINE_ICE_HOLE_POINT.z,
    size: 4,
    weight: 0.4,
    viewDistance: [5, 13],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: ALPINE_PORTAL_POINT.x,
    y: PORTAL_TERRACE_Y + 2,
    z: ALPINE_PORTAL_POINT.z,
    size: 6,
    weight: 0.35,
    viewDistance: [8, 18],
  },
  {
    kind: 'vista',
    name: '雲海（西）',
    x: ALPINE_CENTER.x - CLOUD_VISTA_DISTANCE,
    y: CLOUD_SEA_Y + 8,
    z: ALPINE_CENTER.z + 10,
    size: 80,
    weight: 1,
    viewDistance: [30, 80],
    viewpointList: createRimViewpointList(-1, 0),
  },
  {
    kind: 'vista',
    name: '雲海（東）',
    x: ALPINE_CENTER.x + CLOUD_VISTA_DISTANCE,
    y: CLOUD_SEA_Y + 8,
    z: ALPINE_CENTER.z - 10,
    size: 80,
    weight: 1,
    viewDistance: [30, 80],
    viewpointList: createRimViewpointList(1, 0),
  },
  {
    kind: 'vista',
    name: '雲海（北）',
    x: ALPINE_CENTER.x + 10,
    y: CLOUD_SEA_Y + 8,
    z: ALPINE_CENTER.z - CLOUD_VISTA_DISTANCE,
    size: 80,
    weight: 1,
    viewDistance: [30, 80],
    viewpointList: createRimViewpointList(0, -1),
  },
  {
    kind: 'vista',
    name: '雲海（南）',
    x: ALPINE_CENTER.x - 10,
    y: CLOUD_SEA_Y + 8,
    z: ALPINE_CENTER.z + CLOUD_VISTA_DISTANCE,
    size: 80,
    weight: 1,
    viewDistance: [30, 80],
    viewpointList: createRimViewpointList(0, 1),
  },
]
