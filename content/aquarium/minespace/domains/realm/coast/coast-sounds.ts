import type { SoundEmitterDefinition } from '../../soundscape/type'
import { COAST_CENTER, REEF_WIDTH, SAND_ISLAND_RADIUS } from './coast-layout'

/** 某個方位（度）上離島心 radius 格；島南北壓扁，Z 照比例收 */
function atCoastRing(degree: number, radius: number, stretchZ = 1): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: COAST_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: COAST_CENTER.z + Math.round((Math.sin(radian) * radius) / stretchZ),
  }
}

/** 島南北壓扁的比例，與 coast-layout 的 COAST_ISLAND 一致 */
const ISLAND_STRETCH_Z = 1.2

/**
 * 海中沙島的音源
 *
 * 潮汐磯的聲音是「有呼吸週期的水」：拍岸的浪聲一漲一退、外海的濤聲、頭上盤旋的海鷗、
 * 水槽深處的海豚。這裡照搬，只是浪聲繞著整座島一圈，外海與海豚移到深水那一圈，
 * 站在島中間四面都有浪，走到岸邊才聽得到外海。全沿用潮汐磯的音檔。
 *
 * 夜裡原本只少了海鷗，其餘與白天一模一樣。海不分晝夜，分的是岸上聽到的層次：
 * - 入夜多一層低而慢的潮聲（同一段拍岸聲壓低四個半音），夜裡沒有別的聲音蓋著，浪聽起來比白天沉
 * - 拂曉海鷗最吵，多兩隻繞島；薄暮歸巢，鳥居那邊叫得勤一些
 * - 兩隻白天的海鷗音高錯開，不是同一隻叫兩次
 */
