import { PartCategory } from '../../types'
import type { PartDefinition } from '../../types'

// --- 攻擊環 ---

export const attackRingPartList: PartDefinition[] = [
  {
    id: 'jagged',
    name: { 'zh-hant': '鋸齒環', 'en': 'Jagged Ring' },
    category: PartCategory.ATTACK_RING,
    statsModifier: { attack: 8, defense: 2, stamina: 3, speed: 5 },
    collisionRadius: 0.55,
    visualParams: { toothCount: 12, toothHeight: 0.15 },
  },
  {
    id: 'smooth',
    name: { 'zh-hant': '圓滑環', 'en': 'Smooth Ring' },
    category: PartCategory.ATTACK_RING,
    statsModifier: { attack: 3, defense: 6, stamina: 6, speed: 4 },
    collisionRadius: 0.5,
    visualParams: { toothCount: 0, toothHeight: 0 },
  },
  {
    id: 'triangle',
    name: { 'zh-hant': '三角環', 'en': 'Triangle Ring' },
    category: PartCategory.ATTACK_RING,
    statsModifier: { attack: 10, defense: 1, stamina: 2, speed: 6 },
    collisionRadius: 0.6,
    visualParams: { toothCount: 3, toothHeight: 0.25 },
  },
  {
    id: 'hexWing',
    name: { 'zh-hant': '六翼環', 'en': 'Hex Wing Ring' },
    category: PartCategory.ATTACK_RING,
    statsModifier: { attack: 5, defense: 4, stamina: 5, speed: 3 },
    collisionRadius: 0.55,
    visualParams: { toothCount: 6, toothHeight: 0.2 },
  },
] as const

// --- 重量盤 ---

export const weightDiskPartList: PartDefinition[] = [
  {
    id: 'heavy',
    name: { 'zh-hant': '重力盤', 'en': 'Heavy Disk' },
    category: PartCategory.WEIGHT_DISK,
    statsModifier: { attack: 2, defense: 9, stamina: 2, speed: 2 },
    visualParams: { diameter: 1.0, height: 0.2, outerThickness: 0.3 },
  },
  {
    id: 'light',
    name: { 'zh-hant': '輕量盤', 'en': 'Light Disk' },
    category: PartCategory.WEIGHT_DISK,
    statsModifier: { attack: 3, defense: 2, stamina: 5, speed: 8 },
    visualParams: { diameter: 0.7, height: 0.1, outerThickness: 0.1 },
  },
  {
    id: 'balanced',
    name: { 'zh-hant': '平衡盤', 'en': 'Balanced Disk' },
    category: PartCategory.WEIGHT_DISK,
    statsModifier: { attack: 4, defense: 5, stamina: 5, speed: 5 },
    visualParams: { diameter: 0.85, height: 0.15, outerThickness: 0.2 },
  },
  {
    id: 'eccentric',
    name: { 'zh-hant': '偏心盤', 'en': 'Eccentric Disk' },
    category: PartCategory.WEIGHT_DISK,
    statsModifier: { attack: 6, defense: 3, stamina: 3, speed: 7 },
    visualParams: { diameter: 0.9, height: 0.15, offsetX: 0.1 },
  },
] as const

// --- 軸心 ---

export const spinTipPartList: PartDefinition[] = [
  {
    id: 'sharp',
    name: { 'zh-hant': '尖銳軸', 'en': 'Sharp Tip' },
    category: PartCategory.SPIN_TIP,
    statsModifier: { attack: 3, defense: 1, stamina: 9, speed: 7 },
    frictionCoefficient: 0.2,
    visualParams: { topDiameter: 0.15, bottomDiameter: 0.02, tipHeight: 0.4 },
  },
  {
    id: 'flat',
    name: { 'zh-hant': '平坦軸', 'en': 'Flat Tip' },
    category: PartCategory.SPIN_TIP,
    statsModifier: { attack: 2, defense: 8, stamina: 3, speed: 2 },
    frictionCoefficient: 0.8,
    visualParams: { topDiameter: 0.2, bottomDiameter: 0.2, tipHeight: 0.2 },
  },
  {
    id: 'ball',
    name: { 'zh-hant': '球形軸', 'en': 'Ball Tip' },
    category: PartCategory.SPIN_TIP,
    statsModifier: { attack: 3, defense: 4, stamina: 6, speed: 5 },
    frictionCoefficient: 0.5,
    visualParams: { topDiameter: 0.2, bottomDiameter: 0.15, tipHeight: 0.25 },
  },
  {
    id: 'spring',
    name: { 'zh-hant': '彈簧軸', 'en': 'Spring Tip' },
    category: PartCategory.SPIN_TIP,
    statsModifier: { attack: 1, defense: 7, stamina: 5, speed: 4 },
    frictionCoefficient: 0.6,
    visualParams: { topDiameter: 0.2, bottomDiameter: 0.1, tipHeight: 0.35 },
  },
] as const
