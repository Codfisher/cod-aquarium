import type { SoundEmitterDefinition } from '../../soundscape/type'
import { BASIN_LIST, PARK_RADIUS, SONGBIRD_CENTER } from './songbird-layout'

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
 * 夜裡三隻貓頭鷹。全沿用鳴禽庭的音檔與數字
 */
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
    heightOffset: 5,
    motion: { type: 'wander', radius: 7, periodSecond: 40 + index * 7, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [7, 18] },
    volume: 0.8,
    minDistance: 4,
    maxDistance: 24,
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
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [9, 24] },
    volume: 0.75,
    minDistance: 4,
    maxDistance: 24,
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
    heightOffset: 5,
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.7,
    minDistance: 4,
    maxDistance: 24,
    activeAt: 'night',
  })),
]
