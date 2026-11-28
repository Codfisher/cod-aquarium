import type { DriftFeature } from '../realm-definition'
import { CAIRN_FIELD, FOOT_BATH_RECT, JIGOKU_FOOT_Y } from './jigoku-layout'

/**
 * 湯煙谷細節小景的神遊特色主體
 *
 * 足湯與賽之河原都在谷底那一層（腳底 JIGOKU_FOOT_Y）。
 * 溫泉蛋的小攤不另外登記：它就在鳥居前面，「鳥居」那一筆的鏡頭會帶到那把紅傘。
 * 純資料，不引用造景程式
 */
export const JIGOKU_DETAIL_DRIFT_FEATURE_LIST: DriftFeature[] = [
  {
    kind: 'structure',
    name: '有頂的足湯',
    x: Math.round((FOOT_BATH_RECT.minX + FOOT_BATH_RECT.maxX) / 2),
    /** 池緣與木頂之間那一格 */
    y: JIGOKU_FOOT_Y + 1,
    z: Math.round((FOOT_BATH_RECT.minZ + FOOT_BATH_RECT.maxZ) / 2),
    size: 7,
    weight: 0.6,
    viewDistance: [7, 18],
  },
  {
    kind: 'landmark',
    name: '賽之河原的積石',
    x: CAIRN_FIELD.x,
    /** 石地藏的笠 */
    y: JIGOKU_FOOT_Y + 2,
    z: CAIRN_FIELD.z,
    size: CAIRN_FIELD.radius * 2,
    weight: 0.65,
    viewDistance: [8, 22],
  },
]
