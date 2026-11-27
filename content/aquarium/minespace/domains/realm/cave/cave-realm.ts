import type { GardenGate } from '../garden-gate'
import type { RealmDefinition } from '../realm-definition'
import { CAVE_GATE_POINT, CAVE_MOUTH, getDeckGroundY, getGarden } from '../../garden/garden-layout'
import { YAW_MAP } from '../garden-gate'
import { CAVE_AMBIENT_PARTICLE_LIST } from '../realm-ambient-table'
import { CAVE_DRIFT_FEATURE_LIST } from './cave-drift-features'
import { CAVE_GROUND_Y, CAVE_PORTAL_POINT, TUNNEL_MIDDLE, UNDERGROUND_LAKE_CENTER, UNDERGROUND_LAKE_RADIUS } from './cave-layout'

/**
 * 大廳那座通往地底洞窟的門
 *
 * 立在岩響窟最深處：洞室西壁挖出來的龕裡（CAVE_GATE_POINT），門洞朝東，
 * 對著地底湖與通道來的方向。人得從東南角的洞口低頭鑽進去、走過通道、繞過地底湖，
 * 走到洞的最裡面才到得了——那是這座箱庭本來就要人做的事。
 *
 * 門在山腹裡、地面就是木座那一層，createGardenGate 的「門外四格」在這裡會落進地底湖，
 * 所以整份自己給：落點在門前三格的湖岸乾地上、面朝門（離觸發範圍還有兩格半）；
 * 木牌在門北邊三格的龕裡、牌面朝東，門上的燈照得到它；
 * 選單快速前往則落在洞口外兩步、面朝洞口（門前六格是湖，往上找站得住的地方會找到山頂）
 */
const CAVE_GARDEN = getGarden('cave')

export const CAVE_HUB_GATE: GardenGate = {
  portal: {
    x: CAVE_GATE_POINT.x,
    z: CAVE_GATE_POINT.z,
    y: getDeckGroundY(CAVE_GARDEN),
    spanAxis: 'z',
    targetRealmId: 'cave',
    sign: { x: CAVE_GATE_POINT.x, z: CAVE_GATE_POINT.z - 3, facing: 'east' },
  },
  landingSpawn: {
    x: CAVE_GATE_POINT.x + 3,
    z: CAVE_GATE_POINT.z,
    pitch: 0.05,
    yaw: YAW_MAP.west,
  },
  travelSpawn: {
    x: CAVE_MOUTH.x + 3,
    z: CAVE_MOUTH.z + 3,
    pitch: 0.05,
    yaw: -Math.PI * 0.75,
  },
}

/**
 * 地底洞窟：岩響窟的大場景
 *
 * 岩響窟的洞室放大成一座地底大廳：碎石鋪地的前室（門在這裡）、一段低頭才過得去的通道，
 * 走出通道豁然開朗，二十格高的穹頂、四根頂天的石柱、石筍與鐘乳石，西側一池地底湖，
 * 湖後的岩壁上嵌著兩顆鑽石。整個場景在地底：沒有天、沒有日月與雲，光只來自燈籠
 */
export const CAVE_REALM: RealmDefinition = {
  id: 'cave',
  title: { 'zh-hant': '地底湖窟', 'en': 'Buried Lake' },
  description: { 'zh-hant': '岩響窟的深處，燈火照著一池地底湖', 'en': 'Deep beyond Echo Cavern, lanterns over a buried lake' },
  signCaption: { 'zh-hant': '燈火裡的地底湖', 'en': 'A lake beneath the stone' },
  icon: 'i-material-symbols:diamond-outline',
  /**
   * 站在回程門的西側三格，面朝通道口
   *
   * 從大廳往西穿過門鑽進山裡，到這裡仍是往西走：兩盞石燈籠夾著通道口在正前方，
   * 回去的門就在背後三格。離觸發範圍還有兩格半，落地不會又被送回去
   */
  spawn: {
    x: CAVE_PORTAL_POINT.x - 3,
    z: CAVE_PORTAL_POINT.z,
    pitch: 0.05,
    yaw: YAW_MAP.west,
  },
  isLooping: false,
  /**
   * 地底湖的水面倒影：映出石柱、鐘乳石與燈籠；洞頂的螢光點陣另由 cave-glow 的假倒影補上。
   * 框住湖（半徑加三），隔著岸的洞底不是水，不會被算進去
   */
  mirrorTargetList: [
    {
      id: 'cave-buried-lake',
      centerX: UNDERGROUND_LAKE_CENTER.x,
      centerZ: UNDERGROUND_LAKE_CENTER.z,
      halfSize: UNDERGROUND_LAKE_RADIUS + 3,
      surface: 'water',
    },
  ],
  hasGardens: false,
  isUnderground: true,
  /**
   * 洞頂滴水：岩響窟是通道一組、洞室一組，這裡照樣通道中段一組（貼著三格高的頂），
   * 另一組落進地底湖：湖上的頂很高，水滴從燈光照不到的黑裡掉下來
   */
  caveDripList: [
    { x: TUNNEL_MIDDLE.x, y: CAVE_GROUND_Y + 2.4, z: TUNNEL_MIDDLE.z },
    { x: UNDERGROUND_LAKE_CENTER.x, y: CAVE_GROUND_Y + 7, z: UNDERGROUND_LAKE_CENTER.z },
  ],
  /**
   * 霧色與光由洞穴那一套接手（漫遊控制器的洞穴程度在這裡恆為全滿），
   * 地底的場景另外讀這一份的霧距與天光倍率，套在洞穴的那一份上（見 use-fps-controller）
   */
  atmosphere: {
    fog: {
      /** 岩響窟的洞室是五到二十六格；大廳九十格寬，推遠一倍，對面的石柱與燈火才看得到 */
      start: { value: 8 },
      end: { value: 56 },
    },
    light: {
      /** 岩壁的微光收到一半，暗處交給燈籠：燈照到的地方亮、照不到的就是黑的 */
      ambientRatio: { scale: 0.5 },
    },
    groundMist: {
      /** 地底沒有清晨 */
      chance: { value: 0 },
    },
  },
  /** 往地底去是一陣灰暗的霧，夾著往下落的碎石粉 */
  transition: {
    fogTint: [0.42, 0.4, 0.38],
    particleColor: [0.62, 0.6, 0.55],
    particleRise: -0.5,
    sound: 'cave-drip',
  },
  driftFeatureList: CAVE_DRIFT_FEATURE_LIST,
  ambientParticleList: CAVE_AMBIENT_PARTICLE_LIST,
  portalList: [
    {
      ...CAVE_PORTAL_POINT,
      /** 站在前室碎石地上的腳底高度 */
      y: CAVE_GROUND_Y,
      spanAxis: 'z',
      targetRealmId: 'hub',
      targetSpawn: CAVE_HUB_GATE.landingSpawn,
      /**
       * 在門的北側三格、牌面朝西：這裡的人是從前室往門走過來的
       */
      sign: { x: CAVE_PORTAL_POINT.x, z: CAVE_PORTAL_POINT.z - 3, facing: 'west' },
    },
  ],
}
