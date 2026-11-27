import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { MEADOW_DRIFT_FEATURE_LIST } from './meadow-drift-features'
import {
  MEADOW_CENTER,
  MEADOW_GROUND_Y,
  MEADOW_HUB_GATE_OFFSET,
  MEADOW_PORTAL_LEVEL,
  MEADOW_PORTAL_POINT,
  MEADOW_PUSH_RADIUS,
  MEADOW_SLOW_RADIUS,
} from './meadow-layout'

/**
 * 大廳那座通往風露原的門
 *
 * 風露苑的飛石從禪庭中心過來踩上木座西緣，順著拔掉草的小徑走到中央偏東兩格、偏南一格的門前
 * （MEADOW_HUB_GATE_OFFSET），門洞朝西：孤樹與長凳在左手邊，門在正前方，
 * 坐在長凳上往前看也正對著它。木牌在門南側三格、牌面朝西（北側三格離長凳太近），
 * 回來時落在門西邊四格的小徑上，面朝門
 */
export const MEADOW_HUB_GATE = createGardenGate({
  gardenId: 'meadow',
  side: 'west',
  inner: MEADOW_HUB_GATE_OFFSET,
  targetRealmId: 'meadow',
  signSide: 1,
  signFacing: 'outward',
})

/**
 * 螢火的濃度，乘在大廳那一份上
 *
 * 螢火在禪庭哪裡都有（見 air-motes），夜裡一小群跟著人飄。
 * 這片原野入夜是蟲的地方，草上浮著的螢火要比別處多得多，
 * 一抬眼就是滿坡一閃一閃的綠點
 */
const FIREFLY_DENSITY = 3

/**
 * 風露原：風露苑的大場景
 *
 * 由野花原（草苑的大場景）與蟲鳴夜原（蟲聲叢的大場景）併成：
 * 一座接一座圓圓的草丘起伏到天邊，花色一帶一帶不同，丘頂偶爾一棵孤樹與一張長凳，
 * 丘間的谷底是長著仙人掌的乾土窪地，草裡散著埋了半截的枯木樁與圓石堆。
 *
 * 氣氛只有一套，白天與夜裡都要成立：霧色清、帶一點點青，白天看得很遠、雲是一朵一朵的積雲、風比禪庭大；
 * 光只收一點點，入夜才不會比別處亮（夜裡的主角是蟲聲與螢火，不是月下的景）
 */
export const MEADOW_REALM: RealmDefinition = {
  id: 'meadow',
  title: { 'zh-hant': '風露原', 'en': 'Dewwind Downs' },
  description: { 'zh-hant': '風露苑的另一頭，晝是風、夜是蟲的原野', 'en': 'Beyond the Dewwind Court, downs of wind by day and song by night' },
  signCaption: { 'zh-hant': '晝風夜吟', 'en': 'Wind by day, song by night' },
  icon: 'i-material-symbols:emoji-nature',
  /**
   * 站在回程門的東側三格，面朝原野
   *
   * 從大廳往東穿過門，到這裡仍是往東走：小徑從腳下鑽進草裡，花叢與草丘一路起伏到天邊，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: MEADOW_PORTAL_POINT.x + 3,
    z: MEADOW_PORTAL_POINT.z,
    pitch: 0.04,
    yaw: YAW_MAP.east,
  },
  isLooping: false,
  hasGardens: false,
  driftFeatureList: MEADOW_DRIFT_FEATURE_LIST,
  atmosphere: {
    fog: {
      /** 清而帶一點點青，跟著日夜走；推遠，一座一座丘淡進去 */
      tint: { scale: [0.93, 0.98, 1] },
      start: { value: 70 },
      end: { value: 220 },
    },
    light: {
      lightRatio: { scale: 0.96 },
      ambientRatio: { scale: 0.97 },
    },
    cloud: {
      /** 晴天裡一朵一朵的積雲，風大一點：白天的風是主角 */
      coverageOffset: { offset: 0.02 },
      congestus: { offset: 0.14 },
      windSpeed: { scale: 1.15 },
    },
    groundMist: {
      /** 草上的露氣，清晨常在丘間積一層霧 */
      chance: { value: 0.65 },
      density: { scale: 1.1 },
    },
  },
  backdrop: {
    centerX: MEADOW_CENTER.x,
    centerZ: MEADOW_CENTER.z,
    ridge: { style: 'downs', footY: MEADOW_GROUND_Y + 0.5, seed: 'wildflower-downs' },
    /** 坡後面走不到的地面是 LAKE_BED，平面一路鋪到地平線，站上丘頂回頭也不會看到世界的邊 */
    floor: { surfaceY: MEADOW_GROUND_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往原野去是一陣清淡的青霧，夾著往上飄的蒲公英絨毛，帶一點螢綠 */
  transition: {
    fogTint: [0.92, 1, 0.95],
    particleColor: [0.9, 1, 0.72],
    particleRise: 0.35,
    sound: 'meadow-wind',
  },
  portalList: [
    {
      ...MEADOW_PORTAL_POINT,
      /** 站在門前那塊平地上的腳底高度 */
      y: MEADOW_GROUND_Y + MEADOW_PORTAL_LEVEL + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: MEADOW_HUB_GATE.landingSpawn,
      /** 木牌在門的南側三格、牌面朝東：這裡的人是從原野往門走過來的 */
      sign: { x: MEADOW_PORTAL_POINT.x, z: MEADOW_PORTAL_POINT.z + 3, facing: 'east' },
    },
  ],
  boundary: {
    centerX: MEADOW_CENTER.x,
    centerZ: MEADOW_CENTER.z,
    medium: 'land',
    slowRadius: MEADOW_SLOW_RADIUS,
    pushRadius: MEADOW_PUSH_RADIUS,
  },
  weatherParticle: {
    fireflyDensity: FIREFLY_DENSITY,
  },
}
