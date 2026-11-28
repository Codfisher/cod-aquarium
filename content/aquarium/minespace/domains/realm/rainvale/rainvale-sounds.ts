import type { SoundEmitterDefinition, SoundWeatherGain } from '../../soundscape/type'
import type { PavilionFacing } from './rainvale-layout'
import { PAVILION_LIST, POND_LIST, RAINVALE_CENTER, RAINVALE_GROUND_Y, RAINVALE_RAIN_LEVEL, THICKET_START_RADIUS } from './rainvale-layout'

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
 * 雨聲跟著雨勢走
 *
 * 這場雨在七成八與滿檔之間一陣大一陣小（場景定義的 weather.rain），畫面上雨絲與霧都跟著變，
 * 雨聲原本卻是死的。三種表面各留不同的底：頭頂那片葉子雨起落最明顯，雨小的時候剩一半多一點；
 * 亭頂與水面本來就悶、就近，留得多一些，雨小了躲在亭子裡還是聽得到頂上在響
 */
const LEVEL_RANGE: [number, number] = [RAINVALE_RAIN_LEVEL.min, RAINVALE_RAIN_LEVEL.max]
const CANOPY_RAIN_GAIN: SoundWeatherGain = { source: 'rain', levelRange: LEVEL_RANGE, floor: 0.55 }
const SHELTER_RAIN_GAIN: SoundWeatherGain = { source: 'rain', levelRange: LEVEL_RANGE, floor: 0.7 }

/**
 * 亭頂木板底面的高度
 *
 * 亭子的地板在林地那一層，木頂在地板上方四到五格，這裡是木頂正下方。
 * 直接給 y：自動貼地會把木頂當成地面，音源被擺到亭頂上面四格，
 * 離坐在亭裡的耳朵七格多、中間還隔著那片木頂，量出來幾乎沒有一個地方聽得到
 */
const PAVILION_ROOF_UNDERSIDE_Y = RAINVALE_GROUND_Y + 3.4

/** 較大的幾窪積水（住著蟾蜍的那幾窪） */
const LARGE_POND_LIST = POND_LIST.filter((pond) => pond.radius >= 3)

/**
 * 雨勢大的那一陣才浮出來的一層
 *
 * 雨勢過了八成六才開始有、滿檔才滿：雨小的時候只有平常那片葉子雨，
 * 一陣大雨壓下來時頭頂多一層更密、更沉的雨打在葉子與濕地上
 */
const HEAVY_RAIN_GAIN: SoundWeatherGain = { source: 'rain', levelRange: [0.86, RAINVALE_RAIN_LEVEL.max], floor: 0 }
const HEAVY_RAIN_GRID_SPACING = 22

function createHeavyRainPositionList(): { x: number; z: number }[] {
  const positionList: { x: number; z: number }[] = []
  const reach = THICKET_START_RADIUS
  for (let offsetX = -reach; offsetX <= reach; offsetX += HEAVY_RAIN_GRID_SPACING) {
    for (let offsetZ = -reach; offsetZ <= reach; offsetZ += HEAVY_RAIN_GRID_SPACING) {
      if (Math.hypot(offsetX, offsetZ) <= reach)
        positionList.push(atGrove(offsetX + 5, offsetZ + 4))
    }
  }
  return positionList
}

/** 亭子面朝的方向，與 rainvale-terrain 蓋亭子時同一張表 */
const FACING_OFFSET_MAP: Record<PavilionFacing, { x: number; z: number }> = {
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
}

/**
 * 每座亭子的風鈴掛在哪
 *
 * 屋簷伸出去的前左角、地板上方兩格（rainvale-terrain 的 placePavilion 就是這樣擺 WIND_CHIME 的）
 */
const CHIME_POSITION_LIST = PAVILION_LIST.map((pavilion) => {
  const front = FACING_OFFSET_MAP[pavilion.facing]
  const left = { x: front.z, z: -front.x }

  return {
    x: pavilion.x + (front.x + left.x) * 2,
    z: pavilion.z + (front.z + left.z) * 2,
  }
})

