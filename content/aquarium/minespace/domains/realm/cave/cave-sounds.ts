import type { SoundEmitterDefinition } from '../../soundscape/type'
import {
  CAVE_GROUND_Y,
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
]
