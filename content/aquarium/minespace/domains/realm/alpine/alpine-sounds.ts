import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ALPINE_CENTER, ALPINE_PUSH_RADIUS, ALPINE_SLOW_RADIUS } from './alpine-layout'

/** 稜線上某一點：along 往東南為正、across 往東北為正（與 alpine-layout 同一套座標，不含噪音推移） */
function atRidge(along: number, across: number): { x: number; z: number } {
  return {
    x: Math.round(ALPINE_CENTER.x + (along + across) * Math.SQRT1_2),
    z: Math.round(ALPINE_CENTER.z + (along - across) * Math.SQRT1_2),
  }
}

/** 某個方位（度）上離中心 radius 格 */
function atRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: Math.round(ALPINE_CENTER.x + Math.cos(radian) * radius),
    z: Math.round(ALPINE_CENTER.z + Math.sin(radian) * radius),
  }
}

/**
 * 雪稜的音源
 *
 * 雪稜丘的聲音照搬：稜線上的風、白天的雪雞與鼠兔、夜裡久久一聲的狼嚎，全沿用既有音檔。
 * 雪稜丘的風是中心一顆加外圍一圈；這裡稜線長了好幾倍，沿著稜線排一串，
 * 崖邊再一圈：從崖下吹上來的風，越走近崖邊越響，與推回人的那股風是同一件事。
 *
 * 這裡沒有鄰居要避，所以不走 measureNeighbourLimit；範圍照「站在哪裡該聽到什麼」來給
 */
export const ALPINE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 稜線上的風：沿著稜線五顆，抬高幾格，站在稜上前後都是風 */
  ...[-32, -16, 0, 16, 32].map((along, index): SoundEmitterDefinition => ({
    id: `alpine-ridge-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '山稜的風', 'en': 'Wind along the ridge' },
    zone: 'alpine',
    ...atRidge(along, 0),
    heightOffset: 4,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 8,
    maxDistance: 30,
  })),
  /**
   * 崖邊的風：雪原外圈一圈八顆，擺在減速線與推回線之間
   *
   * 雪坡中段幾乎聽不到，走到外圈風聲就起來了，推回線上最響
   */
  ...[0, 45, 90, 135, 180, 225, 270, 315].map((degree, index): SoundEmitterDefinition => ({
    id: `alpine-cliff-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '山稜的風', 'en': 'Wind along the ridge' },
    zone: 'alpine',
    ...atRing(degree, (ALPINE_SLOW_RADIUS + ALPINE_PUSH_RADIUS) / 2),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 6,
    maxDistance: 28,
  })),
  /** 雪雞：西南雪原的岩邊，從出生點往右前方聽得到 */
  {
    id: 'alpine-snowcock',
    activeAt: 'day',
    sound: 'alpine-snowcock',
    title: { 'zh-hant': '雪雞', 'en': 'Snowcock' },
    zone: 'alpine',
    ...atRidge(14, -30),
    heightOffset: 2,
    motion: { type: 'wander', radius: 6, periodSecond: 70 },
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.7,
    minDistance: 6,
    maxDistance: 30,
  },
  /** 另一隻雪雞在稜線另一側答話，隔著山稜聽是遠的 */
  {
    id: 'alpine-snowcock-far',
    activeAt: 'day',
    sound: 'alpine-snowcock',
    title: { 'zh-hant': '雪雞', 'en': 'Snowcock' },
    zone: 'alpine',
    ...atRidge(-6, 30),
    heightOffset: 2,
    mode: { type: 'interval', rangeSecond: [26, 60] },
    volume: 0.55,
    minDistance: 8,
    maxDistance: 34,
  },
  /** 鼠兔：東北那窪融雪池邊的碎岩裡 */
  {
    id: 'alpine-pika',
    activeAt: 'day',
    sound: 'beast-pika',
    title: { 'zh-hant': '鼠兔', 'en': 'Pika' },
    zone: 'alpine',
    ...atRidge(-16, 32),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [14, 34] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 22,
  },
  /** 西南融雪池邊另一隻鼠兔，出生點走幾步就聽得到 */
  {
    id: 'alpine-pika-west',
    activeAt: 'day',
    sound: 'beast-pika',
    title: { 'zh-hant': '鼠兔', 'en': 'Pika' },
    zone: 'alpine',
    ...atRidge(3, -40),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [16, 40] },
    volume: 0.55,
    minDistance: 4,
    maxDistance: 20,
  },
  /**
   * 稜線上的狼
   *
   * 雪稜丘那一聲擺在木座角上；這裡擺在東南岩峰的峰腳，隔著整道稜線傳過來。
   * 間隔照雪稜丘的兩分半到六分：這種聲音的重量全在稀有
   */
  {
    id: 'alpine-wolf',
    activeAt: 'night',
    sound: 'beast-wolf',
    title: { 'zh-hant': '稜線上的狼嚎', 'en': 'Wolf on the ridge' },
    zone: 'alpine',
    ...atRidge(38, 8),
    heightOffset: 4,
    mode: { type: 'interval', rangeSecond: [150, 360] },
    volume: 0.8,
    minDistance: 14,
    maxDistance: 80,
  },
]
