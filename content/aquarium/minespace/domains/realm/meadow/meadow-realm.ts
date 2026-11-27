import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
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
 * 大廳那座通往野花原的門
 *
 * 草苑的飛石從禪庭中心過來踩上木座西緣。門立在中央偏東兩格、偏南一格的花叢裡
 * （MEADOW_HUB_GATE_OFFSET），門洞朝西：人從西緣走進花叢，孤樹與長凳在左手邊，門在正前方，
 * 坐在長凳上往前看也正對著它。木牌在門南側三格、牌面朝西（北側三格離長凳太近），
 * 回來時落在門西邊四格的花叢裡，面朝門
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
 * 野花原：草苑的大場景
 *
 * 草苑放大成一片起伏到天邊的原野：一座接一座圓圓的草丘，滿地高草，花一叢一叢開，
 * 丘頂偶爾一棵孤樹與一張長凳，中間什麼都沒有。外圍的丘越來越高，遠處是幾圈柔和的嫩綠圓丘。
 * 氣氛是有風的晴天：看得很遠、霧色清，雲是一朵一朵的積雲，風比禪庭大
 */
export const MEADOW_REALM: RealmDefinition = {
  id: 'meadow',
  title: { 'zh-hant': '野花原', 'en': 'Wildflower Downs' },
  description: { 'zh-hant': '草苑的另一頭，風過不留痕的原野', 'en': 'Beyond the Meadow Court, downs where the wind leaves no trace' },
  signCaption: { 'zh-hant': '風過不留痕的原野', 'en': 'Where the wind leaves no trace' },
  icon: 'i-material-symbols:local-florist',
  /**
   * 站在回程門的東側三格，面朝原野
   *
   * 從大廳往東穿過門，到這裡仍是往東走：花叢與草丘一路起伏到天邊，
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
  atmosphere: {
    fog: {
      /** 霧色清，帶一點點綠，跟著日夜走；推遠，一座一座丘淡進去 */
      tint: { scale: [0.97, 1, 0.98] },
      start: { value: 90 },
      end: { value: 260 },
    },
    cloud: {
      /** 晴天裡一朵一朵的積雲，風大一點：草苑的風是主角 */
      coverageOffset: { offset: -0.02 },
      congestus: { offset: 0.2 },
      windSpeed: { scale: 1.35 },
    },
    groundMist: {
      /** 有些清晨丘間積一層薄霧 */
      chance: { value: 0.4 },
      density: { scale: 0.8 },
    },
  },
  backdrop: {
    centerX: MEADOW_CENTER.x,
    centerZ: MEADOW_CENTER.z,
    ridge: { style: 'downs', footY: MEADOW_GROUND_Y + 0.5, seed: 'wildflower-downs' },
    /** 坡後面走不到的地面是 LAKE_BED，平面一路鋪到地平線，站上丘頂回頭也不會看到世界的邊 */
    floor: { surfaceY: MEADOW_GROUND_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往原野去是一陣清淡的綠霧，夾著往上飄的蒲公英絨毛 */
  transition: {
    fogTint: [0.96, 1, 0.94],
    particleColor: [0.98, 0.98, 0.9],
    particleRise: 0.45,
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
}
