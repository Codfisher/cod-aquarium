import type { GardenId } from '../garden/garden-layout'
import type { RealmId, RealmPortal, RealmSpawn } from './realm-definition'
import { getDeckGroundY, getGarden } from '../garden/garden-layout'

/**
 * 大廳那一頭的傳送門：立在所屬箱庭裡、靠近中央的地方
 *
 * 大場景延伸所屬箱庭的設計，門也是那座箱庭的一部分。
 * 第一版立在木座邊上，門洞朝外——看起來像是擺在箱庭旁邊的一道門，
 * 而不是箱庭本身的「入口」。改成立在箱庭裡、接近中央（給 inner），
 * 人走進箱庭、站到正中，眼前就是那道門，傳送門才有它該有的份量。
 *
 * side 在兩種放法裡意思不同：立在邊上時是「立在哪一邊、門洞朝外」；
 * 立在裡面時是「門洞朝哪一邊」，人從那一邊走過來、回來時也落在那一邊、面朝門。
 * 木牌在門旁三格、牌面與門洞同向。每座大場景的定義各叫一次，門的規矩才會一致
 */

export type GardenEdgeSide = 'north' | 'south' | 'east' | 'west'

/** 各邊往外的單位向量：北是 -Z */
const SIDE_OFFSET_MAP = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
} as const

const OPPOSITE_SIDE_MAP = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
} as const

/** 方向換算成偏航：鏡頭的前方是 (sin yaw, cos yaw)，所以 +Z（南）是 0 */
export const YAW_MAP = {
  south: 0,
  north: Math.PI,
  east: Math.PI / 2,
  west: -Math.PI / 2,
} as const

/** 木牌離門洞中心幾格，兩根門柱在 ±1，再隔一格空出來 */
const SIGN_DISTANCE = 3
/**
 * 落點離門洞中心幾格
 *
 * 觸發範圍是門洞前後各半格，四格外還有三格半，落地不會又被送走；
 * 木座外緣在門外一格，四格外一定是木座外的白沙
 */
const LANDING_DISTANCE = 4

export interface GardenGateParam {
  gardenId: GardenId;
  /** 門立在木座的哪一邊，門洞朝這一邊外面 */
  side: GardenEdgeSide;
  /**
   * 沿著那一邊離中點偏幾格，預設 0
   *
   * 沿邊的正方向是 +X（南北兩邊）或 +Z（東西兩邊）。
   * 箱庭裡的小徑不一定走在正中，門要對著小徑的盡頭
   */
  offset?: number;
  targetRealmId: RealmId;
  /**
   * 木牌在門的哪一側：-1 是西（南北兩邊）或北（東西兩邊），1 是另一側
   *
   * 預設 -1，與水鏡池那座一樣在西側
   */
  signSide?: -1 | 1;
  /**
   * 牌面朝外還是朝內
   *
   * 人從木座外面走過來（水鏡池、潮汐磯）就朝外；
   * 人是順著箱庭裡的小徑走到門前（松籟林）就朝內
   */
  signFacing: 'outward' | 'inward';
  /** 落地時往下看多少（弧度），預設 0.12 */
  landingPitch?: number;
  /**
   * 門洞中心離箱庭中心的偏移（格）
   *
   * 給了就立在箱庭裡面（新的放法），不給就照舊立在木座邊上。
   * 箱庭正中通常是它最重要的那樣東西（池子、營火、蜂箱），
   * 門可以略偏一兩格，讓兩者並立，但不要偏到邊上去
   */
  inner?: { x: number; z: number };
}

export interface GardenGate {
  /** 放進 HUB_REALM.portalList 的那一座門 */
  portal: RealmPortal;
  /** 從大場景回來時的落點：門外四格、面朝門，給大場景回程門的 targetSpawn */
  landingSpawn: RealmSpawn;
  /**
   * 選單快速前往這座箱庭時落在哪（不給就是門前六格、面朝門，見 landmark）
   *
   * 門在山腹裡的那種（岩響窟）用得到：門前六格是地底湖，往上找站得住的地方會找到山頂
   */
  travelSpawn?: RealmSpawn;
}

export function createGardenGate({
  gardenId,
  side,
  offset = 0,
  targetRealmId,
  signSide = -1,
  signFacing,
  landingPitch = 0.12,
  inner,
}: GardenGateParam): GardenGate {
  const garden = getGarden(gardenId)
  const outward = SIDE_OFFSET_MAP[side]
  const isSpanX = outward.z !== 0
  /** 拼花木地板那一排：最外圈是深色木的半磚唇，往內一格 */
  const edgeDistance = garden.halfSize - 1
  const x = inner
    ? garden.center.x + inner.x
    : garden.center.x + outward.x * edgeDistance + (isSpanX ? offset : 0)
  const z = inner
    ? garden.center.z + inner.z
    : garden.center.z + outward.z * edgeDistance + (isSpanX ? 0 : offset)

  const portal: RealmPortal = {
    x,
    z,
    /** 站在木座甲板上的腳底高度 */
    y: getDeckGroundY(garden),
    spanAxis: isSpanX ? 'x' : 'z',
    targetRealmId,
    sign: {
      x: x + (isSpanX ? signSide * SIGN_DISTANCE : 0),
      z: z + (isSpanX ? 0 : signSide * SIGN_DISTANCE),
      facing: signFacing === 'outward' ? side : OPPOSITE_SIDE_MAP[side],
    },
  }

  const landingSpawn: RealmSpawn = {
    x: x + outward.x * LANDING_DISTANCE,
    z: z + outward.z * LANDING_DISTANCE,
    pitch: landingPitch,
    /** 面朝門，也就是往木座裡面看 */
    yaw: YAW_MAP[OPPOSITE_SIDE_MAP[side]],
  }

  return { portal, landingSpawn }
}
