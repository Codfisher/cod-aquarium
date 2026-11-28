import type { VoxelBox } from '../../realm/realm-voxel-kit'

/**
 * 環境生物的體素形體（純資料，不引用 Babylon，可以單獨測）
 *
 * 蜻蜓、蝴蝶與蛾原本是環境粒子裡的像素方片：永遠正對鏡頭、沒有厚度、拍翅是兩格圖輪流換。
 * 牠們是身邊近看的東西，方片的毛病比遠景更明顯：繞著牠走一圈，牠永遠是同一張正面
 * （使用者：「蜻蜓目前是不是也是像素風格？是則改成體素風格」）。
 *
 * 現在每一隻是幾個方盒拼的：身體分節、頭、左右各一到兩片翅膀。座標是牠自己的體素格，頭朝 +x、上是 +y；
 * 翅膀的第三軸放的是「離翅根多遠」，一律從零往外，左右共用同一份形狀、由 side 決定翻到哪一邊
 * （與 realm-voxel-kit 的飛鳥同一種擺法）。翅膀整片繞著翅根轉，方盒本身不變形。
 *
 * 新增一種生物：在 CRITTER_SPECIES_MAP 加一份（方盒、拍翅的角度、各色調怎麼調），
 * 再到 ambient-kind-spec 那一種的預設裡寫 critter: '名字'，其餘（數量、出沒時段、生在哪）照舊由場景的清單決定
 */

export type AmbientCritterKey = 'dragonfly' | 'butterfly' | 'moth'

/** 部位的編號，寫進頂點：不動的身體、前翅、後翅 */
export const CRITTER_PART = { body: 0, foreWing: 1, hindWing: 2 } as const

/**
 * 色調的編號，寫進頂點；每一種生物各自決定這五種色調怎麼從「這一隻的底色」調出來
 *
 * 底色是場景清單給的那一對顏色之間抽一個（蜻蜓有藍有紅、蝴蝶有黃有白），形體只管哪裡深、哪裡淺
 */
export const CRITTER_TONE = { body: 0, bodyAlt: 1, wing: 2, wingAlt: 3, wingEdge: 4 } as const
export const CRITTER_TONE_COUNT = 5

/** 一種色調怎麼調：乘上明暗、往白色混多少、多不透明 */
export interface CritterToneRule {
  shade: number;
  whiten: number;
  alpha: number;
}

export interface CritterSpecies {
  boxList: VoxelBox[];
  /**
   * 整隻最長的那一邊是幾格體素
   *
   * 種類表的 size 原本是方片的邊長（格）；除以這個數，就是一格體素在世界裡多大，
   * 換成方盒之後整隻的大小才會與原本的方片差不多
   */
  span: number;
  /** 比原本的方片再放大多少：方盒拼的東西要大一點才讀得出面，但牠們是小蟲，不能大到像鳥 */
  sizeScale: number;
  /** 翅根離身體中線多遠、翅膀底面的高度（體素格）：翅膀繞著這條線轉 */
  wingJoint: { shoulderOffset: number; baseY: number };
  /** 拍翅：平常翹起多少、上下各擺多大、後翅比前翅晚多少（弧度） */
  flap: { restRadian: number; swingRadian: number; hindLagRadian: number };
  /** 轉彎時往內側傾：每秒轉一弧度傾多少，最多傾到哪裡（弧度） */
  bank: { gain: number; maxRadian: number };
  /** 五種色調各自的調法，索引是 CRITTER_TONE */
  toneRuleList: CritterToneRule[];
}

/** 薄片只畫上下兩面：側邊只有十分之一格厚，畫了也看不到（VOXEL_FACE_LIST 的 +y 與 −y） */
const FLAT_FACE_INDEX_LIST = [2, 3] as const

interface WingShape {
  /** 沿身體的前後範圍 */
  fromX: number;
  toX: number;
  /** 離翅根多遠（從哪裡到哪裡） */
  fromReach: number;
  toReach: number;
  part: number;
  tone: number;
}

