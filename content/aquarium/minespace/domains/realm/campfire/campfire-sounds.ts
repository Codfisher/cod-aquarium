import type { SoundEmitterDefinition } from '../../soundscape/type'
import { CAMP_CENTER, CAMP_FIRE_LIST, HOMESTEAD_POINT, PRAIRIE_RADIUS, ROCK_WALL_RADIUS } from './campfire-layout'

/**
 * 拓荒原的音源
 *
 * 爐火壇只有一種聲音：一團持續的低頻劈啪。這裡把它留在篷車邊那堆煮飯的小火上（走進篷車圈就聽得到），
 * 外圍守夜的兩堆各一顆、更小聲；其餘全用現成的音檔：
 * - 乾草原上的風（meadow-wind 那段「草原的風」，壓低音量）一圈鋪開，原野哪裡都有一點
 * - 紅岩壁腳一圈很輕的「山稜的風」，越往外走風越硬
 * - 入夜草裡的蟲
 * - 夜裡久久一聲遠遠的嚎（雪稜那隻狼，擺在岩壁外，當成荒野裡的郊狼）
 */

function atCampRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: CAMP_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: CAMP_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

export const CAMPFIRE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...CAMP_FIRE_LIST.map((fire, index): SoundEmitterDefinition => ({
    id: fire.isCookFire ? 'frontier-cook-fire' : `frontier-outrider-fire-${index}`,
    sound: 'campfire',
    title: fire.isCookFire
      ? { 'zh-hant': '篷車邊的柴火', 'en': 'Cooking fire by the wagons' }
      : { 'zh-hant': '守夜的小火', 'en': 'Outrider\'s small fire' },
    zone: 'campfire',
    x: fire.x,
    z: fire.z,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: fire.isCookFire ? 0.85 : 0.6,
    minDistance: 2,
    maxDistance: fire.isCookFire ? 20 : 13,
  })),
  ...[
    atCampRing(0, 0),
    ...[30, 90, 150, 210, 270, 330].map((degree) => atCampRing(degree, 34)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-prairie-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '乾草原的風', 'en': 'Wind over the dry prairie' },
    zone: 'campfire',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 6,
    maxDistance: 26,
  })),
  ...[45, 135, 225, 315].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-rim-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '岩壁腳的風', 'en': 'Wind at the red cliffs' },
    zone: 'campfire',
    ...atCampRing(degree, PRAIRIE_RADIUS + 4),
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.2,
    minDistance: 6,
    maxDistance: 22,
  })),
  ...[
    atCampRing(70, 18),
    atCampRing(200, 22),
    atCampRing(300, 26),
    { x: HOMESTEAD_POINT.x + 4, z: HOMESTEAD_POINT.z + 6 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '草裡的蟲', 'en': 'Crickets in the dry grass' },
    zone: 'campfire',
    ...position,
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 4,
    maxDistance: 20,
  })),
  ...[200, 20].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-coyote-${index}`,
    activeAt: 'night',
    sound: 'beast-wolf',
    title: { 'zh-hant': '荒野上的嚎', 'en': 'A far howl on the plains' },
    zone: 'campfire',
    ...atCampRing(degree, ROCK_WALL_RADIUS + 6),
    heightOffset: 8,
    mode: { type: 'interval', rangeSecond: [140 + index * 50, 340 + index * 60] },
    volume: 0.6,
    minDistance: 14,
    maxDistance: 90,
  })),
]
