import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { RUINS_GATE_OFFSET } from '../../garden/garden-layout'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  RUINS_CENTER,
  RUINS_FOOT_Y,
  RUINS_GROUND_Y,
  RUINS_PORTAL_POINT,
  RUINS_PUSH_RADIUS,
  RUINS_RIM_HEIGHT,
  RUINS_SLOW_RADIUS,
} from './ruins-layout'

/**
 * 大廳那座通往石殿遺址的門
 *
 * 立在石廊跡那一圈斷柱裡面、石碑南邊兩格（RUINS_GATE_OFFSET），門洞朝南：
 * 斷柱那一圈南邊那一根塌了，留出一道口，從禪庭中心過來穿過那道口就站在門前，
 * 門洞正好框住後面那塊刻紋石碑，往北穿過去就到了石殿遺址。
 * 木牌在門東側三格（西側三格是一塊倒下的青苔石）、牌面朝南；回來時落在門南邊四格、那道口上，面朝門與石碑
 */
export const RUINS_HUB_GATE = createGardenGate({
  gardenId: 'ruins',
  side: 'south',
  inner: RUINS_GATE_OFFSET,
  targetRealmId: 'ruins',
  signSide: 1,
  signFacing: 'outward',
})

/**
 * 石殿遺址：石廊跡的大場景
 *
 * 石廊跡放大成一整座荒廢的石殿：兩排石柱夾著的長廊、塌了一半的拱門、沒了屋頂的大殿
 * （正中是石廊跡那一圈斷柱與石碑）、北端一間屋頂完好的石室。殿外一片長著石生植物的荒地，
 * 四周隆起成亂石坡，遠處一圈灰色的岩稜。氣氛是灰的、冷的、靜的：雲多、光散、霧偏冷灰
 */
export const RUINS_REALM: RealmDefinition = {
  id: 'ruins',
  title: { 'zh-hant': '石殿遺址', 'en': 'Fallen Temple' },
  description: { 'zh-hant': '石廊跡的另一頭，荒廢的石殿與長廊', 'en': 'Beyond the Stone Colonnade, a temple long abandoned' },
  signCaption: { 'zh-hant': '荒廢的石殿', 'en': 'A temple in ruins' },
  icon: 'i-material-symbols:temple-buddhist',
  /**
   * 站在回程門的北側三格，面朝長廊
   *
   * 從大廳往北穿過門，到這裡仍是往北走：兩排石柱一路夾到拱門，後面是大殿的斷牆，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: RUINS_PORTAL_POINT.x,
    z: RUINS_PORTAL_POINT.z - 3,
    pitch: 0.02,
    yaw: YAW_MAP.north,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /**
       * 偏冷的灰，跟著日夜走
       *
       * 霧推得比禪庭遠一點（40～220）：亂石坡外那幾尊巨像（ruins-colossi）自己往地平線色混一到五成半，
       * 坡頂在霧裡要比最近的巨像淡得少，近的坡、中間的巨像、最遠的岩稜才是一層一層退進霧裡
       */
      tint: { scale: [0.93, 0.96, 1] },
      start: { value: 40 },
      end: { value: 220 },
    },
    light: {
      /** 雲層厚，直射光收一截、影子軟；石面粗，高光也收 */
      lightRatio: { scale: 0.86 },
      ambientRatio: { scale: 1.04 },
      specularRatio: { scale: 0.7 },
    },
    cloud: {
      /** 低低的一層灰雲，層雲多、雲塔少，風比禪庭大一點，從斷牆的縫裡穿過去 */
      coverageOffset: { offset: 0.14 },
      stratus: { offset: 0.3 },
      congestus: { offset: -0.1 },
      windSpeed: { scale: 1.15 },
    },
    groundMist: {
      /** 清晨殿裡常積一層霧，石頭吸了一夜的濕氣 */
      chance: { value: 0.5 },
      density: { scale: 1.2 },
    },
  },
  backdrop: {
    centerX: RUINS_CENTER.x,
    centerZ: RUINS_CENTER.z,
    ridge: { style: 'crag', footY: RUINS_GROUND_Y + RUINS_RIM_HEIGHT + 0.5, seed: 'fallen-temple' },
    /** 坡頂外走不到的地面是 LAKE_BED，平面與坡頂同高、一路鋪到地平線 */
    floor: { surfaceY: RUINS_GROUND_Y + RUINS_RIM_HEIGHT + 0.5, blockId: BlockId.STONE, isEndless: true },
  },
  /** 往石殿去是一陣冷灰的霧，夾著往下落的石屑 */
  transition: {
    fogTint: [0.9, 0.92, 0.95],
    particleColor: [0.72, 0.72, 0.7],
    particleRise: -0.15,
    sound: 'alpine-wind',
  },
  portalList: [
    {
      ...RUINS_PORTAL_POINT,
      y: RUINS_FOOT_Y,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: RUINS_HUB_GATE.landingSpawn,
      /** 木牌在門的西側三格、牌面朝北：這裡的人是從長廊往門走過來的 */
      sign: { x: RUINS_PORTAL_POINT.x - 3, z: RUINS_PORTAL_POINT.z, facing: 'north' },
    },
  ],
  boundary: {
    centerX: RUINS_CENTER.x,
    centerZ: RUINS_CENTER.z,
    medium: 'land',
    slowRadius: RUINS_SLOW_RADIUS,
    pushRadius: RUINS_PUSH_RADIUS,
  },
}
