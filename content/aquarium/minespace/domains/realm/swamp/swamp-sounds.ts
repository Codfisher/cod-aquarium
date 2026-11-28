import type { SoundEmitterDefinition } from '../../soundscape/type'
import { MARSH_RADIUS, SWAMP_CENTER } from './swamp-layout'

/** 沼澤中心加上偏移的座標 */
function atMarsh(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: SWAMP_CENTER.x + offsetX, z: SWAMP_CENTER.z + offsetZ }
}

/** 某個方位（度）上離沼澤中心 radius 格 */
function atMarshRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return atMarsh(Math.round(Math.cos(radian) * radius), Math.round(Math.sin(radian) * radius))
}

/**
 * 千蛙沼的音源
 *
 * 千蛙沼是蛙聲澤的放大版，聲音也照蛙聲澤：蛙鳴合唱、蟾蜍與一隻池畔的青蛙，全沿用禪庭的音檔。
 * 蛙鳴是會「對話」的聲音：一隻叫完換另一隻。所以合唱分成六片、彼此隔三十格上下，
 * 各管二十六格（與蛙聲澤同一個數字）：站在木棧上同時聽得到一兩片，
 * 一片在左前方、一片在右後方，走過去前面那片越來越近、後面那片沉下去。
 * 蟾蜍與單隻的蛙夾在合唱之間，間歇地叫，像是在回應。
 * 夜裡沼澤外圍的深水上再兩片遠遠的蛙鳴，隔著水傳過來。
 *
 * 這裡沒有鄰居要避（整個場景只有這一片沼澤），所以不走 measureNeighbourLimit。
 *
 * 六片合唱原本白天黑夜一樣響，晝夜沒有對比。蛙是夜裡的動物：
 * 白天那六片壓小聲（稀稀落落的底），入夜在同樣的位置疊上另一層（音高低一點，是另一群、體型大一些的蛙），
 * 兩層加起來才是滿的；薄暮時蟾蜍先叫得勤，是蛙聲漲起來之前的前奏。
 * 白天蘆葦裡有小葦鳽規律的低鳴（夾著葦鶯粗啞的鳴唱），泥灘邊冒著沼氣的大泡；
 * 入夜外圍另有三片樹蛙，音色比沼裡的蛙尖，一低一高疊著
 */

/** 六片合唱的位置，白天的底與夜裡疊上去的那一層共用 */
const CHORUS_POSITION_LIST = [atMarsh(-30, -20), atMarsh(-20, 20), atMarsh(4, -28), atMarsh(4, 4), atMarsh(26, 24), atMarsh(30, -18)]
export const SWAMP_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...CHORUS_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-frog-${index}`,
    sound: 'swamp-frog',
    title: { 'zh-hant': '蛙鳴合唱', 'en': 'Frog chorus' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    /** 白天的底：原本是零點五五，壓下來讓夜裡疊上去的那一層有地方漲 */
    volume: 0.34,
    minDistance: 6,
    maxDistance: 26,
  })),
  ...[atMarsh(-36, 8), atMarsh(12, 30), atMarsh(36, 10)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-toad-${index}`,
    sound: 'frog-toad',
    title: { 'zh-hant': '蟾蜍', 'en': 'Common toad' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
  })),
  ...[atMarsh(-18, -6), atMarsh(-4, 22), atMarsh(22, -8), atMarsh(-8, -32)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-frog-single-${index}`,
    sound: 'frog-single',
    title: { 'zh-hant': '池畔青蛙', 'en': 'Frog by the pond' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [8, 20] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 20,
  })),
  /** 遠處的蛙鳴：擺在沼澤外圍的深水上，從木棧聽是隔著一大片水傳過來的 */
  ...[atMarshRing(40, MARSH_RADIUS + 16), atMarshRing(220, MARSH_RADIUS + 16)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-frog-distant-${index}`,
    activeAt: 'night',
    sound: 'swamp-frog',
    title: { 'zh-hant': '遠處的蛙鳴', 'en': 'Distant frogs' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 12,
    maxDistance: 60,
    silentInRain: true,
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 入夜疊上去的那一層合唱：同樣六片，音高低一點，與白天的底加起來比原本略滿 */
  ...CHORUS_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-frog-night-${index}`,
    activeAt: 'night',
    sound: 'swamp-frog',
    title: { 'zh-hant': '蛙鳴合唱', 'en': 'Frog chorus' },
    zone: 'swamp',
    x: position.x + 3,
    z: position.z - 2,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.44,
    minDistance: 6,
    maxDistance: 28,
    variation: { pitchOffsetCent: -140, pitchRangeCent: 60 },
    isFiller: true,
  })),
  /** 薄暮的蟾蜍：蛙聲漲起來之前，蟾蜍先叫得勤 */
  ...[atMarsh(-10, 10), atMarsh(18, -22), atMarsh(22, 12)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-dusk-toad-${index}`,
    activeAt: 'dusk',
    sound: 'frog-toad',
    title: { 'zh-hant': '蟾蜍', 'en': 'Common toad' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [5 + index * 2, 13 + index * 3] },
    volume: 0.55,
    minDistance: 4,
    maxDistance: 24,
    variation: { pitchOffsetCent: 90 - index * 110, pitchRangeCent: 70 },
    isFiller: true,
  })),
  /**
   * 蘆葦裡的小葦鳽：蛙聲退下去之後，沼澤白天的主角；薄暮還有一隻沒停
   *
   * 牠的叫聲節奏很規律，所以音高只差一點點；三處離得遠，不會聽成同一隻
   */
  ...[
    { ...atMarsh(-14, -14), activeAt: 'day' as const },
    { ...atMarsh(18, 18), activeAt: 'day' as const },
    { ...atMarsh(-24, 6), activeAt: 'dusk' as const },
  ].map(({ activeAt, ...position }, index): SoundEmitterDefinition => ({
    id: `swamp-realm-bittern-${index}`,
    activeAt,
    sound: 'swamp-bittern',
    title: { 'zh-hant': '蘆葦裡的小葦鳽', 'en': 'Little bittern in the reeds' },
    zone: 'swamp',
    ...position,
    heightOffset: 1.5,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: [0, 40, -40][index] ?? 0, pitchRangeCent: 0 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 沼氣的泡：泥灘邊四處，壓低三個半音成沼澤裡慢慢冒上來的大泡，很小聲，走到旁邊才聽得到 */
  ...[atMarsh(-6, 14), atMarsh(14, -6), atMarsh(-26, -8), atMarsh(28, 6)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-mud-bubble-${index}`,
    sound: 'mud-bubbling',
    title: { 'zh-hant': '冒泡的泥灘', 'en': 'Bubbling mud flat' },
    zone: 'swamp',
    ...position,
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.26,
    minDistance: 2,
    maxDistance: 9,
    variation: { pitchOffsetCent: -300, pitchRangeCent: 120 },
    isFiller: true,
  })),
  /** 入夜的樹蛙：沼澤外圍三片，比沼裡的蛙尖細 */
  ...[atMarshRing(100, 34), atMarshRing(200, 30), atMarshRing(330, 34)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-tree-frog-${index}`,
    activeAt: 'night',
    sound: 'frog-tree-chorus',
    title: { 'zh-hant': '外圍的樹蛙', 'en': 'Tree frogs at the edge' },
    zone: 'swamp',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.36,
    minDistance: 5,
    maxDistance: 26,
    variation: { pitchRangeCent: 160 },
    isFiller: true,
  })),
]
