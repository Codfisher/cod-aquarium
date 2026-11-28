import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ARRIVAL_CLEARING, FOREST_CENTER, FOREST_PATH_POINT_LIST, SHRINE_CLEARING, THICKET_START_RADIUS } from './forest-layout'

/** 某個方位（度）上離林子中心 radius 格 */
function atForestRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: FOREST_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: FOREST_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/** 小徑上某個比例（零到一）的那一點 */
function atPath(ratio: number): { x: number; z: number } {
  const point = FOREST_PATH_POINT_LIST[Math.round((FOREST_PATH_POINT_LIST.length - 1) * ratio)]!
  return { x: Math.round(point.x), z: Math.round(point.z) }
}

/**
 * 林海的音源
 *
 * 松籟林的聲音是「連續寬頻的風，襯著高處的鳥」：樹梢的風聲、烏鶇、交嘴雀、啄木鳥，夜裡一隻貓頭鷹。
 * 這裡照搬，風聲鋪滿整片林子（中心一顆、內外兩圈），走到哪裡頭頂都是松濤；
 * 鳥各多一隻，散在小徑兩側與空地邊上，沿著小徑走會一隻一隻經過。全沿用松籟林的音檔
 */
export const FOREST_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 樹梢的風聲：中心一顆、二十格一圈六顆、密林那一圈八顆，每顆管二十來格 */
  ...[
    atForestRing(0, 0),
    ...[0, 60, 120, 180, 240, 300].map((degree) => atForestRing(degree, 20)),
    ...[22, 67, 112, 157, 202, 247, 292, 337].map((degree) => atForestRing(degree, THICKET_START_RADIUS - 4)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-rustle-${index}`,
    sound: 'forest-rustle',
    title: { 'zh-hant': '樹梢的風聲', 'en': 'Rustling treetops' },
    zone: 'forest',
    ...position,
    heightOffset: 8,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 8,
    maxDistance: 26,
  })),
  /** 烏鶇：一隻在落腳的空地邊、一隻在小徑中段，都會換枝 */
  ...[
    { x: ARRIVAL_CLEARING.x + 7, z: ARRIVAL_CLEARING.z - 3 },
    atPath(0.55),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-blackbird-${index}`,
    activeAt: 'day',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '烏鶇鳴唱', 'en': 'Blackbird song' },
    zone: 'forest',
    ...position,
    heightOffset: 7,
    motion: { type: 'wander', radius: 9, periodSecond: 48 + index * 11, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 28,
    /** 兩隻一高一低：同一段錄音原音高各播一次，聽起來是同一隻換了位置 */
    variation: { pitchOffsetCent: index === 0 ? 50 : -60, pitchRangeCent: 40 },
    silentInRain: true,
  })),
  /** 交嘴雀：小徑兩側各一 */
  ...[atPath(0.3), atPath(0.8)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-crossbill-${index}`,
    activeAt: 'day',
    sound: 'bird-crossbill',
    title: { 'zh-hant': '交嘴雀', 'en': 'Crossbill' },
    zone: 'forest',
    x: position.x + (index === 0 ? -8 : 7),
    z: position.z,
    heightOffset: 7,
    mode: { type: 'interval', rangeSecond: [14, 34] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 26,
    variation: { pitchOffsetCent: index === 0 ? -40 : 70, pitchRangeCent: 40 },
    silentInRain: true,
  })),
  /** 啄木鳥：林子深處兩隻，隔著樹傳過來 */
  ...[atForestRing(200, 30), atForestRing(20, 28)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-woodpecker-${index}`,
    activeAt: 'day',
    sound: 'bird-woodpecker',
    title: { 'zh-hant': '啄木鳥敲樹', 'en': 'Woodpecker drumming' },
    zone: 'forest',
    ...position,
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [18, 45] },
    volume: 0.75,
    minDistance: 6,
    maxDistance: 32,
    silentInRain: true,
  })),
  /** 林中貓頭鷹：夜裡一隻在小徑盡頭的老橡樹上，一隻在林子另一頭 */
  ...[{ x: SHRINE_CLEARING.x, z: SHRINE_CLEARING.z - 2 }, atForestRing(80, 30)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-owl-${index}`,
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '林中貓頭鷹', 'en': 'Owl in the woods' },
    zone: 'forest',
    ...position,
    heightOffset: 9,
    mode: { type: 'interval', rangeSecond: [25, 60] },
    volume: 0.8,
    minDistance: 8,
    maxDistance: 34,
    variation: { pitchOffsetCent: index === 0 ? -50 : 60, pitchRangeCent: 30, volumeDropRatio: 0.35 },
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 拂曉：天還沒亮林子裡的鳥就先叫起來，比白天密，太陽爬高才散 */
  ...[
    { ...atForestRing(140, 14), sound: 'bird-blackbird' },
    { ...atForestRing(260, 22), sound: 'bird-crossbill' },
    { ...atForestRing(330, 16), sound: 'bird-blackbird' },
    { ...atForestRing(60, 26), sound: 'bird-crossbill' },
  ].map(({ sound, ...position }, index): SoundEmitterDefinition => ({
    id: `forest-sea-dawn-${index}`,
    activeAt: 'dawn',
    sound,
    title: { 'zh-hant': '拂曉的鳥', 'en': 'Birds at first light' },
    zone: 'forest',
    ...position,
    heightOffset: 7,
    motion: { type: 'wander', radius: 6, periodSecond: 41 + index * 8, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [5 + index * 2, 13 + index * 3] },
    volume: 0.6,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: [80, -20, -80, 30][index] ?? 0, pitchRangeCent: 50 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 薄暮：烏鶇在天黑前還有一輪晚唱，貓頭鷹開口之前的最後幾句 */
  ...[atForestRing(190, 18), atForestRing(10, 12)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-dusk-${index}`,
    activeAt: 'dusk',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '薄暮的晚唱', 'en': 'Evening song' },
    zone: 'forest',
    ...position,
    heightOffset: 8,
    mode: { type: 'interval', rangeSecond: [14 + index * 6, 32 + index * 8] },
    volume: 0.55,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: index === 0 ? -30 : 40, pitchRangeCent: 40 },
    silentInRain: true,
    isFiller: true,
  })),
  /**
   * 夜裡的林子原本只有風與兩隻貓頭鷹。補的都是夜行的東西，各自很疏：
   * 密林那一圈的狐狸（畫面上夜裡有狐火的行列繞著那一圈走）、林緣一直顫鳴的夜鷹、
   * 小徑邊的夜鶯，薄暮時林子深處一聲狍的吠叫
   */
  ...[atForestRing(130, THICKET_START_RADIUS - 2), atForestRing(310, THICKET_START_RADIUS)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-fox-${index}`,
    activeAt: 'night',
    sound: 'beast-fox-scream',
    title: { 'zh-hant': '密林裡的狐狸', 'en': 'Fox in the thicket' },
    zone: 'forest',
    ...position,
    heightOffset: 2,
    motion: { type: 'wander', radius: 8, periodSecond: 90 + index * 23 },
    mode: { type: 'interval', rangeSecond: [120 + index * 50, 300 + index * 80] },
    volume: 0.6,
    minDistance: 8,
    maxDistance: 46,
    variation: { pitchOffsetCent: index === 0 ? 0 : -110, pitchRangeCent: 90, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
  ...[atForestRing(40, THICKET_START_RADIUS - 6), atForestRing(230, THICKET_START_RADIUS - 8)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-nightjar-${index}`,
    activeAt: 'night',
    sound: 'bird-nightjar',
    title: { 'zh-hant': '林緣的夜鷹', 'en': 'Nightjar at the wood edge' },
    zone: 'forest',
    ...position,
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 4,
    maxDistance: 20,
    variation: { pitchOffsetCent: index === 0 ? 50 : -60 },
    silentInRain: true,
    isFiller: true,
  })),
  ...[atPath(0.4), atPath(0.9)].map((position, index): SoundEmitterDefinition => ({
    id: `forest-sea-nightingale-${index}`,
    activeAt: 'night',
    sound: 'bird-nightingale',
    title: { 'zh-hant': '夜鶯', 'en': 'Nightingale' },
    zone: 'forest',
    x: position.x + (index === 0 ? 9 : -8),
    z: position.z + 4,
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [24 + index * 12, 64 + index * 20] },
    volume: 0.62,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: index === 0 ? -40 : 60, pitchRangeCent: 40, volumeDropRatio: 0.3 },
    silentInRain: true,
    isFiller: true,
  })),
  {
    id: 'forest-sea-roe-deer',
    activeAt: 'dusk',
    sound: 'beast-roe-deer',
    title: { 'zh-hant': '林子深處的狍', 'en': 'Roe deer deep in the woods' },
    zone: 'forest',
    ...atForestRing(170, THICKET_START_RADIUS - 4),
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond: [45, 130] },
    volume: 0.45,
    minDistance: 8,
    maxDistance: 50,
    variation: { pitchOffsetCent: 70, pitchRangeCent: 100, volumeDropRatio: 0.4 },
    isFiller: true,
  },
]
