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
  CAMP_SLOW_RADIUS,
  ROCK_WALL_HEIGHT,
} from './campfire-layout'

/**
 * 大廳那座通往拓荒原的門
 *
 * 立在爐火壇火塘的正東四格、原本東側那張矮凳的位置（CAMPFIRE_GATE_OFFSET），門洞朝東：
 * 西、南、北三張矮凳照舊圍著火，第四個「座位」換成了這道門。
 * 從木座東邊走過來，門洞正好框住後面那堆火，往西穿過去就到了拓荒原。
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
 * 拓荒原：爐火壇的大場景
 *
 * 西部拓荒的原野：一片乾草原，一圈走了一整天、停下來歇腳的篷車，篷車邊一堆煮飯的小火；
 * 東北一間蓋到一半的木屋、一架風車抽水機與剛犁的田，一條車轍路往西通向紅岩台地，
 * 遠處一圈平頂的台地與孤峰。爐火壇留下來的是那一團低低的、一直在的劈啪，不是一座大營火。
 * 氣氛是又熱又乾的白天：日頭毒、天空大、遠處一層暖黃的塵霾；雲少，黃昏燒得通紅，夜裡星星很清楚
 */
export const CAMPFIRE_REALM: RealmDefinition = {
  id: 'campfire',
  title: { 'zh-hant': '拓荒原', 'en': 'Frontier Plains' },
  description: { 'zh-hant': '爐火壇的另一頭，紅岩台地下歇腳的篷車', 'en': 'Beyond the Fire Pit, wagons resting beneath red mesas' },
  signCaption: { 'zh-hant': '篷車歇腳的原野', 'en': 'Where the wagons rest' },
  icon: 'i-material-symbols:local-fire-department',
  /**
   * 站在回程門的西側三格，面朝車轍路與篷車圈
   *
   * 從大廳往西穿過門，到這裡仍是往西走：車轍路從腳下通進篷車圈東邊的口，
   * 再往西是一整片乾草原與遠處的台地。回去的門就在背後三格，離觸發範圍還有兩格半
   */
  spawn: {
    x: CAMP_PORTAL_POINT.x - 3,
    z: CAMP_PORTAL_POINT.z,
    pitch: 0.02,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 乾熱的塵霾，暖黃、跟著日夜走；推得很遠，原野要看得到盡頭的台地 */
      tint: { scale: [1.08, 0.97, 0.84] },
      start: { value: 70 },
      end: { value: 260 },
    },
    light: {
      /** 日頭毒：直射光加強、影子硬；天光收一點，背光那一側才深 */
      lightRatio: { scale: 1.12 },
      ambientRatio: { scale: 0.9 },
      specularRatio: { scale: 1.05 },
    },
    cloud: {
      /** 天空大而乾淨：積雲少、層雲幾乎沒有，夜裡星星清楚；高積雲留一點，黃昏才燒得起來 */
      coverageOffset: { offset: -0.22 },
      stratus: { value: 0 },
      altocumulus: { offset: 0.1 },
      windSpeed: { scale: 1.1 },
    },
    groundMist: {
      /** 乾的地方很少起霧 */
      chance: { value: 0.08 },
    },
  },
  backdrop: {
    centerX: CAMP_CENTER.x,
    centerZ: CAMP_CENTER.z,
    ridge: { style: 'mesa', footY: CAMP_GROUND_Y + ROCK_WALL_HEIGHT + 0.5, seed: 'frontier-plains' },
    /** 紅岩壁頂外走不到的地面是 LAKE_BED，平面與壁頂同高、一路鋪到地平線 */
    floor: { surfaceY: CAMP_GROUND_Y + ROCK_WALL_HEIGHT + 0.5, blockId: BlockId.RED_SAND, isEndless: true },
  },
  /** 往拓荒原去是一陣乾熱的暖黃塵土，夾著往上揚的沙 */
  transition: {
    fogTint: [1.1, 0.9, 0.7],
    particleColor: [0.86, 0.6, 0.38],
    particleRise: 0.25,
    sound: 'meadow-wind',
  },
  portalList: [
    {
      ...CAMP_PORTAL_POINT,
      y: CAMP_FOOT_Y,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: CAMPFIRE_HUB_GATE.landingSpawn,
      /** 木牌在門的北側三格、牌面朝西：這裡的人是從篷車圈那邊往門走過來的 */
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
