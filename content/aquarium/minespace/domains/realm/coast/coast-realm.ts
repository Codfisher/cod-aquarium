import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { COAST_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import { COAST_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { COAST_DRIFT_FEATURE_LIST } from './coast-drift-features'
import {
  COAST_CENTER,
  COAST_PORTAL_POINT,
  COAST_PUSH_RADIUS,
  COAST_SLOW_RADIUS,
  DUNE_GROUND_Y,
  SEA_FLOOR_Y,
  SEA_WATER_SURFACE_Y,
} from './coast-layout'

/**
 * 大廳那座通往海中沙島的門
 *
 * 立在潮汐磯沙地的正中偏北一格（COAST_GATE_OFFSET），門洞朝北：
 * 從北緣的大鳥居走進來，往南穿過整片沙地，門框正好框住門後那一池淺海，
 * 穿過門就到了大海中央的沙島。漂流木挪到西半邊，鳥居到門這一路是空的沙。
 * 木牌在門西側三格、牌面朝北；回來時落在門北邊四格的沙上，面朝門與門後的海
 */
export const COAST_HUB_GATE = createGardenGate({
  gardenId: 'coast',
  side: 'north',
  inner: COAST_GATE_OFFSET,
  targetRealmId: 'coast',
  signFacing: 'outward',
})

/**
 * 海中沙島：潮汐磯的大場景
 *
 * 潮汐磯那一角沙灘放大成大海中央的一座小沙島：被潮水磨出來的岸線、一圈時乾時濕的灘與潮池、
 * 水底的沙與珊瑚、被海風壓扁的相思樹、漂流木、擱淺的小舟、淺海裡的鳥居；四面是看不到邊的海。
 * 氣氛是晴朗的海邊：光亮一點、暖一點，海平線上一層水氣，積雲多、風大
 */
export const COAST_REALM: RealmDefinition = {
  id: 'coast',
  title: { 'zh-hant': '海中沙島', 'en': 'Sand Isle' },
  description: { 'zh-hant': '潮汐磯的另一頭，大海中央的一座沙島', 'en': 'Beyond Tidal Rocks, a sand isle in the open sea' },
  signCaption: { 'zh-hant': '大海中央的沙島', 'en': 'A sand isle at sea' },
  icon: 'i-material-symbols:waves',
  /**
   * 站在回程門的南側三格，面朝島上
   *
   * 從大廳往南穿過門，到這裡仍是往南走：相思樹、小舟與南岸外淺海裡的鳥居在正前方，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: COAST_PORTAL_POINT.x,
    z: COAST_PORTAL_POINT.z + 3,
    pitch: 0.06,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 海上的水氣偏白偏一點點暖，霧遠一點，海平線才是一層亮的薄霧而不是一堵牆 */
      tint: { scale: [1.02, 1.01, 1] },
      start: { value: 80 },
      end: { value: 300 },
    },
    light: {
      /** 海邊的光又亮又硬，沙與水把光反上來，高光也亮一點 */
      lightRatio: { scale: 1.08 },
      ambientRatio: { scale: 1.05 },
      specularRatio: { scale: 1.2 },
      exposure: { scale: 1.03 },
    },
    cloud: {
      /** 海上的積雲：一朵一朵往上長，層雲少，風大 */
      coverageOffset: { offset: 0.05 },
      congestus: { offset: 0.25 },
      stratus: { scale: 0.4 },
      windSpeed: { scale: 1.6 },
    },
    groundMist: {
      /** 晨霧偶爾才有：海風一吹就散 */
      chance: { value: 0.25 },
      density: { scale: 0.7 },
    },
  },
  backdrop: {
    centerX: COAST_CENTER.x,
    centerZ: COAST_CENTER.z,
    ridge: { style: 'islet', footY: SEA_WATER_SURFACE_Y, seed: 'sand-isle' },
    /** 海比湖偏青 */
    water: { surfaceY: SEA_WATER_SURFACE_Y, color: [0.07, 0.2, 0.32] },
    floor: { surfaceY: SEA_FLOOR_Y + 0.5, blockId: BlockId.SAND, isEndless: false },
  },
  /** 往海上去是一陣亮白帶青的霧，夾著往下落的浪花 */
  transition: {
    fogTint: [0.96, 1.01, 1.05],
    particleColor: [0.9, 0.97, 1],
    particleRise: -0.35,
    sound: 'ocean-wave',
  },
  portalList: [
    {
      ...COAST_PORTAL_POINT,
      /** 站在島上沙地的腳底高度 */
      y: DUNE_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: COAST_HUB_GATE.landingSpawn,
      /** 木牌在門的西側三格、牌面朝南：這裡的人是從島上往門走過來的 */
      sign: { x: COAST_PORTAL_POINT.x - 3, z: COAST_PORTAL_POINT.z, facing: 'south' },
    },
  ],
  driftFeatureList: COAST_DRIFT_FEATURE_LIST,
  ambientParticleList: COAST_AMBIENT_PARTICLE_LIST,
  boundary: {
    centerX: COAST_CENTER.x,
    centerZ: COAST_CENTER.z,
    medium: 'water',
    slowRadius: COAST_SLOW_RADIUS,
    pushRadius: COAST_PUSH_RADIUS,
  },
  /** 整片淺海都有湧浪，浪頭貼著島的岸線拍上來（見 water-surface 的折射） */
  swellArea: {
    centerX: COAST_CENTER.x,
    centerZ: COAST_CENTER.z,
    halfSize: COAST_PUSH_RADIUS,
  },
}
