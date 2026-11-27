import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  ARRIVAL_POND,
  RAINVALE_CENTER,
  RAINVALE_GROUND_Y,
  RAINVALE_HUB_GATE_OFFSET,
  RAINVALE_PORTAL_POINT,
  RAINVALE_PUSH_RADIUS,
  RAINVALE_SLOW_RADIUS,
} from './rainvale-layout'

/**
 * 大廳那座通往聽雨林的門
 *
 * 立在聽雨亭那窪積水的東南（RAINVALE_HUB_GATE_OFFSET），門洞沿 Z 軸攤開、面朝東：
 * 亭子在積水西邊、椅子朝東，坐在亭子裡隔著水望出去就是這道門；
 * 從禪庭中心過來的人由東邊踏上木座，走三四步就到門前，往西穿過去。
 * 木牌在門北側三格的草上、牌面朝東；回來時落在門東邊四格的木座邊上，面朝門與門後的亭子
 */
export const RAINVALE_HUB_GATE = createGardenGate({
  gardenId: 'rainvale',
  side: 'east',
  inner: RAINVALE_HUB_GATE_OFFSET,
  targetRealmId: 'rainvale',
  signFacing: 'outward',
})

/**
 * 聽雨林：聽雨亭的大場景
 *
 * 聽雨亭的三樣東西（闊葉樹、積水、小木亭）鋪成一整片下著雨的闊葉林。
 * 雨從頭到尾不停，只是一陣大一陣小；遠處偶爾打雷。
 * 林子外圈一路密起來、地面隆成坡，雨霧裡看不到盡頭
 */
export const RAINVALE_REALM: RealmDefinition = {
  id: 'rainvale',
  title: { 'zh-hant': '聽雨林', 'en': 'Rain Grove' },
  description: { 'zh-hant': '聽雨亭的另一頭，一片雨下不停的闊葉林', 'en': 'Beyond Rain Pavilion, a broadleaf grove where the rain never stops' },
  signCaption: { 'zh-hant': '雨打翠葉的林子', 'en': 'Rain on green leaves' },
  icon: 'i-material-symbols:rainy',
  /**
   * 站在回程門的西側三格，面朝西
   *
   * 從大廳往西穿過門，到這裡仍是往西走：腳下是池的東岸，那一池水與池西岸的亭子就在正前方，
   * 回去的門在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: RAINVALE_PORTAL_POINT.x - 3,
    z: RAINVALE_PORTAL_POINT.z,
    pitch: 0.08,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  /**
   * 雨天的霧、光與天色由天氣那一層給（use-weather 的 RAIN_ATMOSPHERE，雨勢滿檔時整份換過去）；
   * 這裡只給雨勢最小的那幾刻露出來的那一點：偏綠的濕霧、樹冠下暗一點
   */
  atmosphere: {
    fog: {
      tint: { scale: [0.88, 0.97, 0.92] },
      start: { value: 10 },
      end: { value: 60 },
    },
    light: {
      lightRatio: { scale: 0.9 },
      ambientRatio: { scale: 0.96 },
    },
    cloud: {
      /** 雨雲壓得低、鋪得滿，風慢 */
      coverageOffset: { offset: 0.3 },
      stratus: { value: 0.85 },
      windSpeed: { scale: 0.7 },
    },
    groundMist: {
      /** 雨裡不起晨霧（雨霧已經整片壓下來） */
      chance: { value: 0 },
    },
  },
  /**
   * 整片林子都在下雨，與聽雨亭木座正中同一場雨（雨勢一）；
   * 一陣大一陣小，最小的時候也還是在下，看得遠一點。只有這裡會打雷
   */
  weather: {
    rain: { min: 0.78, max: 1, periodSecond: 150 },
    hasThunder: true,
  },
  backdrop: {
    centerX: RAINVALE_CENTER.x,
    centerZ: RAINVALE_CENTER.z,
    /**
     * 不給遠山：雨霧二三十格外就是一片灰，山稜不吃一般的霧，掛在雨裡反而突兀。
     * 林子外面走不到的地面是 LAKE_BED，平面一路鋪到地平線，從樹縫望出去才不會看到世界的邊
     */
    floor: { surfaceY: RAINVALE_GROUND_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往雨林去是一陣帶綠的濕霧，夾著往下落的雨珠 */
  transition: {
    fogTint: [0.82, 0.92, 0.88],
    particleColor: [0.74, 0.82, 0.92],
    particleRise: -0.9,
    sound: 'rain-foliage',
  },
  portalList: [
    {
      ...RAINVALE_PORTAL_POINT,
      /** 站在草地上的腳底高度 */
      y: RAINVALE_GROUND_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: RAINVALE_HUB_GATE.landingSpawn,
      /** 木牌在門的北側三格、牌面朝西：這裡的人是從林子往門走過來的 */
      sign: { x: RAINVALE_PORTAL_POINT.x, z: RAINVALE_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: RAINVALE_CENTER.x,
    centerZ: RAINVALE_CENTER.z,
    medium: 'land',
    slowRadius: RAINVALE_SLOW_RADIUS,
    pushRadius: RAINVALE_PUSH_RADIUS,
  },
  /**
   * 聽雨亭那窪積水有倒影（大廳的 HUB_MIRROR_TARGET_LIST），落腳這一池照樣映：
   * 雨打碎的倒影是這座箱庭的一部分。只映這一池，其餘小窪不映（一面鏡子等於那一帶多畫一趟）
   */
  mirrorTargetList: [
    {
      id: 'rainvale-arrival-pond',
      centerX: ARRIVAL_POND.x,
      centerZ: ARRIVAL_POND.z,
      halfSize: Math.ceil(ARRIVAL_POND.radius) + 3,
      surface: 'water',
    },
  ],
}
