import type { DriftFeature } from '../realm-definition'
import { CAMP_FOOT_Y, PROSPECTOR_CAMP_POINT, WATER_TOWER_POINT } from './campfire-layout'

/**
 * 拓荒原細節小景的神遊特色主體
 *
 * 水塔與淘金人的營地都蓋在原野那一層（腳底 CAMP_FOOT_Y）。
 * 電報線桿、被丟下的行李不另外登記：它們沿著車轍路排，「車轍路」那一筆的鏡頭會帶到。
 * 純資料，不引用造景程式
 */
export const CAMPFIRE_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '水塔',
    /** 水櫃東側那一排木桶：正中那一顆六面都被包住，神遊的檢查會當成埋在方塊裡 */
    x: WATER_TOWER_POINT.x + 1,
    /** 水櫃的腰：木腿四格、平台一格，再往上一格 */
    y: CAMP_FOOT_Y + 5,
    z: WATER_TOWER_POINT.z,
    size: 6,
    weight: 0.7,
    viewDistance: [10, 28],
  },
  {
    kind: 'structure',
    name: '淘金人的營地',
    x: PROSPECTOR_CAMP_POINT.x,
    y: CAMP_FOOT_Y + 1,
    z: PROSPECTOR_CAMP_POINT.z - 1,
    size: 8,
    weight: 0.55,
    viewDistance: [7, 18],
  },
]
