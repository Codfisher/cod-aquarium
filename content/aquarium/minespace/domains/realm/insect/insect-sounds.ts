import type { SoundEmitterDefinition } from '../../soundscape/type'
import { INSECT_CENTER, MEADOW_RADIUS, SAND_PATCH_LIST } from './insect-layout'

/**
 * 蟲鳴夜原的音源
 *
 * 蟲聲叢的日夜是：白天兩顆稀疏的日行草蟲當背景，夜裡蟋蟀與螽斯兩顆迴圈當底、
 * 兩聲獨奏點綴，人走進去在夜裡被整片蟲聲包住。這裡照搬，鋪滿整片草原：
 * 夜裡的合唱每十六格一顆，蟋蟀與螽斯交錯（頻段錯開才不會糊成一團），
 * 再撒十來隻獨奏給前後景；白天的日行草蟲疏一倍。全沿用蟲聲叢的音檔與數字
 */

/** 草原裡間隔 spacing 格的一片網格點（奇數列錯開半格），只留在 radius 以內 */
function createGridPointList(spacing: number, radius: number): { x: number; z: number }[] {
  const pointList: { x: number; z: number }[] = []
  const count = Math.ceil(radius / spacing)
  for (let row = -count; row <= count; row++) {
    const shift = row % 2 === 0 ? 0 : spacing / 2
    for (let column = -count; column <= count; column++) {
      const x = Math.round(column * spacing + shift)
      const z = Math.round(row * spacing * 0.87)
      if (Math.hypot(x, z) <= radius)
        pointList.push({ x: INSECT_CENTER.x + x, z: INSECT_CENTER.z + z })
    }
  }
  return pointList
}

/** 某個方位（度）上離草原中心 radius 格 */
function atMeadowRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: INSECT_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: INSECT_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

const NIGHT_CHORUS_POINT_LIST = createGridPointList(16, MEADOW_RADIUS - 4)
const DAY_CHORUS_POINT_LIST = createGridPointList(26, MEADOW_RADIUS - 6)

/** 獨奏：草原裡散一圈，乾土窪地各一隻（石縫與仙人掌底下） */
const SOLO_POINT_LIST = [
  ...[15, 75, 135, 195, 255, 315].map((degree) => atMeadowRing(degree, 24)),
  ...[45, 165, 285].map((degree) => atMeadowRing(degree, 36)),
  ...SAND_PATCH_LIST.map((patch) => ({ x: patch.x, z: patch.z })),
]

export const INSECT_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 白天：稀疏的日行草蟲，讓位給夜裡那一片 */
  ...DAY_CHORUS_POINT_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `insect-realm-day-chorus-${index}`,
    sound: 'meadow-insect',
    activeAt: 'day',
    title: { 'zh-hant': '日行的草蟲', 'en': 'Daytime insects' },
    zone: 'insect',
    ...position,
    heightOffset: 1,
    volume: 0.26,
    mode: { type: 'loop' },
    minDistance: 4,
    maxDistance: 18,
    silentInRain: true,
  })),
  /** 夜裡的合唱：蟋蟀與螽斯交錯鋪滿 */
  ...NIGHT_CHORUS_POINT_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `insect-realm-night-chorus-${index}`,
    sound: index % 2 === 0 ? 'insect-cricket' : 'insect-bush-cricket',
    activeAt: 'night',
    title: { 'zh-hant': '入夜的合唱', 'en': 'Chorus after dark' },
    zone: 'insect',
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
      id: `insect-realm-solo-${index}`,
      activeAt: 'night',
      sound: isCricket ? 'insect-cricket' : 'insect-bush-cricket',
      title: isCricket
        ? { 'zh-hant': '近處的蟋蟀', 'en': 'Cricket nearby' }
        : { 'zh-hant': '灌叢螽斯', 'en': 'Bush cricket' },
      zone: 'insect',
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
