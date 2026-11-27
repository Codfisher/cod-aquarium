import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { CAMPFIRE_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  CAMP_CENTER,
  CAMP_FOOT_Y,
  CAMP_GROUND_Y,
  CAMP_PORTAL_POINT,
  CAMP_PUSH_RADIUS,
  CAMP_RIDGE_HEIGHT,
  CAMP_SLOW_RADIUS,
} from './campfire-layout'

/**
 * 大廳那座通往營火谷的門
 *
 * 立在爐火壇火塘的正東四格、原本東側那張矮凳的位置（CAMPFIRE_GATE_OFFSET），門洞朝東：
 * 西、南、北三張矮凳照舊圍著火，第四個「座位」換成了這道門。
 * 從木座東邊走過來，門洞正好框住後面那堆火，往西穿過去就到了營火谷。
 * 木牌在門北側三格、牌面朝東；回來時落在門東邊四格的白沙上，面朝門與門後的火
 */
export const CAMPFIRE_HUB_GATE = createGardenGate({
  gardenId: 'campfire',
  side: 'east',
  inner: CAMPFIRE_GATE_OFFSET,
  targetRealmId: 'campfire',
  signFacing: 'outward',
})

/**
 * 營火谷：爐火壇的大場景
 *
 * 爐火壇放大成一片林緣的谷地：正中一座大篝火，四周散著六處小營地（每一處都是一座爐火壇），
 * 谷底是開闊的草地，外圍一圈橡樹林沿著谷坡長上去。氣氛是暖的、帶一點煙，
 * 天光收一點，入夜之後整座谷只剩一團一團的火光
 */
export const CAMPFIRE_REALM: RealmDefinition = {
  id: 'campfire',
  title: { 'zh-hant': '營火谷', 'en': 'Campfire Hollow' },
  description: { 'zh-hant': '爐火壇的另一頭，林緣谷地裡的一圈圈篝火', 'en': 'Beyond the Fire Pit, campfires in a wooded hollow' },
  signCaption: { 'zh-hant': '林緣的篝火', 'en': 'Fires by the wood' },
  icon: 'i-material-symbols:local-fire-department',
  /**
   * 站在回程門的西側三格，面朝土路與大篝火
   *
   * 從大廳往西穿過門，到這裡仍是往西走：土路從腳下通到二十格外的大篝火，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: CAMP_PORTAL_POINT.x - 3,
    z: CAMP_PORTAL_POINT.z,
    pitch: 0.05,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 柴煙把霧染暖，跟著日夜走（夜裡照樣是暗的）；霧近一點，林子一排一排淡進煙裡 */
      tint: { scale: [1.06, 0.95, 0.84] },
      start: { value: 40 },
      end: { value: 165 },
    },
    light: {
      /**
       * 天光收一截，影子那一側暗下來，火光才說了算
       *
       * 夜裡天光本來就弱，這一截主要作用在黃昏：火已經點起來、天還沒黑，
       * 營地四周那一圈暖色在發灰的谷地裡浮出來
       */
      ambientRatio: { scale: 0.86 },
      lightRatio: { scale: 0.96 },
      specularRatio: { scale: 0.8 },
    },
    cloud: {
      /** 谷地上空雲少一點、風輕，煙才一縷一縷直直往上 */
      coverageOffset: { offset: -0.06 },
      windSpeed: { scale: 0.7 },
    },
    groundMist: {
      /** 谷底常起一層薄霧，混著前一夜的柴煙 */
      chance: { value: 0.5 },
      density: { scale: 1.1 },
    },
  },
  backdrop: {
    centerX: CAMP_CENTER.x,
    centerZ: CAMP_CENTER.z,
    ridge: { style: 'woodland', footY: CAMP_GROUND_Y + CAMP_RIDGE_HEIGHT + 0.5, seed: 'campfire-hollow' },
    /** 稜線外走不到的地面是 LAKE_BED，平面與稜線同高、一路鋪到地平線 */
    floor: { surfaceY: CAMP_GROUND_Y + CAMP_RIDGE_HEIGHT + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往營火谷去是一陣暖橘的煙，夾著往上竄的火星 */
  transition: {
    fogTint: [1.06, 0.86, 0.66],
    particleColor: [1, 0.56, 0.2],
    particleRise: 0.55,
    sound: 'campfire',
  },
  portalList: [
    {
      ...CAMP_PORTAL_POINT,
      y: CAMP_FOOT_Y,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: CAMPFIRE_HUB_GATE.landingSpawn,
      /** 木牌在門的北側三格、牌面朝西：這裡的人是從大篝火那邊往門走過來的 */
      sign: { x: CAMP_PORTAL_POINT.x, z: CAMP_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: CAMP_CENTER.x,
    centerZ: CAMP_CENTER.z,
    medium: 'land',
    slowRadius: CAMP_SLOW_RADIUS,
    pushRadius: CAMP_PUSH_RADIUS,
  },
}
