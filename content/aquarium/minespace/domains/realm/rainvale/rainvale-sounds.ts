import type { SoundEmitterDefinition } from '../../soundscape/type'
import { PAVILION_LIST, POND_LIST, RAINVALE_CENTER, THICKET_START_RADIUS } from './rainvale-layout'

/** 林子中心加上偏移的座標 */
function atGrove(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: RAINVALE_CENTER.x + offsetX, z: RAINVALE_CENTER.z + offsetZ }
}

/**
 * 樹冠上的雨要鋪滿整片林子
 *
 * 聽雨亭是中心一顆、四格外一圈六顆，每顆管十八格；林子大了，改成每十四格一顆的網格，
 * 只取林子裡（密林那一圈也鋪，雨打的是那一整面樹冠）。前後左右都有雨，方向感才出得來
 */
const CANOPY_GRID_SPACING = 14

function createCanopyPositionList(): { x: number; z: number }[] {
  const positionList: { x: number; z: number }[] = []
  const reach = THICKET_START_RADIUS + 6
  for (let offsetX = -reach; offsetX <= reach; offsetX += CANOPY_GRID_SPACING) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ += CANOPY_GRID_SPACING) {
      /** 隔一排錯開半格，網格才不會在斜向留出一條一條的空隙 */
      const shiftX = (Math.round((offsetZ + reach) / CANOPY_GRID_SPACING) % 2) * (CANOPY_GRID_SPACING / 2)
      const x = offsetX + shiftX
      if (Math.hypot(x, offsetZ) > reach)
        continue
      positionList.push(atGrove(x, offsetZ))
    }
  }
  return positionList
}

/**
 * 聽雨林的音源
 *
 * 聽雨亭的用意是「雨聲的質地由它打在什麼上面決定」：葉子是柔的、木頭是脆的、水面是悶的。
 * 箱庭只有一種雨聲（雨打樹葉），三種東西擠在十一格裡分不出來；
 * 這裡林子大了，三種表面各自放在它在的地方：
 * - 樹冠：雨打樹葉，鋪滿整片林子，從頭頂落下來
 * - 亭頂：每座亭子一顆，只有躲進亭子、或站在亭邊才聽得到那片木頂上的雨
 * - 水面：每窪積水一顆，貼著水面、音量壓低，走到水邊才浮出來
 * 木頂與水面用的是同一段「隔著東西聽」的雨（雨聽堂的屋瓦雨，高頻低十分貝），
 * 與頭頂那片又亮又碎的葉子雨分得開。另外照聽雨亭：遠雷（等閃電來叫）與雨中的蟾蜍
 */
export const RAINVALE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...createCanopyPositionList().map((position, index): SoundEmitterDefinition => ({
    id: `rainvale-grove-rain-${index}`,
    sound: 'rain-foliage',
    title: { 'zh-hant': '雨打樹葉', 'en': 'Rain on the leaves' },
    zone: 'rainvale',
    ...position,
    /** 聲音要從樹冠那一層落下來，不是從腳邊 */
    heightOffset: 6,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 18,
  })),
  ...PAVILION_LIST.map((pavilion, index): SoundEmitterDefinition => ({
    id: `rainvale-pavilion-roof-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '雨打亭頂', 'en': 'Rain on the pavilion roof' },
    zone: 'rainvale',
    x: pavilion.x,
    z: pavilion.z,
    /** 亭頂那一層，坐在椅子上正好在頭頂 */
    heightOffset: 4,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 9,
  })),
  ...POND_LIST.map((pond, index): SoundEmitterDefinition => ({
    id: `rainvale-pond-rain-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '雨落水面', 'en': 'Rain on the water' },
    zone: 'rainvale',
    x: Math.round(pond.x),
    z: Math.round(pond.z),
    /** 貼著水面 */
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: Math.max(2, Math.round(pond.radius)),
    maxDistance: Math.round(pond.radius) + 7,
  })),
  {
    /**
     * 遠雷
     *
     * mode 是 trigger：自己不響，等天氣系統的閃電來叫（id 與聽雨亭那一顆相同，渲染端只認這個名字）。
     * 掛在林子正中的天上二十格，可聽九十格：林子裡哪裡都聽得到，雷本來就是從很高很遠的地方壓下來的
     */
    id: 'rainvale-thunder',
    sound: 'thunder',
    title: { 'zh-hant': '遠雷', 'en': 'Distant thunder' },
    zone: 'rainvale',
    ...atGrove(0, 0),
    heightOffset: 20,
    mode: { type: 'trigger' },
    volume: 0.85,
    minDistance: 30,
    maxDistance: 90,
  },
  /** 雨中的蟾蜍：住在幾窪較大的積水邊，各叫各的 */
  ...POND_LIST.filter((pond) => pond.radius >= 3).map((pond, index): SoundEmitterDefinition => ({
    id: `rainvale-grove-toad-${index}`,
    sound: 'frog-toad',
    title: { 'zh-hant': '雨中的蟾蜍', 'en': 'Toad in the rain' },
    zone: 'rainvale',
    x: Math.round(pond.x + pond.radius + 1),
    z: Math.round(pond.z - 1),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [14 + index * 3, 34 + index * 4] },
    volume: 0.6,
    minDistance: 3,
    maxDistance: 18,
  })),
]
