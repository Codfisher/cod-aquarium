import type { DriftFeature } from '../realm-definition'
import { PLANK_BRIDGE, RAINVALE_GROUND_Y, TEA_SEAT_POINT } from './rainvale-layout'

/**
 * 聽雨林細節小景的神遊特色主體
 *
 * 茶席與木板橋都在林地那一層。雨鏈與晾著的傘不另外登記：它們掛在亭子上，四座亭子本來就各有一筆。
 * 純資料，不引用造景程式
 */
export const RAINVALE_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '野點傘的茶席',
    x: TEA_SEAT_POINT.x,
    /** 傘柄的上半截，傘面在再上一格 */
    y: RAINVALE_GROUND_Y + 2,
    z: TEA_SEAT_POINT.z,
    size: 5,
    weight: 0.7,
    viewDistance: [6, 16],
  },
  {
    kind: 'structure',
    name: '水窪上的木板橋',
    x: Math.round((PLANK_BRIDGE.minX + PLANK_BRIDGE.maxX) / 2),
    y: RAINVALE_GROUND_Y + 2,
    z: PLANK_BRIDGE.z,
    size: PLANK_BRIDGE.maxX - PLANK_BRIDGE.minX + 1,
    weight: 0.6,
    viewDistance: [6, 16],
  },
]
