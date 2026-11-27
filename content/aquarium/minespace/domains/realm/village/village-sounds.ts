import type { SoundEmitterDefinition } from '../../soundscape/type'
import { BELL_TOWER_POINT, BELL_TOWER_SIZE, EATERY_POINT, HEARTH_POINT, SMITHY_POINT, STREAM_Z, VILLAGE_CENTER, WATERMILL_POINT } from './village-layout'

/** 村子中心加上偏移的座標 */
function atVillage(offsetX: number, offsetZ: number): { x: number; z: number } {
  return { x: VILLAGE_CENTER.x + offsetX, z: VILLAGE_CENTER.z + offsetZ }
}

/** 某個方位（度）上離村子中心 radius 格 */
function atVillageRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return atVillage(Math.round(Math.cos(radian) * radius), Math.round(Math.sin(radian) * radius))
}

/**
 * 村落的音源
 *
 * 村落是市井坊的放大版，聲音也照市井坊：市集的人聲、遠遠的鐘、灶上的火、食肆裡吃飯的聲音，
 * 入夜人聲與灶火退場，換牆角的蟲。全沿用市井坊的音檔，各自擺回它們該在的地方：
 * 人聲沿著市街、鐘在鐘樓頂、火在廣場邊的灶、吃飯聲在食肆門口。
 * 多出來的是鍛冶屋的爐火（灶的火聲）、水車旁的水道（借遣水的流水聲），與台地外那一圈花田：夜裡田裡的蟲（同一個蟲聲，換一個名字）。
 *
 * 這裡沒有鄰居要避（整個場景只有這一座村子），所以不走 measureNeighbourLimit；
 * 鐘聲照市井坊「全庭傳得最遠」的意思，走到田邊都還聽得到
 */
export const VILLAGE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 市集的人聲：沿市街三顆，從門口一路響到廣場另一頭；同名併成一條 */
  ...[atVillage(-22, 0), atVillage(-4, 2), atVillage(17, 0)].map((position, index): SoundEmitterDefinition => ({
    id: `village-realm-crowd-${index}`,
    activeAt: 'day',
    sound: 'village-crowd',
    title: { 'zh-hant': '市集人聲', 'en': 'Market chatter' },
    zone: 'village',
    ...position,
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 6,
    maxDistance: 24,
  })),
  {
    /** 鐘樓頂，鐘吊在屋頂底下兩格 */
    id: 'village-realm-bell',
    sound: 'village-bell',
    title: { 'zh-hant': '鐘樓', 'en': 'Bell tower' },
    zone: 'village',
    ...atVillage(BELL_TOWER_POINT.offsetX, BELL_TOWER_POINT.offsetZ),
    heightOffset: BELL_TOWER_SIZE.height - 2,
    mode: { type: 'interval', rangeSecond: [45, 100] },
    volume: 0.9,
    minDistance: 12,
    maxDistance: 70,
  },
  {
    /** 廣場東南角的灶，收攤了火自然也就熄了 */
    id: 'village-realm-hearth',
    activeAt: 'day',
    sound: 'campfire',
    title: { 'zh-hant': '灶上的火', 'en': 'Cooking fire' },
    zone: 'village',
    ...atVillage(HEARTH_POINT.offsetX, HEARTH_POINT.offsetZ),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.6,
    minDistance: 2,
    maxDistance: 12,
  },
  {
    /** 食肆：擺在門口，走過門前才聽得到裡面在吃飯 */
    id: 'village-realm-eatery',
    activeAt: 'day',
    sound: 'ruins-hall',
    title: { 'zh-hant': '食肆人聲', 'en': 'Chatter from the eatery' },
    zone: 'village',
    ...atVillage(EATERY_POINT.offsetX, EATERY_POINT.offsetZ + 3),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 13,
  },
  {
    /** 鍛冶屋的爐火：與灶同一個火聲，走過鍛冶屋門前才聽得到 */
    id: 'village-realm-smithy',
    activeAt: 'day',
    sound: 'campfire',
    title: { 'zh-hant': '鍛冶的爐火', 'en': 'Forge fire' },
    zone: 'village',
    ...atVillage(SMITHY_POINT.offsetX - 2, SMITHY_POINT.offsetZ - 1),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.55,
    minDistance: 2,
    maxDistance: 12,
  },
  {
    /**
     * 水車
     *
     * 市井坊沒有水，這是村落多出來的那一條水道；借遣水的流水聲，壓得很小，
     * 只有走到水車旁、橋上才聽得到
     */
    id: 'village-realm-watermill',
    sound: 'river-flow',
    title: { 'zh-hant': '水車與水道', 'en': 'Watermill stream' },
    zone: 'village',
    ...atVillage(WATERMILL_POINT.offsetX, STREAM_Z + 1),
    heightOffset: 0,
    mode: { type: 'loop' },
    volume: 0.35,
    minDistance: 2,
    maxDistance: 14,
  },
  /** 收攤之後：屋子的牆角四處各一片蟲聲 */
  ...[atVillage(-26, -6), atVillage(27, 5), atVillage(-9, -17), atVillage(9, 22)].map((position, index): SoundEmitterDefinition => ({
    id: `village-realm-wall-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '牆角的蟲', 'en': 'Crickets by the wall' },
    zone: 'village',
    ...position,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 14,
    silentInRain: true,
  })),
  /** 夜裡的花田：台地外一圈四片，走出村子就換成田裡的蟲 */
  ...[45, 135, 225, 315].map((degree, index): SoundEmitterDefinition => ({
    id: `village-realm-field-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '田裡的蟲', 'en': 'Crickets in the fields' },
    zone: 'village',
    ...atVillageRing(degree, 48),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.36,
    minDistance: 5,
    maxDistance: 22,
    silentInRain: true,
  })),
]
