import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  ARCH_Z,
  CHAMBER_RECT,
  CHAMBER_SEEP_POINT,
  CISTERN_RECT,
  COLONNADE_COLUMN_X_LIST,
  HALL_RECT,
  HALL_STELE_POINT,
  RUINS_CENTER,
  RUINS_FOOT_Y,
} from './ruins-layout'

/**
 * 石殿遺址的音源
 *
 * 石廊跡的聲音是「沒有人」：廊間的穿堂風（雪稜那道嘯風壓低音量鋪底）、石縫滲水（洞裡的滴水，拖著長長的殘響）、
 * 入夜後棲在斷樑上的一隻鴞。這裡照搬，全沿用石廊跡的音檔與音量：
 * - 穿堂風沿著長廊、拱門與大殿鋪開，走到哪都在兩排石柱或斷牆之間
 * - 滲水最響的是北端那間石室（牆縫那道細流），大殿裡兩處積水再各一顆
 * - 鴞兩隻：一隻在大殿那排石柱的斷樑上，一隻在長廊的樑上
 *
 * 音源原本全排在長廊—拱門—大殿—石室那一條中軸上，殿外兩側的荒地量出來一半是靜的。
 * 荒地補的是「野地上的風」：草的風（風露原那一段壓低），比廊間那道硬的嘯風軟，
 * 走出石殿就從石頭的聲音換成草的聲音；另外幾陣會飄的、東邊蓄水池的一點水聲、
 * 白天亂石坡上很遠的一聲鳥、入夜石縫草叢裡的蟲
 */

/** 某個方位（度）上離遺址中心 radius 格 */
function atRuinsRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: RUINS_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: RUINS_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/**
 * 荒地的風擺在哪：內圈貼著石殿兩側（避開中軸那一條，那裡有穿堂風），外圈到亂石坡腳
 */
const WASTELAND_WIND_POSITION_LIST = [
  ...[0, 35, 145, 180, 215, 325].map((degree) => atRuinsRing(degree, 40)),
  ...[18, 62, 118, 162, 198, 242, 298, 342].map((degree) => atRuinsRing(degree, 56)),
]

/** 穿堂風的位置：長廊兩顆、拱門一顆、大殿四顆、石廊跡那一圈一顆 */
const WIND_POSITION_LIST = [
  { x: RUINS_CENTER.x, z: RUINS_CENTER.z + 34 },
  { x: RUINS_CENTER.x, z: RUINS_CENTER.z + 20 },
  { x: RUINS_CENTER.x, z: ARCH_Z },
  { x: HALL_RECT.minX + 8, z: HALL_RECT.minZ + 10 },
  { x: HALL_RECT.maxX - 8, z: HALL_RECT.minZ + 10 },
  { x: HALL_RECT.minX + 8, z: HALL_RECT.maxZ - 10 },
  { x: HALL_RECT.maxX - 8, z: HALL_RECT.maxZ - 10 },
  { ...HALL_STELE_POINT },
]

