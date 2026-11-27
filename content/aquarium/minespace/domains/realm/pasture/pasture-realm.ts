import type { GardenGate } from '../garden-gate'
import type { RealmDefinition } from '../realm-definition'
import { BlockId } from '../../block/block-constants'
import { createGardenGate, YAW_MAP } from '../garden-gate'
import {
  PASTURE_GROUND_Y,
  PASTURE_HUB_GATE_OFFSET,
  PASTURE_PORTAL_POINT,
  PASTURE_PUSH_RADIUS,
  PASTURE_REALM_CENTER,
  PASTURE_SHEEP_FLOCK,
  PASTURE_SLOW_RADIUS,
} from './pasture-layout'

/**
 * 大廳那座通往羊鳴谷的門
 *
 * 牧野的柵欄在北邊留了一道三格寬的門，門立在那道柵欄門裡面一格（PASTURE_HUB_GATE_OFFSET），
 * 門洞朝北對著它：人從北邊穿過柵欄門就是傳送門，羊群在門後吃草。
 * 回來時落在門北邊四格、柵欄門外的木座邊上，面朝門。
 *
 * 木牌不放在門旁三格：那一格就在北邊柵欄的正後面，牌面朝北會貼在欄杆上。
 * 改立在柵欄外、門東側三格的木座邊上（柵欄與木座外緣之間那一排），牌面朝北，
 * 人從飛石走過來、還沒進柵欄門就讀得到
 */
const PASTURE_GATE = createGardenGate({
  gardenId: 'pasture',
  side: 'north',
  inner: PASTURE_HUB_GATE_OFFSET,
  targetRealmId: 'pasture',
  signSide: 1,
  signFacing: 'outward',
})
export const PASTURE_HUB_GATE: GardenGate = {
  ...PASTURE_GATE,
  portal: {
    ...PASTURE_GATE.portal,
    sign: { x: PASTURE_GATE.portal.x + 3, z: PASTURE_GATE.portal.z - 2, facing: 'north' },
  },
}

/**
 * 羊鳴谷：牧野的大場景
 *
 * 牧野放大成一座東西向的山谷：平坦的谷底一大圈柵欄放羊，東西兩頭的坡腳各一小圈，
 * 兩側的坡上幾道長柵欄把山坡隔成一塊一塊的草場，角落堆著乾草、擺著木板水槽，草被啃得稀稀的。
 * 坡越往外越陡，最外面是一圈山，遠處是幾道更高、更暗的山。
 * 氣氛是涼一點的山谷：霧色偏青、雲多一點、層雲偏多，清晨常起谷霧
 */
export const PASTURE_REALM: RealmDefinition = {
  id: 'pasture',
  title: { 'zh-hant': '羊鳴谷', 'en': 'Bleating Vale' },
  description: { 'zh-hant': '牧野的另一頭，柵欄圍起的山谷牧場', 'en': 'Beyond the Pasture, a fenced valley of grazing sheep' },
  signCaption: { 'zh-hant': '羊群吃草的山谷', 'en': 'A valley of grazing sheep' },
  icon: 'i-material-symbols:pets',
  /**
   * 站在回程門的南側三格，面朝柵欄門與羊群
   *
   * 從大廳往南穿過門，到這裡仍是往南走：兩格外就是放羊那一圈的柵欄門，門裡是羊群，
   * 再過去是南坡一塊一塊的草場，回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: PASTURE_PORTAL_POINT.x,
    z: PASTURE_PORTAL_POINT.z + 3,
    pitch: 0.02,
    yaw: YAW_MAP.south,
  },
  isLooping: false,
  hasGardens: false,
  atmosphere: {
    fog: {
      /** 山谷裡的霧偏青、近一點，對面的坡一層層淡進去 */
      tint: { scale: [0.93, 1, 0.97] },
      start: { value: 60 },
      end: { value: 210 },
    },
    light: {
      /** 比平地涼一點、柔一點 */
      lightRatio: { scale: 0.96 },
      ambientRatio: { scale: 1.03 },
    },
    cloud: {
      /** 山谷上空雲多一點，常有一層低低的層雲壓在山頭 */
      coverageOffset: { offset: 0.06 },
      stratus: { offset: 0.12 },
      windSpeed: { scale: 0.9 },
    },
    groundMist: {
      /** 清晨冷空氣沉進谷底，常起谷霧 */
      chance: { value: 0.7 },
      density: { scale: 1.25 },
    },
  },
  backdrop: {
    centerX: PASTURE_REALM_CENTER.x,
    centerZ: PASTURE_REALM_CENTER.z,
    ridge: { style: 'fells', footY: PASTURE_GROUND_Y + 0.5, seed: 'bleating-vale' },
    /** 山頂後面走不到的地面是 LAKE_BED，平面一路鋪到地平線，從坡上回頭也不會看到世界的邊 */
    floor: { surfaceY: PASTURE_GROUND_Y + 0.5, blockId: BlockId.GRASS, isEndless: true },
  },
  /** 往山谷去是一陣帶青的涼霧，夾著往下飄的草屑 */
  transition: {
    fogTint: [0.92, 1, 0.94],
    particleColor: [0.78, 0.86, 0.6],
    particleRise: -0.15,
    sound: 'village-sheep',
  },
  portalList: [
    {
      ...PASTURE_PORTAL_POINT,
      /** 站在谷底草上的腳底高度 */
      y: PASTURE_GROUND_Y + 1,
      spanAxis: 'x',
      targetRealmId: 'hub',
      targetSpawn: PASTURE_HUB_GATE.landingSpawn,
      /** 木牌在門的東側三格、牌面朝南：這裡的人是從柵欄門那邊往門走過來的 */
      sign: { x: PASTURE_PORTAL_POINT.x + 3, z: PASTURE_PORTAL_POINT.z, facing: 'south' },
    },
  ],
  boundary: {
    centerX: PASTURE_REALM_CENTER.x,
    centerZ: PASTURE_REALM_CENTER.z,
    medium: 'land',
    slowRadius: PASTURE_SLOW_RADIUS,
    pushRadius: PASTURE_PUSH_RADIUS,
  },
  sheepFlock: PASTURE_SHEEP_FLOCK,
}
