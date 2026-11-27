import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { WHEATFIELD_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { WHEATFIELD_DRIFT_FEATURE_LIST } from './wheatfield-drift-features'
import {
  WHEATFIELD_CENTER,
  WHEATFIELD_GROUND_Y,
  WHEATFIELD_HUB_GATE_OFFSET,
  WHEATFIELD_PORTAL_LEVEL,
  WHEATFIELD_PORTAL_POINT,
  WHEATFIELD_PUSH_RADIUS,
  WHEATFIELD_SLOW_RADIUS,
} from './wheatfield-layout'

/**
 * 大廳那座通往千頃麥浪的門
 *
 * 麥浪田在禪庭正中，出生點就在它南緣外、面朝北看著那條碎石路，門不能擋在那一眼的正中央。
 * 所以立在路西側五格的麥子裡（WHEATFIELD_HUB_GATE_OFFSET），門洞朝東對著路，
 * 路與門之間鋪一小段碎石；路東側五格是稻草人，一門一人分站路的兩側。
 * 人沿著路走進田中央、往西一拐就穿過去。木牌在門北側三格的麥子裡、牌面朝東，
 * 回來時落在門東邊四格的路邊，面朝門
 */
export const WHEATFIELD_HUB_GATE = createGardenGate({
  gardenId: 'wheatfield',
  side: 'east',
  inner: WHEATFIELD_HUB_GATE_OFFSET,
  targetRealmId: 'wheatfield',
  signFacing: 'outward',
})

/**
 * 千頃麥浪：麥浪田的大場景
 *
 * 麥浪田放大成一望無際的麥田：一塊一塊的田拼到天邊，壟各走各的方向，
 * 地面又長又緩地起伏，風一吹整片麥子從這頭倒到那頭；兩條碎石路在中央交成十字，
 * 路邊是石燈籠與一堆堆草束，田裡站著稻草人。外圍只有一道很矮的緩坡，
 * 坡後是一路鋪到地平線的麥色與幾道很淡的遠丘。氣氛是金色的午後：霧帶金、光暖、雲少、風大一點
 */
export const WHEATFIELD_REALM: RealmDefinition = {
  id: 'wheatfield',
  title: { 'zh-hant': '千頃麥浪', 'en': 'Sea of Wheat' },
  description: { 'zh-hant': '麥浪田的另一頭，風吹過千頃金浪', 'en': 'Beyond the Wheat Field, golden waves to the horizon' },
  signCaption: { 'zh-hant': '風吹千頃金浪', 'en': 'Golden waves to the horizon' },
  icon: 'i-material-symbols:grass',
  /**
   * 站在回程門的西側三格，面朝碎石路與十字路口
   *
   * 從大廳往西穿過門，到這裡仍是往西走：路從腳下一路通到十字路口，兩側是看不到邊的麥子，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: WHEATFIELD_PORTAL_POINT.x - 3,
    z: WHEATFIELD_PORTAL_POINT.z,
    pitch: 0.05,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  driftFeatureList: WHEATFIELD_DRIFT_FEATURE_LIST,
  ambientParticleList: WHEATFIELD_AMBIENT_PARTICLE_LIST,
  atmosphere: {
    fog: {
      /** 霧帶金，跟著日夜走；推得很遠，坡後那片麥色與遠丘才看得到 */
      tint: { scale: [1.06, 1, 0.84] },
      start: { value: 80 },
      end: { value: 250 },
    },
    light: {
      /** 曬熟的麥子要一點暖的直射光 */
      lightRatio: { scale: 1.06 },
      exposure: { scale: 1.03 },
    },
    cloud: {
      /** 晴、雲少，風比禪庭大：麥浪要有風才動得起來，天上的雲也跟著走快一點 */
      coverageOffset: { offset: -0.08 },
      windSpeed: { scale: 1.25 },
    },
    groundMist: {
      /** 平原很少起霧 */
      chance: { value: 0.2 },
    },
  },
  backdrop: {
    centerX: WHEATFIELD_CENTER.x,
    centerZ: WHEATFIELD_CENTER.z,
    ridge: { style: 'plains', footY: WHEATFIELD_GROUND_Y + 0.5, seed: 'sea-of-wheat' },
    /**
     * 緩坡後面走不到的地面是 LAKE_BED，平面一路鋪到地平線
     *
     * 借草束的貼圖：坡很矮，從田裡望得到坡後那一片，遠看是一路金黃到天邊的麥色
     */
    floor: { surfaceY: WHEATFIELD_GROUND_Y + 0.5, blockId: BlockId.HAY, isEndless: true },
  },
  /** 往麥田去是一陣金色的暖霧，夾著往上飄的麥芒與花粉 */
  transition: {
    fogTint: [1.06, 0.98, 0.82],
    particleColor: [0.96, 0.8, 0.42],
    particleRise: 0.25,
    sound: 'wheat-wind',
  },
  portalList: [
    {
      ...WHEATFIELD_PORTAL_POINT,
      /** 站在路上的腳底高度 */
      y: WHEATFIELD_GROUND_Y + WHEATFIELD_PORTAL_LEVEL + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: WHEATFIELD_HUB_GATE.landingSpawn,
      /** 木牌在門的北側三格、牌面朝西：這裡的人是從路上往門走過來的 */
      sign: { x: WHEATFIELD_PORTAL_POINT.x, z: WHEATFIELD_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: WHEATFIELD_CENTER.x,
    centerZ: WHEATFIELD_CENTER.z,
    medium: 'land',
    slowRadius: WHEATFIELD_SLOW_RADIUS,
    pushRadius: WHEATFIELD_PUSH_RADIUS,
  },
}
