import type { SoundEmitterDefinition } from '../../soundscape/type'
import { BLIZZARD_CENTER, DRIFT_WALL_START_RADIUS } from './blizzard-layout'

/**
 * 四面的風要鋪滿整片雪原
 *
 * 吹雪野是半徑三格的一圈六顆、每顆可聽十一格：圈收得緊，站在哪裡六顆都聽得到，方向互相抵消，
 * 剩下的才是「四面八方都是風」。雪原大了，改成每十格一顆的錯排網格、每顆可聽十四格：
 * 站在任何一點，身邊都有五六顆差不多遠的風，同樣聽不出風從哪來
 */
const ROAR_GRID_SPACING = 10

function createRoarPositionList(): { x: number; z: number }[] {
  const positionList: { x: number; z: number }[] = []
  const reach = DRIFT_WALL_START_RADIUS + 8
  let row = 0
  for (let offsetZ = -reach; offsetZ <= reach; offsetZ += ROAR_GRID_SPACING) {
    const shiftX = (row % 2) * (ROAR_GRID_SPACING / 2)
    for (let offsetX = -reach; offsetX <= reach; offsetX += ROAR_GRID_SPACING) {
      const x = offsetX + shiftX
      if (Math.hypot(x, offsetZ) <= reach)
        positionList.push({ x: BLIZZARD_CENTER.x + x, z: BLIZZARD_CENTER.z + offsetZ })
    }
    row++
  }
  return positionList
}

/** 某個方位（度）上離中心 radius 格 */
function atField(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: BLIZZARD_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: BLIZZARD_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

/**
 * 白矇雪原的音源
 *
 * 吹雪野的重點是「只剩一種聲音」：其他箱庭都在收集聲音，這一座在清空它們。
 * 不種鳥、不種蟲、不種水，一樣都不留，雪原上也是：底層一片四面的暴風雪，
 * 上面幾陣會飄的打旋陣風，給風一點前後景。全沿用吹雪野的兩個音檔
 */
export const BLIZZARD_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...createRoarPositionList().map((position, index): SoundEmitterDefinition => ({
    id: `blizzard-field-roar-${index}`,
    sound: 'blizzard-roar',
    title: { 'zh-hant': '四面的暴風雪', 'en': 'Blizzard on all sides' },
    zone: 'blizzard',
    ...position,
    /** 貼著地面，暴風雪是從地表捲起來的 */
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.8,
    minDistance: 3,
    maxDistance: 14,
  })),
  /** 打旋的陣風：正中一顆、二十格一圈六顆，各自飄、時有時無 */
  ...[
    atField(0, 0),
    ...[15, 75, 135, 195, 255, 315].map((degree) => atField(degree, 22)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `blizzard-field-gust-${index}`,
    sound: 'blizzard-gust',
    title: { 'zh-hant': '捲過去的雪', 'en': 'Snow whipping past' },
    zone: 'blizzard',
    ...position,
    heightOffset: 4,
    motion: { type: 'wander', radius: 7, periodSecond: 23 + index * 4, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [6, 18] },
    volume: 0.7,
    minDistance: 3,
    maxDistance: 12,
  })),
]
