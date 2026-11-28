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

/**
 * 各場景的飛行設定
 *
 * 高度跟著「看得到什麼」走，不是越高越好（使用者實測：聽雨森林飛到樹冠上，幾乎沒有東西可以看）：
 * - 霧濃的場景（聽雨森林、濕地、吹雪野）只低飛：在樹冠下、水面上離地幾格滑過去，不升空
 * - 樹冠密的場景（林海、蟬鳴林、鳥鳴林）一半低飛、一半貼著樹梢飛（離樹梢三到六格，以前是五到十二格）
 * - 四周有谷壁的場景（溪谷、地獄谷、石廊跡、拓荒原）高度壓在谷壁頂之下，看的是谷裡的東西
 * - 四面開闊的場景（麥田、風露原、海岸、湖、雪稜、楓林、村落）才高高地滑翔
 * 另外所有場景都再受霧的遠近限制（見 getDriftFlight）
 */
const DRIFT_FLIGHT_MAP: Partial<Record<RealmId, RealmDriftFlight>> = {
  /** 地底洞頂只有二三十格，鏡頭一升就貼頂；改成只低飛（沿著走得通的洞道，離地高一些、快一些） */
  cave: { isEnabled: true, clearanceMin: 0, clearanceMax: 0, glideChance: 1, glideLiftRange: [1.2, 3] },
  /** 樹冠上方貼著樹梢；一半的時候改在林下低飛，看樹幹、溪與林間的光 */
  forest: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, routeMode: 'free', glideChance: 0.5 },
  cicada: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, routeMode: 'free', glideChance: 0.5 },
  songbird: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, routeMode: 'free', glideChance: 0.5 },
  /** 雨霧只看得到五六十格，樹冠上是一片白：只在林下低飛 */
  rainvale: { isEnabled: true, clearanceMin: 2, clearanceMax: 4, glideChance: 1 },
  /** 水霧低、枯樹稀：貼著水面與木棧低飛 */
  swamp: { isEnabled: true, clearanceMin: 2, clearanceMax: 4, glideChance: 1 },
  /** 風雪裡只看得到三四十格：貼地低飛 */
  blizzard: { isEnabled: true, clearanceMin: 2, clearanceMax: 3.5, glideChance: 1, glideLiftRange: [1.2, 3] },
  /** 山脊上方，腳下是雲海；離最高岩稜多留一些 */
  alpine: { isEnabled: true, clearanceMin: 6, clearanceMax: 14, routeMode: 'free' },
  /** 沿谷底走，高度壓在峽谷邊緣（RIM_MIN_Y = 29）之下 */
  river: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, altitudeMax: 27, routeMode: 'ground', glideChance: 0.4 },
  /** 谷壁高出谷底十四格（VALLEY_WALL_HEIGHT）：飛在蒸氣與泉池上方幾格，不越過谷壁；一半低飛 */
  jigoku: { isEnabled: true, clearanceMin: 3, clearanceMax: 6, routeMode: 'free', glideChance: 0.5 },
  /** 亂石坡頂高出荒地九格（RUINS_RIM_HEIGHT）、岩壁高八格（ROCK_WALL_HEIGHT）：離柱頂與帳頂近一些 */
  ruins: { isEnabled: true, clearanceMin: 3, clearanceMax: 7, routeMode: 'free', glideChance: 0.3 },
  campfire: { isEnabled: true, clearanceMin: 3, clearanceMax: 7, routeMode: 'free', glideChance: 0.3 },
  /** 水面與沙洲上方，離最高的東西近一些才有貼著水面飛的感覺 */
  lake: { isEnabled: true, clearanceMin: 4, clearanceMax: 9, routeMode: 'free', glideChance: 0.2 },
  coast: { isEnabled: true, clearanceMin: 4, clearanceMax: 9, routeMode: 'free', glideChance: 0.2 },
}

/** 晴天的霧終點（格），場景沒寫固定值時用它 */
const DEFAULT_FOG_END = 220
/**
 * 巡航時離最高障礙的距離，最多是霧終點的幾成
 *
 * 鏡頭略微俯視（八到十六度），離腳下的東西 h 格高時，畫面中央落在約 h ÷ sin(俯角) 格外；
 * 那個距離要在霧還沒把東西吃掉之前，所以 h 與霧的遠近成正比。零點零八：霧終點兩百二十格是十七格（不影響開闊的場景），
 * 六十格是四點八格
 */
const FOG_CLEARANCE_RATIO = 0.08
const FOG_CLEARANCE_FLOOR = 2

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

/** 這座場景霧的終點（格）：場景寫了固定值就用它，否則是晴天的基準 */
export function getRealmFogEnd(realm: RealmDefinition): number {
  const end = realm.atmosphere.fog?.end
  return end && 'value' in end ? end.value : DEFAULT_FOG_END
}

/**
 * 這座場景的飛行設定
 *
 * 場景定義上的 driftFlight 優先，其次是上面的表，都沒有就用預設；
 * 最後一律再受霧的限制：離障礙的距離不超過霧終點的 FOG_CLEARANCE_RATIO（霧越濃飛得越低）
 */
export function getDriftFlight(realm: RealmDefinition): RealmDriftFlight {
  const flight = realm.driftFlight ?? DRIFT_FLIGHT_MAP[realm.id] ?? DEFAULT_DRIFT_FLIGHT
  const clearanceCap = Math.max(FOG_CLEARANCE_FLOOR, getRealmFogEnd(realm) * FOG_CLEARANCE_RATIO)
  if (flight.clearanceMax <= clearanceCap)
    return flight

  return {
    ...flight,
    clearanceMax: clearanceCap,
    clearanceMin: Math.min(flight.clearanceMin, clearanceCap * 0.6),
  }
}
