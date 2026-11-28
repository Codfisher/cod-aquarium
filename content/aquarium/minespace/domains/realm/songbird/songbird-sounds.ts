import type { SoundEmitterDefinition } from '../../soundscape/type'
import { BASIN_LIST, PARK_RADIUS, SONGBIRD_CENTER, SONGBIRD_GROUND_Y } from './songbird-layout'

/**
 * 鳥在枝頭的高度（世界座標，腳底以上五格，鳴禽庭那幾隻的 heightOffset）
 *
 * 直接給 y、不用 heightOffset：音源的高度是從「這一柱最上面那格實心方塊」往上量的，樹葉也算，
 * 點落在樹叢上的那幾隻會先被抬到樹冠頂再往上五格，林下聽起來就遠了一大截
 */
const PERCH_Y = SONGBIRD_GROUND_Y + 6

/** 某個方位（度）上離園子中心 radius 格 */
function atParkRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: SONGBIRD_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: SONGBIRD_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/**
 * 百囀林苑的音源
 *
 * 鳴禽庭的聲音只有旋律：一隻在樹梢間換位置的烏鶇、一隻交嘴雀、飲水盤上偶爾一聲的水鳥，
 * 夜裡架上換一隻貓頭鷹。沒有風、沒有水聲、沒有蟲——這裡也一樣，一顆風聲都不放。
 * 烏鶇與交嘴雀各散六七隻在園子裡（每一隻都會換樹），飲水盤各一隻水鳥，
 * 夜裡三隻貓頭鷹。全沿用鳴禽庭的音檔與數字。
 *
 * 要豐富也只在鳥身上加，仍然一顆風、一滴水都不放：
 * - 每一隻的音高各差一點（幾十音分，再多鳥就變卡通了），同一段錄音聽起來才是好幾隻
 * - 一天裡鳥叫得最勤的是拂曉：天沒亮就多出一批，間隔短，太陽爬高才散；薄暮烏鶇還有一輪晚唱
 * - 白天多兩種鳴禽：歐亞鴝（短而亮的一句）與歌鶇（一句話反覆說兩三遍），與烏鶇、交嘴雀錯開方位
 * - 夜裡的梟從三隻補到五隻（東半邊原本一隻都沒有，量出來三成的地面入夜後完全沒有聲音），
 *   另外有夜鶯：入夜後才開口、一路唱到拂曉的那一種；飲水盤邊的水鳥夜裡偶爾也叫一聲
 * - 晨昏北邊樹冠上空的椋鳥群（畫面上那一團會變形的鳥群，原本完全無聲）：整群吵雜、然後轟地起飛
 */

