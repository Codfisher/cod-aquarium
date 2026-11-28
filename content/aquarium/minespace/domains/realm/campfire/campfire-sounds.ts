import type { SoundEmitterDefinition } from '../../soundscape/type'
import { CAMP_CENTER, CAMP_FIRE_LIST, CAMP_FOOT_Y, HOMESTEAD_POINT, PRAIRIE_RADIUS, ROCK_WALL_RADIUS, WINDMILL_POINT } from './campfire-layout'

/**
 * 拓荒原的音源
 *
 * 爐火壇只有一種聲音：一團持續的低頻劈啪。這裡把它留在篷車邊那堆煮飯的小火上（走進篷車圈就聽得到），
 * 外圍守夜的兩堆各一顆、更小聲；其餘全用現成的音檔：
 * - 乾草原上的風（meadow-wind 那段「草原的風」，壓低音量）一圈鋪開，原野哪裡都有一點
 * - 紅岩壁腳一圈很輕的「山稜的風」，越往外走風越硬
 * - 入夜草裡的蟲
 * - 夜裡久久一聲遠遠的嚎（雪稜那隻狼，擺在岩壁外，當成荒野裡的郊狼）
 *
 * 白天原本很薄：草原的風只有零點三、岩壁的風零點二，篷車圈外四成的地方最響的聲音不到零點一五，
 * 外圈還有一成二完全沒有聲音。白天補的是「風會動」：
 * 風的底調高一點，外圈多鋪一圈，再加幾陣慢慢飄過去的；風車抽水機有了自己的嘎吱聲。
 * 嚎原本借的是雪稜的狼（調高三個多半音、每一聲差多一點，才不是同一隻狼搬過來），
 * 另外補了實錄的郊狼：很遠的一群，與單獨的一隻。
 * 草原上白天的活物（土撥鼠之類）還沒有：手邊沒有實錄，不拿別種動物的叫聲調音高去充數
 */

function atCampRing(degree: number, radius: number): { x: number; z: number } {
  const radian = (degree / 180) * Math.PI
  return {
    x: CAMP_CENTER.x + Math.round(Math.cos(radian) * radius),
    z: CAMP_CENTER.z + Math.round(Math.sin(radian) * radius),
  }
}

