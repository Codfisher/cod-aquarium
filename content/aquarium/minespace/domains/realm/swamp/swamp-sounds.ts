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
 * 這裡沒有鄰居要避（整個場景只有這一片沼澤），所以不走 measureNeighbourLimit
 */
export const SWAMP_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...[atMarsh(-30, -20), atMarsh(-20, 20), atMarsh(4, -28), atMarsh(4, 4), atMarsh(26, 24), atMarsh(30, -18)].map((position, index): SoundEmitterDefinition => ({
    id: `swamp-realm-frog-${index}`,
    sound: 'swamp-frog',
    title: { 'zh-hant': '蛙鳴合唱', 'en': 'Frog chorus' },
    zone: 'swamp',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
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
]
