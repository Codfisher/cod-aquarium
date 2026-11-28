import type { SoundEmitterDefinition } from '../../soundscape/type'
import { EATERY_POINT, HEARTH_POINT, HOUSE_LOT_LIST, SMITHY_POINT, STREAM_Z, TERRACE_GROUND_Y, VILLAGE_CENTER, WATERMILL_POINT } from './village-layout'

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
 * 村落是市井坊的放大版，聲音也照市井坊：市集的人聲、灶上的火、食肆裡吃飯的聲音，
 * 入夜人聲與灶火退場，換牆角的蟲。全沿用市井坊的音檔，各自擺回它們該在的地方：
 * 人聲沿著市街、火在廣場邊的灶、吃飯聲在食肆門口。
 * 多出來的是鍛冶屋的爐火（灶的火聲）、水車旁的水道（借遣水的流水聲），與台地外那一圈花田：夜裡田裡的蟲（同一個蟲聲，換一個名字）。
 *
 * 這裡沒有鄰居要避（整個場景只有這一座村子），所以不走 measureNeighbourLimit。
 *
 * 2026-11-28 拿掉了鐘樓的鐘聲：使用者覺得太吵。原本鐘聲傳得最遠（走到田邊都聽得到），
 * 現在鐘樓只是不出聲的布景；市井坊（大廳）的鐘不受影響。
 *
 * 台地外那一圈花田原本白天完全沒有聲音（量出來全場四分之一的地面是靜的，集中在北邊與東邊）。
 * 補上的都是田裡本來就該有的：田上的風、白天田邊的鳥、拂曉的鳥、薄暮先起頭的草蟲，夜裡的蟲從四片補到八片。
 *
 * 村子裡看得到卻沒有聲音的東西也補上：鍛冶屋白天打鐵（原本只有爐火）、水車轉動的木頭與水聲
 * （原本只有水道的流水）、拂曉民家的雞啼、偶爾遠遠一聲狗吠
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

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 田上的風：花田那一圈八片，很輕，整天都在；借的是風露原的風，調低一點分開 */
  ...[22, 67, 112, 157, 202, 247, 292, 337].map((degree, index): SoundEmitterDefinition => ({
    id: `village-realm-field-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '田上的風', 'en': 'Wind over the fields' },
    zone: 'village',
    ...atVillageRing(degree, 50),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.24,
    minDistance: 8,
    maxDistance: 30,
    variation: { pitchOffsetCent: -120 },
    isFiller: true,
  })),
  /** 白天田邊的鳥：北、東、西南各一隻，在田埂的樹上換位置 */
  ...[atVillageRing(270, 46), atVillageRing(350, 50), atVillageRing(140, 52)].map((position, index): SoundEmitterDefinition => ({
    id: `village-realm-field-bird-${index}`,
    activeAt: 'day',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '田邊的鳥', 'en': 'Bird at the field edge' },
    zone: 'village',
    ...position,
    heightOffset: 4,
    motion: { type: 'wander', radius: 6, periodSecond: 47 + index * 9, riseHeight: 1 },
    mode: { type: 'interval', rangeSecond: [22 + index * 5, 52 + index * 8] },
    volume: 0.5,
    minDistance: 5,
    maxDistance: 30,
    variation: { pitchOffsetCent: 30 + index * 30, pitchRangeCent: 50 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 拂曉：天還沒亮，屋頂與田邊的鳥先叫起來，比白天密；太陽爬高就散 */
  ...[
    atVillage(-10, -8),
    atVillage(14, 12),
    atVillageRing(60, 44),
    atVillageRing(200, 44),
    atVillageRing(300, 44),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `village-realm-dawn-bird-${index}`,
    activeAt: 'dawn',
    sound: 'bird-blackbird',
    title: { 'zh-hant': '拂曉的鳥', 'en': 'Birds at first light' },
    zone: 'village',
    ...position,
    heightOffset: 6,
    mode: { type: 'interval', rangeSecond: [5 + index * 2, 14 + index * 3] },
    volume: 0.55,
    minDistance: 6,
    maxDistance: 34,
    variation: { pitchOffsetCent: index * 35 - 70, pitchRangeCent: 50 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 薄暮：田裡的草蟲在人聲還沒散的時候先起頭，天黑透了才交給夜裡那幾片 */
  ...[0, 90, 180, 270].map((degree, index): SoundEmitterDefinition => ({
    id: `village-realm-dusk-cricket-${index}`,
    activeAt: 'dusk',
    sound: 'insect-cricket',
    title: { 'zh-hant': '薄暮的草蟲', 'en': 'Crickets at dusk' },
    zone: 'village',
    ...atVillageRing(degree, 42),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 5,
    maxDistance: 24,
    variation: { pitchOffsetCent: 80 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 夜裡的花田補到八片：原本只有四個斜角，正北正東那幾段田是空的 */
  ...[0, 90, 180, 270].map((degree, index): SoundEmitterDefinition => ({
    id: `village-realm-field-cricket-fill-${index}`,
    activeAt: 'night',
    /** 與原本那四片蟋蟀不同頻段的一段夏夜蟲鳴，兩種交錯著繞田一圈 */
    sound: 'insect-night-chorus',
    title: { 'zh-hant': '田裡的蟲', 'en': 'Crickets in the fields' },
    zone: 'village',
    ...atVillageRing(degree, 52),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 5,
    maxDistance: 24,
    variation: { pitchOffsetCent: index % 2 === 0 ? -90 : 110 },
    silentInRain: true,
    isFiller: true,
  })),
  /**
   * 入夜的廣場與大街：石縫與屋簷下的蟲
   *
   * 鐘聲拿掉之後，夜裡的村子中心只剩牆腳幾隻蟋蟀（可聽十四格），廣場一帶量出來幾乎沒有聲音：
   * 白天的人聲、爐火、打鐵都收了，以前是傳七十格的鐘把這一塊蓋住的。
   * 人都睡了，補的是蟲不是人：廣場周圍三處，薄暮就開始、整夜都在，很輕，走到田邊就換成田裡那一圈
   */
  ...(['dusk', 'night'] as const).flatMap((activeAt) => [
    { offsetX: 5, offsetZ: -5 },
    { offsetX: -9, offsetZ: 6 },
    { offsetX: 17, offsetZ: 9 },
  ].map((offset, index): SoundEmitterDefinition => ({
    id: `village-realm-plaza-insect-${activeAt}-${index}`,
    activeAt,
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '屋簷下的蟲', 'en': 'Insects under the eaves' },
    zone: 'village',
    ...atVillage(offset.offsetX, offset.offsetZ),
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: 0.26,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent: [0, -110, 90][index] ?? 0 },
    silentInRain: true,
    isFiller: true,
  }))),
  {
    /** 鍛冶屋的打鐵：白天十幾二十秒一串，從屋裡傳出來；同一塊鐵砧音高幾乎不變，只有下手輕重不同 */
    id: 'village-realm-anvil',
    activeAt: 'day',
    sound: 'village-anvil',
    title: { 'zh-hant': '鍛冶的打鐵', 'en': 'Hammer on the anvil' },
    zone: 'village',
    ...atVillage(SMITHY_POINT.offsetX, SMITHY_POINT.offsetZ),
    /** 直接給 y：屋裡地板上方一格多，自動貼地會擺到屋頂上 */
    y: TERRACE_GROUND_Y + 1.5,
    mode: { type: 'interval', rangeSecond: [12, 34] },
    volume: 0.5,
    minDistance: 3,
    maxDistance: 26,
    variation: { pitchRangeCent: 30, volumeDropRatio: 0.35 },
    isFiller: true,
  },
  {
    /** 水車：立在小屋北邊的水道裡，木輪轉動、水一斗一斗落進槽裡 */
    id: 'village-realm-water-wheel',
    sound: 'village-water-wheel',
    title: { 'zh-hant': '水車與水道', 'en': 'Watermill stream' },
    zone: 'village',
    ...atVillage(WATERMILL_POINT.offsetX, STREAM_Z),
    /** 水面上方兩格，輪軸的高度 */
    y: TERRACE_GROUND_Y + 1.5,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 3,
    maxDistance: 16,
    /** 水車的節奏是固定的，不調音高 */
    variation: { pitchRangeCent: 0 },
    isFiller: true,
  },
  /** 拂曉的雞啼：兩戶民家各一隻，一高一低，天亮透了就不叫 */
  ...[HOUSE_LOT_LIST[0]!, HOUSE_LOT_LIST[4]!].map((lot, index): SoundEmitterDefinition => ({
    id: `village-realm-rooster-${index}`,
    activeAt: 'dawn',
    sound: 'village-rooster',
    title: { 'zh-hant': '雞啼', 'en': 'Rooster' },
    zone: 'village',
    ...atVillage(lot.offsetX + lot.halfWidth + 2, lot.offsetZ),
    heightOffset: 1.5,
    mode: { type: 'interval', rangeSecond: [18 + index * 14, 50 + index * 24] },
    volume: 0.6,
    minDistance: 5,
    maxDistance: 44,
    variation: { pitchOffsetCent: index === 0 ? 0 : -90, pitchRangeCent: 40, volumeDropRatio: 0.3 },
    isFiller: true,
  })),
  /**
   * 遠遠的狗吠：村子北邊與西南的民家後面，好幾分鐘才一聲
   *
   * 這段錄音只有零點八秒、聽起來偏處理過，所以放得遠、壓小聲；聽了不對的話這一組整段拿掉就好
   */
  ...[atVillageRing(255, 38), atVillageRing(150, 40)].map((position, index): SoundEmitterDefinition => ({
    id: `village-realm-dog-${index}`,
    sound: 'village-dog',
    title: { 'zh-hant': '遠處的狗吠', 'en': 'A dog barking far off' },
    zone: 'village',
    ...position,
    heightOffset: 1,
    mode: { type: 'interval', rangeSecond: [80 + index * 50, 240 + index * 80] },
    volume: 0.32,
    minDistance: 8,
    maxDistance: 50,
    variation: { pitchOffsetCent: index === 0 ? -60 : 90, pitchRangeCent: 120, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
]
