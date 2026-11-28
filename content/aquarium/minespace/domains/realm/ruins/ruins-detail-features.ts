import type { DriftFeature } from '../realm-definition'
import { CISTERN_RECT, RUINS_FOOT_Y, RUINS_GROUND_Y, TOPPLED_STATUE_POINT } from './ruins-layout'

/**
 * 石殿遺址細節小景的神遊特色主體
 *
 * 蓄水池在殿外荒地那一層（水面在 RUINS_GROUND_Y），石像在殿基上。
 * 馬賽克拼花不另外登記：它圍著石碑，「大殿石碑」那一筆的鏡頭本來就對著那裡。
 * 純資料，不引用造景程式
 */
export const RUINS_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'water',
    name: '殿東的蓄水池',
    x: Math.round((CISTERN_RECT.minX + CISTERN_RECT.maxX) / 2),
    y: RUINS_GROUND_Y + 2,
    z: Math.round((CISTERN_RECT.minZ + CISTERN_RECT.maxZ) / 2),
    size: CISTERN_RECT.maxX - CISTERN_RECT.minX + 1,
    weight: 0.7,
    viewDistance: [8, 22],
  },
  {
    kind: 'landmark',
    name: '石室門前倒下的石像',
    x: TOPPLED_STATUE_POINT.x + 1,
    y: RUINS_FOOT_Y + 1,
    z: TOPPLED_STATUE_POINT.z,
    size: 6,
    weight: 0.5,
    viewDistance: [5, 14],
  },
]
