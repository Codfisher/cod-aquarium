import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  CAVE_GROUND_Y,
  GROTTO_CENTER,
  HALL_CENTER,
  OLD_MOUTH,
  TUNNEL_MIDDLE,
  UNDERGROUND_LAKE_CENTER,
  UNDERGROUND_LAKE_RADIUS,
} from './cave-layout'

/**
 * 地底洞窟的音源
 *
 * 照岩響窟：通道裡的滴水、洞室底下的地底湖、洞口的風。全沿用岩響窟的音檔，
 * 大廳大了，滴水多擺幾處（鐘乳石垂下來的地方），湖也是兩顆；風改從門後那段坍掉的舊洞口漏進來。
 *
 * 高度一律直接給：整個世界是實心的岩，從世界頂往下找地面會停在四十格高的岩頂上，
 * 音源就飄到岩層裡去了（岩響窟的音源也是直接給 y）
 */
export const CAVE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 通道與大廳的滴水：同名併成一條 */
  ...[
    { x: TUNNEL_MIDDLE.x, z: TUNNEL_MIDDLE.z, y: CAVE_GROUND_Y + 2 },
    { x: HALL_CENTER.x + 4, z: HALL_CENTER.z - 6, y: CAVE_GROUND_Y + 8 },
    { x: HALL_CENTER.x + 22, z: HALL_CENTER.z + 10, y: CAVE_GROUND_Y + 6 },
    { x: HALL_CENTER.x - 8, z: HALL_CENTER.z - 18, y: CAVE_GROUND_Y + 5 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cave-realm-drip-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '洞頂滴水', 'en': 'Dripping from the ceiling' },
    zone: 'cave',
    ...position,
    mode: { type: 'loop' },
    volume: 0.8,
    minDistance: 3,
    maxDistance: 22,
  })),
  /** 地底湖：湖心一顆、東岸一顆，從大廳走過去越來越近 */
  ...[
    { x: UNDERGROUND_LAKE_CENTER.x, z: UNDERGROUND_LAKE_CENTER.z },
    { x: UNDERGROUND_LAKE_CENTER.x + UNDERGROUND_LAKE_RADIUS - 2, z: UNDERGROUND_LAKE_CENTER.z - 2 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cave-realm-lake-${index}`,
    sound: 'cave-water',
    title: { 'zh-hant': '地底湖', 'en': 'Underground lake' },
    zone: 'cave',
    ...position,
    y: CAVE_GROUND_Y,
    mode: { type: 'loop' },
    volume: 0.8,
    minDistance: 4,
    maxDistance: 26,
  })),
  {
    /** 門後那段坍掉的舊洞口：外面的風從碎石縫裡漏進來，只有站在門邊才聽得到 */
    id: 'cave-realm-mouth-wind',
    sound: 'alpine-wind',
    title: { 'zh-hant': '洞口風聲', 'en': 'Wind at the cave mouth' },
    zone: 'cave',
    x: OLD_MOUTH.endX - 3,
    z: OLD_MOUTH.z,
    y: CAVE_GROUND_Y + 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 3,
    maxDistance: 16,
  },

  /**
   * 以下是補底的音源（isFiller），神遊不拿它們當停留點
   *
   * 量出來全洞兩成的地面是靜的：人一到的那間前室、大廳的北緣東緣與南緣。
   * 補的仍是滴水，只是每一處的音高各調一點（同一段錄音原樣鋪滿，聽起來是同一處在滴），
   * 音量比大廳正中那幾顆小，是牆腳、矮頂底下零星的幾滴
   */
  ...[
    /** 前室：門一出來就有水聲，洞才是濕的 */
    { x: GROTTO_CENTER.x - 2, z: GROTTO_CENTER.z - 2, pitchOffsetCent: 220 },
    /** 大廳東北（礦工舊營地那一側）、正北、西北 */
    { x: HALL_CENTER.x + 30, z: HALL_CENTER.z - 14, pitchOffsetCent: -160 },
    { x: HALL_CENTER.x + 26, z: HALL_CENTER.z - 28, pitchOffsetCent: 90 },
    { x: HALL_CENTER.x + 6, z: HALL_CENTER.z - 32, pitchOffsetCent: 310 },
    /** 大廳南緣與東南 */
    { x: HALL_CENTER.x + 2, z: HALL_CENTER.z + 28, pitchOffsetCent: -240 },
    { x: HALL_CENTER.x + 28, z: HALL_CENTER.z + 22, pitchOffsetCent: 150 },
    /** 湖對岸、洞深處那一頭 */
    { x: HALL_CENTER.x - 32, z: HALL_CENTER.z - 16, pitchOffsetCent: -90 },
  ].map(({ pitchOffsetCent, ...position }, index): SoundEmitterDefinition => ({
    id: `cave-realm-drip-fill-${index}`,
    sound: 'cave-drip',
    title: { 'zh-hant': '洞頂滴水', 'en': 'Dripping from the ceiling' },
    zone: 'cave',
    ...position,
    y: CAVE_GROUND_Y + 5,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 20,
    variation: { pitchOffsetCent },
    isFiller: true,
  })),
  /**
   * 洞深處的地下水流：湖對岸那一頭，水往更深的坑道裡流
   *
   * 這段錄音原始音量很小、放大了十七分貝，底噪可能明顯，所以只放兩處、壓小聲；
   * 聽了不對的話這一組整段拿掉就好
   */
  ...[
    { x: HALL_CENTER.x - 36, z: HALL_CENTER.z - 8, pitchOffsetCent: 0 },
    { x: HALL_CENTER.x - 22, z: HALL_CENTER.z + 20, pitchOffsetCent: -120 },
  ].map(({ pitchOffsetCent, ...position }, index): SoundEmitterDefinition => ({
    id: `cave-realm-stream-${index}`,
    sound: 'cave-stream',
    title: { 'zh-hant': '遠處的地下水流', 'en': 'Water running deeper in' },
    zone: 'cave',
    ...position,
    y: CAVE_GROUND_Y + 1,
    mode: { type: 'loop' },
    volume: 0.28,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent, pitchRangeCent: 0 },
    isFiller: true,
  })),
  /**
   * 洞頂的蝙蝠：大廳西北最高的那片穹頂底下
   *
   * 這段錄音的能量幾乎都在四千赫以上，太大聲會像一片嘶聲，所以壓得很小、只在正下方聽得到；
   * 聽了不對的話這一組整段拿掉就好
   */
  ...[
    { x: HALL_CENTER.x - 14, z: HALL_CENTER.z - 20, y: CAVE_GROUND_Y + 12 },
    { x: HALL_CENTER.x + 10, z: HALL_CENTER.z + 2, y: CAVE_GROUND_Y + 14 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cave-realm-bats-${index}`,
    sound: 'cave-bats',
    title: { 'zh-hant': '洞頂的蝙蝠', 'en': 'Bats on the ceiling' },
    zone: 'cave',
    ...position,
    mode: { type: 'loop' },
    volume: 0.18,
    minDistance: 4,
    maxDistance: 18,
    variation: { pitchOffsetCent: index === 0 ? -60 : 40 },
    isFiller: true,
  })),
]
