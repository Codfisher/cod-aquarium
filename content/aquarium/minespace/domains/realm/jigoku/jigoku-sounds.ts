import type { SoundEmitterDefinition, SoundVariation } from '../../soundscape/type'
import {
  CAUSEWAY_START_Z,
  EAST_LOOKOUT,
  FOOT_BATH_RECT,
  HOT_POOL_LIST,
  JIGOKU_CENTER,
  LAKE_CENTER,
  LAKE_ISLAND,
  LAKE_RADIUS_X,
  LAKE_RADIUS_Z,
  LAKE_Y,
  LAVA_SURFACE_Y,
  LAVA_TORII,
  MAIN_FALL,
  OVERLOOK_EDGE_Z,
  RIM_Y,
  SHRINE_PLATFORM,
  SPILL_SPRING,
  STEAM_VENT_LIST,
  TERRACE_Y,
  WEST_FALL,
  WEST_LOOKOUT,
} from './jigoku-layout'

/**
 * 湯煙谷的音源
 *
 * 地獄谷的聲音是「從地底下上來的低頻，黏稠而緩慢」：圍著熔岩縫一圈的熔岩滾沸（貼著縫、高度零，
 * 聲音要從低處來），加上埋在地面下、兩三分鐘才一次的悶響。這裡全沿用地獄谷的音檔，照新的地形擺：
 *
 * - 熔岩滾沸都貼在熔岩面上：站在台地上聲音從崖下十格的地方上來；走下石階、走上參道，兩側越來越響，
 *   到祠台是三面都在滾。沿著台地的崖緣另補一圈，東西兩臂走到哪裡崖下都有熔岩在響
 * - 兩道熔岩瀑各一顆，掛在瀑身的半腰，音量與範圍最大，整座火口的遠處都聽得到主瀑
 * - 泥池用同一段滾沸，音量壓低、範圍收小、音高調高一點：泥湯也是黏的，只是小一號
 * - 四池熱泉是另一段錄音（清的滾水夾著蒸氣），噴氣孔一孔一顆嘶聲，湯瀧與足湯各有自己的水聲，
 *   都很小聲，走近了才浮出來
 * - 地底的悶響是三顆貼著湖面的低頻（火山底部兩次噴發之間那種持續的悶響），鋪成整座火口的底。
 *   熔岩瀑沒有自己的錄音：瀑身那一顆仍是滾沸壓低三個半音，等找到實錄的熔岩流再換（只收實錄，不拿別的聲音疊出一個來）
 * - 遠火山隔一兩分鐘悶爆一聲，從北邊的稜線上方傳過來
 *
 * 第一版量出來全場七成八的地面一顆都聽不到（量測見 docs/development-notes 的「音景」一節），原因有三：
 * 熔岩面比台地低十格，遮蔽沿直線數方塊，崖下的聲音全被崖身擋掉（現在標 canCarryOverEdge，多試一條越過崖緣的路）；
 * 主瀑的音源擺在瀑腳、可聽九十格，而走得到的最近處也有六十格外；悶響埋在高度零的岩層裡，等於不存在。
 *
 * 共用同一段錄音的音源靠 variation 的音高分開（一百音分是一個半音）。
 * 這裡的數字都沒有人聽過，是照「大的東西低而慢、小的東西高而快」排的，要實際聽了再調
 */

/** 熔岩瀑：比湖面的滾沸低沉、慢一些，聽起來是更大的一股 */
const LAVA_FALL_VARIATION: SoundVariation = { pitchOffsetCent: -300 }
/** 泥池：比熔岩小一號 */
const MUD_POT_VARIATION: SoundVariation = { pitchOffsetCent: 150 }
/** 熱泉：四池各差一點（照 id 定），同一段十二秒的錄音才不會四池齊步 */
const HOT_SPRING_VARIATION: SoundVariation = { pitchRangeCent: 150 }
/**
 * 噴氣孔：十四孔各有各的音高（照 id 定，上下兩個半音）
 *
 * 這段嘶聲出自老片庫，可能偏機械蒸氣，所以壓得很小、只在孔邊聽得到；
 * 聽了不對的話整組拿掉就好（下面 STEAM_VENT_LIST 那一段）
 */
