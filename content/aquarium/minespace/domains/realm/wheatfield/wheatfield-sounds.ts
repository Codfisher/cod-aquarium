import type { SoundEmitterDefinition } from '../../soundscape/type'
import { WHEATFIELD_CENTER } from './wheatfield-layout'

/** 某個方位（度）上離麥田中心 radius 格 */
function atWheatfieldRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: WHEATFIELD_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: WHEATFIELD_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/** 一圈 count 顆、從 startDegree 起等距排開 */
function createRing(count: number, radius: number, startDegree: number): { x: number; z: number }[] {
  return Array.from({ length: count }, (_, index) => atWheatfieldRing(startDegree + (index * 360) / count, radius))
}

/**
 * 千頃麥浪的音源
 *
 * 麥浪田只有一種聲音：麥稈根部互相摩擦的風聲，四顆圍在田裡、及腰的高度，
 * 風從一邊掃到另一邊，走在田裡聽得出方向。這裡照搬，鋪滿整片田：
 * 中心一顆、往外三圈，每顆管二十格上下，走到哪裡腳邊都是麥浪，相鄰兩顆的方向也不一樣。
 * 沒有加別的聲音：麥浪田是全庭最單純的一座，放大之後仍只有風與麥
 */
export const WHEATFIELD_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  atWheatfieldRing(0, 0),
  ...createRing(6, 22, 0),
  ...createRing(10, 46, 18),
  ...createRing(12, 70, 0),
].map((position, index): SoundEmitterDefinition => ({
  id: `wheatfield-sea-rustle-${index}`,
  sound: 'wheat-wind',
  title: { 'zh-hant': '麥稈摩擦', 'en': 'Wheat stalks rubbing' },
  zone: 'wheatfield',
  ...position,
  /** 及腰的高度，聲音要從麥子那一層來 */
  heightOffset: 2,
  mode: { type: 'loop' },
  volume: 0.42,
  minDistance: 6,
  maxDistance: 20,
}))
