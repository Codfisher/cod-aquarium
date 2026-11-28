import type { SoundEmitterDefinition } from '../../soundscape/type'
import { WHEATFIELD_CENTER, WHEATFIELD_PERCH_POINT } from './wheatfield-layout'

/** 某個方位（度）上離麥田中心 radius 格 */
function atWheatfieldRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: WHEATFIELD_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: WHEATFIELD_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/** 一圈 count 顆、從 startDegree 起等距排開 */
function createRing(count: number, radius: number, startDegree: number): { x: number; z: number }[] {
  return Array.from({ length: count }, (_, index) => atWheatfieldRing(startDegree + (index * 360) / count, radius))
}

/**
 * 千頃麥浪的音源
 *
 * 麥浪田只有一種聲音：麥稈根部互相摩擦的風聲，四顆圍在田裡、及腰的高度，
 * 風從一邊掃到另一邊，走在田裡聽得出方向。這裡照搬，鋪滿整片田：
 * 中心一顆、往外三圈，每顆管二十格上下，走到哪裡腳邊都是麥浪，相鄰兩顆的方向也不一樣。
 * 沒有加別的聲音：麥浪田是全庭最單純的一座，放大之後仍只有風與麥。
 *
 * 只有一種聲音，但不該是一片不會動的聲音：畫面上麥浪是一道一道掃過去的。
 * 所以另外放幾陣會走的風（同一段錄音壓低一點、大聲一點），慢慢在田上繞大圈，
 * 掃到身邊時麥聲漲起來、過去了又退回原本那片底。
 *
 * 風與麥之外只多兩個點，都是白天、都很疏，而且各自一顆、要拿掉很容易：
 * 田埂那棵枯樹上的烏鴉（畫面上本來就有那棵「烏鴉歇腳的枯樹」，卻沒有烏鴉的聲音），
 * 與頭頂很高的地方一隻雲雀。麥浪田原本刻意只有一種聲音，這兩顆若覺得破壞了那份單純，刪掉即可
 */
export const WHEATFIELD_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...[
    atWheatfieldRing(0, 0),
    ...createRing(6, 22, 0),
    ...createRing(10, 46, 18),
    ...createRing(12, 70, 0),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `wheatfield-sea-rustle-${index}`,
    sound: 'wheat-wind',
    title: { 'zh-hant': '麥稈摩擦', 'en': 'Wheat stalks rubbing' },
    zone: 'wheatfield',
    ...position,
    /** 及腰的高度，聲音要從麥子那一層來 */
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.42,
    minDistance: 6,
    maxDistance: 20,
  })),
  /** 掃過麥田的一陣（補底的音源，神遊不拿它們當停留點） */
  ...[...createRing(3, 20, 40), ...createRing(4, 50, 10)].map((position, index): SoundEmitterDefinition => ({
    id: `wheatfield-sea-gust-${index}`,
    sound: 'wheat-wind',
    title: { 'zh-hant': '掃過麥田的風', 'en': 'A gust sweeping the wheat' },
    zone: 'wheatfield',
    ...position,
    heightOffset: 3,
    motion: { type: 'orbit', radius: 16, periodSecond: 84 + index * 17, riseHeight: 1 },
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 5,
    maxDistance: 22,
    variation: { pitchOffsetCent: -220, pitchRangeCent: 70 },
    isFiller: true,
  })),
  {
    /**
     * 枯樹上的烏鴉：樹頂那一截枯枝上，兩三分鐘啼三聲
     *
     * 音量與範圍都壓在麥浪之下（麥稈 0.42、掃過的那一陣 0.6）：走近枯樹才聽得清楚，
     * 在田裡遠遠的只是麥聲底下的一點，不能蓋過麥浪
     */
    id: 'wheatfield-sea-crow',
    activeAt: 'day',
    sound: 'bird-crow',
    title: { 'zh-hant': '枯樹上的烏鴉', 'en': 'Crow on the dead tree' },
    zone: 'wheatfield',
    x: WHEATFIELD_PERCH_POINT.x,
    z: WHEATFIELD_PERCH_POINT.z,
    /** 樹幹頂上半格（枯樹六格高），自動貼地也會落在這裡，寫明比較清楚 */
    heightOffset: 0.5,
    mode: { type: 'interval', rangeSecond: [100, 240] },
    volume: 0.28,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchRangeCent: 60, volumeDropRatio: 0.35 },
    isFiller: true,
  },
  {
    /**
     * 高空的雲雀：田中央上空繞大圈，邊飛邊唱
     *
     * 牠是一段不停的循環，所以壓得很輕（麥稈的三分之一）：要靜下來才分得出頭頂有鳥，不能蓋過麥浪
     */
    id: 'wheatfield-sea-skylark',
    activeAt: 'day',
    sound: 'bird-skylark',
    title: { 'zh-hant': '高空的雲雀', 'en': 'Skylark high overhead' },
    zone: 'wheatfield',
    ...atWheatfieldRing(200, 14),
    heightOffset: 24,
    motion: { type: 'orbit', radius: 22, periodSecond: 190, riseHeight: 4 },
    mode: { type: 'loop' },
    volume: 0.14,
    minDistance: 16,
    maxDistance: 56,
    variation: { pitchOffsetCent: 40, pitchRangeCent: 0 },
    isFiller: true,
  },
]
