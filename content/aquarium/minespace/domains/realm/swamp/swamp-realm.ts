import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { SWAMP_DRIFT_FEATURE_LIST } from './swamp-drift-features'
import {
  MARSH_RADIUS,
  SWAMP_CENTER,
  SWAMP_DEEP_FLOOR_Y,
  SWAMP_HUB_GATE_OFFSET,
  SWAMP_PORTAL_POINT,
  SWAMP_PUSH_RADIUS,
  SWAMP_SLOW_RADIUS,
  SWAMP_WATER_SURFACE_Y,
  SWAMP_WATER_Y,
} from './swamp-layout'

/**
 * 大廳那座通往千蛙沼的門
 *
 * 千蛙沼屬於蛙聲澤。蛙聲澤的木棧道沿著木座中線東西橫穿，中段南側那座歇腳的平台
 * 放寬、貼上棧道並整格墊高（見 buildSwampGarden），門就立在平台中央（SWAMP_HUB_GATE_OFFSET），
 * 門洞沿 X 軸攤開、面朝北：沿著棧道走到中段，往南一轉就走進門裡，門的四周都是水。
 * 木牌在門的西側三格、同一座平台上，牌面朝北；
 * 回來時落在門北邊四格、平台北端的木板上，面朝門；選單的快速前往落在門前六格，正好是棧道南邊那排木板
 */
const SWAMP_GARDEN_GATE = createGardenGate({
  gardenId: 'swamp',
  side: 'north',
  inner: SWAMP_HUB_GATE_OFFSET,
  targetRealmId: 'swamp',
  signFacing: 'outward',
})

/**
 * 門洞的腳底高度墊高一格
 *
 * createGardenGate 給的是站在甲板上的高度；平台是整格的木板（頂面比甲板高一格），
 * 門框要立在木板上，觸發範圍也要從木板頂面算起
 */
export const SWAMP_HUB_GATE = {
  ...SWAMP_GARDEN_GATE,
  portal: { ...SWAMP_GARDEN_GATE.portal, y: SWAMP_GARDEN_GATE.portal.y + 1 },
}

/**
 * 霧片在鏡頭四周幾格內鋪
 *
 * 大廳那八十片鋪在蛙聲澤（半徑十二格）上；沼澤大了十幾倍，
 * 攤平了只剩零星幾片，所以跟著人走，鋪在身邊這一圈
 */
const MIST_FOLLOW_RADIUS = 20

/**
 * 千蛙沼：蛙聲澤的大場景
 *
 * 蛙聲澤放大：一大片泥灘與淺水交錯的沼澤，枯木從水裡站起來，水面鋪著睡蓮，
 * 單側有扶手的半磚木棧彎彎曲曲走過整片水，沿途三座歇腳的平台各一盞紙燈；
 * 沼澤外圍的水越來越深，再往外是一片水與遠處低矮的林線。
 * 氣氛是濕的：灰綠的霧收得近、光是散的、層雲壓得低，晨昏時霧片最濃
 */
