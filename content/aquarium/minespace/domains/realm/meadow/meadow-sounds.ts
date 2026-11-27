import type { SoundEmitterDefinition } from '../../soundscape/type'
import { MEADOW_CENTER } from './meadow-layout'

/** 某個方位（度）上離原野中心 radius 格 */
function atMeadowRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: MEADOW_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: MEADOW_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/** 一圈 count 顆、從 startDegree 起等距排開 */
function createRing(count: number, radius: number, startDegree: number): { x: number; z: number }[] {
  return Array.from({ length: count }, (_, index) => atMeadowRing(startDegree + (index * 360) / count, radius))
}

/**
 * 野花原的音源
 *
 * 草苑三種聲音：草原的風（開闊而柔，兩顆）、白天草上稀稀落落的蚱蜢、入夜整片的蟋蟀。
 * 這裡照搬，風鋪滿整片原野（中心一顆、內外兩圈），走到哪裡都是同一陣柔風；
 * 蚱蜢散在花叢裡、慢慢飄，走過去一處一處經過；夜裡的蟋蟀多幾顆、範圍拉寬，整片地一起響。
 * 全沿用草苑的音檔與名稱
 */
export const MEADOW_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 草原的風：每顆管二十多格，高高地掠過丘頂 */
  ...[atMeadowRing(0, 0), ...createRing(6, 26, 30), ...createRing(8, 52, 0)].map((position, index): SoundEmitterDefinition => ({
    id: `meadow-downs-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '草原的風', 'en': 'Wind over the meadow' },
    zone: 'meadow',
    ...position,
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 8,
    maxDistance: 30,
  })),
  /** 日頭下的草蟲：散在花叢裡，飄得很淺 */
  ...[...createRing(3, 16, 60), ...createRing(5, 40, 10)].map((position, index): SoundEmitterDefinition => ({
    id: `meadow-downs-insect-${index}`,
    activeAt: 'day',
    sound: 'meadow-insect',
    title: { 'zh-hant': '日頭下的草蟲', 'en': 'Grasshoppers in the sun' },
    zone: 'meadow',
    ...position,
    heightOffset: 1,
    motion: { type: 'wander', radius: 5, periodSecond: 34 + index * 5 },
    mode: { type: 'loop' },
    volume: 0.32,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),
  /** 草間的蟲聲：入夜整片地一起響 */
  ...[atMeadowRing(0, 0), ...createRing(6, 34, 0)].map((position, index): SoundEmitterDefinition => ({
    id: `meadow-downs-night-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '草間的蟲聲', 'en': 'Crickets across the meadow' },
    zone: 'meadow',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.42,
    minDistance: 5,
    maxDistance: 24,
    silentInRain: true,
  })),
]
