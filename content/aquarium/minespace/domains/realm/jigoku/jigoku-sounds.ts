import type { SoundEmitterDefinition } from '../../soundscape/type'
import { HOT_POOL_LIST, JIGOKU_CENTER, JIGOKU_FLOOR_Y, measureRiftShape, RIFT_HALF_LENGTH } from './jigoku-layout'

/**
 * 湯煙谷的音源
 *
 * 地獄谷的聲音是「從地底下上來的低頻，黏稠而緩慢」：圍著熔岩縫一圈的熔岩滾沸（貼著縫、高度零，
 * 聲音要從低處來），加上埋在地面下、兩三分鐘才一次的悶響。這裡照搬，全沿用地獄谷的音檔與音量：
 * - 熔岩滾沸沿著整條縫每十格一顆，走在木棧上，縫始終在身邊的同一側滾著
 * - 泥池用同一段滾沸，音量壓低、範圍收小：泥湯也是黏的，只是小一號
 * - 地底的悶響三顆，埋在谷底下三格，各自隔很久才一次，彼此錯開
 */

/** 熔岩縫中心線上每十格一點，兩端收尖的那幾格不放 */
const LAVA_POSITION_LIST = Array.from({ length: 9 }, (_, index) => {
  const offsetX = -RIFT_HALF_LENGTH + 4 + index * 9
  return { x: JIGOKU_CENTER.x + offsetX, z: Math.round(measureRiftShape(offsetX).center) }
})

export const JIGOKU_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...LAVA_POSITION_LIST.map((position, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-churn-${index}`,
    sound: 'jigoku-lava',
    title: { 'zh-hant': '裂縫裡的熔岩', 'en': 'Lava in the fissure' },
    zone: 'jigoku',
    ...position,
    heightOffset: 0,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 3,
    maxDistance: 18,
  })),
  ...HOT_POOL_LIST.filter((pool) => pool.kind === 'mud').map((pool, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-mud-${index}`,
    sound: 'jigoku-lava',
    title: { 'zh-hant': '泥池滾沸', 'en': 'Bubbling mud pot' },
    zone: 'jigoku',
    x: pool.x,
    z: pool.z,
    heightOffset: 0,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 2,
    maxDistance: 10,
  })),
  ...[
    { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z },
    { x: JIGOKU_CENTER.x - 32, z: JIGOKU_CENTER.z - 6 },
    { x: JIGOKU_CENTER.x + 30, z: JIGOKU_CENTER.z + 6 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-rumble-${index}`,
    sound: 'thunder',
    title: { 'zh-hant': '地底的悶響', 'en': 'A rumble from below' },
    zone: 'jigoku',
    ...position,
    /** 埋在地面下，聲音悶在土裡才對；直接給高度，不讓它自動貼到熔岩面上 */
    y: JIGOKU_FLOOR_Y - 3,
    mode: { type: 'interval', rangeSecond: [110 + index * 25, 260 + index * 40] },
    volume: 0.5,
    minDistance: 6,
    maxDistance: 30,
  })),
]
