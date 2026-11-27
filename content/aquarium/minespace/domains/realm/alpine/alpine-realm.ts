import type { RealmDefinition } from '../realm-definition'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  ALPINE_CENTER,
  ALPINE_POND_LIST,
  ALPINE_PORTAL_POINT,
  ALPINE_PUSH_RADIUS,
  ALPINE_SLOW_RADIUS,
  CLOUD_SEA_SURFACE_Y,
  PORTAL_TERRACE_Y,
} from './alpine-layout'

/**
 * 大廳那座通往雪稜的門
 *
 * 雪稜屬於雪稜丘，門立在雪稜丘裡面：岩稜西南側山腳的那一片雪地上，
 * 夾在岩稜與融雪池之間（木座中心往西八格、往南三格），門洞沿 Z 軸攤開、面朝西。
 * 從禪庭中心過來的飛石從西邊走上木座，雪地上再幾顆飛石一路帶到門前（見 buildAlpineGarden）；
 * 門背後就是拔起來的岩稜，穿過門往東，到了雪稜仍是面朝岩稜。
 * 木牌在門的北側三格、牌面朝西；回來時落在門西邊四格的飛石上、面朝門
 */
export const ALPINE_HUB_GATE = createGardenGate({
  gardenId: 'alpine',
  side: 'west',
  inner: { x: -8, z: 3 },
  targetRealmId: 'alpine',
  signFacing: 'outward',
})

/**
 * 雪稜：雪稜丘的大場景
 *
 * 雪稜丘那道岩稜放大成一座浮在雲海上的雪山：稜線從西北走到東南，兩頭拔起走不上去的岩峰，
 * 兩側的雪坡往外落到一圈雪原，外緣是斷崖，崖下是雲海；四周一圈積雪的遠山。
 * 氣氛是高山上稀薄的空氣：光又亮又硬、天藍得深、看得很遠，雲少、風大
 */
export const ALPINE_REALM: RealmDefinition = {
  id: 'alpine',
  title: { 'zh-hant': '雪稜', 'en': 'Snow Ridgeline' },
  description: { 'zh-hant': '雪稜丘的另一頭，雲海上的一道山稜', 'en': 'Beyond Snow Ridge, a ridgeline above the clouds' },
  signCaption: { 'zh-hant': '雲海上的山稜', 'en': 'A ridge above the clouds' },
  icon: 'i-material-symbols:landscape',
  /**
   * 站在回程門的東側三格，面朝東
   *
   * 從大廳往東穿過門，到這裡仍是往東走：岩稜斜斜橫在正前方，西北那座岩峰在左手邊；
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: ALPINE_PORTAL_POINT.x + 3,
    z: ALPINE_PORTAL_POINT.z,
    pitch: 0.02,
    yaw: YAW_MAP.east,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 冷的藍白，跟著日夜走；空氣稀薄，霧推得很遠 */
      tint: { scale: [0.92, 0.97, 1.08] },
      start: { value: 140 },
      end: { value: 340 },
    },
    light: {
      /** 高山上的光又亮又硬：直射光與高光加強，天光收一點，影子才深 */
      lightRatio: { scale: 1.12 },
      ambientRatio: { scale: 0.94 },
      specularRatio: { scale: 1.25 },
      /** 滿地的雪很亮，曝光收一點，雪面才不會整片頂到白 */
      exposure: { scale: 0.94 },
    },
    cloud: {
      /** 雲海在腳下，頭頂的雲少；風大，雲走得快 */
      coverageOffset: { offset: -0.18 },
      stratus: { scale: 0.3 },
      congestus: { scale: 0.5 },
      windSpeed: { scale: 1.9 },
    },
    groundMist: {
      /** 雪原上沒有晨霧：低處的水氣都沉在雲海裡 */
      chance: { value: 0 },
    },
  },
  backdrop: {
    centerX: ALPINE_CENTER.x,
    centerZ: ALPINE_CENTER.z,
    ridge: { style: 'snowpeak', footY: CLOUD_SEA_SURFACE_Y, seed: 'snow-ridgeline' },
    cloudSea: { surfaceY: CLOUD_SEA_SURFACE_Y },
  },
  /** 往山上去是一陣冷白的霧，夾著往下飄的細雪 */
  transition: {
    fogTint: [0.94, 0.98, 1.08],
    particleColor: [0.94, 0.97, 1],
    particleRise: -0.25,
    sound: 'alpine-wind',
  },
  portalList: [
    {
      ...ALPINE_PORTAL_POINT,
      /** 站在雪台上的腳底高度 */
      y: PORTAL_TERRACE_Y + 1,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: ALPINE_HUB_GATE.landingSpawn,
      /**
       * 與大廳那座同樣在門的北側三格，但牌面朝東：
       * 這裡的人是從山上往門走過來的，大廳那座則是從外面順著飛石走過來
       */
      sign: { x: ALPINE_PORTAL_POINT.x, z: ALPINE_PORTAL_POINT.z - 3, facing: 'east' },
    },
  ],
  /** 兩窪融雪池的冰面映著天，與雪稜丘那一窪一樣（見 water-mirror） */
  mirrorTargetList: ALPINE_POND_LIST.map((pond) => ({
    id: pond.id,
    centerX: pond.x,
    centerZ: pond.z,
    halfSize: Math.ceil(pond.radius) + 2,
    surface: 'ice' as const,
  })),
  /** 雪原外圈迎著崖下吹上來的風，越往外越走不動，過了推回線被風推回來；斷崖在推回線外六格以上 */
  boundary: {
    centerX: ALPINE_CENTER.x,
    centerZ: ALPINE_CENTER.z,
    medium: 'land',
    slowRadius: ALPINE_SLOW_RADIUS,
    pushRadius: ALPINE_PUSH_RADIUS,
  },
}