/** 一片翅膀攤成左右兩個薄方盒 */
function createWingPair(shape: WingShape, baseY: number, thickness: number): VoxelBox[] {
  return [1, -1].map((side) => ({
    min: [shape.fromX, baseY, shape.fromReach] as const,
    max: [shape.toX, baseY + thickness, shape.toReach] as const,
    part: shape.part,
    side,
    tone: shape.tone,
    faceIndexList: FLAT_FACE_INDEX_LIST,
  }))
}

function createBodyBox(min: readonly [number, number, number], max: readonly [number, number, number], tone: number): VoxelBox {
  return { min, max, part: CRITTER_PART.body, side: 0, tone }
}

const DRAGONFLY_WING_BASE_Y = 0.42
const BUTTERFLY_WING_BASE_Y = 0.08
const MOTH_WING_BASE_Y = 0.2

/**
 * 蜻蜓：大頭、粗的胸，腹部三節一節比一節細、深淺相間，前後兩對又窄又長的翅
 *
 * 身長七格八、翼展七格八。翅膀是半透明的淺色薄片，拍得快、幅度小，後翅晚前翅四分之一拍
 */
const DRAGONFLY: CritterSpecies = {
  boxList: [
    createBodyBox([2.4, -0.5, -0.6], [3.4, 0.5, 0.6], CRITTER_TONE.bodyAlt),
    createBodyBox([0.8, -0.5, -0.5], [2.4, 0.6, 0.5], CRITTER_TONE.body),
    createBodyBox([-0.9, -0.3, -0.3], [0.8, 0.3, 0.3], CRITTER_TONE.bodyAlt),
    createBodyBox([-2.6, -0.26, -0.26], [-0.9, 0.26, 0.26], CRITTER_TONE.body),
    createBodyBox([-4.4, -0.2, -0.2], [-2.6, 0.2, 0.2], CRITTER_TONE.bodyAlt),
    ...createWingPair({ fromX: 1.5, toX: 2.3, fromReach: 0, toReach: 3.4, part: CRITTER_PART.foreWing, tone: CRITTER_TONE.wing }, DRAGONFLY_WING_BASE_Y, 0.1),
    ...createWingPair({ fromX: 0.5, toX: 1.35, fromReach: 0, toReach: 3.1, part: CRITTER_PART.hindWing, tone: CRITTER_TONE.wingAlt }, DRAGONFLY_WING_BASE_Y, 0.1),
  ],
  span: 7.8,
  sizeScale: 1.35,
  wingJoint: { shoulderOffset: 0.5, baseY: DRAGONFLY_WING_BASE_Y },
  flap: { restRadian: 0.06, swingRadian: 0.3, hindLagRadian: 1.6 },
  bank: { gain: 0.16, maxRadian: 0.6 },
  toneRuleList: [
    { shade: 0.92, whiten: 0, alpha: 1 },
    { shade: 0.5, whiten: 0, alpha: 1 },
    { shade: 1, whiten: 0.78, alpha: 0.6 },
    { shade: 0.94, whiten: 0.7, alpha: 0.6 },
    { shade: 1, whiten: 0.78, alpha: 0.6 },
  ],
}

/**
 * 蝴蝶：細的深色身體，一對大的前翅（外緣一道深色的邊）與一對小一點的後翅
 *
 * 翼展七格。翅膀拍得慢、幅度大，往上幾乎合起來、往下略低於水平
 */
