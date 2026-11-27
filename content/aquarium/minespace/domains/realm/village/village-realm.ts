import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  FIELD_Y,
  TERRACE_GROUND_Y,
  VILLAGE_CENTER,
  VILLAGE_PORTAL_POINT,
  VILLAGE_PUSH_RADIUS,
  VILLAGE_SLOW_RADIUS,
} from './village-layout'

/**
 * 大廳那座通往村落的門
 *
 * 立在市井坊中央那塊石板廣場上、井的西邊三格，門洞朝西：
 * 市井坊的飛石從禪庭中心過來踩上木座西緣，順著走進廣場，正對著門，門後就是那口有頂棚的井。
 * 門與井並立在廣場的中心，紙燈柱那一圈在外面圍著。
 * 木牌在門南側三格的廣場石板上（北側三格正好在小屋的屋簷底下）、牌面朝西，走過來就讀得到；
 * 回來時落在門西邊四格（廣場與紙燈柱之間），面朝門與門後的井。
 * 不立在井西邊四格：那樣快速前往的落點（門前六格）正好是廣場那圈紙燈柱西邊那一根，人會被放到燈柱頂上
 */
export const VILLAGE_HUB_GATE = createGardenGate({
  gardenId: 'village',
  side: 'west',
  inner: { x: -3, z: 0 },
  targetRealmId: 'village',
  signSide: 1,
  signFacing: 'outward',
})

/**
 * 村落：市井坊的大場景
 *
 * 市井坊放大成一座小村：高出田地一格的台地上，一條七格寬的市街從回程門筆直通到廣場的井，
 * 兩側是攤子與門對著街的小屋，廣場西南角一座放大的鐘樓，東北角一間食肆；
 * 台地外是一塊一塊的花田與乾草，再往外草坡緩緩隆起成一圈丘陵，遠處三圈綠丘。
 * 氣氛是晴朗的鄉間：霧帶一點暖、看得遠，積雲多一點，偶爾清晨田上起霧
 */
export const VILLAGE_REALM: RealmDefinition = {
  id: 'village',
  title: { 'zh-hant': '鐘聲村', 'en': 'Bell Hamlet' },
  description: { 'zh-hant': '市井坊的另一頭，鐘聲裡的小村', 'en': 'Beyond the Market Quarter, a hamlet under the bell' },
  signCaption: { 'zh-hant': '鐘聲裡的小村', 'en': 'A hamlet by the bell' },
  icon: 'i-material-symbols:cottage',
  /**
   * 站在回程門的東側三格，面朝市街與廣場
   *
   * 從大廳往東穿過門，到這裡仍是往東走：兩排攤子夾著市街，盡頭是井與鐘樓，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: VILLAGE_PORTAL_POINT.x + 3,
    z: VILLAGE_PORTAL_POINT.z,
    pitch: 0.06,
    yaw: YAW_MAP.east,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 偏暖一點點，跟著日夜走；霧推遠，丘陵的稜線與後面的布景丘都看得到 */
      tint: { scale: [1.02, 1, 0.95] },
      start: { value: 80 },
      end: { value: 250 },
    },
    cloud: {
      /** 晴朗的鄉間：雲量略少，但丘陵上空常有一朵朵鼓起來的積雲 */
      coverageOffset: { offset: -0.05 },
      congestus: { offset: 0.15 },
      windSpeed: { scale: 0.9 },
    },
    groundMist: {
      /** 有些清晨田上起一層薄霧 */
      chance: { value: 0.35 },
    },
  },
  backdrop: {
    centerX: VILLAGE_CENTER.x,
    centerZ: VILLAGE_CENTER.z,
    ridge: { style: 'hills', footY: FIELD_Y + 0.5, seed: 'bell-hamlet' },
    /** 稜線後面走不到的地面是 LAKE_BED，平面一路鋪到地平線，站上坡回頭也不會看到世界的邊 */
    floor: { surfaceY: FIELD_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往村子去是一陣帶暖的霧，夾著往下飄的花瓣 */
  transition: {
    fogTint: [1.02, 0.98, 0.9],
    particleColor: [1, 0.8, 0.62],
    particleRise: -0.2,
    sound: 'village-crowd',
  },
  portalList: [
    {
      ...VILLAGE_PORTAL_POINT,
      /** 站在台地上的腳底高度 */
      y: TERRACE_GROUND_Y,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: VILLAGE_HUB_GATE.landingSpawn,
      /**
       * 在門的南側三格、牌面朝東：這裡的人是從市街往門走過來的
       */
      sign: { x: VILLAGE_PORTAL_POINT.x, z: VILLAGE_PORTAL_POINT.z + 3, facing: 'east' },
    },
  ],
  boundary: {
    centerX: VILLAGE_CENTER.x,
    centerZ: VILLAGE_CENTER.z,
    medium: 'land',
    slowRadius: VILLAGE_SLOW_RADIUS,
    pushRadius: VILLAGE_PUSH_RADIUS,
  },
}
