import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  CASCADE_X,
  measureStreamZ,
  measureValleyCenterZ,
  PLUNGE_POOL,
  RIVER_PORTAL_POINT,
  VALLEY_END_X,
  VALLEY_HEAD_X,
  WATERFALL_POINT,
} from './river-layout'

/** 溪心上的某一排 */
function atStream(x: number): { x: number; z: number } {
  return { x, z: Math.round(measureStreamZ(x)) }
}

/**
 * 溪谷的音源
 *
 * 遣水的聲音照搬：瀑布、沿著水道一串流水、白天的紅冠水雞，全沿用既有音檔，
 * 一顆一顆貼著水擺：瀑布在水幕上，流水沿著溪心，跌水那一道坎多一顆。
 * 遣水沒有夜聲；這裡谷底大了，夜裡水邊多一叢草蟲，與湖中島同一個音檔。
 *
 * 瀑布傳得最遠：谷裡什麼地方都聽得到一點，走近才轟起來，
 * 正是遣水那一句「走到哪裡都逃不掉那個聲音」
 */
export const RIVER_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 瀑布：擺在水幕落進潭裡的地方，轟聲是從那裡來的，不是從崖頂 */
  {
    id: 'river-realm-waterfall',
    sound: 'waterfall',
    title: { 'zh-hant': '瀑布', 'en': 'Waterfall' },
    zone: 'river',
    x: WATERFALL_POINT.x + 2,
    z: WATERFALL_POINT.z,
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 1,
    minDistance: 12,
    maxDistance: 90,
  },
  /** 崖頂的水口：溪水在缺口邊翻下去，站在潭邊抬頭聽得到上面那一層 */
  {
    id: 'river-realm-lip',
    sound: 'river-flow',
    title: { 'zh-hant': '瀑布', 'en': 'Waterfall' },
    zone: 'river',
    x: VALLEY_HEAD_X - 3,
    z: WATERFALL_POINT.z,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 6,
    maxDistance: 34,
  },
  /** 旁邊那道兩段的小瀑布：岩台上的小池，水從這裡再翻下去 */
  {
    id: 'river-realm-side-fall',
    sound: 'river-flow',
    title: { 'zh-hant': '瀑布', 'en': 'Waterfall' },
    zone: 'river',
    x: VALLEY_HEAD_X + 2,
    z: WATERFALL_POINT.z + (WATERFALL_POINT.z > measureValleyCenterZ(VALLEY_HEAD_X) ? -7 : 7),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
  },
  /** 瀑布潭：水落進潭裡翻起來的那一層，比瀑布本身近 */
  {
    id: 'river-realm-plunge',
    sound: 'river-flow',
    title: { 'zh-hant': '水道流水', 'en': 'Flowing water' },
    zone: 'river',
    ...atStream(VALLEY_HEAD_X + PLUNGE_POOL.offsetX + PLUNGE_POOL.radius),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 20,
  },
  /** 沿著溪心一串流水，十六格一顆，走在岸邊前後都是水聲 */
  ...Array.from({ length: 6 }, (_, index) => VALLEY_HEAD_X + 30 + index * 16)
    .filter((x) => x < VALLEY_END_X)
    .map((x, index): SoundEmitterDefinition => ({
      id: `river-realm-flow-${index}`,
      sound: 'river-flow',
      title: { 'zh-hant': '水道流水', 'en': 'Flowing water' },
      zone: 'river',
      ...atStream(x),
      heightOffset: 1,
      mode: { type: 'loop' },
      volume: 0.5,
      minDistance: 4,
      maxDistance: 18,
    })),
  /** 跌水：溪水在這裡落一格，比平流響一點 */
  {
    id: 'river-realm-cascade',
    sound: 'river-flow',
    title: { 'zh-hant': '水道流水', 'en': 'Flowing water' },
    zone: 'river',
    ...atStream(CASCADE_X),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 20,
  },
  /** 紅冠水雞：在下游那個靜水潭上換位置 */
  {
    id: 'river-realm-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '紅冠水雞', 'en': 'Moorhen' },
    zone: 'river',
    ...atStream(150),
    heightOffset: 1,
    motion: { type: 'wander', radius: 4, periodSecond: 60 },
    mode: { type: 'interval', rangeSecond: [16, 38] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
    silentInRain: true,
  },
  /** 上游那個潭也有一隻，間隔長一點，兩隻偶爾一來一往 */
  {
    id: 'river-realm-moorhen-upstream',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '紅冠水雞', 'en': 'Moorhen' },
    zone: 'river',
    ...atStream(110),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [24, 56] },
    volume: 0.55,
    minDistance: 4,
    maxDistance: 22,
    silentInRain: true,
  },
  /** 夜裡水邊的草蟲：門前那片草地與上游的北岸 */
  ...[
    { x: RIVER_PORTAL_POINT.x - 10, z: RIVER_PORTAL_POINT.z + 2 },
    { x: 116, z: Math.round(measureValleyCenterZ(116) - 8) },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'river',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.35,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),
]
