import type { DriftFeature } from '../realm-definition'
import { MEADOW_STONE_CIRCLE } from './meadow-layout'

/**
 * 風露原細節小景的神遊特色主體
 *
 * 石環那一塊地面在 8 到 9 之間（地形檢查腳本量的），視線取圈心平石上方一格。
 * 石牆與野餐草蓆不另外登記：牆沿著東邊的丘腳走，草蓆就在牆的背風處，石環的鏡頭會帶到。
 * 純資料，不引用造景程式
 */
export const MEADOW_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'landmark',
    name: '月見石環',
    x: MEADOW_STONE_CIRCLE.x,
    y: 11,
    z: MEADOW_STONE_CIRCLE.z,
    size: MEADOW_STONE_CIRCLE.radius * 2 + 1,
    weight: 0.75,
    viewDistance: [8, 22],
  },
]
