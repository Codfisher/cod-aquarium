import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  CASCADE_X,
  measureStreamZ,
  measureValleyCenterZ,
  PLUNGE_POOL,
  RIVER_LOG_BRIDGE_POINT,
  RIVER_PORTAL_POINT,
  VALLEY_END_X,
  VALLEY_FLOOR_Y,
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
    /**
     * 谷是朝天開的，瀑布的轟聲會從谷裡升上來
     *
     * 爬上谷壁、站在崖頂時，到瀑布的直線整段埋在岩壁裡，原本一上去就完全聽不到（量出來東北那片崖頂是靜的）
     */
    canCarryOverEdge: true,
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
    /** 兩隻水雞一高一低，一來一往才聽得出是兩隻 */
    variation: { pitchOffsetCent: 60, pitchRangeCent: 50 },
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
    variation: { pitchOffsetCent: -70, pitchRangeCent: 50 },
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
    /** 與湖中島是同一段草蟲：調低一點，谷底的夜比湖邊沉 */
    variation: { pitchOffsetCent: -160 },
    silentInRain: true,
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 薄暮：水邊的草蟲在天黑之前先起頭，下游與木橋邊各一叢 */
  ...[
    { x: 178, z: Math.round(measureValleyCenterZ(178) + 7) },
    { x: 140, z: Math.round(measureValleyCenterZ(140) - 7) },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-dusk-cricket-${index}`,
    activeAt: 'dusk',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'river',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 18,
    variation: { pitchOffsetCent: 70 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 夜裡下游多兩叢：原本只有門前與上游北岸，下游整段入夜只剩水聲 */
  ...[
    { x: 188, z: Math.round(measureValleyCenterZ(188) - 6) },
    { x: 150, z: Math.round(measureValleyCenterZ(150) + 8) },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-cricket-fill-${index}`,
    activeAt: 'night',
    /** 與門前、上游那兩叢草蟲不同頻段的一段夏夜蟲鳴，下游的夜因此是另一種質地 */
    sound: 'insect-night-chorus',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'river',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 3,
    maxDistance: 16,
    variation: { pitchOffsetCent: -40 - index * 150 },
    silentInRain: true,
    isFiller: true,
  })),
  /**
   * 崖頂的風：東北那片谷壁爬得上去，上面離瀑布一百格、離溪二十幾格高，原本什麼都聽不到。
   * 借雪稜的嘯風壓低、壓小聲，站上去聽到的是空曠，往下走回谷裡才又是水聲
   */
  ...[{ x: 166, z: 112 }, { x: 180, z: 108 }].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-rim-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '崖頂的風', 'en': 'Wind on the rim' },
    zone: 'river',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.24,
    minDistance: 6,
    maxDistance: 26,
    variation: { pitchOffsetCent: -320 },
    isFiller: true,
  })),
  /**
   * 淺水流過石頭的細碎聲：獨木橋下與下游的淺灘
   *
   * 沿溪那一串是主流的水聲（厚、連續）；這幾處是水淺、石頭露出來的地方，聲音細而碎，
   * 很小聲，站在橋上或蹲到水邊才分得出來
   */
  ...[
    { x: RIVER_LOG_BRIDGE_POINT.x, z: RIVER_LOG_BRIDGE_POINT.z },
    atStream(170),
    atStream(190),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-trickle-${index}`,
    sound: 'river-trickle',
    title: { 'zh-hant': '石間的細流', 'en': 'Water trickling over stones' },
    zone: 'river',
    ...position,
    /** 橋下那一段水面的高度；下游的水面低一兩格，音源就在水面上方一點 */
    y: VALLEY_FLOOR_Y + 1.2,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 2,
    maxDistance: 10,
    variation: { pitchOffsetCent: [0, 90, -80][index] ?? 0 },
    isFiller: true,
  })),
  /** 門前那片草地與北岸的草聲：風吹水邊長草的沙沙聲，很輕；白天離溪遠一點的地方原本只剩遠遠的瀑布 */
  ...[
    { x: RIVER_PORTAL_POINT.x - 4, z: RIVER_PORTAL_POINT.z + 5 },
    { x: RIVER_PORTAL_POINT.x - 16, z: RIVER_PORTAL_POINT.z - 2 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `river-realm-bank-grass-${index}`,
    sound: 'lake-reeds',
    title: { 'zh-hant': '岸邊的草聲', 'en': 'Grass stirring on the bank' },
    zone: 'river',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.24,
    minDistance: 4,
    maxDistance: 18,
    variation: { pitchOffsetCent: index === 0 ? 50 : -90 },
    isFiller: true,
  })),
]
