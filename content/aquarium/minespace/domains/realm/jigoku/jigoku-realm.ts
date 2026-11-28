import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { JIGOKU_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { JIGOKU_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { JIGOKU_DRIFT_FEATURE_LIST, JIGOKU_DRIFT_VIEWPOINT_LIST } from './jigoku-drift-features'
import {
  JIGOKU_CENTER,
  JIGOKU_FOOT_Y,
  JIGOKU_PORTAL_POINT,
  JIGOKU_PUSH_RADIUS,
  JIGOKU_SLOW_RADIUS,
  LAVA_AREA_LIGHT_LIMIT,
  RIM_Y,
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
 * 地獄谷那道熔岩縫撐開成一整座火口：火口底是熔岩湖，北壁一道熔岩瀑直接落進湖裡，
 * 南邊高出湖面十格的一彎台地上是回程門、鳥居、熱泉、泥池與噴氣孔；一道石階下到湖面，
 * 接一條貼著熔岩的參道走到湖裡的祠台，路只到那裡（地獄谷：「這裡不能過，也不該過」）。
 * 氣氛照地獄谷那片熱氣：霧是被底下的火染過的暗紅、入夜也不暗；
 * 白天是一片悶著的煙，直射光被火山灰擋掉一半；天一黑，熔岩、火映與遠火山才整個亮出來
 */
export const JIGOKU_REALM: RealmDefinition = {
  id: 'jigoku',
  title: { 'zh-hant': '湯煙谷', 'en': 'Valley of Steam' },
  description: { 'zh-hant': '地獄谷的另一頭，硫煙後面一整座熔岩湖', 'en': 'Beyond Hell Valley, a lake of lava behind the sulphur smoke' },
  signCaption: { 'zh-hant': '硫煙後的熔岩湖', 'en': 'A lake of lava' },
  icon: 'i-material-symbols:volcano',
  /**
   * 站在回程門的北側三格，面朝鳥居與到著台
   *
   * 從大廳往北穿過門，到這裡仍是往北走：先穿過鳥居，三十格外就是崖邊，
   * 走到那裡整座熔岩湖才在腳下攤開；落地這一眼先看到的是鳥居框住的熔岩瀑與稜線上的遠火山。
   * 回去的門就在背後三格，離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: JIGOKU_PORTAL_POINT.x,
    z: JIGOKU_PORTAL_POINT.z - 3,
    pitch: 0.02,
    yaw: YAW_MAP.north,
  },
  isLooping: false,
  hasGardens: false,
  driftFeatureList: JIGOKU_DRIFT_FEATURE_LIST,
  driftViewpointList: JIGOKU_DRIFT_VIEWPOINT_LIST,
  /**
   * 神遊：高度壓在稜線（RIM_Y）之下，看的是火口裡的東西
   *
   * 離最高的東西三到七格：飛過湖面時離熔岩只有幾格，是整趟最好看的一段；
   * 三成五的時候改成沿著木棧、石階與參道低飛
   */
  driftFlight: { isEnabled: true, clearanceMin: 3, clearanceMax: 7, altitudeMax: RIM_Y - 6, routeMode: 'free', glideChance: 0.35 },
  ambientParticleList: JIGOKU_AMBIENT_PARTICLE_LIST,
  /** 整片熔岩（湖、河、兩道瀑布）併成九盞面光源，連同石燈籠與回程門的燈全場十六盞 */
  areaLightLimit: LAVA_AREA_LIGHT_LIMIT,
  atmosphere: {
    fog: {
      /**
       * 被熔岩從底下照紅的煙
       *
       * 地獄谷的霧色（JIGOKU_ATMOSPHERE）是岩漿的橘紅，入夜只暗到八成，因為光源在腳下。
       * 這裡寫成固定值（連夜裡都是這個顏色），同一個道理；但壓得比地獄谷暗得多：
       * 地獄谷的霧是二十格內一堵亮橘的牆，這裡要隔著一百多格看到對面的熔岩瀑，
       * 霧亮了整座湖就是一片橘白。暗紅的霧白天讀成悶著的煙，夜裡讀成火光
       */
      tint: { value: [0.46, 0.2, 0.1] },
      /** 霧推得遠：對面一百多格外的火口壁淡在煙裡但看得見，熔岩瀑是亮的、穿得過來 */
      start: { value: 24 },
      end: { value: 300 },
    },
    light: {
      /** 火山灰擋掉一半的陽光、影子軟下來；天光也收一點，白天是悶的；岩面粗，沒有高光 */
      lightRatio: { value: 0.5 },
      ambientRatio: { value: 0.9 },
      specularRatio: { value: 0.14 },
    },
    cloud: {
      /** 火口上空壓著一層煙與蒸氣凝成的雲，風小，煙才積得住 */
      coverageOffset: { offset: 0.25 },
      stratus: { offset: 0.45 },
      windSpeed: { scale: 0.6 },
    },
    groundMist: {
      /** 清晨台地上常積著一層濕熱的霧 */
      chance: { value: 0.7 },
      density: { scale: 1.2 },
    },
  },
  backdrop: {
    centerX: JIGOKU_CENTER.x,
    centerZ: JIGOKU_CENTER.z,
    ridge: { style: 'caldera', footY: RIM_Y + 0.5, seed: 'valley-of-steam' },
    /** 稜線外走不到的地面是 LAKE_BED，平面與它的頂面同高、一路鋪到地平線 */
    floor: { surfaceY: RIM_Y + 0.5, blockId: BlockId.STONE, isEndless: true },
  },
  /** 往湯煙谷去是一陣暗紅的熱氣，夾著往上飄的火星 */
  transition: {
    fogTint: [1.05, 0.5, 0.26],
    particleColor: [1, 0.72, 0.4],
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
      /** 木牌在門的西側三格、牌面朝北：這裡的人是從到著台沿木棧往門走回來的 */
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
