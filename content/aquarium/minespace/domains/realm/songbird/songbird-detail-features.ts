import type { DriftFeature } from '../realm-definition'
import { BIRD_HIDE_POINT, SONGBIRD_CENTER, SONGBIRD_GROUND_Y, STEPPING_PATH_LIST } from './songbird-layout'

/**
 * 百囀林苑細節小景的神遊特色主體
 *
 * 觀鳥小屋的位置是地形生完之後量的（BIRD_HIDE_POINT 就寫成實際蓋下去的那一格）；
 * 飛石小徑的路徑取主線的骨架，高度在草地上方三格，高過花、低過樹冠。
 * 純資料，不引用造景程式
 */

/** 沿著飛石走的視線高度 */
const PATH_VIEW_Y = SONGBIRD_GROUND_Y + 3

export const SONGBIRD_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '觀鳥小屋',
    x: BIRD_HIDE_POINT.x,
    y: SONGBIRD_GROUND_Y + 3,
    z: BIRD_HIDE_POINT.z,
    size: 8,
    weight: 0.65,
    viewDistance: [8, 20],
  },
  {
    kind: 'structure',
    name: '飛石小徑',
    x: SONGBIRD_CENTER.x + 10,
    y: PATH_VIEW_Y,
    z: SONGBIRD_CENTER.z - 3,
    size: 40,
    weight: 0.5,
    viewDistance: [8, 24],
    pathList: STEPPING_PATH_LIST[0].map((point) => ({ x: point.x, y: PATH_VIEW_Y, z: point.z })),
  },
]
