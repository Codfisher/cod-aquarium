import type { RealmDefinition } from '../realm-definition'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  RIVER_BOUNDARY_CENTER,
  RIVER_CENTER,
  RIVER_PORTAL_POINT,
  RIVER_PUSH_RADIUS,
  RIVER_SLOW_RADIUS,
  UPPER_FLOOR_Y,
  VALLEY_FLOOR_Y,
  WATERFALL_POINT,
} from './river-layout'

/**
 * 大廳那座通往溪谷的門
 *
 * 溪谷屬於遣水，門立在遣水裡面：水道東岸、礫石灘旁的草地上（木座中心往東五格、往北一格），
 * 門洞沿 Z 軸攤開、面朝東。從東邊走上木座，草地上幾顆飛石一路帶到門前（見 buildRiverGarden）；
 * 站在門前往西看，門洞框住的正是水道與後面翻下來的瀑布，穿過門就到了瀑布的那一頭。
 * 門框五格寬，北邊的鹿威、南邊的木橋都碰不到。
 * 木牌在門的北側三格、牌面朝東；回來時落在門東邊四格的飛石上、面朝門與門後的水道
 */
export const RIVER_HUB_GATE = createGardenGate({
  gardenId: 'river',
  side: 'east',
  inner: { x: 5, z: -1 },
  targetRealmId: 'river',
  signFacing: 'outward',
})

/**
 * 溪谷：遣水的大場景
 *
 * 遣水那道水道放大成一道東西向的溪谷：西頭一面二十來格高的崖，瀑布從崖頂的缺口落進圓潭，
 * 溪水往東彎過整片谷底，半途跌一格，下游收進窄峽、鑽進岩縫；南北是長著青苔的谷壁。
 * 氣氛是水氣重的谷：霧近一點、偏青，天光柔、清晨常有貼地的霧，谷裡風小
 */
export const RIVER_REALM: RealmDefinition = {
  id: 'river',
  title: { 'zh-hant': '溪谷', 'en': 'Stream Valley' },
  description: { 'zh-hant': '遣水的另一頭，瀑布落進一道溪谷', 'en': 'Beyond Garden Stream, a waterfall feeds a valley' },
  signCaption: { 'zh-hant': '瀑布下的溪谷', 'en': 'Valley below the falls' },
  icon: 'i-material-symbols:water',
  /**
   * 站在回程門的西側三格，面朝西
   *
   * 從大廳往西穿過門，到這裡仍是往西走：溪水從左前方彎過來，谷底盡頭就是瀑布；
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: RIVER_PORTAL_POINT.x - 3,
    z: RIVER_PORTAL_POINT.z,
    pitch: 0.02,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 帶一點青的白，水氣重；跟著日夜走 */
      tint: { scale: [0.95, 1.01, 0.99] },
      start: { value: 70 },
      end: { value: 210 },
    },
    light: {
      /** 谷裡的光是被谷壁與水氣篩過的：天光多一點、直射光收一點 */
      ambientRatio: { scale: 1.06 },
      lightRatio: { scale: 0.92 },
      specularRatio: { scale: 1.1 },
    },
    cloud: {
      coverageOffset: { offset: 0.06 },
      stratus: { offset: 0.12 },
      windSpeed: { scale: 0.7 },
    },
    groundMist: {
      /** 溪谷的清晨常起霧，貼著水面與草地 */
      chance: { value: 0.7 },
      density: { scale: 1.3 },
    },
  },
  backdrop: {
    centerX: RIVER_CENTER.x,
    centerZ: RIVER_CENTER.z,
    /** 谷壁外面一圈一圈長滿樹的稜，從谷口與稜線的低處望出去就是它 */
    ridge: { style: 'forest', footY: VALLEY_FLOOR_Y, seed: 'stream-valley' },
    /** 主瀑布落進潭裡的那一排：水沫往外噴、水霧順著溪往下游飄 */
    waterfallMist: { x: WATERFALL_POINT.x, y: UPPER_FLOOR_Y + 0.4, z: WATERFALL_POINT.z, halfWidth: 4 },
  },
  /** 往溪谷去是一陣帶著水氣的青白霧，夾著往下落的水沫 */
  transition: {
    fogTint: [0.93, 1.01, 0.99],
    particleColor: [0.86, 0.95, 0.96],
    particleRise: -0.5,
    sound: 'waterfall',
  },
  portalList: [
    {
      ...RIVER_PORTAL_POINT,
      /** 站在谷底草地上的腳底高度 */
      y: VALLEY_FLOOR_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: RIVER_HUB_GATE.landingSpawn,
      /**
       * 與大廳那座同樣在門的北側三格，但牌面朝西：
       * 這裡的人是從谷裡往門走過來的，大廳那座則是從外面順著飛石走過來
       */
      sign: { x: RIVER_PORTAL_POINT.x, z: RIVER_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  /** 四面都是爬不上去的谷壁；這一圈只是保險，比谷底最遠的一點還外面 */
  boundary: {
    centerX: RIVER_BOUNDARY_CENTER.x,
    centerZ: RIVER_BOUNDARY_CENTER.z,
    medium: 'land',
    slowRadius: RIVER_SLOW_RADIUS,
    pushRadius: RIVER_PUSH_RADIUS,
  },
}