export const SWAMP_REALM: RealmDefinition = {
  id: 'swamp',
  title: { 'zh-hant': '千蛙沼', 'en': 'Frog Fen' },
  description: { 'zh-hant': '蛙聲澤的另一頭，蛙聲隔著水此起彼落', 'en': 'Beyond Frog Marsh, where frogs answer across the water' },
  signCaption: { 'zh-hant': '蛙聲隔水相應', 'en': 'Frogs call across the water' },
  icon: 'i-material-symbols:water-drop',
  driftFeatureList: SWAMP_DRIFT_FEATURE_LIST,
  /**
   * 站在回程門的東側三格、木棧的起點上，面朝沼澤
   *
   * 從大廳往東穿過門踏上木棧，到這裡仍是往東走：木棧在前方伸進一片水與泥灘之間，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: SWAMP_PORTAL_POINT.x + 3,
    z: SWAMP_PORTAL_POINT.z,
    pitch: 0.06,
    yaw: YAW_MAP.east,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 帶一點綠的濕冷灰，跟著日夜走：與蛙聲澤那片霧同一個調性 */
      tint: { scale: [0.84, 0.92, 0.8] },
      /** 這是白天最淡的時候；疊上蛙聲澤那組沼澤大氣（fogRatio）之後，白天收到六到五十格、晨昏三到二十五格 */
      start: { value: 10 },
      end: { value: 70 },
    },
    light: {
      /** 水氣把陽光散開：直射光弱、天光反而均勻，水面的反光鈍掉 */
      lightRatio: { scale: 0.72 },
      ambientRatio: { scale: 1.04 },
      specularRatio: { scale: 0.6 },
    },
    cloud: {
      coverageOffset: { offset: 0.22 },
      stratus: { offset: 0.45 },
      windSpeed: { scale: 0.5 },
    },
    groundMist: {
      chance: { value: 1 },
      density: { scale: 1.8 },
    },
  },
  backdrop: {
    centerX: SWAMP_CENTER.x,
    centerZ: SWAMP_CENTER.z,
    ridge: { style: 'marsh', footY: SWAMP_WATER_SURFACE_Y, seed: 'frog-fen' },
    /** 沼澤外的水：混著泥的暗綠，正對著看幾乎看不到底 */
    water: { surfaceY: SWAMP_WATER_SURFACE_Y, color: [0.08, 0.12, 0.09] },
    floor: { surfaceY: SWAMP_DEEP_FLOOR_Y + 0.5, blockId: BlockId.CLAY, isEndless: false },
  },
  /** 往沼澤去是一陣灰綠的濕霧，夾著慢慢往上浮的水氣 */
  transition: {
    fogTint: [0.88, 0.96, 0.86],
    particleColor: [0.74, 0.84, 0.7],
    particleRise: 0.2,
    sound: 'swamp-frog',
  },
  portalList: [
    {
      ...SWAMP_PORTAL_POINT,
      /** 站在泥岸上的腳底高度 */
      y: SWAMP_WATER_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: SWAMP_HUB_GATE.landingSpawn,
      /**
       * 與大廳那座同樣在門的北側三格，但牌面朝東：
       * 這裡的人是從木棧往門走過來的，大廳那座則是從木座外的白沙走過來
       */
      sign: { x: SWAMP_PORTAL_POINT.x, z: SWAMP_PORTAL_POINT.z - 3, facing: 'east' },
    },
  ],
  boundary: {
    centerX: SWAMP_CENTER.x,
    centerZ: SWAMP_CENTER.z,
    medium: 'water',
    slowRadius: SWAMP_SLOW_RADIUS,
    pushRadius: SWAMP_PUSH_RADIUS,
  },
  weatherParticle: {
    swampMist: {
      centerX: SWAMP_CENTER.x,
      centerZ: SWAMP_CENTER.z,
      radius: MARSH_RADIUS + 8,
      followRadius: MIST_FOLLOW_RADIUS,
      /**
       * 身邊八格內不生
       *
       * 一片霧十幾格寬，貼著鏡頭生的那幾片每一片都蓋滿整個畫面，一百多片疊起來，
       * 高畫質量到光是霧片就多六毫秒（白天、出生點）。讓出身邊一圈，
       * 包住人的那一層交給場景霧（fogRatio），霧片是一團團壓在前方水上的，走過去才穿進去
       */
      clearRadius: 8,
      /**
       * 生成速度：白天 0.8、晨昏兩倍於蛙聲澤木座上的那一份，夜裡介於兩者
       *
       * 第一版白天只給兩成、讓出身邊十格、高度壓在兩格半以下，幾乎看不到霧
       * （使用者：「怎麼沒有延續實體霧效果」）
       */
      dayDensity: 0.8,
      peakDensity: 2,
      waterSurfaceY: SWAMP_WATER_Y + 0.5,
      /** 比蛙聲澤（0.5～5）低一點：從木棧上看是貼著水面的一層，霧頂約在頭的高度 */
      heightRange: [0.3, 3.5],
      /** 蛙聲澤那組沼澤大氣：白天疊四成半，晨昏九成（霧收到三四格到二十出頭） */
      fogRatio: { day: 0.45, peak: 0.92 },
    },
  },
}