const STEAM_VENT_VARIATION: SoundVariation = { pitchRangeCent: 200 }
/** 悶響：三顆的音高照 id 錯開，十四秒的循環疊起來才聽不出週期 */
const RUMBLE_VARIATION: SoundVariation = { pitchOffsetCent: -60, pitchRangeCent: 180 }
/** 遠火山的悶爆：每一聲差得多、有大有小 */
const ERUPTION_VARIATION: SoundVariation = { pitchRangeCent: 280, volumeDropRatio: 0.4 }
/** 湯瀧借的是溪谷那道大瀑布：調高一點，是小一號的一道水 */
const SPILL_VARIATION: SoundVariation = { pitchOffsetCent: 250 }

/** 貼在熔岩面上的熔岩滾沸 */
function createChurn(id: string, x: number, z: number, volume: number, maxDistance: number): SoundEmitterDefinition {
  return {
    id: `jigoku-valley-churn-${id}`,
    sound: 'jigoku-lava',
    title: { 'zh-hant': '湖裡的熔岩', 'en': 'Lava in the lake' },
    zone: 'jigoku',
    x,
    z,
    /** 直接給高度：不給的話會自動貼到地面，崖邊那幾顆會被擺到台地上 */
    y: LAVA_SURFACE_Y,
    mode: { type: 'loop' },
    volume,
    minDistance: 3,
    maxDistance,
    /** 熔岩在崖下十格，聲音要越過崖緣才上得了台地 */
    canCarryOverEdge: true,
  }
}

const SHRINE_REACH = SHRINE_PLATFORM.halfSize + 3

/**
 * 台地崖緣外的熔岩：沿著熔岩湖的南半圈、從崖腳往湖裡退八格排一圈（退五格有三顆會落在崖腳的碎岩裡）
 *
 * 角度從正東（零度）經正南（九十度）到正西；正南那一段有到著台崖腳的兩顆，這裡跳過。
 * 每顆可聽三十六格，扣掉十二格的高低差，站在崖邊最響、往台地裡走二十格左右淡掉，接手的是熱泉與噴氣孔
 */
const CLIFF_EDGE_DEGREE_LIST = [12, 30, 48, 66, 114, 132, 150, 168]
const CLIFF_EDGE_INSET = 8

function createCliffEdgeChurnList(): SoundEmitterDefinition[] {
  return CLIFF_EDGE_DEGREE_LIST.map((degree, index) => {
    const radian = (degree / 180) * Math.PI
    const x = Math.round(LAKE_CENTER.x + Math.cos(radian) * (LAKE_RADIUS_X - CLIFF_EDGE_INSET))
    const z = Math.round(LAKE_CENTER.z + Math.sin(radian) * (LAKE_RADIUS_Z - CLIFF_EDGE_INSET))

    return { ...createChurn(`edge-${index}`, x, z, 0.5, 36), isFiller: true }
  })
}

const HOT_SPRING_LIST = HOT_POOL_LIST.filter((pool) => pool.kind === 'spring')

