import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ISLAND_POND_RADIUS, ISLAND_RADIUS, LAKE_CENTER, LAKE_JETTY_POINT, LAKE_WATER_SURFACE_Y } from './lake-layout'

/** 湖心加上偏移的座標 */
function atLake(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: LAKE_CENTER.x + offsetX, z: LAKE_CENTER.z + offsetZ }
}

/** 某個方位（度）上離湖心 radius 格 */
function atLakeRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return atLake(Math.round(Math.cos(radian) * radius), Math.round(Math.sin(radian) * radius))
}

/**
 * 湖中島的音源
 *
 * 湖中島是水鏡池的放大版，聲音也照水鏡池：靜水上的聲音是一個一個點，中間全是空白——
 * 池畔一隻蛙、一隻水鏡池的水鳥，夜裡水邊的草蟲。這兩三個點是主角，其餘都要讓開。
 * 多出來的只有外面那片湖：岸邊偶爾一聲很輕的水，不鋪成一圈不停的浪。
 * 全沿用禪庭已有的音檔。
 *
 * 第一版還有一圈不停的拍岸、夜裡深水外圍一大片蛙鳴與木棧底下的流水，
 * 疊起來整座島一直有聲音，等不到「下一聲」，與水鏡池要的安靜相反，都拿掉了。
 *
 * 這裡沒有鄰居要避（整個場景只有這一座島），所以不走 measureNeighbourLimit；
 * 範圍照「站在哪裡該聽到什麼」來給：池邊聽得到池子的，走到岸邊才聽得到湖
 */
export const LAKE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /**
   * 岸邊的水：四顆，偶爾一聲
   *
   * 湖面是靜的，不該有浪一波一波拍上來；只有走到岸邊時，偶爾聽到一聲水碰到沙。
   * 每顆隔十幾二十秒才響一次、音量壓低，可聽十二格，站在池邊聽不到
   */
  ...[30, 120, 210, 300].map((degree, index): SoundEmitterDefinition => ({
    id: `lake-shore-${index}`,
    sound: 'ocean-shore',
    title: { 'zh-hant': '岸邊的水', 'en': 'Water at the shore' },
    zone: 'pond',
    ...atLakeRing(degree, ISLAND_RADIUS + 1),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [12, 26] },
    volume: 0.2,
    minDistance: 3,
    maxDistance: 12,
  })),
  /** 池畔的一隻蛙，照水鏡池擺在池子正中 */
  {
    id: 'lake-pond-frog',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔蛙鳴', 'en': 'Pondside frog' },
    zone: 'pond',
    ...atLake(-4, 2),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [6, 18] },
    volume: 0.65,
    minDistance: 4,
    maxDistance: 22,
  },
  /** 池裡的水鳥，在池面上換位置 */
  {
    id: 'lake-pond-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '水鳥', 'en': 'Moorhen' },
    zone: 'pond',
    ...atLake(3, -3),
    heightOffset: 1,
    motion: { type: 'wander', radius: ISLAND_POND_RADIUS - 5, periodSecond: 58 },
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
    silentInRain: true,
  },
  /** 水邊的草蟲：池子西南、盆景松底下那一叢 */
  {
    id: 'lake-pond-cricket',
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'pond',
    ...atLake(-11, 9),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.35,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  },

  /**
   * 以下是補底的音源（isFiller），神遊不拿它們當停留點
   *
   * 夜裡整座島原本只有西南那一叢蟲與池心一隻蛙，量出來兩成的地面完全沒有聲音（東岸、北岸）。
   * 補的量刻意克制，仍是「一個一個點、中間是空白」：東岸短棧邊與北岸各一叢草蟲（音高各調一點，
   * 不是同一叢搬三次），池北一隻夜裡才開口的蛙，薄暮時池邊另一隻叫得勤一些
   */
  ...[
    { x: LAKE_JETTY_POINT.x - 4, z: LAKE_JETTY_POINT.z - 2, pitchOffsetCent: 110 },
    { ...atLake(7, -19), pitchOffsetCent: -130 },
  ].map(({ pitchOffsetCent, ...position }, index): SoundEmitterDefinition => ({
    id: `lake-shore-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'pond',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 17,
    variation: { pitchOffsetCent },
    silentInRain: true,
    isFiller: true,
  })),
  {
    id: 'lake-pond-night-frog',
    activeAt: 'night',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔蛙鳴', 'en': 'Pondside frog' },
    zone: 'pond',
    ...atLake(6, -8),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [11, 30] },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent: -190, pitchRangeCent: 70 },
    isFiller: true,
  },
  {
    id: 'lake-pond-dusk-frog',
    activeAt: 'dusk',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔蛙鳴', 'en': 'Pondside frog' },
    zone: 'pond',
    ...atLake(-7, -6),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [5, 12] },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent: 140, pitchRangeCent: 70 },
    isFiller: true,
  },
  {
    /** 東岸短棧邊的小舟：湖水一下一下輕拍棧腳與船身，走上短棧才聽得到 */
    id: 'lake-jetty-lapping',
    sound: 'water-lapping',
    title: { 'zh-hant': '水拍短棧', 'en': 'Water lapping at the jetty' },
    zone: 'pond',
    x: LAKE_JETTY_POINT.x + 1,
    z: LAKE_JETTY_POINT.z,
    /** 直接給 y：棧板底下、就在水面那一層（水面離棧板不到一格）。自動貼地會貼到棧板上面 */
    y: LAKE_WATER_SURFACE_Y - 0.1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 2,
    maxDistance: 10,
    isFiller: true,
  },
  /** 岸邊草叢被風撥動的沙沙聲：南岸與西岸各一小片，很輕 */
  ...[atLakeRing(65, ISLAND_RADIUS - 4), atLakeRing(165, ISLAND_RADIUS - 5)].map((position, index): SoundEmitterDefinition => ({
    id: `lake-shore-reeds-${index}`,
    sound: 'lake-reeds',
    title: { 'zh-hant': '岸邊的草聲', 'en': 'Grass stirring by the shore' },
    zone: 'pond',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.2,
    minDistance: 3,
    maxDistance: 13,
    variation: { pitchOffsetCent: index === 0 ? -70 : 90 },
    isFiller: true,
  })),
  /** 潛鳥：湖面很遠的地方一聲悠長的哀鳴，薄暮一隻、夜裡另一頭一隻，好幾分鐘才一次 */
  ...[
    { ...atLakeRing(200, ISLAND_RADIUS + 26), activeAt: 'dusk' as const, rangeSecond: [50, 130] as [number, number] },
    { ...atLakeRing(20, ISLAND_RADIUS + 30), activeAt: 'night' as const, rangeSecond: [130, 340] as [number, number] },
  ].map(({ activeAt, rangeSecond, ...position }, index): SoundEmitterDefinition => ({
    id: `lake-loon-${index}`,
    activeAt,
    sound: 'bird-loon',
    title: { 'zh-hant': '遠處的潛鳥', 'en': 'A loon far out on the lake' },
    zone: 'pond',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond },
    volume: 0.6,
    minDistance: 20,
    maxDistance: 90,
    variation: { pitchOffsetCent: index === 0 ? 0 : -70, pitchRangeCent: 40, volumeDropRatio: 0.3 },
    isFiller: true,
  })),
]