export const RUINS_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...WIND_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '廊間穿堂風', 'en': 'Wind through the colonnade' },
    zone: 'ruins',
    ...position,
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 4,
    maxDistance: 22,
  })),
  {
    /**
     * 石室裡的滲水
     *
     * 牆縫那道細流就在這裡。四面石牆加一層屋頂，聲音出不去，
     * 走進門就被那一聲一聲的水包住；給的高度是石室地面上兩格，直接寫 y（屋頂會讓自動找地面找到屋頂上去）
     */
    id: 'ruins-temple-seep-chamber',
    sound: 'cave-drip',
    title: { 'zh-hant': '石縫滲水', 'en': 'Water seeping through the stone' },
    zone: 'ruins',
    x: CHAMBER_SEEP_POINT.x,
    z: CHAMBER_SEEP_POINT.z + 1,
    y: RUINS_FOOT_Y + 2,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 16,
  },
  ...[
    { x: HALL_RECT.minX + 6, z: HALL_RECT.minZ + 18 },
    { x: HALL_RECT.maxX - 6, z: HALL_RECT.maxZ - 14 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-seep-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '石縫滲水', 'en': 'Water seeping through the stone' },
    zone: 'ruins',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 3,
    maxDistance: 16,
  })),
  ...[
    /**
     * 直接給 y：就在斷樑上面
     *
     * 原本用 heightOffset 八格、七格，自動貼地會先貼到柱頂的橫樑再往上加，
     * 鴞被擺到樑上方七八格的空中，比畫面上的斷樑高出一大截
     */
    { x: HALL_RECT.minX + 10, z: HALL_RECT.minZ + 18, y: RUINS_FOOT_Y + 8.5 },
    { x: COLONNADE_COLUMN_X_LIST[1], z: RUINS_CENTER.z + 24, y: RUINS_FOOT_Y + 7.5 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-owl-${index}`,
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '棲在斷樑的鴞', 'en': 'Owl on the broken beam' },
    zone: 'ruins',
    ...position,
    mode: { type: 'interval', rangeSecond: [26 + index * 9, 62 + index * 14] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 24,
  })),
  {
    /** 石室正中再一顆很輕的風，從門口灌進去在裡面打轉，石室才不是一片死寂 */
    id: 'ruins-temple-chamber-air',
    sound: 'alpine-wind',
    title: { 'zh-hant': '石室裡的迴風', 'en': 'Air circling the chamber' },
    zone: 'ruins',
    x: RUINS_CENTER.x,
    z: Math.round((CHAMBER_RECT.minZ + CHAMBER_RECT.maxZ) / 2),
    y: RUINS_FOOT_Y + 3,
    mode: { type: 'loop' },
    volume: 0.22,
    minDistance: 3,
    maxDistance: 10,
  },

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  ...WASTELAND_WIND_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-wasteland-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '荒地上的風', 'en': 'Wind over the wasteland' },
    zone: 'ruins',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.24,
    minDistance: 6,
    maxDistance: 26,
    variation: { pitchOffsetCent: -220 },
    isFiller: true,
  })),
  /** 掃過荒地的一陣：慢慢飄，飄近了草聲漲起來、飄遠了又退回去 */
  ...[atRuinsRing(10, 46), atRuinsRing(170, 46), atRuinsRing(265, 50)].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-wasteland-gust-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '荒地上的風', 'en': 'Wind over the wasteland' },
    zone: 'ruins',
    ...position,
    heightOffset: 3,
    motion: { type: 'wander', radius: 13, periodSecond: 74 + index * 13, riseHeight: 1 },
    mode: { type: 'loop' },
    volume: 0.36,
    minDistance: 4,
    maxDistance: 20,
    variation: { pitchOffsetCent: -80 },
    isFiller: true,
  })),
  {
    /** 殿東蓄水池殘跡的那一池淺水：石緣滴進池裡的水（石室那段滲水調高一點），走到池邊才聽得到 */
    id: 'ruins-temple-cistern',
    sound: 'cave-drip',
    title: { 'zh-hant': '蓄水池的水', 'en': 'Water in the old cistern' },
    zone: 'ruins',
    x: Math.round((CISTERN_RECT.minX + CISTERN_RECT.maxX) / 2),
    z: Math.round((CISTERN_RECT.minZ + CISTERN_RECT.maxZ) / 2),
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 13,
    variation: { pitchOffsetCent: 260 },
    isFiller: true,
  },
  /**
   * 白天的烏鴉：大殿一截斷柱頂上、長廊的殘柱上、殿外荒地上各一隻，一分鐘上下啼一次，提醒這裡沒有人
   *
   * 高度是量過那一柱的頂面再給的（斷柱四格半、殘柱一格半、荒地那隻就站在地上），不用 heightOffset 猜
   */
  ...[
    { x: HALL_RECT.maxX - 10, z: HALL_RECT.minZ + 18, y: RUINS_FOOT_Y + 4.5 },
    { x: COLONNADE_COLUMN_X_LIST[0], z: RUINS_CENTER.z + 32, y: RUINS_FOOT_Y + 1.5 },
    { ...atRuinsRing(205, 46), y: RUINS_FOOT_Y - 0.5 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-crow-${index}`,
    activeAt: 'day',
    sound: 'bird-crow',
    title: { 'zh-hant': '斷柱上的烏鴉', 'en': 'Crow on the broken column' },
    zone: 'ruins',
    ...position,
    mode: { type: 'interval', rangeSecond: [38 + index * 22, 110 + index * 35] },
    volume: 0.55,
    minDistance: 6,
    maxDistance: 40,
    variation: { pitchOffsetCent: [0, -110, 80][index] ?? 0, pitchRangeCent: 60, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
  /** 白天亂石坡上的落石：很遠、好幾分鐘才一次 */
  ...[atRuinsRing(35, 68), atRuinsRing(190, 70)].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-rockfall-${index}`,
    activeAt: 'day',
    sound: 'ruins-rockfall',
    title: { 'zh-hant': '亂石坡的落石', 'en': 'Rockfall on the scree' },
    zone: 'ruins',
    ...position,
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond: [190 + index * 60, 460 + index * 90] },
    volume: 0.55,
    minDistance: 12,
    maxDistance: 80,
    variation: { pitchRangeCent: 180, volumeDropRatio: 0.45 },
    isFiller: true,
  })),
  /**
   * 拱門與石室門口的風嚎：有音高的那種嗚咽
   *
   * 這段錄在大樓的電梯井外，質地偏「建築物裡的風」。石造的門洞說得通，但只放兩處、壓小聲；
   * 聽了不對的話這一組整段拿掉就好，廊間的穿堂風不靠它
   */
  ...[
    { x: RUINS_CENTER.x, z: ARCH_Z, y: RUINS_FOOT_Y + 4, pitchOffsetCent: -80 },
    { x: RUINS_CENTER.x, z: CHAMBER_RECT.maxZ + 1, y: RUINS_FOOT_Y + 2, pitchOffsetCent: 140 },
  ].map(({ pitchOffsetCent, ...position }, index): SoundEmitterDefinition => ({
    id: `ruins-temple-howl-${index}`,
    sound: 'ruins-wind-howl',
    title: { 'zh-hant': '門洞裡的風嚎', 'en': 'Wind moaning in the doorway' },
    zone: 'ruins',
    ...position,
    mode: { type: 'loop' },
    volume: 0.24,
    minDistance: 3,
    maxDistance: 16,
    variation: { pitchOffsetCent, pitchRangeCent: 0 },
    isFiller: true,
  })),
  /** 入夜石縫與草叢裡的蟲：殿外兩側各兩叢 */
  ...[atRuinsRing(25, 34), atRuinsRing(160, 36), atRuinsRing(200, 48), atRuinsRing(335, 50)].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-night-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '石縫間的蟲', 'en': 'Crickets among the stones' },
    zone: 'ruins',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 18,
    variation: { pitchOffsetCent: -140 },
    isFiller: true,
  })),
]
