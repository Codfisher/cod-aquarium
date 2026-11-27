import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ARRIVAL_CLEARING, CICADA_CENTER, SHADE_CLEARING, VERANDA_LIST, WOOD_RADIUS } from './cicada-layout'

/** 林子裡間隔 spacing 格的一片網格點（奇數列錯開半格），只留在 radius 以內 */
function createGridPointList(spacing: number, radius: number): { x: number; z: number }[] {
  const pointList: { x: number; z: number }[] = []
  const count = Math.ceil(radius / spacing)
  for (let row = -count; row <= count; row++) {
    const shift = row % 2 === 0 ? 0 : spacing / 2
    for (let column = -count; column <= count; column++) {
      const x = Math.round(column * spacing + shift)
      const z = Math.round(row * spacing * 0.87)
      if (Math.hypot(x, z) <= radius)
        pointList.push({ x: CICADA_CENTER.x + x, z: CICADA_CENTER.z + z })
    }
  }
  return pointList
}

/**
 * 蟬雨深林的音源
 *
 * 蟬時雨的關鍵是「聽不出有幾隻，也聽不出從哪裡來」：六顆蟬的合唱圍一圈、全掛在樹冠的高度、
 * 範圍互相重疊，方向互相抵消，剩下一片從頭頂壓下來的聲音；再加一隻會動、比別人近的，
 * 整片聲音才有前後景。入夜蟬整片停掉，換蟋蟀接手。
 * 這裡把那一圈鋪成一整片：每十五格一顆合唱掛在蓋子底下，走到哪裡都同時有五六顆進耳朵；
 * 近處的那一隻多放幾隻，夜裡的蟋蟀疏一點。全沿用蟬時雨的音檔與數字
 */
export const CICADA_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 樹冠上的蟬：整片網格，掛在蓋子底下 */
  ...createGridPointList(15, WOOD_RADIUS + 4).map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-chorus-${index}`,
    activeAt: 'day',
    sound: 'insect-cicada',
    title: { 'zh-hant': '樹冠上的蟬', 'en': 'Cicadas in the canopy' },
    zone: 'cicada',
    ...position,
    heightOffset: 8,
    mode: { type: 'loop' },
    volume: 0.85,
    minDistance: 4,
    maxDistance: 18,
    silentInRain: true,
  })),
  /** 近處的一隻：位置會動，飛過去的時候人會下意識抬頭找 */
  ...[
    { x: ARRIVAL_CLEARING.x + 3, z: ARRIVAL_CLEARING.z - 2 },
    { x: SHADE_CLEARING.x - 2, z: SHADE_CLEARING.z },
    { x: CICADA_CENTER.x + 16, z: CICADA_CENTER.z - 8 },
    { x: CICADA_CENTER.x - 20, z: CICADA_CENTER.z + 10 },
    { x: CICADA_CENTER.x + 4, z: CICADA_CENTER.z + 4 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-near-${index}`,
    activeAt: 'day',
    sound: 'insect-cicada',
    title: { 'zh-hant': '近處的一隻', 'en': 'One close by' },
    zone: 'cicada',
    ...position,
    heightOffset: 5,
    motion: { type: 'wander', radius: 4, periodSecond: 52 + index * 9, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.5,
    minDistance: 2,
    maxDistance: 12,
    silentInRain: true,
  })),
  /** 入夜的蟋蟀：兩道緣廊前各一隻，林子裡再疏疏地鋪一片 */
  ...[
    ...VERANDA_LIST.map((veranda) => ({ x: veranda.x, z: veranda.z - 3 })),
    ...createGridPointList(26, WOOD_RADIUS),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-night-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '入夜的蟋蟀', 'en': 'Crickets after dark' },
    zone: 'cicada',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),
]
