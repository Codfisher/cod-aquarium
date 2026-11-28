import type { SoundEmitterDefinition, SoundWeatherGain } from '../../soundscape/type'
import { BLIZZARD_CENTER, BLIZZARD_GROUND_Y, BLIZZARD_SNOW_LEVEL, BURIED_FENCE_POINT_LIST, DRIFT_WALL_START_RADIUS, SHELTER_HUT_POINT } from './blizzard-layout'

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
 * 風聲跟著雪勢走
 *
 * 雪勢在七成二與滿檔之間起落（場景定義的 weather.snow），鬆開時畫面上看得到十幾格外的燈籠，
 * 風聲也該跟著鬆一口氣：最小時剩一半，滿檔才是定義裡的音量
 */
const SNOW_GAIN: SoundWeatherGain = {
  source: 'snow',
  levelRange: [BLIZZARD_SNOW_LEVEL.min, BLIZZARD_SNOW_LEVEL.max],
  floor: 0.5,
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
    weatherGain: SNOW_GAIN,
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
    weatherGain: SNOW_GAIN,
    /** 每一陣差得多一點、有強有弱：同一段陣風原樣重播，十幾秒就聽得出來 */
    variation: { pitchRangeCent: 180, volumeDropRatio: 0.45 },
  })),
  /**
   * 壓過來又退走的低風（補底的音源）
   *
   * 底層那片暴風雪是幾十顆釘在原地的循環，站著聽久了是一道不會動的牆。
   * 這幾顆用同一段錄音壓低七個半音、慢慢地在雪原上飄：飄近時低頻漲起來，飄遠了又退回去，
   * 風才有「一陣一陣」的起伏。仍然只有風，沒有多放別的東西
   */
  ...[40, 110, 180, 250, 320].map((degree, index): SoundEmitterDefinition => ({
    id: `blizzard-field-swell-${index}`,
    sound: 'blizzard-roar',
    title: { 'zh-hant': '壓過來的低風', 'en': 'A low wind bearing down' },
    zone: 'blizzard',
    ...atField(degree, 24),
    heightOffset: 5,
    motion: { type: 'wander', radius: 14, periodSecond: 64 + index * 11, riseHeight: 2 },
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 4,
    maxDistance: 24,
    weatherGain: SNOW_GAIN,
    variation: { pitchOffsetCent: -700, pitchRangeCent: 80 },
    isFiller: true,
  })),
  /**
   * 縫隙裡的風哨：避難小屋的板牆與雪埋的舊柵欄
   *
   * 這段錄的是風從門縫灌進來的口哨聲，質地是「縫隙的風」不是曠野的風，
   * 所以只擺在真的有縫的東西旁邊：走到小屋邊、柵欄邊才聽得到，雪原上其他地方仍然只有那一片風。
   * 聽了不對的話這一組整段拿掉就好
   */
  ...[
    { x: SHELTER_HUT_POINT.x, z: SHELTER_HUT_POINT.z + 1, y: BLIZZARD_GROUND_Y + 2.5, pitchOffsetCent: -120 },
    { x: BURIED_FENCE_POINT_LIST[1]!.x, z: BURIED_FENCE_POINT_LIST[1]!.z, y: BLIZZARD_GROUND_Y + 2.5, pitchOffsetCent: 180 },
  ].map(({ pitchOffsetCent, ...position }, index): SoundEmitterDefinition => ({
    id: `blizzard-field-whistle-${index}`,
    sound: 'blizzard-whistle',
    title: { 'zh-hant': '縫隙裡的風哨', 'en': 'Wind whistling through the gaps' },
    zone: 'blizzard',
    ...position,
    mode: { type: 'loop' },
    volume: 0.26,
    minDistance: 2,
    maxDistance: 12,
    weatherGain: SNOW_GAIN,
    variation: { pitchOffsetCent, pitchRangeCent: 0 },
    isFiller: true,
  })),
]
