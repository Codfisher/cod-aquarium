import type { DriftFeature } from '../realm-definition'
import {
  WHEATFIELD_CART_POINT,
  WHEATFIELD_HAYSTACK_POINT,
  WHEATFIELD_POND_RECT,
  WHEATFIELD_SHRINE_POINT,
} from './wheatfield-layout'

/**
 * 千頃麥浪細節小景的神遊特色主體
 *
 * 位置從版面常數算，高度是用地形檢查腳本量的（那幾處的地面在 9 到 11 之間）；
 * 改了田塊的切法或起伏要重量。純資料，不引用造景程式
 */
export const WHEATFIELD_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'water',
    name: '蓄水池與水門',
    x: Math.round((WHEATFIELD_POND_RECT.minX + WHEATFIELD_POND_RECT.maxX) / 2),
    y: 11,
    z: Math.round((WHEATFIELD_POND_RECT.minZ + WHEATFIELD_POND_RECT.maxZ) / 2),
    size: 8,
    weight: 0.6,
    viewDistance: [7, 20],
  },
  {
    kind: 'structure',
    name: '收割田的草垛與板車',
    x: Math.round((WHEATFIELD_HAYSTACK_POINT.x + WHEATFIELD_CART_POINT.x + 2) / 2),
    y: 13,
    z: Math.round((WHEATFIELD_HAYSTACK_POINT.z + WHEATFIELD_CART_POINT.z) / 2),
    size: 10,
    weight: 0.6,
    viewDistance: [8, 22],
  },
  {
    kind: 'structure',
    name: '田頭小祠',
    x: WHEATFIELD_SHRINE_POINT.x,
    y: 13,
    z: WHEATFIELD_SHRINE_POINT.z,
    size: 4,
    weight: 0.5,
    viewDistance: [5, 14],
  },
]
