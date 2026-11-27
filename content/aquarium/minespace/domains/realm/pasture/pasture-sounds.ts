import type { SoundEmitterDefinition } from '../../soundscape/type'
import { PASTURE_REALM_CENTER, PASTURE_SHEEP_FLOCK } from './pasture-layout'

/** 某個方位（度）上離谷底中心 radius 格 */
function atPastureRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: PASTURE_REALM_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: PASTURE_REALM_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/**
 * 羊鳴谷的音源
 *
 * 牧野兩種聲音：白天的羊群（跟著羊慢慢挪位置）、入夜草間的蟲。
 * 這裡照搬：羊群大了，叫聲分成三顆，散在放羊那一圈裡各自慢慢走，
 * 站在柵欄邊聽得出叫聲從不同的羊那裡來；夜裡羊趴下睡了，換成谷底與兩側坡上的蟲聲。
 * 全沿用牧野的音檔與名稱
 */
export const PASTURE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 牧場羊群：三顆在放羊那一圈裡，走得很慢，一分鐘才換完一趟 */
  ...[
    { x: PASTURE_SHEEP_FLOCK.centerX - 5, z: PASTURE_SHEEP_FLOCK.centerZ - 4 },
    { x: PASTURE_SHEEP_FLOCK.centerX + 5, z: PASTURE_SHEEP_FLOCK.centerZ - 2 },
    { x: PASTURE_SHEEP_FLOCK.centerX, z: PASTURE_SHEEP_FLOCK.centerZ + 5 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `pasture-vale-sheep-${index}`,
    activeAt: 'day',
    sound: 'village-sheep',
    title: { 'zh-hant': '牧場羊群', 'en': 'Sheep in the pasture' },
    zone: 'pasture',
    ...position,
    heightOffset: 1,
    motion: { type: 'wander', radius: 6, periodSecond: 62 + index * 9 },
    mode: { type: 'interval', rangeSecond: [12, 30] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 28,
  })),
  /** 夜草間的蟲：谷底一顆、往外一圈 */
  ...[atPastureRing(0, 0), ...[20, 80, 140, 200, 260, 320].map((degree) => atPastureRing(degree, 30))].map((position, index): SoundEmitterDefinition => ({
    id: `pasture-vale-night-insect-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '夜草間的蟲', 'en': 'Crickets in the night grass' },
    zone: 'pasture',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 4,
    maxDistance: 20,
    silentInRain: true,
  })),
]