export const COAST_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /**
   * 拍岸浪聲：貼著島岸一圈十顆
   *
   * 島岸一圈約一百格，十顆各管十來格，沿著灘走前後都是浪；
   * 可聽二十格，站在島中間（離岸十來格）還聽得到四面的浪，音檔本身就是一漲一退的呼吸
   */
  ...[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((degree, index): SoundEmitterDefinition => ({
    id: `coast-isle-shore-${index}`,
    sound: 'ocean-shore',
    title: { 'zh-hant': '拍岸浪聲', 'en': 'Waves on the shore' },
    zone: 'coast',
    ...atCoastRing(degree, SAND_ISLAND_RADIUS + 1, ISLAND_STRETCH_Z),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 4,
    maxDistance: 20,
  })),
  /** 外海濤聲：珊瑚淺海外緣四顆，站在灘上才聽得清楚，游出去就整片包住 */
  ...[45, 135, 225, 315].map((degree, index): SoundEmitterDefinition => ({
    id: `coast-isle-ocean-${index}`,
    sound: 'ocean-wave',
    title: { 'zh-hant': '外海濤聲', 'en': 'Open sea' },
    zone: 'coast',
    ...atCoastRing(degree, SAND_ISLAND_RADIUS + REEF_WIDTH),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 10,
    maxDistance: 40,
  })),
  /** 海鷗：照潮汐磯在頭頂上繞圈，只是圈子大一點，繞著整座島飛 */
  {
    id: 'coast-isle-gull',
    activeAt: 'day',
    sound: 'ocean-gull',
    title: { 'zh-hant': '海鷗', 'en': 'Seagulls' },
    zone: 'coast',
    ...atCoastRing(0, 0),
    heightOffset: 10,
    motion: { type: 'orbit', radius: 14, periodSecond: 46, riseHeight: 3 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.7,
    minDistance: 8,
    maxDistance: 34,
    variation: { pitchOffsetCent: 40, pitchRangeCent: 70 },
  },
  /** 第二隻停在南岸外淺海的鳥居上，偶爾叫一兩聲 */
  {
    id: 'coast-isle-gull-torii',
    activeAt: 'day',
    sound: 'ocean-gull',
    title: { 'zh-hant': '海鷗', 'en': 'Seagulls' },
    zone: 'coast',
    ...atCoastRing(90, SAND_ISLAND_RADIUS + 6, ISLAND_STRETCH_Z),
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [24, 56] },
    volume: 0.5,
    minDistance: 5,
    maxDistance: 26,
    variation: { pitchOffsetCent: -80, pitchRangeCent: 60 },
  },
  /**
   * 海豚：在深水那一圈游來游去
   *
   * 潮汐磯的海豚壓在水槽最深處；這裡放到珊瑚淺海外的深水，
   * 站在岸邊聽得到遠遠的一兩聲，游出去才靠得近
   */
  ...[60, 240].map((degree, index): SoundEmitterDefinition => ({
    id: `coast-isle-dolphin-${index}`,
    sound: 'ocean-dolphin',
    title: { 'zh-hant': '海豚', 'en': 'Dolphins' },
    zone: 'coast',
    ...atCoastRing(degree, SAND_ISLAND_RADIUS + REEF_WIDTH + 6),
    heightOffset: 0,
    motion: { type: 'wander', radius: 8, periodSecond: 60 },
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.8,
    minDistance: 6,
    maxDistance: 30,
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 夜裡的潮聲：岸邊五處，夾在白天那十顆之間，低而慢 */
  ...[18, 90, 162, 234, 306].map((degree, index): SoundEmitterDefinition => ({
    id: `coast-isle-night-tide-${index}`,
    activeAt: 'night',
    sound: 'ocean-shore',
    title: { 'zh-hant': '夜裡的潮聲', 'en': 'The tide after dark' },
    zone: 'coast',
    ...atCoastRing(degree, SAND_ISLAND_RADIUS + 2, ISLAND_STRETCH_Z),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 5,
    maxDistance: 26,
    variation: { pitchOffsetCent: -400, pitchRangeCent: 60 },
    isFiller: true,
  })),
  /** 拂曉的海鷗：兩隻繞著島飛，叫得比白天密 */
  ...[0, 1].map((index): SoundEmitterDefinition => ({
    id: `coast-isle-dawn-gull-${index}`,
    activeAt: 'dawn',
    sound: 'ocean-gull',
    title: { 'zh-hant': '海鷗', 'en': 'Seagulls' },
    zone: 'coast',
    ...atCoastRing(index * 180 + 40, 6),
    heightOffset: 8 + index * 3,
    motion: { type: 'orbit', radius: 16 + index * 5, periodSecond: 38 + index * 13, riseHeight: 3 },
    mode: { type: 'interval', rangeSecond: [6 + index * 3, 15 + index * 5] },
    volume: 0.6,
    minDistance: 8,
    maxDistance: 36,
    variation: { pitchOffsetCent: index === 0 ? 90 : -50, pitchRangeCent: 70 },
    isFiller: true,
  })),
  {
    /** 薄暮歸巢：鳥居上那一隻的同伴，天黑前叫得勤 */
    id: 'coast-isle-dusk-gull',
    activeAt: 'dusk',
    sound: 'ocean-gull',
    title: { 'zh-hant': '海鷗', 'en': 'Seagulls' },
    zone: 'coast',
    ...atCoastRing(100, SAND_ISLAND_RADIUS + 5, ISLAND_STRETCH_Z),
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [9, 22] },
    volume: 0.5,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: 20, pitchRangeCent: 80 },
    isFiller: true,
  },
  /**
   * 擱淺的小舟：東岸的灘上（與神遊那個主體同一個方位），海水輕拍船身，繫船的纜繩偶爾被拉得嘎吱一聲
   *
   * 纜繩那段錄在港口，背景可能有一點低頻；只有站在船邊才聽得到
   */
  {
    id: 'coast-isle-boat-lapping',
    sound: 'water-lapping',
    title: { 'zh-hant': '擱淺的小舟', 'en': 'The beached boat' },
    zone: 'coast',
    ...atCoastRing(8, SAND_ISLAND_RADIUS - 2, ISLAND_STRETCH_Z),
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 2,
    maxDistance: 10,
    variation: { pitchOffsetCent: 60 },
    isFiller: true,
  },
  {
    id: 'coast-isle-boat-rope',
    sound: 'coast-rope-creak',
    title: { 'zh-hant': '擱淺的小舟', 'en': 'The beached boat' },
    zone: 'coast',
    ...atCoastRing(8, SAND_ISLAND_RADIUS - 2, ISLAND_STRETCH_Z),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [16, 46] },
    volume: 0.4,
    minDistance: 2,
    maxDistance: 10,
    variation: { pitchRangeCent: 160, volumeDropRatio: 0.5 },
    isFiller: true,
  },
]
