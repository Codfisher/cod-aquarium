import type { DriftFeature } from '../realm-definition'
import { CICADA_GROUND_Y, OLD_WELL_POINT, WOOD_SHRINE_POINT } from './cicada-layout'

/**
 * 蟬雨深林細節小景的神遊特色主體
 *
 * 小祠與古井各在一塊陽光空地的正中，那兩塊地是平的（林地那一層）。
 * 緣廊上的擺設不另外登記：兩道緣廊本來就各有一筆。純資料，不引用造景程式
 */
export const CICADA_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '林間小祠',
    x: WOOD_SHRINE_POINT.x,
    /** 祠身那一格 */
    y: CICADA_GROUND_Y + 2,
    z: WOOD_SHRINE_POINT.z,
    size: 6,
    weight: 0.6,
    viewDistance: [5, 14],
  },
  {
    kind: 'structure',
    name: '林間古井',
    x: OLD_WELL_POINT.x,
    /** 井欄與木頂之間、垂著鐵鏈的那一格 */
    y: CICADA_GROUND_Y + 3,
    z: OLD_WELL_POINT.z,
    size: 5,
    weight: 0.6,
    viewDistance: [5, 14],
  },
]
