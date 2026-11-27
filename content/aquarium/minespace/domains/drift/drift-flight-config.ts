import type { RealmDefinition, RealmDriftFlight, RealmId } from '../realm/realm-definition'

/**
 * 神遊的無人機設定
 *
 * 場景定義上的 driftFlight 優先；沒給的場景查這張表；表裡也沒有就用預設。
 * 各場景的建議值集中寫在這裡，原因是場景資料夾同時有人在改，
 * 一座場景一個欄位散在十八個檔案裡，調高度時要開十八個檔案
 */

/** 預設：離最高障礙四到十格，四面開闊的場景都夠用 */
export const DEFAULT_DRIFT_FLIGHT: RealmDriftFlight = {
  isEnabled: true,
  clearanceMin: 4,
  clearanceMax: 10,
  routeMode: 'free',
}

const DRIFT_FLIGHT_MAP: Partial<Record<RealmId, RealmDriftFlight>> = {
  /** 地底洞頂只有二三十格，鏡頭一升就貼頂，只散步 */
  cave: { isEnabled: false, clearanceMin: 0, clearanceMax: 0 },
  /** 樹冠上方，離最高的樹梢五到十二格；樹海視野開闊，升高才看得出一片海 */
  forest: { isEnabled: true, clearanceMin: 5, clearanceMax: 12, routeMode: 'free' },
  cicada: { isEnabled: true, clearanceMin: 5, clearanceMax: 12, routeMode: 'free' },
  songbird: { isEnabled: true, clearanceMin: 5, clearanceMax: 11, routeMode: 'free' },
  /** 貼地低飛：風雪裡視野本來就短，升太高只剩一片白 */
  blizzard: { isEnabled: true, clearanceMin: 2.5, clearanceMax: 5, routeMode: 'free' },
  /** 山脊上方，腳下是雲海；離最高岩稜多留一些 */
  alpine: { isEnabled: true, clearanceMin: 6, clearanceMax: 14, routeMode: 'free' },
  /** 沿谷底走，高度壓在峽谷邊緣（RIM_MIN_Y = 29）之下 */
  river: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, altitudeMax: 27, routeMode: 'ground' },
  /** 水面與沙洲上方，離最高的東西近一些才有貼著水面飛的感覺 */
  lake: { isEnabled: true, clearanceMin: 4, clearanceMax: 9, routeMode: 'free' },
  coast: { isEnabled: true, clearanceMin: 4, clearanceMax: 9, routeMode: 'free' },
}

/**
 * 神遊的活動範圍（圓）
 *
 * 大場景用邊界的減速線；沒有邊界的場景（地底）回傳 null，由格子退回世界邊緣內縮。
 * 大廳不支援神遊，不在這裡
 */
export function getDriftRegion(realm: RealmDefinition): { x: number; z: number; radius: number } | null {
  if (realm.boundary)
    return { x: realm.boundary.centerX, z: realm.boundary.centerZ, radius: realm.boundary.slowRadius }
  return null
}

/** 這座場景的飛行設定 */
export function getDriftFlight(realm: RealmDefinition): RealmDriftFlight {
  return realm.driftFlight ?? DRIFT_FLIGHT_MAP[realm.id] ?? DEFAULT_DRIFT_FLIGHT
}
