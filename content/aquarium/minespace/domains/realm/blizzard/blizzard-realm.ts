import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { BLIZZARD_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { BLIZZARD_DRIFT_FEATURE_LIST } from './blizzard-drift-features'
import {
  BLIZZARD_CENTER,
  BLIZZARD_GROUND_Y,
  BLIZZARD_HUB_GATE_OFFSET,
  BLIZZARD_PORTAL_POINT,
  BLIZZARD_PUSH_RADIUS,
  BLIZZARD_SLOW_RADIUS,
  BLIZZARD_SNOW_LEVEL,
} from './blizzard-layout'

/**
 * 大廳那座通往白矇雪原的門
 *
 * 立在吹雪野正中偏北一格（BLIZZARD_HUB_GATE_OFFSET），門洞沿 X 軸攤開、面朝北：
 * 從禪庭中心過來的人由北邊踏上木座，白裡先浮出門上那三盞燈的暈，走近才看出是一道門，
 * 往南穿過去。吹雪野不擺建築（有體積的東西一出現就佔滿畫面），門只有細樁與一道橫樑，
 * 而且自己會發光，與那三盞石燈籠是同一種存在。
 * 木牌在門西側三格、牌面朝北；回來時落在門北邊四格的雪上，面朝門
 */
export const BLIZZARD_HUB_GATE = createGardenGate({
  gardenId: 'blizzard',
  side: 'north',
  inner: BLIZZARD_HUB_GATE_OFFSET,
  targetRealmId: 'blizzard',
  signFacing: 'outward',
})

/**
 * 白矇雪原：吹雪野的大場景
 *
 * 吹雪野那場暴風雪鋪滿整片雪原，而且幾乎不停：大部分時候白到幾格外什麼都沒有，
 * 偶爾風勢鬆一點，十幾格外的燈籠暈才浮出來。聲音只剩風
 */
export const BLIZZARD_REALM: RealmDefinition = {
  id: 'blizzard',
  title: { 'zh-hant': '白矇雪原', 'en': 'Whiteout Plain' },
  description: { 'zh-hant': '吹雪野的另一頭，風把一切都吹走的雪原', 'en': 'Beyond Whiteout Field, a snowfield the wind has emptied' },
  signCaption: { 'zh-hant': '只剩風聲', 'en': 'Only the wind' },
  icon: 'i-material-symbols:weather-snowy',
  driftFeatureList: BLIZZARD_DRIFT_FEATURE_LIST,
  ambientParticleList: BLIZZARD_AMBIENT_PARTICLE_LIST,
  /**
   * 站在回程門的南側三格，面朝南
   *
   * 從大廳往南穿過門，到這裡仍是往南走；第一根木樁就在眼前，回去的門在背後三格（白矇裡也看得到門上的燈）
   */
  spawn: {
    x: BLIZZARD_PORTAL_POINT.x,
    z: BLIZZARD_PORTAL_POINT.z + 3,
    pitch: 0.1,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  /**
   * 暴風雪的霧、光與天色由天氣那一層給（SNOW_ATMOSPHERE，與世界邊界那道白幕同一組數字）；
   * 這裡只是風勢鬆開那幾刻露出來的底：冷白、霧推到四十格，光從四面八方來
   */
  atmosphere: {
    fog: {
      tint: { scale: [0.96, 0.98, 1.04] },
      start: { value: 2 },
      end: { value: 40 },
    },
    light: {
      lightRatio: { scale: 0.85 },
      /** 滿地的雪很亮，曝光收一點，雪面才不會整片頂到白 */
      exposure: { scale: 0.92 },
    },
    cloud: {
      coverageOffset: { offset: 0.4 },
      stratus: { value: 1 },
      windSpeed: { scale: 2 },
    },
    groundMist: {
      chance: { value: 0 },
    },
  },
  /**
   * 雪勢在七成二與滿檔之間起落，大部分時候在八成以上：
   * 滿檔是吹雪野木座正中那一場（六格外一片白）；鬆到最小時霧推到十幾格，天仍是白的
   */
  weather: {
    snow: { ...BLIZZARD_SNOW_LEVEL, periodSecond: 80 },
  },
  backdrop: {
    centerX: BLIZZARD_CENTER.x,
    centerZ: BLIZZARD_CENTER.z,
    /** 雪原外面走不到的地面是 LAKE_BED，雪面一路鋪到地平線 */
    floor: { surfaceY: BLIZZARD_GROUND_Y + 0.5, blockId: BlockId.SNOW, isEndless: true },
  },
  /** 往雪原去是一陣刺白的風雪，夾著橫著飛的細雪 */
  transition: {
    fogTint: [1, 1.02, 1.08],
    particleColor: [0.95, 0.97, 1],
    particleRise: -0.15,
    sound: 'blizzard-roar',
  },
  portalList: [
    {
      ...BLIZZARD_PORTAL_POINT,
      y: BLIZZARD_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: BLIZZARD_HUB_GATE.landingSpawn,
      /** 木牌在門的西側三格、牌面朝南：這裡的人是從雪原往門走回來的 */
      sign: { x: BLIZZARD_PORTAL_POINT.x - 3, z: BLIZZARD_PORTAL_POINT.z, facing: 'south' },
    },
  ],
  /** 白矇裡看不到邊：外圈的雪丘越堆越高，走上去越走越慢，過了推回線被風推回來 */
  boundary: {
    centerX: BLIZZARD_CENTER.x,
    centerZ: BLIZZARD_CENTER.z,
    medium: 'land',
    slowRadius: BLIZZARD_SLOW_RADIUS,
    pushRadius: BLIZZARD_PUSH_RADIUS,
  },
}
