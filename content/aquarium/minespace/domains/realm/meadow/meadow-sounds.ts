import type { SoundEmitterDefinition } from '../../soundscape/type'
import { MEADOW_CENTER, MEADOW_HOLLOW_LIST, MEADOW_SLOW_RADIUS } from './meadow-layout'

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

/** 原野裡間隔 spacing 格的一片網格點（奇數列錯開半格），只留在 radius 以內 */
function createGridPointList(spacing: number, radius: number): { x: number; z: number }[] {
  const pointList: { x: number; z: number }[] = []
  const count = Math.ceil(radius / spacing)
  for (let row = -count; row <= count; row++) {
    const shift = row % 2 === 0 ? 0 : spacing / 2
    for (let column = -count; column <= count; column++) {
      const x = Math.round(column * spacing + shift)
      const z = Math.round(row * spacing * 0.87)
      if (Math.hypot(x, z) <= radius)
        pointList.push({ x: MEADOW_CENTER.x + x, z: MEADOW_CENTER.z + z })
    }
  }
  return pointList
}

/** 夜裡的合唱：每二十格一顆，鋪滿走得到的原野 */
const NIGHT_CHORUS_POINT_LIST = createGridPointList(20, MEADOW_SLOW_RADIUS - 8)

/** 獨奏：原野裡散兩圈，乾土窪地各一隻（石縫與仙人掌底下） */
const SOLO_POINT_LIST = [
  ...[15, 75, 135, 195, 255, 315].map((degree) => atMeadowRing(degree, 26)),
  ...[45, 117, 189, 261, 333].map((degree) => atMeadowRing(degree, 46)),
  ...MEADOW_HOLLOW_LIST.map((hollow) => ({ x: hollow.x, z: hollow.z })),
]

/**
 * 風露原的音源
 *
 * 風露苑的日夜分工照搬到整片原野：
 * 草原的風鋪滿整片（中心一顆、內外兩圈），日夜都在，高高地掠過丘頂；
 * 白天是散在花叢裡、慢慢飄的蚱蜢；一入夜蚱蜢歇了，蟋蟀與螽斯交錯鋪滿（頻段錯開才不會糊成一團），
 * 再撒十幾隻獨奏給前後景。全沿用兩座箱庭的音檔與數字
 */
export const MEADOW_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 草原的風：每顆管二十多格 */
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
  ...[...createRing(3, 16, 60), ...createRing(5, 38, 10), ...createRing(6, 56, 40)].map((position, index): SoundEmitterDefinition => ({
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
  /** 夜裡的合唱：蟋蟀與螽斯交錯鋪滿 */
  ...NIGHT_CHORUS_POINT_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `meadow-downs-night-chorus-${index}`,
    sound: index % 2 === 0 ? 'insect-cricket' : 'insect-bush-cricket',
    activeAt: 'night',
    title: { 'zh-hant': '入夜的合唱', 'en': 'Chorus after dark' },
    zone: 'meadow',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
    silentInRain: true,
  })),
  /** 底層之上的獨奏，讓那片合唱有前後景 */
  ...SOLO_POINT_LIST.map((position, index): SoundEmitterDefinition => {
    const isCricket = index % 2 === 0
    return {
      id: `meadow-downs-solo-${index}`,
      activeAt: 'night',
      sound: isCricket ? 'insect-cricket' : 'insect-bush-cricket',
      title: isCricket
        ? { 'zh-hant': '近處的蟋蟀', 'en': 'Cricket nearby' }
        : { 'zh-hant': '灌叢螽斯', 'en': 'Bush cricket' },
      zone: 'meadow',
      ...position,
      heightOffset: 1,
      mode: { type: 'interval', rangeSecond: isCricket ? [12, 30] : [14, 32] },
      volume: 0.5,
      minDistance: 3,
      maxDistance: 20,
      silentInRain: true,
    }
  }),
]
