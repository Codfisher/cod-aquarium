import type { SoundEmitterDefinition } from '../../soundscape/type'
import { ARRIVAL_CLEARING, CICADA_CENTER, CICADA_GROUND_Y, CROWN_BOTTOM_Y, OLD_WELL_POINT, SHADE_CLEARING, SUN_CLEARING_LIST, VERANDA_LIST, WOOD_RADIUS } from './cicada-layout'

/** 林子裡間隔 spacing 格的一片網格點（奇數列錯開半格），只留在 radius 以內 */
function createGridPointList(spacing: number, radius: number): { x: number; z: number }[] {
  const pointList: { x: number; z: number }[] = []
  const count = Math.ceil(radius / spacing)
  for (let row = -count; row <= count; row++) {
    const shift = row % 2 === 0 ? 0 : spacing / 2
    for (let column = -count; column <= count; column++) {
      const x = Math.round(column * spacing + shift)
      const z = Math.round(row * spacing * 0.87)
      if (Math.hypot(x, z) <= radius)
        pointList.push({ x: CICADA_CENTER.x + x, z: CICADA_CENTER.z + z })
    }
  }
  return pointList
}

/**
 * 蟬雨深林的音源
 *
 * 蟬時雨的關鍵是「聽不出有幾隻，也聽不出從哪裡來」：六顆蟬的合唱圍一圈、全掛在樹冠的高度、
 * 範圍互相重疊，方向互相抵消，剩下一片從頭頂壓下來的聲音；再加一隻會動、比別人近的，
 * 整片聲音才有前後景。入夜蟬整片停掉，換蟋蟀接手。
 * 這裡把那一圈鋪成一整片：每十三格一顆合唱，走到哪裡都同時有十來顆進耳朵。
 *
 * 高度一律直接給 y，不用 heightOffset：音源的 y 是從「這一柱最上面那格實心方塊」往上量的，
 * 樹葉也算實心，掛在林子裡的音源會先被抬到樹冠頂、再往上八格，
 * 離林下的耳朵將近二十格，可聽距離幾乎全被垂直那一段吃掉（第一版就是這樣，「在地面行走時幾乎聽不到蟬聲」）。
 * 合唱掛在主林層的樹冠底面（CROWN_BOTTOM_Y，腳底以上六格上下），每一顆的可聽距離放寬到二十二格
 */
