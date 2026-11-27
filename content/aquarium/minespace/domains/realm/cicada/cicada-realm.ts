import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { CICADA_DRIFT_FEATURE_LIST } from './cicada-drift-features'
import {
  CICADA_CENTER,
  CICADA_GROUND_Y,
  CICADA_HUB_GATE_OFFSET,
  CICADA_PORTAL_POINT,
  CICADA_PUSH_RADIUS,
  CICADA_SLOW_RADIUS,
} from './cicada-layout'

/**
 * 大廳那座通往蟬雨深林的門
 *
 * 蟬時雨四棵樹擠在一起、樹冠合成一張蓋子，底下那片陰影的正中就是門（CICADA_HUB_GATE_OFFSET），
 * 門洞朝南，正對南緣那道朝北的緣廊：坐在廊上，眼前就是樹下那道門。
 * 四棵樹的樹幹一律六格以上（見 buildCicadaGarden），樹冠壓在門的笠木上方，不會插進門框。
 * 木牌在門西側三格、牌面朝南；回來時落在門南邊四格的緣廊上，面朝門
 */
export const CICADA_HUB_GATE = createGardenGate({
  gardenId: 'cicada',
  side: 'south',
  inner: CICADA_HUB_GATE_OFFSET,
  targetRealmId: 'cicada',
  signFacing: 'outward',
})

/**
 * 蟬雨深林：蟬時雨的大場景
 *
 * 蟬時雨那張樹冠的蓋子撐開成一整片林子：光禿禿的樹幹一根根撐上去，頭頂一層葉子鋪到林子外緣，
 * 光只從葉縫漏下來；地上是土與苔、蕨與腐葉，兩道朝北的緣廊、幾盞石燈籠，
 * 最外面一圈樹幹密成一堵牆，遠處是又高又密的闊葉林稜。
 * 氣氛是盛夏正午：太陽很烈、林外一片白亮的暑氣，林下深深的蔭——聲音很大，卻一隻蟬都看不見
 */
export const CICADA_REALM: RealmDefinition = {
  id: 'cicada',
  title: { 'zh-hant': '蟬雨深林', 'en': 'Cicada Wood' },
  description: { 'zh-hant': '蟬時雨的另一頭，盛夏的濃蔭深林', 'en': 'Beyond the Cicada Shower, a deep midsummer shade' },
  signCaption: { 'zh-hant': '蟬雨落無痕', 'en': 'An unseen shower' },
  icon: 'i-material-symbols:sunny',
  driftFeatureList: CICADA_DRIFT_FEATURE_LIST,
  /**
   * 站在回程門北側三格，面朝空地與土徑
   *
   * 從大廳往北穿過門，到這裡仍是往北走：左手邊一道緣廊面朝空地，土徑從前方鑽進林子，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: CICADA_PORTAL_POINT.x,
    z: CICADA_PORTAL_POINT.z - 3,
    pitch: -0.04,
    yaw: YAW_MAP.north,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 偏暖偏白的暑氣，跟著日夜走；霧近一點，林子深處一排排樹幹化進一片亮白裡 */
      tint: { scale: [1.1, 1.04, 0.86] },
      start: { value: 25 },
      end: { value: 150 },
    },
    light: {
      /** 盛夏的烈日：直射光與高光加強、曝光拉高，天光收一點，葉縫漏下的光點與林蔭對比才強 */
      lightRatio: { scale: 1.18 },
      ambientRatio: { scale: 0.9 },
      specularRatio: { scale: 1.1 },
      exposure: { scale: 1.04 },
    },
    cloud: {
      /** 夏天的積雨雲塔，雲不多、風很輕 */
      coverageOffset: { offset: -0.04 },
      congestus: { offset: 0.35 },
      windSpeed: { scale: 0.5 },
    },
    groundMist: {
      /** 盛夏沒有晨霧 */
      chance: { value: 0 },
    },
  },
  backdrop: {
    centerX: CICADA_CENTER.x,
    centerZ: CICADA_CENTER.z,
    ridge: { style: 'canopy', footY: CICADA_GROUND_Y + 0.5, seed: 'cicada-wood' },
    /** 林子外面走不到的地面是 LAKE_BED，平面一路鋪到地平線，從樹幹的縫隙望出去是一片土 */
    floor: { surfaceY: CICADA_GROUND_Y + 0.5, blockId: BlockId.DIRT, isEndless: true },
  },
  /** 往深林去是一陣暖白的暑氣，夾著往下落的綠葉碎點 */
  transition: {
    fogTint: [1.08, 1.02, 0.86],
    particleColor: [0.5, 0.72, 0.28],
    particleRise: -0.2,
    sound: 'insect-cicada',
  },
  portalList: [
    {
      ...CICADA_PORTAL_POINT,
      /** 站在空地上的腳底高度 */
      y: CICADA_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: CICADA_HUB_GATE.landingSpawn,
      /** 木牌在門東側三格、牌面朝北：西側是緣廊那一頭，人是從空地往門走過來的 */
      sign: { x: CICADA_PORTAL_POINT.x + 3, z: CICADA_PORTAL_POINT.z, facing: 'north' },
    },
  ],
  boundary: {
    centerX: CICADA_CENTER.x,
    centerZ: CICADA_CENTER.z,
    medium: 'land',
    slowRadius: CICADA_SLOW_RADIUS,
    pushRadius: CICADA_PUSH_RADIUS,
  },
}
