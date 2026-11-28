import type { SoundEmitterDefinition } from '../../soundscape/type'
import { AUTUMN_CENTER } from './autumn-layout'

/** 某個方位（度）上離林地中心 radius 格；radius 為零就是中心 */
function atGroveRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: AUTUMN_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: AUTUMN_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/**
 * 落葉沙沙的位置：中心一顆、內圈六顆、外圈八顆
 *
 * 外圈錯開半格角度，與內圈不排成一條條放射線
 */
const RUSTLE_POSITION_LIST = [
  atGroveRing(0, 0),
  ...[0, 60, 120, 180, 240, 300].map((degree) => atGroveRing(degree, 16)),
  ...[22, 67, 112, 157, 202, 247, 292, 337].map((degree) => atGroveRing(degree, 32)),
]

/**
 * 金葉林的音源
 *
 * 金葉林是金葉苑的放大版，聲音也照金葉苑：乾的、粗的落葉沙沙，入夜換落葉堆裡的蟲。
 * 金葉苑的整個用意是「聲音是從一地的乾葉子上來的，不是從樹梢」，
 * 所以沙沙聲全部貼著地面（高一格），一顆顆鋪滿林地、各管十五格：
 * 走到哪，腳邊前後都是乾葉在響，而不是頭頂一片風聲。全沿用禪庭已有的音檔。
 *
 * 這裡沒有鄰居要避（整個場景只有這一片林），所以不走 measureNeighbourLimit。
 *
 * 沙沙聲借的是林海的樹梢風，白天整片林子九成八的地方只聽得到這一種、而且是不會動的一片。
 * 仍然疏、仍然只有葉子，只是讓它活一點：
 * - 整片調高一點（乾葉比活葉脆），與林海分開
 * - 幾陣貼地捲過去的風：乾落葉被捲起來的一陣，每隔十幾秒在林地上某處響一次
 * - 白天很遠的一聲啄木鳥，一兩分鐘才一次，襯出林子的空
 * - 薄暮時落葉堆裡的蟲先起頭，林子深處一聲狍的吠叫
 * - 晨昏雁群從西邊的低空飛過（畫面上本來就有那一列雁，原本沒有聲音）
 */
export const AUTUMN_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...RUSTLE_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `autumn-realm-rustle-${index}`,
    sound: 'forest-rustle',
    title: { 'zh-hant': '落葉沙沙', 'en': 'Rustling autumn leaves' },
    zone: 'autumn',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 4,
    maxDistance: 15,
    variation: { pitchOffsetCent: 110, pitchRangeCent: 70 },
  })),
  /** 落葉堆裡的蟲：入夜接手，散在林地上幾處落葉積得厚的地方 */
  ...[atGroveRing(30, 10), atGroveRing(150, 22), atGroveRing(250, 14), atGroveRing(320, 28), atGroveRing(80, 30)].map((position, index): SoundEmitterDefinition => ({
    id: `autumn-realm-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '落葉間的蟲', 'en': 'Crickets in the leaf litter' },
    zone: 'autumn',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /**
   * 貼地捲過去的一陣：把乾葉捲起來又放下
   *
   * 一段真的乾落葉被風捲起的錄音（漸強漸弱的一陣），每隔十幾秒在林地上某處響一次，位置慢慢飄。
   * 每一陣的音高、輕重都差一些：同一陣原樣重播很快就聽得出來
   */
  ...[atGroveRing(50, 20), atGroveRing(135, 26), atGroveRing(225, 22), atGroveRing(315, 24), atGroveRing(0, 6)].map((position, index): SoundEmitterDefinition => ({
    id: `autumn-realm-leaf-gust-${index}`,
    sound: 'autumn-leaves-gust',
    title: { 'zh-hant': '捲起落葉的風', 'en': 'A gust lifting the leaves' },
    zone: 'autumn',
    ...position,
    heightOffset: 1.5,
    motion: { type: 'wander', radius: 12, periodSecond: 58 + index * 13, riseHeight: 1 },
    mode: { type: 'interval', rangeSecond: [9 + index * 3, 24 + index * 4] },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 20,
    variation: { pitchRangeCent: 180, volumeDropRatio: 0.45 },
    isFiller: true,
  })),
  /** 白天林子深處的啄木鳥：很遠、很疏 */
  ...[atGroveRing(200, 36), atGroveRing(20, 38)].map((position, index): SoundEmitterDefinition => ({
    id: `autumn-realm-woodpecker-${index}`,
    activeAt: 'day',
    sound: 'bird-woodpecker',
    title: { 'zh-hant': '遠處的啄木鳥', 'en': 'A woodpecker far off' },
    zone: 'autumn',
    ...position,
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [70 + index * 35, 160 + index * 50] },
    volume: 0.42,
    minDistance: 8,
    maxDistance: 46,
    variation: { pitchOffsetCent: index === 0 ? -70 : 40, pitchRangeCent: 30, volumeDropRatio: 0.4 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 薄暮：落葉堆裡的蟲在天黑之前先起頭 */
  ...[atGroveRing(100, 18), atGroveRing(210, 30), atGroveRing(350, 20)].map((position, index): SoundEmitterDefinition => ({
    id: `autumn-realm-dusk-cricket-${index}`,
    activeAt: 'dusk',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '落葉間的蟲', 'en': 'Crickets in the leaf litter' },
    zone: 'autumn',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.28,
    minDistance: 3,
    maxDistance: 18,
    variation: { pitchOffsetCent: -110 },
    silentInRain: true,
    isFiller: true,
  })),
  {
    /**
     * 雁群：晨昏從西邊的低空橫越（畫面上的雁行就在那個方位，見 autumn-geese）
     *
     * 只在太陽貼著地平線那一段出聲，與天上那一列雁同進同退。
     * 音源在林子西邊的高處繞大圈，聲音是從頭頂偏西過去的
     */
    id: 'autumn-realm-geese',
    activeAt: 'twilight',
    sound: 'bird-geese-flyover',
    title: { 'zh-hant': '雁群飛過', 'en': 'Geese passing over' },
    zone: 'autumn',
    x: AUTUMN_CENTER.x - 26,
    z: AUTUMN_CENTER.z - 3,
    y: 34,
    motion: { type: 'orbit', radius: 22, periodSecond: 120, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [45, 110] },
    volume: 0.7,
    minDistance: 20,
    maxDistance: 90,
    variation: { pitchRangeCent: 60, volumeDropRatio: 0.3 },
    isFiller: true,
  },
  /** 林子深處的狍：薄暮一聲、夜裡隔更久一聲，短而啞的吠叫 */
  ...[
    { ...atGroveRing(250, 36), activeAt: 'dusk' as const, rangeSecond: [40, 110] as [number, number] },
    { ...atGroveRing(70, 38), activeAt: 'night' as const, rangeSecond: [90, 240] as [number, number] },
  ].map(({ activeAt, rangeSecond, ...position }, index): SoundEmitterDefinition => ({
    id: `autumn-realm-roe-deer-${index}`,
    activeAt,
    sound: 'beast-roe-deer',
    title: { 'zh-hant': '林子深處的狍', 'en': 'Roe deer deep in the grove' },
    zone: 'autumn',
    ...position,
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond },
    volume: 0.45,
    minDistance: 8,
    maxDistance: 50,
    variation: { pitchOffsetCent: index === 0 ? 40 : -90, pitchRangeCent: 100, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
]
