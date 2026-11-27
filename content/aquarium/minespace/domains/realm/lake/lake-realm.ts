import type { GardenGate } from '../garden-gate'
import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { getGarden, POND_BOARDWALK_START_Z, POND_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  DEEP_FLOOR_Y,
  ISLAND_GROUND_Y,
  ISLAND_POND_RADIUS,
  LAKE_CENTER,
  LAKE_PORTAL_POINT,
  LAKE_PUSH_RADIUS,
  LAKE_SLOW_RADIUS,
  LAKE_WATER_SURFACE_Y,
} from './lake-layout'

const POND_GARDEN = getGarden('pond')

/**
 * 大廳那座通往湖中島的門
 *
 * 湖中島屬於水鏡池，門立在池心偏南一格的水裡（POND_GATE_OFFSET），門洞朝北。
 * 北邊那條從禪庭中心過來的飛石走到木座北緣，接上水鏡池那塊挑出水面的木板，
 * 木板一路鋪進門洞：人沿著木板走進池心，穿過門就到了湖中島，門與木板一起倒映在池面上。
 * 回來時落在門北邊四格的木板上，面朝門。
 *
 * 木牌不放在門旁三格（那裡是水），改立在木板起點西側兩格的草地上、牌面朝北，
 * 從飛石走上木板之前就讀得到
 */
const POND_GATE = createGardenGate({
  gardenId: 'pond',
  side: 'north',
  inner: POND_GATE_OFFSET,
  targetRealmId: 'lake',
  signFacing: 'outward',
})
export const LAKE_HUB_GATE: GardenGate = {
  ...POND_GATE,
  portal: {
    ...POND_GATE.portal,
    sign: {
      x: POND_GARDEN.center.x + POND_GATE_OFFSET.x - 2,
      z: POND_GARDEN.center.z + POND_BOARDWALK_START_Z,
      facing: 'north',
    },
  },
}

/**
 * 湖中島：水鏡池的大場景
 *
 * 水鏡池放大一倍多：一座直徑約五十格的草島浮在深湖中央，島中央一池直徑約二十格的水，
 * 池裡的木棧、紙燈、立石與盆景松都照水鏡池擺；四周三圈遠山。
 * 氣氛是清晨的湖：晨霧天天有而且濃、雲多一點、層雲偏多、霧色偏藍白、風放慢
 */
export const LAKE_REALM: RealmDefinition = {
  id: 'lake',
  title: { 'zh-hant': '湖中島', 'en': 'Lake Isle' },
  description: { 'zh-hant': '水鏡池的另一頭，霧裡的一座島', 'en': 'Beyond Mirror Pond, an isle in the mist' },
  signCaption: { 'zh-hant': '霧裡的一座島', 'en': 'An isle in the mist' },
  icon: 'i-material-symbols:water-lux',
  /**
   * 站在回程門的南側三格，面朝島中央的池子
   *
   * 從大廳往南穿過門，到這裡仍是往南走：池子、木棧與盡頭的紙燈在正前方，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: LAKE_PORTAL_POINT.x,
    z: LAKE_PORTAL_POINT.z + 3,
    pitch: 0.08,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 藍白，跟著日夜走：夜裡乘上去照樣是暗的 */
      tint: { scale: [0.93, 0.98, 1.06] },
      start: { value: 90 },
      end: { value: 240 },
    },
    light: {
      /** 湖面反光讓背光面亮一點，直射光收一點，整體偏柔 */
      ambientRatio: { scale: 1.06 },
      lightRatio: { scale: 0.94 },
    },
    cloud: {
      coverageOffset: { offset: 0.15 },
      stratus: { offset: 0.3 },
      windSpeed: { scale: 0.55 },
    },
    groundMist: {
      chance: { value: 1 },
      density: { scale: 1.6 },
    },
  },
  backdrop: {
    centerX: LAKE_CENTER.x,
    centerZ: LAKE_CENTER.z,
    ridge: { style: 'mountain', footY: LAKE_WATER_SURFACE_Y, seed: 'lake-isle' },
    water: { surfaceY: LAKE_WATER_SURFACE_Y, color: [0.12, 0.19, 0.4] },
    floor: { surfaceY: DEEP_FLOOR_Y + 0.5, blockId: BlockId.CLAY, isEndless: false },
  },
  /** 往湖裡去是一陣藍白的霧，夾著往下落的水珠 */
  transition: {
    fogTint: [0.9, 0.97, 1.08],
    particleColor: [0.82, 0.92, 1],
    particleRise: -0.6,
    sound: 'ocean-shore',
  },
  portalList: [
    {
      ...LAKE_PORTAL_POINT,
      /** 站在島上草地的腳底高度 */
      y: ISLAND_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: LAKE_HUB_GATE.landingSpawn,
      /**
       * 與大廳那座同樣在門的西側三格，但牌面朝南：
       * 這裡的人是從島上往門走過來的，大廳那座則是從外面順著飛石走過來
       */
      sign: { x: LAKE_PORTAL_POINT.x - 3, z: LAKE_PORTAL_POINT.z, facing: 'south' },
    },
  ],
  /**
   * 島中央那一池是水鏡池放大的那一池，倒影本身就是主題，照水鏡池映天空與池邊的松、石與紙燈。
   * 範圍框住池子（半徑十格、岸線吃三格噪音）就好，外面那片湖不映：湖面由布景的掠射反光代替
   */
  mirrorTargetList: [
    {
      id: 'lake-isle-pond',
      centerX: LAKE_CENTER.x,
      centerZ: LAKE_CENTER.z,
      halfSize: ISLAND_POND_RADIUS + 3,
      surface: 'water',
    },
  ],
  boundary: {
    centerX: LAKE_CENTER.x,
    centerZ: LAKE_CENTER.z,
    medium: 'water',
    slowRadius: LAKE_SLOW_RADIUS,
    pushRadius: LAKE_PUSH_RADIUS,
  },
}
