import type { RealmDefinition } from '../realm-definition'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  INSECT_CENTER,
  INSECT_GROUND_Y,
  INSECT_HUB_GATE_OFFSET,
  INSECT_PORTAL_POINT,
  INSECT_PUSH_RADIUS,
  INSECT_RIDGE_Y,
  INSECT_SLOW_RADIUS,
} from './insect-layout'

/**
 * 大廳那座通往蟲鳴夜原的門
 *
 * 蟲聲叢正中沒有任何造景，只有高到看不見地面的草——草叢本身就是這座箱庭的主角，
 * 門就立在草叢正中（INSECT_HUB_GATE_OFFSET），四面都是草。門洞朝東：
 * 禪庭中心那串飛石走上木座東緣，buildInsectGarden 從那裡往西踩出一條一格寬的小徑，直通門洞。
 * 木牌在門北側三格、牌面朝東；回來時落在門東邊四格的小徑上，面朝門
 */
export const INSECT_HUB_GATE = createGardenGate({
  gardenId: 'insect',
  side: 'east',
  inner: INSECT_HUB_GATE_OFFSET,
  targetRealmId: 'insect',
  signFacing: 'outward',
})

/**
 * 螢火的濃度，乘在大廳那一份上
 *
 * 螢火在禪庭哪裡都有（見 air-motes），夜裡一小群跟著人飄。
 * 這片草原是蟲的地方，夜裡的草上浮著的螢火要比別處多得多，
 * 一抬眼就是滿坡一閃一閃的綠點
 */
const FIREFLY_DENSITY = 3

/**
 * 蟲鳴夜原：蟲聲叢的大場景
 *
 * 蟲聲叢放大成一片起伏的草原：草種到滿、看不見地面，埋了半截的枯木樁一叢一叢、
 * 圓石堆、幾片長著仙人掌的乾土窪地，一條踩出來的小徑彎彎地穿過去；
 * 外圍一圈低矮的草坡，遠處是一道道又長又暗的丘。
 * 氣氛是偏藍偏暗的，像月下：霧近一點、帶一點藍，光收一些，夜裡螢火比別處多
 */
export const INSECT_REALM: RealmDefinition = {
  id: 'insect',
  title: { 'zh-hant': '蟲鳴夜原', 'en': 'Cricket Downs' },
  description: { 'zh-hant': '蟲聲叢的另一頭，蟲聲鋪滿的草原', 'en': 'Beyond the Insect Thicket, a meadow full of song' },
  signCaption: { 'zh-hant': '碎吟遍野', 'en': 'Song in every blade' },
  icon: 'i-material-symbols:emoji-nature',
  /**
   * 站在回程門西側三格，面朝草原
   *
   * 從大廳往西穿過門，到這裡仍是往西走：小徑從腳下鑽進草裡，回去的門就在背後三格。
   * 離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: INSECT_PORTAL_POINT.x - 3,
    z: INSECT_PORTAL_POINT.z,
    pitch: 0.06,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 偏藍偏冷，跟著日夜走：月下的草原；霧近一點，一道道丘淡進去 */
      tint: { scale: [0.82, 0.9, 1.04] },
      start: { value: 35 },
      end: { value: 160 },
    },
    light: {
      /** 直射光收一些、曝光壓一點，白天也帶著一點傍晚的暗 */
      lightRatio: { scale: 0.86 },
      ambientRatio: { scale: 0.92 },
      exposure: { scale: 0.94 },
    },
    cloud: {
      coverageOffset: { offset: 0.05 },
      windSpeed: { scale: 0.6 },
    },
    groundMist: {
      /** 草上的露氣，清晨幾乎天天起霧，比禪庭濃 */
      chance: { value: 0.85 },
      density: { scale: 1.4 },
    },
  },
  backdrop: {
    centerX: INSECT_CENTER.x,
    centerZ: INSECT_CENTER.z,
    /** 山腳插在坡頂那一層；沒有地面平面（見 INSECT_EDGE_RADIUS） */
    ridge: { style: 'moor', footY: INSECT_RIDGE_Y + 0.5, seed: 'cricket-downs' },
  },
  /** 往草原去是一陣偏藍的暗霧，夾著幾點往上浮的螢綠 */
  transition: {
    fogTint: [0.82, 0.9, 1],
    particleColor: [0.7, 1, 0.45],
    particleRise: 0.2,
    sound: 'insect-cricket',
  },
  portalList: [
    {
      ...INSECT_PORTAL_POINT,
      /** 站在最低那一層草上的腳底高度 */
      y: INSECT_GROUND_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: INSECT_HUB_GATE.landingSpawn,
      /** 木牌在門北側三格、牌面朝西：這裡的人是從草原往門走過來的 */
      sign: { x: INSECT_PORTAL_POINT.x, z: INSECT_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: INSECT_CENTER.x,
    centerZ: INSECT_CENTER.z,
    medium: 'land',
    slowRadius: INSECT_SLOW_RADIUS,
    pushRadius: INSECT_PUSH_RADIUS,
  },
  weatherParticle: {
    fireflyDensity: FIREFLY_DENSITY,
  },
}
