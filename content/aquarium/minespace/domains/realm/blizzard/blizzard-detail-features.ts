import type { DriftFeature } from '../realm-definition'
import { BLIZZARD_GROUND_Y, BURIED_SLED_POINT, FROZEN_POND, SHELTER_HUT_POINT } from './blizzard-layout'

/**
 * 白矇雪原細節小景的神遊特色主體
 *
 * 小屋與雪橇的位置是地形生完之後量的（版面常數就寫成實際蓋下去的那一格），三處都在雪地那一層。
 * 疊石路標與雪埋的柵欄不另外登記：路標一路排到小屋，走過去的鏡頭會帶到。
 * 純資料，不引用造景程式
 */
export const BLIZZARD_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'light',
    name: '避難小屋的燈',
    x: SHELTER_HUT_POINT.x,
    /** 屋裡站著的眼睛高度，燈在東邊一格的木箱上 */
    y: BLIZZARD_GROUND_Y + 2,
    z: SHELTER_HUT_POINT.z,
    size: 7,
    weight: 0.8,
    viewDistance: [7, 20],
  },
  {
    kind: 'landmark',
    name: '結冰的池',
    x: FROZEN_POND.x,
    y: BLIZZARD_GROUND_Y + 2,
    z: FROZEN_POND.z,
    size: FROZEN_POND.radius * 2,
    weight: 0.6,
    viewDistance: [8, 24],
  },
  {
    kind: 'landmark',
    name: '半埋的雪橇',
    x: BURIED_SLED_POINT.x,
    y: BLIZZARD_GROUND_Y + 2,
    z: BURIED_SLED_POINT.z,
    size: 4,
    weight: 0.45,
    viewDistance: [5, 14],
  },
]
