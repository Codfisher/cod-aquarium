import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  ARCH_Z,
  CHAMBER_RECT,
  CHAMBER_SEEP_POINT,
  COLONNADE_COLUMN_X_LIST,
  HALL_RECT,
  HALL_STELE_POINT,
  RUINS_CENTER,
  RUINS_FOOT_Y,
} from './ruins-layout'

/**
 * 石殿遺址的音源
 *
 * 石廊跡的聲音是「沒有人」：廊間的穿堂風（雪稜那道嘯風壓低音量鋪底）、石縫滲水（洞裡的滴水，拖著長長的殘響）、
 * 入夜後棲在斷樑上的一隻鴞。這裡照搬，全沿用石廊跡的音檔與音量：
 * - 穿堂風沿著長廊、拱門與大殿鋪開，走到哪都在兩排石柱或斷牆之間
 * - 滲水最響的是北端那間石室（牆縫那道細流），大殿裡兩處積水再各一顆
 * - 鴞兩隻：一隻在大殿那排石柱的斷樑上，一隻在長廊的樑上
 */

/** 穿堂風的位置：長廊兩顆、拱門一顆、大殿四顆、石廊跡那一圈一顆 */
const WIND_POSITION_LIST = [
  { x: RUINS_CENTER.x, z: RUINS_CENTER.z + 34 },
  { x: RUINS_CENTER.x, z: RUINS_CENTER.z + 20 },
  { x: RUINS_CENTER.x, z: ARCH_Z },
  { x: HALL_RECT.minX + 8, z: HALL_RECT.minZ + 10 },
  { x: HALL_RECT.maxX - 8, z: HALL_RECT.minZ + 10 },
  { x: HALL_RECT.minX + 8, z: HALL_RECT.maxZ - 10 },
  { x: HALL_RECT.maxX - 8, z: HALL_RECT.maxZ - 10 },
  { ...HALL_STELE_POINT },
]

export const RUINS_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...WIND_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '廊間穿堂風', 'en': 'Wind through the colonnade' },
    zone: 'ruins',
    ...position,
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 4,
    maxDistance: 22,
  })),
  {
    /**
     * 石室裡的滲水
     *
     * 牆縫那道細流就在這裡。四面石牆加一層屋頂，聲音出不去，
     * 走進門就被那一聲一聲的水包住；給的高度是石室地面上兩格，直接寫 y（屋頂會讓自動找地面找到屋頂上去）
     */
    id: 'ruins-temple-seep-chamber',
    sound: 'cave-drip',
    title: { 'zh-hant': '石縫滲水', 'en': 'Water seeping through the stone' },
    zone: 'ruins',
    x: CHAMBER_SEEP_POINT.x,
    z: CHAMBER_SEEP_POINT.z + 1,
    y: RUINS_FOOT_Y + 2,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 16,
  },
  ...[
    { x: HALL_RECT.minX + 6, z: HALL_RECT.minZ + 18 },
    { x: HALL_RECT.maxX - 6, z: HALL_RECT.maxZ - 14 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-seep-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '石縫滲水', 'en': 'Water seeping through the stone' },
    zone: 'ruins',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 3,
    maxDistance: 16,
  })),
  ...[
    { x: HALL_RECT.minX + 10, z: HALL_RECT.minZ + 18, heightOffset: 8 },
    { x: COLONNADE_COLUMN_X_LIST[1], z: RUINS_CENTER.z + 24, heightOffset: 7 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `ruins-temple-owl-${index}`,
    activeAt: 'night',
    sound: 'bird-owl',
    title: { 'zh-hant': '棲在斷樑的鴞', 'en': 'Owl on the broken beam' },
    zone: 'ruins',
    ...position,
    mode: { type: 'interval', rangeSecond: [26 + index * 9, 62 + index * 14] },
    volume: 0.7,
    minDistance: 5,
    maxDistance: 24,
  })),
  {
    /** 石室正中再一顆很輕的風，從門口灌進去在裡面打轉，石室才不是一片死寂 */
    id: 'ruins-temple-chamber-air',
    sound: 'alpine-wind',
    title: { 'zh-hant': '石室裡的迴風', 'en': 'Air circling the chamber' },
    zone: 'ruins',
    x: RUINS_CENTER.x,
    z: Math.round((CHAMBER_RECT.minZ + CHAMBER_RECT.maxZ) / 2),
    y: RUINS_FOOT_Y + 3,
    mode: { type: 'loop' },
    volume: 0.22,
    minDistance: 3,
    maxDistance: 10,
  },
]
