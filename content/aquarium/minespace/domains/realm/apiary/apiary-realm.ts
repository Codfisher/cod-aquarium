import type { RealmDefinition } from '../realm-definition'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  APIARY_CENTER,
  APIARY_FLOOR_Y,
  APIARY_HUB_GATE_OFFSET,
  APIARY_PORTAL_POINT,
  APIARY_PUSH_RADIUS,
  APIARY_RIDGE_Y,
  APIARY_SLOW_RADIUS,
} from './apiary-layout'

/**
 * 大廳那座通往萬花蜂台的門
 *
 * 蜂巢圃正中三個蜂箱北側原本是一道七格的竹籬，人得繞路才靠得近。
 * 門嵌進竹籬正中（APIARY_HUB_GATE_OFFSET），竹籬分成門兩側的兩段籬，
 * 門洞朝北：從禪庭中心那串飛石走上木座，正前方就是這道門，門洞框著後面那疊蜂箱。
 * 預設的木牌位置（門西側三格）正好是西段竹籬，往北挪一格立在籬前，牌面朝北；
 * 回來時落在門北邊四格的木地板上，面朝門與蜂箱
 */
const GATE = createGardenGate({
  gardenId: 'apiary',
  side: 'north',
  inner: APIARY_HUB_GATE_OFFSET,
  targetRealmId: 'apiary',
  signFacing: 'outward',
})

export const APIARY_HUB_GATE = {
  ...GATE,
  portal: {
    ...GATE.portal,
    sign: { x: GATE.portal.x - 3, z: GATE.portal.z - 1, facing: 'north' as const },
  },
}

/**
 * 萬花蜂台：蜂巢圃的大場景
 *
 * 蜂巢圃放大成一座碗狀的花谷：谷底一大疊蜂箱、北側一道竹籬，四周五層花台種滿同一組花，
 * 花台上散著十幾組照蜂巢圃擺的蜂箱，四道木階的小徑上下；最上層外面一圈花坡圍住，
 * 遠處是一圈一圈暖色的圓丘。氣氛是晴朗溫暖的花季午後，空氣裡一層淡淡的金
 */
export const APIARY_REALM: RealmDefinition = {
  id: 'apiary',
  title: { 'zh-hant': '萬花蜂台', 'en': 'Hive Terraces' },
  description: { 'zh-hant': '蜂巢圃的另一頭，層層花台上的蜂箱', 'en': 'Beyond the Bee Yard, hives on terraces of bloom' },
  signCaption: { 'zh-hant': '層層花台', 'en': 'Terraces of bloom' },
  icon: 'i-material-symbols:hive',
  /**
   * 站在回程門南側三格，面朝谷底那疊蜂箱
   *
   * 從大廳往南穿過門，到這裡仍是往南走：竹籬與蜂箱在正前方，四周的花台一層層往上收，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: APIARY_PORTAL_POINT.x,
    z: APIARY_PORTAL_POINT.z + 3,
    pitch: 0.02,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 暖黃，跟著日夜走：花季的空氣裡浮著一層花粉的金；霧推遠一點，對面的花台看得清楚 */
      tint: { scale: [1.06, 1, 0.84] },
      start: { value: 70 },
      end: { value: 210 },
    },
    light: {
      /** 晴朗的午後：直射光略強，花色才跳得出來 */
      lightRatio: { scale: 1.06 },
      ambientRatio: { scale: 1.02 },
    },
    cloud: {
      /** 晴天積雲，少一點、低一點，風輕 */
      coverageOffset: { offset: -0.06 },
      congestus: { offset: 0.12 },
      windSpeed: { scale: 0.7 },
    },
    groundMist: {
      /** 偶爾清晨谷底積一層薄霧 */
      chance: { value: 0.3 },
      density: { scale: 0.6 },
    },
  },
  backdrop: {
    centerX: APIARY_CENTER.x,
    centerZ: APIARY_CENTER.z,
    /**
     * 山腳插在花坡稜線那一層；沒有地面平面（見 APIARY_EDGE_RADIUS），
     * 稜線外走不到的 LAKE_BED 從谷裡看不到
     */
    ridge: { style: 'bloom', footY: APIARY_RIDGE_Y + 0.5, seed: 'hive-terraces' },
  },
  /** 往花谷去是一陣暖黃的霧，夾著往上飄的花粉 */
  transition: {
    fogTint: [1.05, 0.98, 0.8],
    particleColor: [1, 0.82, 0.3],
    particleRise: 0.3,
    sound: 'bee',
  },
  portalList: [
    {
      ...APIARY_PORTAL_POINT,
      /** 站在谷底草地上的腳底高度 */
      y: APIARY_FLOOR_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: APIARY_HUB_GATE.landingSpawn,
      /** 木牌在門西側三格、牌面朝南：這裡的人是從谷底往門走過來的 */
      sign: { x: APIARY_PORTAL_POINT.x - 3, z: APIARY_PORTAL_POINT.z, facing: 'south' },
    },
  ],
  boundary: {
    centerX: APIARY_CENTER.x,
    centerZ: APIARY_CENTER.z,
    medium: 'land',
    slowRadius: APIARY_SLOW_RADIUS,
    pushRadius: APIARY_PUSH_RADIUS,
  },
}
