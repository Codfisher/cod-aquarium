import type { SoundEmitterDefinition } from '../../soundscape/type'
import { CLOISTER_OUTER_RECT, CLOISTER_WIDTH, COURTYARD_POOL, HALL_RECT, RAINHALL_CENTER } from './rainhall-layout'

/** 院子中心加上偏移的座標 */
function atCourt(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: RAINHALL_CENTER.x + offsetX, z: RAINHALL_CENTER.z + offsetZ }
}

/** 迴廊走道正中那一條線（離外牆兩格） */
const CLOISTER_LANE_X = CLOISTER_OUTER_RECT.minX + 2
const CLOISTER_LANE_Z = CLOISTER_OUTER_RECT.maxZ - 2
/** 迴廊出簷那一條線（滴水線） */
const CLOISTER_EAVE_X = CLOISTER_OUTER_RECT.minX + CLOISTER_WIDTH + 1
const CLOISTER_EAVE_Z = CLOISTER_OUTER_RECT.maxZ - CLOISTER_WIDTH - 1

/**
 * 雨聽深院的音源
 *
 * 雨聽堂的聲音全部是「隔著一層東西聽到的雨」：屋瓦上的雨（高頻低十分貝的那一段）、
 * 順著出簷落在卵石上的滴水、雨裡的蟾蜍。沒有雷（坐著聽雨的安穩不要被打散），也沒有葉子雨（院子裡沒有樹）。
 * 這裡照搬，鋪到整座院子：
 * - 屋瓦上的雨：大堂頂上六顆、迴廊頂上每十格一顆，走在簷下頭頂一路都是那一層悶響
 * - 簷下滴水：沿著每一道滴水線每七八格一顆，與眼睛差不多高，走過去一顆一顆經過
 * - 中庭的雨：中庭正中太遠，屋瓦那幾顆都傳不到，那一大窪積水上與兩側各一顆貼地的悶雨
 * - 雨中的蟾蜍：中庭一隻、東邊小庭一隻
 */
export const RAINHALL_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...[-8, 0, 8].flatMap((offsetX) => [-23, -17].map((offsetZ) => atCourt(offsetX, offsetZ))).map((position, index): SoundEmitterDefinition => ({
    id: `rainhall-hall-roof-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '打在屋瓦上的雨', 'en': 'Rain on the roof' },
    zone: 'rainhall',
    ...position,
    /** 屋脊的高度，雨要從頭頂上那層下來 */
    heightOffset: 7,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 5,
    maxDistance: 15,
  })),
  ...[
    ...[-24, -14, -4, 6, 16, 26].flatMap((offsetZ) => [atCourt(CLOISTER_LANE_X, offsetZ), atCourt(-CLOISTER_LANE_X, offsetZ)]),
    ...[-10, 0, 10].map((offsetX) => atCourt(offsetX, CLOISTER_LANE_Z)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `rainhall-cloister-roof-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '打在屋瓦上的雨', 'en': 'Rain on the roof' },
    zone: 'rainhall',
    ...position,
    heightOffset: 5,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 11,
  })),
  ...[
    ...[-9, -3, 3, 9].map((offsetX) => atCourt(offsetX, HALL_RECT.maxZ + 1)),
    ...[-6, 4, 14].flatMap((offsetZ) => [atCourt(CLOISTER_EAVE_X, offsetZ), atCourt(-CLOISTER_EAVE_X, offsetZ)]),
    ...[-12, -4, 4, 12].map((offsetX) => atCourt(offsetX, CLOISTER_EAVE_Z)),
    atCourt(HALL_RECT.minX - 1, -21),
    atCourt(HALL_RECT.maxX + 1, -21),
  ].map((position, index): SoundEmitterDefinition => ({
    /**
     * 順著出簷落下來的水
     *
     * 擺在滴水線上、與眼睛差不多高，範圍壓到十格：走到簷邊才聽得到那一排水滴打在卵石上
     */
    id: `rainhall-eave-drip-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '簷下滴水', 'en': 'Dripping from the eaves' },
    zone: 'rainhall',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 2,
    maxDistance: 10,
  })),
  ...[
    atCourt(COURTYARD_POOL.x, COURTYARD_POOL.z),
    atCourt(-9, 13),
    atCourt(9, 13),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `rainhall-court-rain-${index}`,
    sound: 'rain-roof',
    title: { 'zh-hant': '雨落中庭', 'en': 'Rain in the courtyard' },
    zone: 'rainhall',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 4,
    maxDistance: 13,
  })),
  ...[atCourt(-10, 9), atCourt(15, -23)].map((position, index): SoundEmitterDefinition => ({
    id: `rainhall-court-toad-${index}`,
    sound: 'frog-toad',
    title: { 'zh-hant': '雨中的蟾蜍', 'en': 'Toad in the rain' },
    zone: 'rainhall',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [16 + index * 5, 40 + index * 6] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 18,
  })),
]
