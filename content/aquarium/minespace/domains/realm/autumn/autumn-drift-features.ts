import type { DriftFeature } from '../realm-definition'
import {
  AUTUMN_CENTER,
  AUTUMN_PORTAL_POINT,
  GROVE_GROUND_Y,
  GROVE_RADIUS,
  GROVE_RIM_WIDTH,
  measureGroveDistance,
  SAND_CLEARING_LIST,
} from './autumn-layout'

/**
 * 金葉林的神遊特色主體
 *
 * 耙沙、長凳、石燈籠由 autumn-layout 的常數推算；鳥居的位置照 autumn-terrain 的
 * findToriiPoint 同一套算法（林地西緣、五格寬柱腳都落在草地上的最外一排）。
 * 白楊是亂數種的，座標是照生成結果掃出來的（改了種子或數量要重掃）
 */

/** 地面那一層上面一格，也就是人與擺設的腳底高度 */
const STAND_Y = GROVE_GROUND_Y + 1

/** 照 autumn-terrain 的 findToriiPoint：往西走到五格柱腳都還是草地的最後一排 */
function findToriiPoint(): { x: number; z: number } {
  const groundRadius = GROVE_RADIUS - GROVE_RIM_WIDTH
  const { z } = AUTUMN_CENTER
  let { x } = AUTUMN_CENTER
  const isGroundRow = (rowX: number) => [-2, -1, 0, 1, 2].every((offset) => measureGroveDistance(rowX, z + offset) < groundRadius - 1)
  while (x > 0 && isGroundRow(x - 1))
    x -= 1
  return { x, z }
}

const TORII_POINT = findToriiPoint()
const LARGE_CLEARING = SAND_CLEARING_LIST[0]
const SMALL_CLEARING = SAND_CLEARING_LIST[1]
const LARGE_SAND = { x: AUTUMN_CENTER.x + LARGE_CLEARING.offsetX, z: AUTUMN_CENTER.z + LARGE_CLEARING.offsetZ }
const SMALL_SAND = { x: AUTUMN_CENTER.x + SMALL_CLEARING.offsetX, z: AUTUMN_CENTER.z + SMALL_CLEARING.offsetZ }

export const AUTUMN_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'gate',
    name: '林地西緣鳥居',
    x: TORII_POINT.x,
    y: STAND_Y + 3,
    z: TORII_POINT.z,
    size: 8,
    weight: 1,
    viewDistance: [10, 28],
  },
  {
    kind: 'structure',
    name: '大片耙沙與長凳',
    x: LARGE_SAND.x,
    y: STAND_Y + 0.5,
    z: LARGE_SAND.z,
    size: LARGE_CLEARING.radius * 2,
    weight: 0.9,
    viewDistance: [8, 24],
  },
  {
    kind: 'structure',
    name: '西北小耙沙',
    x: SMALL_SAND.x,
    y: STAND_Y + 0.5,
    z: SMALL_SAND.z,
    size: SMALL_CLEARING.radius * 2,
    weight: 0.7,
    viewDistance: [7, 20],
  },
  {
    kind: 'light',
    name: '耙沙旁的紙燈',
    x: LARGE_SAND.x - Math.round(LARGE_CLEARING.radius + 1),
    y: STAND_Y + 1.5,
    z: LARGE_SAND.z + 3,
    size: 3,
    weight: 0.4,
    viewDistance: [6, 16],
  },
  {
    kind: 'light',
    name: '林間石燈籠',
    x: AUTUMN_CENTER.x - 8,
    y: STAND_Y + 1.5,
    z: AUTUMN_CENTER.z + 12,
    size: 3,
    weight: 0.5,
    viewDistance: [6, 18],
  },
  {
    kind: 'gate',
    name: '回程門',
    x: AUTUMN_PORTAL_POINT.x,
    y: STAND_Y + 2,
    z: AUTUMN_PORTAL_POINT.z,
    size: 6,
    weight: 0.5,
    viewDistance: [8, 22],
  },
  {
    kind: 'tree',
    name: '金黃白楊',
    x: 155,
    y: STAND_Y + 10,
    z: 137,
    size: 10,
    weight: 0.7,
    viewDistance: [10, 26],
  },
  {
    kind: 'tree',
    name: '琥珀白楊',
    x: 136,
    y: STAND_Y + 10,
    z: 126,
    size: 10,
    weight: 0.6,
    viewDistance: [10, 26],
  },
  {
    kind: 'vista',
    name: '西邊秋色遠丘',
    x: AUTUMN_CENTER.x - 85,
    y: STAND_Y + 8,
    z: AUTUMN_CENTER.z + 10,
    size: 80,
    weight: 0.6,
    viewDistance: [30, 70],
  },
  {
    kind: 'vista',
    name: '北邊秋色遠丘',
    x: AUTUMN_CENTER.x + 10,
    y: STAND_Y + 8,
    z: AUTUMN_CENTER.z - 85,
    size: 80,
    weight: 0.5,
    viewDistance: [30, 70],
  },
]
