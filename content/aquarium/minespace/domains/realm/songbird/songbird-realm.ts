import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  SONGBIRD_CENTER,
  SONGBIRD_GROUND_Y,
  SONGBIRD_HUB_GATE_OFFSET,
  SONGBIRD_OUTER_FLOOR_Y,
  SONGBIRD_PORTAL_POINT,
  SONGBIRD_PUSH_RADIUS,
  SONGBIRD_SLOW_RADIUS,
} from './songbird-layout'

/**
 * 大廳那座通往百囀林苑的門
 *
 * 鳴禽庭正中是那只飲水盤，門就立在它東邊緊挨著（SONGBIRD_HUB_GATE_OFFSET），門洞朝東：
 * 禪庭中心那串飛石走上木座東緣，往西一看，門洞框著飲水盤與後面兩株矮橡樹。
 * 木牌在門北側三格（東北那株橡樹的樹冠底下）、牌面朝東；
 * 回來時落在門東邊四格的花草上，面朝門與飲水盤
 */
export const SONGBIRD_HUB_GATE = createGardenGate({
  gardenId: 'songbird',
  side: 'east',
  inner: SONGBIRD_HUB_GATE_OFFSET,
  targetRealmId: 'songbird',
  signFacing: 'outward',
})

/**
 * 百囀林苑：鳴禽庭的大場景
 *
 * 鳴禽庭放大成一座被林子圍住的園子：開滿花的草地上一叢一叢的矮橡樹、
 * 十座鳥屋、六只飲水盤，外圍一圈越來越密的橡樹把風擋在外面，遠處是幾圈和緩的綠丘。
 * 氣氛是清朗柔和的：霧推得很遠、天光足、雲少、幾乎沒有風——底噪愈乾淨，旋律愈清楚
 */
export const SONGBIRD_REALM: RealmDefinition = {
  id: 'songbird',
  title: { 'zh-hant': '百囀林苑', 'en': 'Songbird Arbor' },
  description: { 'zh-hant': '鳴禽庭的另一頭，沒有風聲水聲的林苑', 'en': 'Beyond the Songbird Court, an arbor without wind or stream' },
  signCaption: { 'zh-hant': '唯留清羽囀', 'en': 'Only birdsong' },
  icon: 'i-material-symbols:raven',
  /**
   * 站在回程門西側三格，面朝園子
   *
   * 從大廳往西穿過門，到這裡仍是往西走：第一只飲水盤在前方幾步，樹叢與鳥屋散在後面，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: SONGBIRD_PORTAL_POINT.x - 3,
    z: SONGBIRD_PORTAL_POINT.z,
    pitch: 0.04,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 幾乎不染色、推得很遠：清朗的空氣，對面的樹叢一叢一叢看得清楚 */
      tint: { scale: [0.98, 1, 1.02] },
      start: { value: 110 },
      end: { value: 260 },
    },
    light: {
      /** 天光足、高光收一點：光是柔的，林蔭底下也不會太暗 */
      ambientRatio: { scale: 1.06 },
      specularRatio: { scale: 0.9 },
    },
    cloud: {
      /** 雲少、沒有層雲，風幾乎停了 */
      coverageOffset: { offset: -0.12 },
      stratus: { value: 0 },
      windSpeed: { scale: 0.35 },
    },
    groundMist: {
      chance: { value: 0.25 },
      density: { scale: 0.6 },
    },
  },
  backdrop: {
    centerX: SONGBIRD_CENTER.x,
    centerZ: SONGBIRD_CENTER.z,
    ridge: { style: 'arbor', footY: SONGBIRD_GROUND_Y + 0.5, seed: 'songbird-arbor' },
    /** 林子外面走不到的地面是 LAKE_BED，平面一路鋪到地平線，從樹縫望出去才不會看到世界的邊 */
    floor: { surfaceY: SONGBIRD_OUTER_FLOOR_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往林苑去是一陣清透的白霧，夾著慢慢飄的細羽 */
  transition: {
    fogTint: [0.96, 1, 1],
    particleColor: [0.95, 0.94, 0.86],
    particleRise: 0.15,
    sound: 'bird-blackbird',
  },
  portalList: [
    {
      ...SONGBIRD_PORTAL_POINT,
      /** 站在草地上的腳底高度 */
      y: SONGBIRD_GROUND_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: SONGBIRD_HUB_GATE.landingSpawn,
      /** 木牌在門北側三格、牌面朝西：這裡的人是從園子往門走過來的 */
      sign: { x: SONGBIRD_PORTAL_POINT.x, z: SONGBIRD_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
  boundary: {
    centerX: SONGBIRD_CENTER.x,
    centerZ: SONGBIRD_CENTER.z,
    medium: 'land',
    slowRadius: SONGBIRD_SLOW_RADIUS,
    pushRadius: SONGBIRD_PUSH_RADIUS,
  },
}
