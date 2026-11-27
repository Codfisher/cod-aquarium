import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  AUTUMN_CENTER,
  AUTUMN_HUB_GATE_OFFSET,
  AUTUMN_PORTAL_POINT,
  AUTUMN_PUSH_RADIUS,
  AUTUMN_SLOW_RADIUS,
  GROVE_GROUND_Y,
  GROVE_RADIUS,
  LOWLAND_Y,
} from './autumn-layout'

/**
 * 大廳那座通往金葉林的門
 *
 * 金葉林屬於金葉苑。門立在箱庭裡、中央偏西北一點的一小塊空地上（AUTUMN_HUB_GATE_OFFSET），
 * 門洞沿 Z 軸攤開、面朝西：金葉苑的鳥居在木座西緣、是這座箱庭的入口，
 * 穿過鳥居踩著一地落葉走十來步，正前方就是門；耙沙與長凳在東南，兩者不搶。
 * 那一圈不種白楊（見 buildAutumnGarden），笠木與木牌不會插進樹冠裡。
 * 木牌在門的北側三格、牌面朝西，順著來路讀得到；
 * 回來時落在門西邊四格的落葉上，面朝門與門後的林子
 */
export const AUTUMN_HUB_GATE = createGardenGate({
  gardenId: 'autumn',
  side: 'west',
  inner: AUTUMN_HUB_GATE_OFFSET,
  targetRealmId: 'autumn',
  signFacing: 'outward',
})

/**
 * 落葉在鏡頭四周幾格內飄
 *
 * 大廳那一份三百多片鋪在金葉苑（半徑十四格）上；林地大了幾十倍，
 * 攤平了等於沒有，所以跟著人走，鋪在身邊同樣半徑十四格的一圈，濃度與箱庭一樣
 */
const LEAF_FOLLOW_RADIUS = 14

/**
 * 金葉林：金葉苑的大場景
 *
 * 金葉苑放大：一塊高起來的林地，白楊照樣疏、地面照樣鋪滿落葉，
 * 林間兩片耙沙各配一張長凳與一盞紙燈，西緣一座鳥居與東緣的回程門遙遙相對；
 * 林地邊緣一圈緩坡長滿落了葉的白楊，再往下是看不到邊的低林與三圈秋色的圓丘。
 * 氣氛是秋天午後：暖黃的霧、光偏柔、高積雲多一點、風輕，落葉一直在掉
 */
export const AUTUMN_REALM: RealmDefinition = {
  id: 'autumn',
  title: { 'zh-hant': '金葉林', 'en': 'Golden Wood' },
  description: { 'zh-hant': '金葉苑的另一頭，一地乾葉的疏林', 'en': 'Beyond the Golden Court, a sparse wood on dry leaves' },
  signCaption: { 'zh-hant': '一地乾葉', 'en': 'A floor of dry leaves' },
  icon: 'i-material-symbols:park',
  /**
   * 站在回程門的西側三格，面朝林地
   *
   * 從大廳往西穿過門，到這裡仍是往西走：那一大片耙沙與長凳在前方，
   * 遠處霧裡是林地另一頭的鳥居，回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: AUTUMN_PORTAL_POINT.x - 3,
    z: AUTUMN_PORTAL_POINT.z,
    pitch: 0.06,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 暖黃，跟著日夜走：秋天午後的空氣裡浮著一層金色的塵 */
      tint: { scale: [1.1, 0.97, 0.78] },
      start: { value: 50 },
      end: { value: 185 },
    },
    light: {
      /** 天光收一點、直射光略強：樹影深一點，落葉被斜陽照亮的那一面才跳得出來 */
      ambientRatio: { scale: 0.94 },
      lightRatio: { scale: 1.04 },
    },
    cloud: {
      /** 秋高氣爽：積雲少一點，高處一片片魚鱗似的高積雲 */
      coverageOffset: { offset: -0.08 },
      altocumulus: { offset: 0.25 },
      windSpeed: { scale: 0.85 },
    },
    groundMist: {
      /** 偶爾有一層薄薄的晨霾，不像湖邊天天都有 */
      chance: { value: 0.5 },
      density: { scale: 0.7 },
    },
  },
  backdrop: {
    centerX: AUTUMN_CENTER.x,
    centerZ: AUTUMN_CENTER.z,
    ridge: { style: 'autumn', footY: LOWLAND_Y + 0.5, seed: 'golden-wood' },
    /** 坡腳外的低林地面：一路鋪到地平線，遠看是一片褐色的落葉 */
    floor: { surfaceY: LOWLAND_Y + 0.5, blockId: BlockId.DIRT, isEndless: true },
  },
  /** 往林子裡去是一陣暖黃的霧，夾著慢慢落下的葉色碎點 */
  transition: {
    fogTint: [1.06, 0.94, 0.78],
    particleColor: [0.95, 0.62, 0.18],
    particleRise: -0.3,
    sound: 'forest-rustle',
  },
  portalList: [
    {
      ...AUTUMN_PORTAL_POINT,
      /** 站在林地草地上的腳底高度 */
      y: GROVE_GROUND_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: AUTUMN_HUB_GATE.landingSpawn,
      /**
       * 與大廳那座同樣在門的北側三格，但牌面朝西：
       * 這裡的人是從林地往門走過來的，大廳那座則是從木座外的白沙走過來
       */
      sign: { x: AUTUMN_PORTAL_POINT.x, z: AUTUMN_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: AUTUMN_CENTER.x,
    centerZ: AUTUMN_CENTER.z,
    medium: 'land',
    slowRadius: AUTUMN_SLOW_RADIUS,
    pushRadius: AUTUMN_PUSH_RADIUS,
  },
  weatherParticle: {
    fallingLeaves: {
      centerX: AUTUMN_CENTER.x,
      centerZ: AUTUMN_CENTER.z,
      radius: GROVE_RADIUS + 6,
      followRadius: LEAF_FOLLOW_RADIUS,
      /** 林地草地頂面再高四格半：白楊的樹冠頂都在這之上，打到地面或小丘的重抽 */
      canopyMinY: GROVE_GROUND_Y + 5,
    },
  },
}
