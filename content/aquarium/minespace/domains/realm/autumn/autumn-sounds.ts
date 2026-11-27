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
 * 這裡沒有鄰居要避（整個場景只有這一片林），所以不走 measureNeighbourLimit
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
]