export const CICADA_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 樹冠上的蟬：整片網格，掛在蓋子底下 */
  ...createGridPointList(13, WOOD_RADIUS + 4).map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-chorus-${index}`,
    activeAt: 'day',
    sound: 'insect-cicada',
    title: { 'zh-hant': '樹冠上的蟬', 'en': 'Cicadas in the canopy' },
    zone: 'cicada',
    ...position,
    /** 高低錯開零到兩格，一整片聲音才不是同一個平面 */
    y: CROWN_BOTTOM_Y + (index % 3),
    mode: { type: 'loop' },
    volume: 0.85,
    minDistance: 6,
    maxDistance: 22,
    silentInRain: true,
  })),
  /** 近處的一隻：位置會動，飛過去的時候人會下意識抬頭找 */
  ...[
    { x: ARRIVAL_CLEARING.x + 3, z: ARRIVAL_CLEARING.z - 2 },
    { x: SHADE_CLEARING.x - 2, z: SHADE_CLEARING.z },
    { x: CICADA_CENTER.x + 16, z: CICADA_CENTER.z - 8 },
    { x: CICADA_CENTER.x - 20, z: CICADA_CENTER.z + 10 },
    { x: CICADA_CENTER.x + 4, z: CICADA_CENTER.z + 4 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-near-${index}`,
    activeAt: 'day',
    sound: 'insect-cicada',
    title: { 'zh-hant': '近處的一隻', 'en': 'One close by' },
    zone: 'cicada',
    ...position,
    y: CROWN_BOTTOM_Y - 2,
    motion: { type: 'wander', radius: 4, periodSecond: 52 + index * 9, riseHeight: 2 },
    mode: { type: 'interval', rangeSecond: [10, 26] },
    volume: 0.5,
    minDistance: 2,
    maxDistance: 12,
    silentInRain: true,
  })),
  /** 入夜的蟋蟀：兩道緣廊前各一隻，林子裡再疏疏地鋪一片 */
  ...[
    ...VERANDA_LIST.map((veranda) => ({ x: veranda.x, z: veranda.z - 3 })),
    ...createGridPointList(26, WOOD_RADIUS),
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-night-${index}`,
    activeAt: 'night',
    sound: 'insect-cricket',
    title: { 'zh-hant': '入夜的蟋蟀', 'en': 'Crickets after dark' },
    zone: 'cicada',
    ...position,
    /** 直接給高度：落在樹幹或枝幹上的點，貼齊地面會被抬到樹冠頂 */
    y: CICADA_GROUND_Y + 2,
    mode: { type: 'loop' },
    volume: 0.45,
    minDistance: 3,
    maxDistance: 16,
    silentInRain: true,
  })),

  /**
   * 以下是補底的音源（isFiller），神遊不拿它們當停留點
   *
   * 夜裡的蟋蟀每二十六格一顆、可聽十六格，網格之間留了洞（量出來一成二的地面是靜的）。
   * 洞裡補的是另一種蟲（草螽），與蟋蟀錯開半格：兩種蟲一高一低交錯著，夜裡的林子才不是同一段聲音鋪到底
   */
  ...createGridPointList(26, WOOD_RADIUS + 14)
    .map((point) => ({ x: point.x + 13, z: point.z + 11 }))
    .filter((point) => Math.hypot(point.x - CICADA_CENTER.x, point.z - CICADA_CENTER.z) <= WOOD_RADIUS + 2)
    .map((position, index): SoundEmitterDefinition => ({
      id: `cicada-realm-night-katydid-${index}`,
      activeAt: 'night',
      sound: 'insect-bush-cricket',
      title: { 'zh-hant': '林下的草螽', 'en': 'Katydids under the trees' },
      zone: 'cicada',
      ...position,
      y: CICADA_GROUND_Y + 2,
      mode: { type: 'loop' },
      volume: 0.36,
      minDistance: 3,
      maxDistance: 17,
      variation: { pitchOffsetCent: -60, pitchRangeCent: 90 },
      silentInRain: true,
      isFiller: true,
    })),
  /**
   * 薄暮還在叫的幾隻蟬
   *
   * 白天那一整片跟著天色退場，太陽貼著山頭的時候只剩零星幾隻、聲音沉一些（同一段蟬聲壓低三個半音）。
   * 這是先頂著的做法：傍晚的蟬（蜩）有自己的聲音，專用的錄音進來之後換掉 sound、拿掉音高偏移
   */
  ...[
    { x: CICADA_CENTER.x - 22, z: CICADA_CENTER.z - 6 },
    { x: CICADA_CENTER.x - 14, z: CICADA_CENTER.z + 20 },
    { x: CICADA_CENTER.x + 12, z: CICADA_CENTER.z - 22 },
    { x: CICADA_CENTER.x + 24, z: CICADA_CENTER.z + 12 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `cicada-realm-dusk-${index}`,
    activeAt: 'dusk',
    sound: 'insect-cicada',
    title: { 'zh-hant': '薄暮的蟬', 'en': 'Cicadas at dusk' },
    zone: 'cicada',
    ...position,
    y: CROWN_BOTTOM_Y,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 5,
    maxDistance: 28,
    variation: { pitchOffsetCent: -300, pitchRangeCent: 60 },
    silentInRain: true,
    isFiller: true,
  })),
  /** 緣廊簷下的風鈴：廊板西頭、地板上方兩格（cicada-details 掛 WIND_CHIME 的那一格），兩道廊的鈴一高一低 */
  ...VERANDA_LIST.map((veranda, index): SoundEmitterDefinition => ({
    id: `cicada-realm-chime-${index}`,
    sound: 'chime-furin',
    title: { 'zh-hant': '簷下的風鈴', 'en': 'Wind chime under the eaves' },
    zone: 'cicada',
    x: veranda.x - 2,
    z: veranda.z,
    y: CICADA_GROUND_Y + 3,
    mode: { type: 'interval', rangeSecond: [14 + index * 6, 38 + index * 9] },
    volume: 0.36,
    minDistance: 2,
    maxDistance: 14,
    /** 同一個鈴每次都是同一個音，只有碰得輕重不同 */
    variation: { pitchOffsetCent: index === 0 ? 60 : -110, pitchRangeCent: 0, volumeDropRatio: 0.5 },
    isFiller: true,
  })),
  /** 薄暮到入夜的樹蛙：古井邊與向陽空地的濕處，天色一暗就叫開，夜裡小聲一點繼續 */
  ...[
    { ...OLD_WELL_POINT, activeAt: 'dusk' as const, volume: 0.4 },
    { x: SUN_CLEARING_LIST[0]!.x, z: SUN_CLEARING_LIST[0]!.z + 3, activeAt: 'dusk' as const, volume: 0.34 },
    { x: OLD_WELL_POINT.x + 2, z: OLD_WELL_POINT.z - 2, activeAt: 'night' as const, volume: 0.3 },
    { x: CICADA_CENTER.x + 6, z: CICADA_CENTER.z + 24, activeAt: 'night' as const, volume: 0.26 },
  ].map(({ activeAt, volume, ...position }, index): SoundEmitterDefinition => ({
    id: `cicada-realm-tree-frog-${index}`,
    activeAt,
    sound: 'frog-tree-chorus',
    title: { 'zh-hant': '樹蛙', 'en': 'Tree frogs' },
    zone: 'cicada',
    ...position,
    y: CICADA_GROUND_Y + 2,
    mode: { type: 'loop' },
    volume,
    minDistance: 3,
    maxDistance: 20,
    variation: { pitchRangeCent: 160 },
    silentInRain: true,
    isFiller: true,
  })),
  /**
   * 秋夜的鳴蟲：兩道緣廊前各一叢
   *
   * 這段錄音原始音量很小、放大了十七分貝，底噪可能明顯，所以只放兩處、壓小聲；
   * 聽了不對的話這一組整段拿掉就好，夜裡的底有蟋蟀與草螽撐著
   */
  ...VERANDA_LIST.map((veranda, index): SoundEmitterDefinition => ({
    id: `cicada-realm-autumn-insect-${index}`,
    activeAt: 'night',
    sound: 'insect-japan-autumn',
    title: { 'zh-hant': '廊前的鳴蟲', 'en': 'Insects by the veranda' },
    zone: 'cicada',
    x: veranda.x + 3,
    z: veranda.z - 5,
    y: CICADA_GROUND_Y + 2,
    mode: { type: 'loop' },
    volume: 0.26,
    minDistance: 3,
    maxDistance: 14,
    variation: { pitchOffsetCent: index === 0 ? 0 : 120 },
    silentInRain: true,
    isFiller: true,
  })),
]
