import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { JIGOKU_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { JIGOKU_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { JIGOKU_DRIFT_FEATURE_LIST } from './jigoku-drift-features'
import {
  JIGOKU_CENTER,
  JIGOKU_FLOOR_Y,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  JIGOKU_PUSH_RADIUS,
  JIGOKU_SLOW_RADIUS,
  VALLEY_WALL_HEIGHT,
} from './jigoku-layout'

/**
 * 大廳那座通往湯煙谷的門
 *
 * 立在地獄谷南岸、鳥居與熔岩縫之間，原本那塊刻紋石碑的位置（JIGOKU_GATE_OFFSET），門洞朝南：
 * 從禪庭中心過來先穿過鳥居，眼前就是這道門，門後兩步就是那條發光的縫。
 * 石碑往西讓了一格半、立在門旁（木牌的位置往北挪，見 garden-builders-middle 的 buildJigokuGarden），
 * 那一對石燈籠移到鳥居與門之間、夾著走道。回來時落在門南邊四格、鳥居外的木座邊上，面朝門
 */
export const JIGOKU_HUB_GATE = createGardenGate({
  gardenId: 'jigoku',
  side: 'south',
  inner: JIGOKU_GATE_OFFSET,
  targetRealmId: 'jigoku',
  signFacing: 'outward',
})

/**
 * 湯煙谷：地獄谷的大場景
 *
 * 地獄谷放大成一整道地熱谷：谷底正中是那道熔岩縫，兩側冒著蒸氣的噴氣孔、滾著的熱泉與泥池，
 * 硫磺把岩染黃，一條圍著柵欄的木棧繞著縫走一圈；兩側谷壁兩格一階、爬不上去。
 * 氣氛照地獄谷那片熱氣：霧壓得很近、顏色是被地底的火染過的暖色，入夜也不暗；
 * 直射光被熱氣散掉一大截、天光反而亮（地面那池光往上打）、岩面沒有高光
 */
export const JIGOKU_REALM: RealmDefinition = {
  id: 'jigoku',
  title: { 'zh-hant': '湯煙谷', 'en': 'Valley of Steam' },
  description: { 'zh-hant': '地獄谷的另一頭，冒著硫煙的熱谷', 'en': 'Beyond Hell Valley, a valley of sulphur and steam' },
  signCaption: { 'zh-hant': '硫煙裡的熱谷', 'en': 'Sulphur and steam' },
  icon: 'i-material-symbols:volcano',
  /**
   * 站在回程門的北側三格，面朝鳥居與木棧
   *
   * 從大廳往北穿過門，到這裡仍是往北走：先穿過鳥居，再往前就是那一圈木棧與碑後的熔岩縫，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: JIGOKU_PORTAL_POINT.x,
    z: JIGOKU_PORTAL_POINT.z - 3,
    pitch: 0.06,
    yaw: YAW_MAP.north,
  },
  isLooping: false,
  hasGardens: false,
  driftFeatureList: JIGOKU_DRIFT_FEATURE_LIST,
  ambientParticleList: JIGOKU_AMBIENT_PARTICLE_LIST,
  atmosphere: {
    fog: {
      /**
       * 地獄谷那片熱氣的顏色，往硫磺的黃偏一點
       *
       * 地獄谷的霧色（JIGOKU_ATMOSPHERE）是岩漿的橘紅，入夜只暗到八成，因為光源在腳下。
       * 這裡寫成固定值（連夜裡都是這個顏色），同一個道理；色相往黃挪，
       * 整道谷是一片硫煙與蒸氣，不是只有一道岩漿縫的那一小座
       */
      tint: { value: [1, 0.6, 0.3] },
      /** 霧壓得很近：熱泉與噴氣孔看得清楚，對面的谷壁融在一片湯煙裡 */
      start: { value: 4 },
      end: { value: 50 },
    },
    light: {
      /** 照地獄谷：熱氣把陽光散開、影子軟下來；地面那池光往上打，天光比晴天亮；岩面粗，沒有高光 */
      lightRatio: { value: 0.58 },
      ambientRatio: { value: 1.1 },
      specularRatio: { value: 0.14 },
    },
    cloud: {
      /** 谷上空常壓著一層蒸氣凝成的雲，風小，煙才積得住 */
      coverageOffset: { offset: 0.1 },
      stratus: { offset: 0.25 },
      windSpeed: { scale: 0.6 },
    },
    groundMist: {
      /** 天天清晨谷底都積著一層濕熱的霧 */
      chance: { value: 1 },
      density: { scale: 1.5 },
    },
  },
  backdrop: {
    centerX: JIGOKU_CENTER.x,
    centerZ: JIGOKU_CENTER.z,
    ridge: { style: 'caldera', footY: JIGOKU_FLOOR_Y + VALLEY_WALL_HEIGHT + 0.5, seed: 'valley-of-steam' },
    /** 谷壁頂外走不到的地面是 LAKE_BED，平面與谷壁頂同高、一路鋪到地平線 */
    floor: { surfaceY: JIGOKU_FLOOR_Y + VALLEY_WALL_HEIGHT + 0.5, blockId: BlockId.STONE, isEndless: true },
  },
  /** 往湯煙谷去是一陣暖黃的熱氣，夾著往上飄的水氣 */
  transition: {
    fogTint: [1.05, 0.66, 0.36],
    particleColor: [1, 0.9, 0.72],
    particleRise: 0.45,
    sound: 'jigoku-lava',
  },
  portalList: [
    {
      ...JIGOKU_PORTAL_POINT,
      y: JIGOKU_FOOT_Y,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: JIGOKU_HUB_GATE.landingSpawn,
      /** 木牌在門的西側三格、牌面朝北：這裡的人是從木棧往門走過來的 */
      sign: { x: JIGOKU_PORTAL_POINT.x - 3, z: JIGOKU_PORTAL_POINT.z, facing: 'north' },
    },
  ],
  boundary: {
    centerX: JIGOKU_CENTER.x,
    centerZ: JIGOKU_CENTER.z,
    medium: 'land',
    slowRadius: JIGOKU_SLOW_RADIUS,
    pushRadius: JIGOKU_PUSH_RADIUS,
  },
}