export const JIGOKU_EMITTER_DEFINITION_LIST: SoundEmitterDefinition[] = [
  /** 到著台的崖腳、石階兩側 */
  createChurn('cliff-west', JIGOKU_CENTER.x - 9, OVERLOOK_EDGE_Z - 6, 0.5, 34),
  createChurn('cliff-east', JIGOKU_CENTER.x + 9, OVERLOOK_EDGE_Z - 6, 0.5, 34),
  /** 參道兩側 */
  createChurn('causeway-west', JIGOKU_CENTER.x - 5, CAUSEWAY_START_Z - 8, 0.55, 18),
  createChurn('causeway-east', JIGOKU_CENTER.x + 5, CAUSEWAY_START_Z - 8, 0.55, 18),
  /** 祠台三面與大鳥居腳下 */
  createChurn('shrine-west', SHRINE_PLATFORM.x - SHRINE_REACH, SHRINE_PLATFORM.z, 0.55, 18),
  createChurn('shrine-east', SHRINE_PLATFORM.x + SHRINE_REACH, SHRINE_PLATFORM.z, 0.55, 18),
  createChurn('torii', LAVA_TORII.x, LAVA_TORII.z + 1, 0.6, 20),
  /** 湖心島南側、東西兩座展望台腳下 */
  createChurn('island', LAKE_ISLAND.x, LAKE_ISLAND.z + LAKE_ISLAND.radius + 4, 0.45, 26),
  /** 黑岩原上的兩道熔岩河：西展望台在它們南邊二十幾格、高十二格，可聽距離放寬才上得去 */
  createChurn('river', 81, 94, 0.55, 46),
  createChurn('river-mouth', 99, 104, 0.5, 40),
  createChurn('east-bay', EAST_LOOKOUT.x, EAST_LOOKOUT.z - EAST_LOOKOUT.northReach - 5, 0.5, 30),
  {
    ...createChurn('main-fall', MAIN_FALL.x, MAIN_FALL.z + 4, 0.95, 170),
    title: { 'zh-hant': '落進湖裡的熔岩瀑', 'en': 'Lava pouring into the lake' },
    /**
     * 掛在瀑身半腰再高一點，不是瀑腳
     *
     * 瀑布二十七格高，聲音是整道瀑身發出來的；擺在瀑腳的話從到著台聽過去，連線被湖心島擋住。
     * 可聽一百七十格：到著台離它一百一十幾格，那裡是整座場景的第一眼，主瀑要聽得到
     */
    y: Math.round((LAKE_Y + MAIN_FALL.topY) / 2) + 3,
    minDistance: 10,
    variation: LAVA_FALL_VARIATION,
  },
  {
    ...createChurn('west-fall', 65, 91, 0.75, 70),
    title: { 'zh-hant': '落進湖裡的熔岩瀑', 'en': 'Lava pouring into the lake' },
    y: Math.round((LAKE_Y + WEST_FALL.topY) / 2),
    minDistance: 6,
    variation: LAVA_FALL_VARIATION,
  },
  ...HOT_POOL_LIST.filter((pool) => pool.kind === 'mud').map((pool, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-mud-${index}`,
    sound: 'jigoku-lava',
    title: { 'zh-hant': '泥池滾沸', 'en': 'Bubbling mud pot' },
    zone: 'jigoku',
    x: pool.x,
    z: pool.z,
    y: TERRACE_Y + 0.5,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 2,
    maxDistance: 14,
    variation: MUD_POT_VARIATION,
  })),
  {
    id: 'jigoku-valley-spill',
    sound: 'waterfall',
    title: { 'zh-hant': '落下崖的熱泉', 'en': 'Hot spring spilling over the cliff' },
    zone: 'jigoku',
    x: SPILL_SPRING.x,
    z: SPILL_SPRING.z - SPILL_SPRING.radius - 3,
    /** 水從台地落到湖邊的岩棚，音源擺在那道水的半腰；人站在崖上的泉邊，聲音越過崖緣上來 */
    y: Math.round((LAKE_Y + 4 + TERRACE_Y) / 2),
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: 3,
    maxDistance: 26,
    canCarryOverEdge: true,
    variation: SPILL_VARIATION,
  },
  ...[
    { x: JIGOKU_CENTER.x, z: JIGOKU_CENTER.z - 28 },
    { x: JIGOKU_CENTER.x - 54, z: JIGOKU_CENTER.z - 42 },
    { x: JIGOKU_CENTER.x + 56, z: JIGOKU_CENTER.z - 40 },
  ].map((position, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-rumble-${index}`,
    sound: 'jigoku-rumble',
    title: { 'zh-hant': '地底的悶響', 'en': 'A rumble from below' },
    zone: 'jigoku',
    ...position,
    /**
     * 貼著熔岩面，不埋進湖底
     *
     * 原本是借雷聲、兩三分鐘才一次，擺在高度零：整顆在岩層裡，遮蔽固定把它壓到底噪，全場聽不到。
     * 現在是火山底部那種持續的低頻，一直都在：位置放在熔岩面上，聲音越過崖緣傳上台地，
     * 「悶」是錄音本身的質地，不必靠埋進岩裡
     */
    y: LAVA_SURFACE_Y + 1,
    mode: { type: 'loop' },
    volume: 0.4,
    minDistance: 12,
    maxDistance: 100,
    canCarryOverEdge: true,
    variation: RUMBLE_VARIATION,
  })),
  {
    id: 'jigoku-valley-rumble-far',
    sound: 'jigoku-eruption',
    title: { 'zh-hant': '遠火山的悶響', 'en': 'The far volcano rumbling' },
    zone: 'jigoku',
    x: JIGOKU_CENTER.x + 16,
    z: MAIN_FALL.z - 6,
    /** 稜線上方八格：擺在稜線的高度會剛好埋進火口壁（那一柱的地面比 RIM_Y 高一格） */
    y: RIM_Y + 8,
    /**
     * 一兩分鐘悶爆一聲
     *
     * 遠火山的噴發在畫面上是連續的（火星與煙一直在冒，沒有「這一下」可以對），所以照舊自己計時；
     * 日後畫面若做出分明的一次噴發，改成 trigger、由渲染端用 requestSoundTrigger 叫就對得上
     */
    mode: { type: 'interval', rangeSecond: [60, 170] },
    volume: 0.6,
    minDistance: 30,
    maxDistance: 200,
    variation: ERUPTION_VARIATION,
  },

  /**
   * 以下是補底的音源（isFiller）：畫面上看得到、原本沒有聲音的東西，以及崖緣外那一圈熔岩。
   * 神遊不拿它們當停留點
   */
  ...createCliffEdgeChurnList(),
  /** 西展望台懸在熔岩上的那一頭，正下方 */
  {
    ...createChurn('west-bay', WEST_LOOKOUT.x, WEST_LOOKOUT.z - WEST_LOOKOUT.northReach - 5, 0.5, 30),
    isFiller: true,
  },
  ...HOT_SPRING_LIST.map((pool, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-spring-${index}`,
    sound: 'jigoku-hot-spring',
    title: { 'zh-hant': '熱泉咕嘟', 'en': 'Hot spring bubbling' },
    zone: 'jigoku',
    x: pool.x,
    z: pool.z,
    y: TERRACE_Y + 1,
    mode: { type: 'loop' },
    volume: 0.3,
    minDistance: Math.round(pool.radius),
    maxDistance: Math.round(pool.radius) + 10,
    variation: HOT_SPRING_VARIATION,
    isFiller: true,
  })),
  ...STEAM_VENT_LIST.map((vent, index): SoundEmitterDefinition => ({
    id: `jigoku-valley-vent-${index}`,
    sound: 'jigoku-steam-vent',
    title: { 'zh-hant': '噴氣孔的嘶聲', 'en': 'Hissing steam vent' },
    zone: 'jigoku',
    x: vent.x,
    z: vent.z,
    /** 孔口那一圈圓石的高度；孔是往下挖的洞，自動貼地會掉進洞底 */
    y: TERRACE_Y + 1.5,
    mode: { type: 'loop' },
    volume: 0.14,
    minDistance: 1.5,
    maxDistance: 10,
    variation: STEAM_VENT_VARIATION,
    isFiller: true,
  })),
  {
    /** 足湯：木頂底下那一池熱水，與熱泉同一段錄音，調高、壓得很小，是一池溫吞的水在冒細泡 */
    id: 'jigoku-valley-foot-bath',
    sound: 'jigoku-hot-spring',
    title: { 'zh-hant': '足湯的水聲', 'en': 'Water in the foot bath' },
    zone: 'jigoku',
    x: Math.round((FOOT_BATH_RECT.minX + FOOT_BATH_RECT.maxX) / 2),
    z: Math.round((FOOT_BATH_RECT.minZ + FOOT_BATH_RECT.maxZ) / 2),
    /** 直接給高度：自動貼地會貼到木頂上面 */
    y: TERRACE_Y + 1.5,
    mode: { type: 'loop' },
    volume: 0.14,
    minDistance: 2,
    maxDistance: 9,
    variation: { pitchOffsetCent: 260 },
    isFiller: true,
  },
]