/** 四個風鈴各有各的音高（鈴的大小不同），同一個鈴每次都是同一個音 */
const CHIME_PITCH_LIST = [-140, 30, 150, -50]

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
 * 與頭頂那片又亮又碎的葉子雨分得開。另外照聽雨亭：遠雷（等閃電來叫）與雨中的蟾蜍。
 *
 * 日夜原本完全一樣。雨不分晝夜，分的是水邊：薄暮時蟾蜍叫得密、聲音沉一點，
 * 入夜後小水窪邊多幾隻青蛙，一聲一聲的
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
    weatherGain: CANOPY_RAIN_GAIN,
  })),
  ...PAVILION_LIST.map((pavilion, index): SoundEmitterDefinition => ({
    id: `rainvale-pavilion-roof-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '雨打亭頂', 'en': 'Rain on the pavilion roof' },
    zone: 'rainvale',
    x: pavilion.x,
    z: pavilion.z,
    /** 木頂正下方，坐在椅子上正好在頭頂 */
    y: PAVILION_ROOF_UNDERSIDE_Y,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 9,
    weatherGain: SHELTER_RAIN_GAIN,
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
    weatherGain: SHELTER_RAIN_GAIN,
    /** 與亭頂是同一段錄音：調低一點，水面的雨比木頭上的悶 */
    variation: { pitchOffsetCent: -180 },
  })),
  {
    /**
     * 遠雷
     *
     * mode 是 trigger：自己不響，等天氣系統的閃電來叫（id 與聽雨亭那一顆相同，渲染端只認這個名字）。
     * 掛在林子正中的天上二十格，可聽九十格：林子裡哪裡都聽得到，雷本來就是從很高很遠的地方壓下來的。
     * 每一道雷渲染端會給一個新的方位（見 sound-shaping 的 pickThunderPosition），這裡的座標只是它載入時待的地方。
     * 另有一顆 rainvale-thunder-roll（拖得長的滾雷），渲染端每一道雷在兩顆之間挑一顆叫
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
    /** 同一段雷聲每一道差得多一點，才不像重播 */
    variation: { pitchRangeCent: 150 },
  },
  /** 雨中的蟾蜍：住在幾窪較大的積水邊，各叫各的 */
  ...LARGE_POND_LIST.map((pond, index): SoundEmitterDefinition => ({
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

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 薄暮：同幾窪水的另一岸多一隻，叫得密、聲音沉，天黑透之後退場 */
  ...LARGE_POND_LIST.map((pond, index): SoundEmitterDefinition => ({
    id: `rainvale-grove-dusk-toad-${index}`,
    activeAt: 'dusk',
    sound: 'frog-toad',
    title: { 'zh-hant': '雨中的蟾蜍', 'en': 'Toad in the rain' },
    zone: 'rainvale',
    x: Math.round(pond.x - pond.radius - 1),
    z: Math.round(pond.z + 1),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [7 + index * 2, 16 + index * 3] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 18,
    variation: { pitchOffsetCent: -160 },
    isFiller: true,
  })),
  /** 入夜：雨裡的蛙與蟾蜍一起叫開，幾窪大水邊各一片（細雨夜裡實錄的蛙鳴） */
  ...LARGE_POND_LIST.map((pond, index): SoundEmitterDefinition => ({
    id: `rainvale-grove-night-frog-${index}`,
    activeAt: 'night',
    sound: 'rain-frogs',
    title: { 'zh-hant': '夜雨裡的蛙', 'en': 'Frogs in the night rain' },
    zone: 'rainvale',
    x: Math.round(pond.x),
    z: Math.round(pond.z + pond.radius + 1),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 4,
    maxDistance: 22,
    /** 四片的音高照 id 錯開：十四秒的循環四片齊播會聽出週期 */
    variation: { pitchRangeCent: 100 },
    isFiller: true,
  })),
  /** 大雨的那一層：雨勢壓下來時才有 */
  ...createHeavyRainPositionList().map((position, index): SoundEmitterDefinition => ({
    id: `rainvale-grove-heavy-rain-${index}`,
    sound: 'rain-leaves-heavy',
    title: { 'zh-hant': '壓下來的大雨', 'en': 'The rain coming down hard' },
    zone: 'rainvale',
    ...position,
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 24,
    weatherGain: HEAVY_RAIN_GAIN,
    variation: { pitchRangeCent: 100 },
    isFiller: true,
  })),
  /** 亭子簷角的風鈴：雨裡的風偶爾碰它一下 */
  ...CHIME_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `rainvale-pavilion-chime-${index}`,
    sound: 'chime-furin',
    title: { 'zh-hant': '簷角的風鈴', 'en': 'Wind chime under the eaves' },
    zone: 'rainvale',
    ...position,
    /** 地板上方兩格，直接給 y：那一柱頭上是出簷的木頂 */
    y: RAINVALE_GROUND_Y + 3,
    mode: { type: 'interval', rangeSecond: [16 + index * 5, 42 + index * 7] },
    volume: 0.36,
    minDistance: 2,
    maxDistance: 13,
    variation: { pitchOffsetCent: CHIME_PITCH_LIST[index] ?? 0, pitchRangeCent: 0, volumeDropRatio: 0.5 },
    isFiller: true,
  })),
  {
    /** 滾雷：與遠雷同一個位置、同樣等渲染端來叫，是拖得很長的那一種 */
    id: 'rainvale-thunder-roll',
    sound: 'thunder-dry-roll',
    title: { 'zh-hant': '遠雷', 'en': 'Distant thunder' },
    zone: 'rainvale',
    ...atGrove(0, 0),
    heightOffset: 20,
    mode: { type: 'trigger' },
    volume: 0.85,
    minDistance: 30,
    maxDistance: 90,
    variation: { pitchRangeCent: 200 },
    isFiller: true,
  },
]