export const CAMPFIRE_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  ...CAMP_FIRE_LIST.map((fire, index): SoundEmitterDefinition => ({
    id: fire.isCookFire ? 'frontier-cook-fire' : `frontier-outrider-fire-${index}`,
    sound: 'campfire',
    title: fire.isCookFire
      ? { 'zh-hant': '篷車邊的柴火', 'en': 'Cooking fire by the wagons' }
      : { 'zh-hant': '守夜的小火', 'en': 'Outrider\'s small fire' },
    zone: 'campfire',
    x: fire.x,
    z: fire.z,
    heightOffset: 1,
    mode: { type: 'loop' },
    volume: fire.isCookFire ? 0.85 : 0.6,
    minDistance: 2,
    maxDistance: fire.isCookFire ? 20 : 13,
  })),
  ...[
    atCampRing(0, 0),
    ...[30, 90, 150, 210, 270, 330].map((degree) => atCampRing(degree, 34)),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-prairie-wind-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '乾草原的風', 'en': 'Wind over the dry prairie' },
    zone: 'campfire',
    ...position,
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 6,
    maxDistance: 26,
  })),
  ...[45, 135, 225, 315].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-rim-wind-${index}`,
    sound: 'alpine-wind',
    title: { 'zh-hant': '岩壁腳的風', 'en': 'Wind at the red cliffs' },
    zone: 'campfire',
    ...atCampRing(degree, PRAIRIE_RADIUS + 4),
    heightOffset: 3,
    mode: { type: 'loop' },
    volume: 0.26,
    minDistance: 6,
    maxDistance: 22,
    /** 與雪稜、遺址是同一段嘯風：調低一點，紅岩壁腳的風比山稜上的鈍 */
    variation: { pitchOffsetCent: -180 },
  })),
  ...[
    atCampRing(70, 18),
    atCampRing(200, 22),
    atCampRing(300, 26),
    { x: HOMESTEAD_POINT.x + 4, z: HOMESTEAD_POINT.z + 6 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-cricket-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '草裡的蟲', 'en': 'Crickets in the dry grass' },
    zone: 'campfire',
    ...position,
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 4,
    maxDistance: 20,
  })),
  ...[200, 20].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-coyote-${index}`,
    activeAt: 'night',
    /**
     * 真的郊狼群嚎。原本借雪稜的狼調高三個多半音冒充，使用者定了「只收實錄」之後換掉：
     * 拿別種動物調音高來充數也算造假。這段錄音原始音量很小、放大了二十分貝上下，
     * 背景可能殘留低頻，所以比原本那兩聲小聲
     */
    sound: 'beast-coyote-chorus',
    title: { 'zh-hant': '荒野上的嚎', 'en': 'A far howl on the plains' },
    zone: 'campfire',
    ...atCampRing(degree, ROCK_WALL_RADIUS + 6),
    heightOffset: 8,
    mode: { type: 'interval', rangeSecond: [140 + index * 50, 340 + index * 60] },
    volume: 0.44,
    minDistance: 14,
    maxDistance: 96,
    variation: { pitchOffsetCent: index === 0 ? 0 : -70, pitchRangeCent: 90, volumeDropRatio: 0.4 },
  })),

  /** 以下是補底的音源（isFiller），神遊不拿它們當停留點 */

  /** 外圈的風：草原靠岩壁那一帶原本是空的 */
  ...[0, 60, 120, 180, 240, 300].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-prairie-wind-outer-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '乾草原的風', 'en': 'Wind over the dry prairie' },
    zone: 'campfire',
    ...atCampRing(degree, 52),
    heightOffset: 2,
    mode: { type: 'loop' },
    volume: 0.34,
    minDistance: 6,
    maxDistance: 26,
    variation: { pitchOffsetCent: 60 },
    isFiller: true,
  })),
  /** 掃過草原的一陣：慢慢飄，飄近了風聲漲起來、飄遠了又退回去 */
  ...[atCampRing(40, 30), atCampRing(165, 34), atCampRing(285, 30)].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-prairie-gust-${index}`,
    sound: 'meadow-wind',
    title: { 'zh-hant': '乾草原的風', 'en': 'Wind over the dry prairie' },
    zone: 'campfire',
    ...position,
    heightOffset: 3,
    motion: { type: 'wander', radius: 14, periodSecond: 68 + index * 15, riseHeight: 1 },
    mode: { type: 'loop' },
    volume: 0.46,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent: 150 },
    isFiller: true,
  })),
  /** 薄暮：草裡的蟲在天黑之前先起頭 */
  ...[atCampRing(20, 30), atCampRing(140, 32), atCampRing(250, 38)].map((position, index): SoundEmitterDefinition => ({
    id: `frontier-dusk-cricket-${index}`,
    activeAt: 'dusk',
    sound: 'insect-bush-cricket',
    title: { 'zh-hant': '薄暮的草蟲', 'en': 'Crickets at dusk' },
    zone: 'campfire',
    ...position,
    heightOffset: 0.5,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchOffsetCent: 120 },
    isFiller: true,
  })),
  {
    /** 風車抽水機：木屋西邊那座，風一推就嘎吱嘎吱地轉。音源在塔頂的葉輪那裡 */
    id: 'frontier-windmill',
    sound: 'campfire-windmill',
    title: { 'zh-hant': '風車抽水機', 'en': 'Windmill pump' },
    zone: 'campfire',
    x: WINDMILL_POINT.x,
    z: WINDMILL_POINT.z,
    /** 直接給 y：木塔七格高、頂上一片木板，葉輪在板子上面 */
    y: CAMP_FOOT_Y + 8,
    mode: { type: 'loop' },
    volume: 0.5,
    minDistance: 4,
    maxDistance: 22,
    variation: { pitchRangeCent: 0 },
    isFiller: true,
  },
  /**
   * 單獨吠的郊狼：岩壁外兩處，比群嚎常出現
   *
   * 錄音原始音量很小、放大了二十分貝上下，背景可能殘留低頻，所以放得遠、壓小聲；聽了不對就把這一組拿掉
   */
  ...[290, 150].map((degree, index): SoundEmitterDefinition => ({
    id: `frontier-coyote-yip-${index}`,
    activeAt: 'night',
    sound: 'beast-coyote-yip',
    title: { 'zh-hant': '荒野上的嚎', 'en': 'A far howl on the plains' },
    zone: 'campfire',
    ...atCampRing(degree, ROCK_WALL_RADIUS + 4),
    heightOffset: 8,
    mode: { type: 'interval', rangeSecond: [50 + index * 30, 130 + index * 50] },
    volume: 0.4,
    minDistance: 14,
    maxDistance: 90,
    variation: { pitchOffsetCent: index === 0 ? 80 : -120, pitchRangeCent: 200, volumeDropRatio: 0.4 },
    isFiller: true,
  })),
]
