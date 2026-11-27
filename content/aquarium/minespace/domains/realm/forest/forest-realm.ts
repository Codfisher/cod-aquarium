import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { FOREST_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { FOREST_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { FOREST_DRIFT_FEATURE_LIST } from './forest-drift-features'
import {
  FOREST_CENTER,
  FOREST_GROUND_Y,
  FOREST_PORTAL_POINT,
  FOREST_PUSH_RADIUS,
  FOREST_SLOW_RADIUS,
} from './forest-layout'

/**
 * 大廳那座通往林海的門
 *
 * 松籟林的大鳥居在木座南緣，是從禪庭中心走過來的入口；石板小徑從那裡往北穿過林子，
 * 走到正中開成一小片石板空地，門就立在上面（FOREST_GATE_OFFSET），門洞朝南。
 * 穿過密密的松林、一抬頭就是這道門，往北穿過去就到了林海，一路仍是往北走。
 * 木牌在門西側三格、牌面朝南；回來時落在門南邊四格的小徑上，面朝門
 */
export const FOREST_HUB_GATE = createGardenGate({
  gardenId: 'forest',
  side: 'south',
  inner: FOREST_GATE_OFFSET,
  targetRealmId: 'forest',
  signFacing: 'outward',
})

/**
 * 林海：松籟林的大場景
 *
 * 松籟林放大成一片看不到盡頭的松林：起伏的林地、兩格寬的石板小徑從落腳的空地一路繞到
 * 小徑盡頭的空地（鳥居、石燈籠與一棵老橡樹），林子越往外越密，最外面一圈密成一堵牆，
 * 遠處是一層一層淡進霧裡的林稜。氣氛是涼的、綠的，林間一層薄霧
 */
export const FOREST_REALM: RealmDefinition = {
  id: 'forest',
  title: { 'zh-hant': '松濤林海', 'en': 'Sea of Pines' },
  description: { 'zh-hant': '松籟林的另一頭，望不見盡頭的松林', 'en': 'Beyond Pine Grove, a forest without end' },
  signCaption: { 'zh-hant': '望不見盡頭的林', 'en': 'A forest without end' },
  icon: 'i-material-symbols:forest',
  /**
   * 站在回程門的北側三格，面朝空地與小徑
   *
   * 從大廳往北穿過門，到這裡仍是往北走：小徑從腳下穿過空地鑽進林子，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: FOREST_PORTAL_POINT.x,
    z: FOREST_PORTAL_POINT.z - 3,
    pitch: 0.04,
    yaw: YAW_MAP.north,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 林間的霧偏綠偏冷，跟著日夜走；霧近一點，樹一排一排淡進去，看不到底 */
      tint: { scale: [0.9, 1, 0.93] },
      start: { value: 30 },
      end: { value: 150 },
    },
    light: {
      /** 樹冠擋掉一部分直射光，林下偏暗偏柔 */
      lightRatio: { scale: 0.92 },
      ambientRatio: { scale: 0.95 },
    },
    cloud: {
      coverageOffset: { offset: 0.05 },
      windSpeed: { scale: 0.8 },
    },
    groundMist: {
      /** 林間常起霧，比禪庭濃一點 */
      chance: { value: 0.75 },
      density: { scale: 1.3 },
    },
  },
  backdrop: {
    centerX: FOREST_CENTER.x,
    centerZ: FOREST_CENTER.z,
    ridge: { style: 'forest', footY: FOREST_GROUND_Y + 0.5, seed: 'sea-of-pines' },
    /** 林子外面走不到的地面是 LAKE_BED，平面一路鋪到地平線，從林子的縫隙望出去才不會看到世界的邊 */
    floor: { surfaceY: FOREST_GROUND_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往林子裡去是一陣帶綠的霧，夾著往下落的松針 */
  transition: {
    fogTint: [0.88, 1, 0.9],
    particleColor: [0.55, 0.68, 0.4],
    particleRise: -0.4,
    sound: 'forest-rustle',
  },
  portalList: [
    {
      ...FOREST_PORTAL_POINT,
      /** 站在空地草上的腳底高度 */
      y: FOREST_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: FOREST_HUB_GATE.landingSpawn,
      /** 木牌在門的西側三格、牌面朝北：這裡的人是從空地往門走過來的 */
      sign: { x: FOREST_PORTAL_POINT.x - 3, z: FOREST_PORTAL_POINT.z, facing: 'north' },
    },
  ],
  driftFeatureList: FOREST_DRIFT_FEATURE_LIST,
  ambientParticleList: FOREST_AMBIENT_PARTICLE_LIST,
  boundary: {
    centerX: FOREST_CENTER.x,
    centerZ: FOREST_CENTER.z,
    medium: 'land',
    slowRadius: FOREST_SLOW_RADIUS,
    pushRadius: FOREST_PUSH_RADIUS,
  },
}
