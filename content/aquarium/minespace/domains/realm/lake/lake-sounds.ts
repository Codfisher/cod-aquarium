import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ISLAND_POND_RADIUS, ISLAND_RADIUS, LAKE_CENTER } from './lake-layout'

/** 湖心加上偏移的座標 */
function atLake(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: LAKE_CENTER.x + offsetX, z: LAKE_CENTER.z + offsetZ }
}

/** 某個方位（度）上離湖心 radius 格 */
function atLakeRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return atLake(Math.round(Math.cos(radian) * radius), Math.round(Math.sin(radian) * radius))
}

/**
 * 湖中島的音源
 *
 * 湖中島是水鏡池的放大版，聲音也照水鏡池：靜水上的聲音是一個一個點，中間全是空白——
 * 池畔一隻蛙、一隻水鏡池的水鳥，夜裡水邊的草蟲。這兩三個點是主角，其餘都要讓開。
 * 多出來的只有外面那片湖：岸邊偶爾一聲很輕的水，不鋪成一圈不停的浪。
 * 全沿用禪庭已有的音檔。
 *
 * 第一版還有一圈不停的拍岸、夜裡深水外圍一大片蛙鳴與木棧底下的流水，
 * 疊起來整座島一直有聲音，等不到「下一聲」，與水鏡池要的安靜相反，都拿掉了。
 *
 * 這裡沒有鄰居要避（整個場景只有這一座島），所以不走 measureNeighbourLimit；
 * 範圍照「站在哪裡該聽到什麼」來給：池邊聽得到池子的，走到岸邊才聽得到湖
 */
export const LAKE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /**
   * 岸邊的水：四顆，偶爾一聲
   *
   * 湖面是靜的，不該有浪一波一波拍上來；只有走到岸邊時，偶爾聽到一聲水碰到沙。
   * 每顆隔十幾二十秒才響一次、音量壓低，可聽十二格，站在池邊聽不到
   */
  ...[30, 120, 210, 300].map((degree, index): SoundEmitterDefinition => ({
    id: `lake-shore-${index}`,
    sound: 'ocean-shore',
    title: { 'zh-hant': '岸邊的水', 'en': 'Water at the shore' },
    zone: 'pond',
    ...atLakeRing(degree, ISLAND_RADIUS + 1),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [12, 26] },
    volume: 0.2,
    minDistance: 3,
    maxDistance: 12,
  })),
  /** 池畔的一隻蛙，照水鏡池擺在池子正中 */
  {
    id: 'lake-pond-frog',
    sound: 'frog-single',
    title: { 'zh-hant': '池畔蛙鳴', 'en': 'Pondside frog' },
    zone: 'pond',
    ...atLake(-4, 2),
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [6, 18] },
    volume: 0.65,
    minDistance: 4,
    maxDistance: 22,
  },
  /** 池裡的水鳥，在池面上換位置 */
  {
    id: 'lake-pond-moorhen',
    activeAt: 'day',
    sound: 'bird-moorhen',
    title: { 'zh-hant': '水鳥', 'en': 'Moorhen' },
    zone: 'pond',
    ...atLake(3, -3),
    heightOffset: 1,
    motion: { type: 'wander', radius: ISLAND_POND_RADIUS - 5, periodSecond: 58 },
    mode: { type: 'interval', rangeSecond: [18, 44] },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
    silentInRain: true,
  },
  /** 水邊的草蟲：池子西南、盆景松底下那一叢 */
  {
    id: 'lake-pond-cricket',
    activeAt: 'night',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '水邊的草蟲', 'en': 'Waterside crickets' },
    zone: 'pond',
    ...atLake(-11, 9),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.35,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  },
]