/** 第 index 隻的音高偏移（音分）：在正負九十之間錯開，相鄰兩隻一高一低 */
function measureBirdPitch(index: number): number {
  return ((index * 67) % 181) - 90
}
export const SONGBIRD_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 烏鶇：在樹梢之間換位置，每次開口的方位都不一樣 */
  ...[
    atParkRing(0, 0),
    ...[30, 100, 170, 240, 310].map((degree) => atParkRing(degree, 20)),
    atParkRing(200, 32),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-blackbird-${index}`,
    activeAt: 'day',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '烏鶇鳴唱', 'en': 'Blackbird song' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y,
    motion: { type: 'wander', radius: 7, periodSecond: 40 + index * 7, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [7, 18] },
    volume: 0.8,
    minDistance: 4,
    maxDistance: 24,
    variation: { pitchOffsetCent: measureBirdPitch(index), pitchRangeCent: 40 },
    silentInRain: true,
  })),
  /** 交嘴雀：與烏鶇錯開方位 */
  ...[
    ...[65, 135, 205, 275, 345].map((degree) => atParkRing(degree, 14)),
    ...[10, 130].map((degree) => atParkRing(degree, PARK_RADIUS - 6)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-crossbill-${index}`,
    activeAt: 'day',
    sound: 'bird-crossbill',
    title: { 'zh-hant': '交嘴雀', 'en': 'Crossbill' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y,
    mode: { type: 'interval', rangeSecond: [9, 24] },
    volume: 0.75,
    minDistance: 4,
    maxDistance: 24,
    variation: { pitchOffsetCent: measureBirdPitch(index + 3), pitchRangeCent: 40 },
    silentInRain: true,
  })),
  /** 飲水盤上的水鳥，偶爾一聲，替鳴禽留出空白 */
  ...BASIN_LIST.map((basin, index): SoundEmitterDefinition => ({
    id: `songbird-realm-moorhen-${index}`,
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '飲水的水鳥', 'en': 'Bird at the basin' },
    zone: 'songbird',
    x: basin.x,
    z: basin.z,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [20, 46] },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),
  /** 夜裡：鳴禽日落就不唱了，園子裡三隻貓頭鷹，一聲拖得很長的低音 */
  ...[atParkRing(0, 0), atParkRing(120, 24), atParkRing(250, 26)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-owl-${index}`,
    sound: 'bird-owl',
    title: { 'zh-hant': '架上的夜梟', 'en': 'Owl on the perch' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y,
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 24,
    activeAt: 'night',
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 拂曉的合唱：烏鶇與交嘴雀各多幾隻，叫得密 */
  ...[
    { ...atParkRing(45, 10), sound: 'bird-blackbird' },
    { ...atParkRing(150, 28), sound: 'bird-crossbill' },
    { ...atParkRing(215, 16), sound: 'bird-blackbird' },
    { ...atParkRing(280, 30), sound: 'bird-crossbill' },
    { ...atParkRing(335, 24), sound: 'bird-blackbird' },
    { ...atParkRing(95, 32), sound: 'bird-blackbird' },
  ].map(({ sound, ...position }, index): SoundEmitterDefinition => ({
    id: `songbird-realm-dawn-${index}`,
    activeAt: 'dawn',
    sound,
    title: { 'zh-hant': '拂曉的合唱', 'en': 'Dawn chorus' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y + (index % 3),
    motion: { type: 'wander', radius: 5, periodSecond: 36 + index * 6, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [3 + index, 9 + index * 2] },
    volume: 0.65,
    minDistance: 4,
    maxDistance: 26,
    variation: { pitchOffsetCent: measureBirdPitch(index + 5), pitchRangeCent: 50 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 薄暮的晚唱：烏鶇在天色暗下來之前還有一輪，比白天疏 */
  ...[atParkRing(70, 22), atParkRing(190, 26), atParkRing(310, 18)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-dusk-${index}`,
    activeAt: 'dusk',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '薄暮的晚唱', 'en': 'Evening song' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y + 1,
    mode: { type: 'interval', rangeSecond: [12 + index * 4, 28 + index * 6] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 28,
    variation: { pitchOffsetCent: measureBirdPitch(index + 1) - 20, pitchRangeCent: 40 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 歐亞鴝：白天四隻，短而亮的一句，會換枝 */
  ...[atParkRing(20, 24), atParkRing(115, 12), atParkRing(230, 28), atParkRing(320, 10)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-robin-${index}`,
    activeAt: 'day',
    sound: 'bird-robin',
    title: { 'zh-hant': '歐亞鴝', 'en': 'Robin' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y - 1,
    motion: { type: 'wander', radius: 6, periodSecond: 44 + index * 9, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [14 + index * 4, 40 + index * 6] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 24,
    variation: { pitchOffsetCent: measureBirdPitch(index + 2), pitchRangeCent: 40 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 歌鶇：白天三隻在高一點的樹冠，一句話反覆說兩三遍 */
  ...[atParkRing(80, 18), atParkRing(175, 30), atParkRing(290, 22)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-thrush-${index}`,
    activeAt: 'day',
    sound: 'bird-song-thrush',
    title: { 'zh-hant': '歌鶇', 'en': 'Song thrush' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y + 2,
    mode: { type: 'interval', rangeSecond: [20 + index * 6, 56 + index * 10] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 26,
    variation: { pitchOffsetCent: measureBirdPitch(index + 4), pitchRangeCent: 40 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 拂曉的底：鄉間黎明多種鳥疊在一起的那一片，園子裡鋪五處，只在拂曉 */
  ...[atParkRing(0, 0), atParkRing(40, 26), atParkRing(130, 26), atParkRing(220, 26), atParkRing(310, 26)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-dawn-bed-${index}`,
    activeAt: 'dawn',
    sound: 'bird-dawn-chorus',
    title: { 'zh-hant': '拂曉的合唱', 'en': 'Dawn chorus' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y + 2,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 8,
    maxDistance: 30,
    /** 五處的音高照 id 錯開一點：十四秒的循環鋪成一片，同音高會聽出週期 */
    variation: { pitchRangeCent: 50 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 夜鶯：入夜後才開口，園子四角各一隻，一句一句隔著唱；拂曉還有兩隻沒停 */
  ...[
    { ...atParkRing(35, 28), activeAt: 'night' as const },
    { ...atParkRing(145, 22), activeAt: 'night' as const },
    { ...atParkRing(215, 30), activeAt: 'night' as const },
    { ...atParkRing(325, 20), activeAt: 'night' as const },
    { ...atParkRing(100, 16), activeAt: 'dawn' as const },
    { ...atParkRing(265, 14), activeAt: 'dawn' as const },
  ].map(({ activeAt, ...position }, index): SoundEmitterDefinition => ({
    id: `songbird-realm-nightingale-${index}`,
    activeAt,
    sound: 'bird-nightingale',
    title: { 'zh-hant': '夜鶯', 'en': 'Nightingale' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y - 2,
    mode: { type: 'interval', rangeSecond: [16 + index * 5, 46 + index * 8] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 28,
    variation: { pitchOffsetCent: measureBirdPitch(index + 6), pitchRangeCent: 40, volumeDropRatio: 0.3 },
    isFiller: true,
  })),
  {
    /**
     * 椋鳥群：晨昏在北邊樹冠上空（畫面上的群舞就在那個方位，見 songbird-murmuration）
     *
     * 只在太陽貼著地平線那一段出聲，與天上那一團鳥同進同退
     */
    id: 'songbird-realm-starling-flock',
    activeAt: 'twilight',
    sound: 'bird-starling-flock',
    title: { 'zh-hant': '椋鳥群', 'en': 'Starling flock' },
    zone: 'songbird',
    x: SONGBIRD_CENTER.x - 10,
    z: SONGBIRD_CENTER.z - 28,
    y: 30,
    motion: { type: 'wander', radius: 10, periodSecond: 70, riseHeight: 3 },
    mode: { type: 'interval', rangeSecond: [30, 80] },
    volume: 0.7,
    minDistance: 16,
    maxDistance: 80,
    variation: { pitchRangeCent: 60, volumeDropRatio: 0.3 },
    isFiller: true,
  },
  /** 夜裡多出來的梟：東邊兩隻，各有各的音高與節奏 */
  ...[atParkRing(0, 26), atParkRing(60, 30)].map((position, index): SoundEmitterDefinition => ({
    id: `songbird-realm-owl-fill-${index}`,
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '架上的夜梟', 'en': 'Owl on the perch' },
    zone: 'songbird',
    ...position,
    y: PERCH_Y + (index % 2) * 2,
    mode: { type: 'interval', rangeSecond: [24 + index * 7, 58 + index * 11] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 26,
    variation: { pitchOffsetCent: [-90, 70, -30, 110][index] ?? 0, pitchRangeCent: 30, volumeDropRatio: 0.35 },
    isFiller: true,
  })),
  /** 夜裡飲水盤邊的水鳥：三個盤各一隻，一兩分鐘才一聲 */
  ...[BASIN_LIST[0]!, BASIN_LIST[3]!, BASIN_LIST[5]!].map((basin, index): SoundEmitterDefinition => ({
    id: `songbird-realm-night-moorhen-${index}`,
    activeAt: 'night',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '飲水的水鳥', 'en': 'Bird at the basin' },
    zone: 'songbird',
    x: basin.x + 1,
    z: basin.z + 1,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [50 + index * 20, 120 + index * 30] },
    volume: 0.4,
    minDistance: 3,
    maxDistance: 18,
    variation: { pitchOffsetCent: -80 + index * 60, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
]