const BUTTERFLY: CritterSpecies = {
  boxList: [
    createBodyBox([-1.5, -0.3, -0.3], [1.1, 0.3, 0.3], CRITTER_TONE.body),
    createBodyBox([1.1, -0.3, -0.36], [1.7, 0.36, 0.36], CRITTER_TONE.bodyAlt),
    ...createWingPair({ fromX: 0, toX: 1.9, fromReach: 0, toReach: 2.5, part: CRITTER_PART.foreWing, tone: CRITTER_TONE.wing }, BUTTERFLY_WING_BASE_Y, 0.12),
    ...createWingPair({ fromX: 0.3, toX: 1.9, fromReach: 2.5, toReach: 3.2, part: CRITTER_PART.foreWing, tone: CRITTER_TONE.wingEdge }, BUTTERFLY_WING_BASE_Y, 0.12),
    ...createWingPair({ fromX: -1.6, toX: 0, fromReach: 0, toReach: 2.3, part: CRITTER_PART.hindWing, tone: CRITTER_TONE.wingAlt }, BUTTERFLY_WING_BASE_Y, 0.12),
  ],
  span: 7,
  sizeScale: 1.25,
  wingJoint: { shoulderOffset: 0.3, baseY: BUTTERFLY_WING_BASE_Y },
  flap: { restRadian: 0.52, swingRadian: 0.72, hindLagRadian: 0.25 },
  bank: { gain: 0.14, maxRadian: 0.35 },
  toneRuleList: [
    { shade: 0.3, whiten: 0, alpha: 1 },
    { shade: 0.22, whiten: 0, alpha: 1 },
    { shade: 1, whiten: 0, alpha: 1 },
    { shade: 0.8, whiten: 0, alpha: 1 },
    { shade: 0.42, whiten: 0, alpha: 1 },
  ],
}

/**
 * 蛾：身體比蝴蝶粗短、毛茸茸的淺色，翅膀寬而短
 *
 * 翼展六格二。拍得比蝴蝶快、幅度小，翅膀大致攤平
 */
const MOTH: CritterSpecies = {
  boxList: [
    createBodyBox([-1.4, -0.42, -0.42], [0.9, 0.42, 0.42], CRITTER_TONE.body),
    createBodyBox([0.9, -0.34, -0.38], [1.5, 0.34, 0.38], CRITTER_TONE.bodyAlt),
    ...createWingPair({ fromX: -0.2, toX: 1.3, fromReach: 0, toReach: 2.7, part: CRITTER_PART.foreWing, tone: CRITTER_TONE.wing }, MOTH_WING_BASE_Y, 0.12),
    ...createWingPair({ fromX: -1.4, toX: -0.2, fromReach: 0, toReach: 1.9, part: CRITTER_PART.hindWing, tone: CRITTER_TONE.wingAlt }, MOTH_WING_BASE_Y, 0.12),
  ],
  span: 6.2,
  sizeScale: 1.35,
  wingJoint: { shoulderOffset: 0.4, baseY: MOTH_WING_BASE_Y },
  flap: { restRadian: 0.3, swingRadian: 0.55, hindLagRadian: 0.2 },
  bank: { gain: 0.12, maxRadian: 0.4 },
  toneRuleList: [
    { shade: 0.62, whiten: 0, alpha: 1 },
    { shade: 0.4, whiten: 0, alpha: 1 },
    { shade: 1, whiten: 0, alpha: 1 },
    { shade: 0.78, whiten: 0, alpha: 1 },
    { shade: 0.6, whiten: 0, alpha: 1 },
  ],
}

export const CRITTER_SPECIES_MAP: Record<AmbientCritterKey, CritterSpecies> = {
  dragonfly: DRAGONFLY,
  butterfly: BUTTERFLY,
  moth: MOTH,
}

/**
 * 整隻攤平之後最長的那一邊（體素格）：身長，或兩隻翅膀攤開的翼展
 *
 * 給測試核對 span 用：span 寫錯，換成方盒之後整隻的大小就會跟原本的方片差一截
 */
export function measureCritterSpan(species: CritterSpecies): number {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let wingReach = 0
  let bodyHalfWidth = 0
  for (const box of species.boxList) {
    minX = Math.min(minX, box.min[0])
    maxX = Math.max(maxX, box.max[0])
    if (box.part === CRITTER_PART.body)
      bodyHalfWidth = Math.max(bodyHalfWidth, Math.abs(box.min[2]), Math.abs(box.max[2]))
    else
      wingReach = Math.max(wingReach, box.max[2] + species.wingJoint.shoulderOffset)
  }
  return Math.max(maxX - minX, Math.max(wingReach, bodyHalfWidth) * 2)
}
