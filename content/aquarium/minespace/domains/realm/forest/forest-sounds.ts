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
  })),
]
