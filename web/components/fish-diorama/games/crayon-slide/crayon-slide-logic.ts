/** 蠟筆滑道（垂直下潛版）的純邏輯層。
 *
 * 峽谷段落生成、蠟筆存量、深度計分與結束判定、海膽致命判定、
 * 圓對線段的碰撞解算全集中於此。
 * 抽開 Babylon 有兩個好處：能在 node 環境直接測，
 * 以及有無 Havok 的兩條路徑共用同一套規則，降級模式的手感才不會走樣。
 */
import { clamp, createRandomGenerator, randomBetween } from '../../shared/random-generator'

// --- 魚體與運動的調校常數（物理與降級兩條路徑共用，避免手感分岔） ---
/** 魚（紙球）的碰撞半徑 */
export const FISH_RADIUS = 0.55
/** 遊戲重力：比真實重力重，落下俐落但玩家來得及反應 */
export const FISH_GRAVITY_Y = -21
/** 下落終端速度的上限：畫面每秒約掃過三分之一的可見高度，玩家看得清也畫得完 */
export const FISH_MAX_FALL_SPEED = 11
/** 開場的下落終端速度：先慢慢飄，玩家有時間熟悉畫線 */
export const FISH_START_FALL_SPEED = 6.5
/** 下潛到這個深度時終端速度到頂 */
export const FALL_SPEED_RAMP_DEPTH = 140
/** 水平阻尼（每秒指數衰減率）：離開斜坡後的橫向滑移逐漸收斂，不會一路飄到撞牆 */
export const FISH_HORIZONTAL_DAMPING = 0.55
/** 速度上限：避免連續斜坡把魚加速到穿透薄線 */
export const FISH_MAX_SPEED = 26
/** 彈性：紙球撞到紙板只該輕輕一頓，不能像皮球彈個不停 */
export const FISH_RESTITUTION = 0.12
/** 切向速度保留比例，接近 1 = 幾乎無摩擦的滑道 */
export const FISH_TANGENT_RETENTION = 0.999

/** 降級模式的固定子步長：dt 再大也切到這個尺度，才不會高速穿過薄線 */
const MAX_FALLBACK_STEP_SECONDS = 1 / 120
/** 碰撞解算的重複次數：夾在兩條線之間時需要多輪才推得出來 */
const DEFAULT_ITERATION_COUNT = 3
/** 法線 y 大於此值才算「踩在上面」，側撞不算著地 */
const DEFAULT_GROUND_NORMAL_Y = 0.45

// --- 峽谷生成 ---
/** 峽谷半寬：左右牆的內側表面落在 ±此值 */
export const CANYON_HALF_WIDTH = 5.5
/** 難度飽和的段落序號：再往後不加難，否則安全通道窄到擠不過 */
const DIFFICULTY_FULL_INDEX = 26
/** 開場的教學段數：這幾段沒有障礙，先讓玩家感受下潛與畫線 */
const TUTORIAL_SEGMENT_COUNT = 2
const SEGMENT_HEIGHT_MIN = 14
const SEGMENT_HEIGHT_MAX = 20
/** 安全通道半寬的難度插值端點。魚半徑 0.55，最窄仍有三倍身位。
 * 通道刻意窄：寬到蓋住中線的話，玩家直直往下掉就過了，根本不用躲
 */
const CORRIDOR_HALF_WIDTH_EASY = 2.2
const CORRIDOR_HALF_WIDTH_HARD = 1.7
/** 通道中心離峽谷中線的最大偏移。必須大於「通道半寬＋海膽半徑」減掉
 * 中央帶的寬度，海膽才有辦法出現在峽谷正中央；同時上限受牆面限制：
 * 最大偏移＋通道半寬要小於峽谷半寬，通道才不會被牆吃掉
 */
const PATH_X_MAX_OFFSET = 3.4
/** 浮游海膽的致命半徑。視覺刺尖比這更長，判定從寬玩家才不會覺得被陰 */
const URCHIN_RADIUS = 0.75
/** 牆刺尖端的致命半徑。刻意比視覺的刺扇小：
 * 判定是圓、視覺是扇，圓太大會讓魚在刺的上下方「隔空」撞死
 */
const WALL_SPIKE_RADIUS = 0.5
/** 牆刺至少凸出這麼長，太短會貼在牆上看不出威脅 */
const WALL_SPIKE_MIN_PROTRUSION = 1.1
/** 段落頂與底各留這麼高的緩衝不放障礙，跨段時不會被門口的刺偷襲 */
const SEGMENT_EDGE_MARGIN = 1.5

export type CanyonHazardKind = 'urchin' | 'wallSpike'

/** 一顆致命障礙。致命判定化約成圓或膠囊，形態只差在視覺 */
export interface CanyonHazardSpec {
  kind: CanyonHazardKind;
  /** 致命圓心。wallSpike 是刺尖那一端 */
  x: number;
  y: number;
  radius: number;
  /** wallSpike 專用：致命範圍是「牆面到刺尖」這條線段掃出來的膠囊。
   * 撐住刺的岩瘤整段都凸在通道裡，只算刺尖那顆圓的話，
   * 魚會直接穿過看得見的岩石而毫髮無傷
   */
  baseX?: number;
  /** wallSpike 附著的牆：-1 左牆、1 右牆；urchin 為 0 */
  wallSide: -1 | 0 | 1;
}

/** 一片安全層架。start→end 這條線就是可站立的表面，不含厚度 */
export interface CanyonShelfSpec {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** 段落的「形狀」：y 座標相對段落頂（0 ~ -height），與世界位置無關，
 * 純形狀才好驗證「同一序號永遠長一樣」
 */
export interface CanyonSegmentShape {
  index: number;
  height: number;
  /** 安全通道中心在段落頂端的 x（承接上一段出口） */
  entryPathX: number;
  /** 安全通道中心在段落底端的 x */
  exitPathX: number;
  corridorHalfWidth: number;
  hazardList: CanyonHazardSpec[];
  shelfList: CanyonShelfSpec[];
}

/** 串接到世界座標後的段落 */
export interface ChainedCanyonSegment {
  index: number;
  height: number;
  topY: number;
  bottomY: number;
  entryPathX: number;
  exitPathX: number;
  corridorHalfWidth: number;
  hazardList: CanyonHazardSpec[];
  shelfList: CanyonShelfSpec[];
}

/** 段落難度（0~1）。通道寬度、障礙數量都由它插值 */
export function getSegmentDifficulty(index: number): number {
  return clamp(index / DIFFICULTY_FULL_INDEX, 0, 1)
}

/** 依下潛深度插值的終端速度：開場緩、越深越快，節奏跟著難度一起收緊 */
export function getFallSpeedLimit(depth: number): number {
  const ratio = clamp(depth / FALL_SPEED_RAMP_DEPTH, 0, 1)
  return FISH_START_FALL_SPEED + (FISH_MAX_FALL_SPEED - FISH_START_FALL_SPEED) * ratio
}

/** 某段落底端的安全通道中心 x。獨立於段落形狀生成，
 * 下一段才能拿「上一段的出口」當自己的入口，通道跨段連續
 */
export function getCanyonExitPathX(index: number): number {
  if (index < 0) {
    return 0
  }
  const random = createRandomGenerator((index * 7349 + 811) | 0)
  const difficulty = getSegmentDifficulty(index)
  // 一開始就要甩得夠開，通道不甩離中線的話遊戲就沒有「躲」這回事；
  // 幅度至少四成、左右隨機，出口永遠偏離中線，中央留給障礙
  const range = PATH_X_MAX_OFFSET * (0.7 + 0.3 * difficulty)
  const magnitudeRatio = 0.4 + 0.6 * random()
  const sign = random() < 0.5 ? -1 : 1
  return sign * range * magnitudeRatio
}

/** 段落內某深度的安全通道中心 x。餘弦緩和讓通道是平滑的 S 曲線而非折線 */
export function getCanyonPathX(
  shape: Pick<CanyonSegmentShape, 'height' | 'entryPathX' | 'exitPathX'>,
  depthFromTop: number,
): number {
  const ratio = clamp(depthFromTop / shape.height, 0, 1)
  const eased = (1 - Math.cos(Math.PI * ratio)) / 2
  return shape.entryPathX + (shape.exitPathX - shape.entryPathX) * eased
}

function appendHazard(
  shape: CanyonSegmentShape,
  random: () => number,
  y: number,
  pathX: number,
) {
  // 哪一側離牆的空間大就放哪一側，五五波時擲硬幣
  const leftSpace = (pathX - shape.corridorHalfWidth) - (-CANYON_HALF_WIDTH)
  const rightSpace = CANYON_HALF_WIDTH - (pathX + shape.corridorHalfWidth)
  const side: -1 | 1 = Math.abs(leftSpace - rightSpace) < 0.4
    ? (random() < 0.5 ? -1 : 1)
    : (leftSpace > rightSpace ? -1 : 1)
  const space = side === -1 ? leftSpace : rightSpace
  const corridorEdgeX = pathX + side * shape.corridorHalfWidth

  // 空間塞得下整顆海膽就有機會放浮游海膽，否則從牆伸出尖刺
  const canPlaceUrchin = space >= URCHIN_RADIUS * 2 + 0.5
  if (canPlaceUrchin && random() < 0.55) {
    const minCenterOffset = URCHIN_RADIUS
    const maxCenterOffset = space - URCHIN_RADIUS - 0.2
    // 平方偏置讓海膽緊貼通道邊緣：通道甩到側邊時，海膽就會出現在峽谷中央，
    // 均勻分布只會把海膽塞到牆角，玩家看都不用看
    const edgeBias = random() ** 2
    const centerOffset = minCenterOffset
      + Math.max(0, maxCenterOffset - minCenterOffset) * edgeBias
    shape.hazardList.push({
      kind: 'urchin',
      x: corridorEdgeX + side * centerOffset,
      y,
      radius: URCHIN_RADIUS,
      wallSide: 0,
    })
    return
  }

  // 牆刺的致命圓在尖端：凸出愈長愈危險，但尖端必須留在通道外才公平
  const maxProtrusion = space - WALL_SPIKE_RADIUS
  if (maxProtrusion < WALL_SPIKE_MIN_PROTRUSION) {
    // 這一帶太窄放不下公平的刺，寧可少一個障礙
    return
  }
  // 開根號偏置讓刺偏長：通道甩到對側時，長刺才會伸進峽谷中央逼玩家改道
  const protrusionBias = Math.sqrt(random())
  const protrusion = WALL_SPIKE_MIN_PROTRUSION
    + (maxProtrusion - WALL_SPIKE_MIN_PROTRUSION) * protrusionBias
  shape.hazardList.push({
    kind: 'wallSpike',
    x: side * (CANYON_HALF_WIDTH - protrusion),
    y,
    radius: WALL_SPIKE_RADIUS,
    // 岩瘤從牆面一路撐到刺尖，整段都要致命。膠囊只往牆的方向長，
    // 通道那一側的邊界仍是刺尖那顆圓，公平性不受影響
    baseX: side * CANYON_HALF_WIDTH,
    wallSide: side,
  })
}

function appendShelf(
  shape: CanyonSegmentShape,
  random: () => number,
  y: number,
) {
  // 層架從牆往峽谷中央伸，允許戳進安全通道：它不致命，
  // 但魚落上去會停住，逼玩家畫斜坡把魚導出來
  const side: -1 | 1 = random() < 0.5 ? -1 : 1
  const length = randomBetween(random, 2.4, 3.8)
  // 尾端往峽谷中央微微下垂，落在上面的魚有機會自己滾出來
  shape.shelfList.push({
    startX: side * CANYON_HALF_WIDTH,
    startY: y,
    endX: side * (CANYON_HALF_WIDTH - length),
    endY: y - length * 0.18,
  })
}

/** 以段落序號為種子生成段落形狀。同一序號永遠得到同一份地形，
 * 玩家重玩時記得住哪裡有海膽
 */
export function generateCanyonSegmentShape(index: number): CanyonSegmentShape {
  const random = createRandomGenerator((index * 9176 + 1337) | 0)
  const difficulty = getSegmentDifficulty(index)
  const height = randomBetween(random, SEGMENT_HEIGHT_MIN, SEGMENT_HEIGHT_MAX)
  const corridorHalfWidth = CORRIDOR_HALF_WIDTH_EASY
    + (CORRIDOR_HALF_WIDTH_HARD - CORRIDOR_HALF_WIDTH_EASY) * difficulty

  const shape: CanyonSegmentShape = {
    index,
    height,
    entryPathX: getCanyonExitPathX(index - 1),
    exitPathX: getCanyonExitPathX(index),
    corridorHalfWidth,
    hazardList: [],
    shelfList: [],
  }
  if (index < TUTORIAL_SEGMENT_COUNT) {
    return shape
  }

  // 障礙與層架各佔一條互不重疊的垂直帶，同高度不會擠成一排無解的牆
  const hazardCount = Math.round(randomBetween(random, 1.4, 2.2 + 2.2 * difficulty))
  const hasShelf = random() < 0.45
  const featureCount = hazardCount + (hasShelf ? 1 : 0)
  const bandHeight = (height - SEGMENT_EDGE_MARGIN * 2) / featureCount
  const shelfBandIndex = hasShelf ? Math.floor(random() * featureCount) : -1

  for (let bandIndex = 0; bandIndex < featureCount; bandIndex++) {
    const bandTop = -SEGMENT_EDGE_MARGIN - bandHeight * bandIndex
    const featureY = bandTop - randomBetween(random, bandHeight * 0.3, bandHeight * 0.7)
    if (bandIndex === shelfBandIndex) {
      appendShelf(shape, random, featureY)
    }
    else {
      appendHazard(shape, random, featureY, getCanyonPathX(shape, -featureY))
    }
  }
  return shape
}

/** 把段落形狀平移到世界座標。x 本來就是絕對座標，只需平移 y */
export function chainCanyonSegment(index: number, topY: number): ChainedCanyonSegment {
  const shape = generateCanyonSegmentShape(index)
  return {
    index,
    height: shape.height,
    topY,
    bottomY: topY - shape.height,
    entryPathX: shape.entryPathX,
    exitPathX: shape.exitPathX,
    corridorHalfWidth: shape.corridorHalfWidth,
    hazardList: shape.hazardList.map((hazard) => ({ ...hazard, y: hazard.y + topY })),
    shelfList: shape.shelfList.map((shelf) => ({
      ...shelf,
      startY: shelf.startY + topY,
      endY: shelf.endY + topY,
    })),
  }
}

// --- 致命判定 ---
/** 致命判定比視覺小一圈的緩衝：擦過刺尖不算死，玩家才不會覺得被陰 */
export const HAZARD_CONTACT_GRACE = 0.22

/** 回傳第一顆碰到的障礙，沒碰到回傳 null。
 * 純數學圓對圓，不建物理剛體，有無 Havok 都走同一套判定
 */
export function findHazardContact(
  body: { x: number; y: number; radius: number },
  hazardList: readonly CanyonHazardSpec[],
  grace: number = HAZARD_CONTACT_GRACE,
): CanyonHazardSpec | null {
  for (const hazard of hazardList) {
    // 有 baseX 的是牆刺：致命範圍是牆面到刺尖的膠囊，取線段上最近的點來量距離。
    // 沒有的話線段退化成一個點，等同原本的圓對圓
    const nearestX = hazard.baseX === undefined
      ? hazard.x
      : clamp(body.x, Math.min(hazard.x, hazard.baseX), Math.max(hazard.x, hazard.baseX))
    const distance = Math.hypot(body.x - nearestX, body.y - hazard.y)
    if (distance < body.radius + hazard.radius - grace) {
      return hazard
    }
  }
  return null
}

// --- 蠟筆存量 ---
export interface CrayonInkOptions {
  /** 總長度上限（世界單位） */
  capacity: number;
  /** 每秒回充的長度 */
  refillPerSecond: number;
  /** 低於此存量視為畫不動，避免留下一堆碎屑般的短線 */
  minimumDrawLength: number;
}

export interface CrayonInk {
  readonly capacity: number;
  getRemaining: () => number;
  /** 0~1，供存量條顯示 */
  getRatio: () => number;
  canDraw: () => boolean;
  /** 嘗試消耗指定長度，回傳實際核准的長度（不足時截短） */
  consume: (length: number) => number;
  refill: (deltaSeconds: number) => void;
  /** 擦掉線條時退還長度，不超過上限 */
  restore: (length: number) => void;
  reset: () => void;
}

export function createCrayonInk(options: CrayonInkOptions): CrayonInk {
  let remaining = options.capacity

  return {
    capacity: options.capacity,
    getRemaining: () => remaining,
    getRatio: () => clamp(remaining / options.capacity, 0, 1),
    canDraw: () => remaining >= options.minimumDrawLength,
    consume(length) {
      if (length <= 0) {
        return 0
      }
      const granted = Math.min(length, remaining)
      remaining -= granted
      return granted
    },
    refill(deltaSeconds) {
      remaining = Math.min(options.capacity, remaining + options.refillPerSecond * deltaSeconds)
    },
    restore(length) {
      if (length <= 0) {
        return
      }
      remaining = Math.min(options.capacity, remaining + length)
    },
    reset() {
      remaining = options.capacity
    },
  }
}

// --- 碰撞：圓對「有厚度的線段」（膠囊） ---
/** 有厚度的線段碰撞體。牆、層架與蠟筆線都化約成這個形狀，解算器才只有一套 */
export interface SegmentCollider {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  halfThickness: number;
  /** 玩家畫的蠟筆線。接觸回饋要能分辨魚是不是站在自己畫的線上 */
  isCrayon: boolean;
}

export interface CircleBodyState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}

export interface CollisionSolveOptions {
  restitution: number;
  tangentRetention: number;
  iterationCount?: number;
  groundNormalY?: number;
}

export interface CollisionSolveResult {
  isGrounded: boolean;
  isOnCrayon: boolean;
  contactCount: number;
}

/** 點投影到線段上的參數位置，夾在 [0, 1] */
export function getSegmentProjection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
): number {
  const spanX = endX - startX
  const spanY = endY - startY
  const spanLengthSquared = spanX * spanX + spanY * spanY
  if (spanLengthSquared < 1e-12) {
    return 0
  }
  return clamp(((pointX - startX) * spanX + (pointY - startY) * spanY) / spanLengthSquared, 0, 1)
}

export function getClosestPointOnSegment(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
): { x: number; y: number } {
  const ratio = getSegmentProjection(startX, startY, endX, endY, pointX, pointY)
  return {
    x: startX + (endX - startX) * ratio,
    y: startY + (endY - startY) * ratio,
  }
}

/** 把圓推出所有重疊的線段並反射速度。body 會被就地修改。
 *
 * 逐條處理而非一次求解全部接觸點：低速小場景下位置修正的重複迭代已足夠收斂，
 * 換來的是不用組裝矩陣，每幀成本可預測
 */
export function solveCircleAgainstSegmentList(
  body: CircleBodyState,
  colliderList: readonly SegmentCollider[],
  options: CollisionSolveOptions,
): CollisionSolveResult {
  const iterationCount = options.iterationCount ?? DEFAULT_ITERATION_COUNT
  const groundNormalY = options.groundNormalY ?? DEFAULT_GROUND_NORMAL_Y

  let isGrounded = false
  let isOnCrayon = false
  let contactCount = 0

  for (let iteration = 0; iteration < iterationCount; iteration++) {
    let hasContactInIteration = false

    for (const collider of colliderList) {
      const ratio = getSegmentProjection(
        collider.startX,
        collider.startY,
        collider.endX,
        collider.endY,
        body.x,
        body.y,
      )
      const closestX = collider.startX + (collider.endX - collider.startX) * ratio
      const closestY = collider.startY + (collider.endY - collider.startY) * ratio
      const offsetX = body.x - closestX
      const offsetY = body.y - closestY
      const distance = Math.hypot(offsetX, offsetY)
      const contactDistance = body.radius + collider.halfThickness
      if (distance >= contactDistance) {
        continue
      }

      // 圓心正好壓在線上時沒有可用的法線，一律往上推：卡在線裡不動比彈錯方向更糟
      const hasNormal = distance > 1e-6
      const normalX = hasNormal ? offsetX / distance : 0
      const normalY = hasNormal ? offsetY / distance : 1
      const penetration = contactDistance - distance
      body.x += normalX * penetration
      body.y += normalY * penetration

      const normalSpeed = body.velocityX * normalX + body.velocityY * normalY
      if (normalSpeed < 0) {
        const tangentX = -normalY
        const tangentY = normalX
        const tangentSpeed = body.velocityX * tangentX + body.velocityY * tangentY
        const bouncedNormalSpeed = -normalSpeed * options.restitution
        const keptTangentSpeed = tangentSpeed * options.tangentRetention
        body.velocityX = normalX * bouncedNormalSpeed + tangentX * keptTangentSpeed
        body.velocityY = normalY * bouncedNormalSpeed + tangentY * keptTangentSpeed
      }

      hasContactInIteration = true
      contactCount += 1
      if (normalY >= groundNormalY) {
        isGrounded = true
        if (collider.isCrayon) {
          isOnCrayon = true
        }
      }
    }

    if (!hasContactInIteration) {
      break
    }
  }

  return { isGrounded, isOnCrayon, contactCount }
}

/** 不推開、只回報接觸狀態。Havok 負責運動時仍需要知道魚踩在什麼上面 */
export function detectCircleContact(
  body: Pick<CircleBodyState, 'x' | 'y' | 'radius'>,
  colliderList: readonly SegmentCollider[],
  tolerance: number,
  groundNormalY: number = DEFAULT_GROUND_NORMAL_Y,
): { isGrounded: boolean; isOnCrayon: boolean } {
  let isGrounded = false
  let isOnCrayon = false

  for (const collider of colliderList) {
    const ratio = getSegmentProjection(
      collider.startX,
      collider.startY,
      collider.endX,
      collider.endY,
      body.x,
      body.y,
    )
    const closestX = collider.startX + (collider.endX - collider.startX) * ratio
    const closestY = collider.startY + (collider.endY - collider.startY) * ratio
    const offsetX = body.x - closestX
    const offsetY = body.y - closestY
    const distance = Math.hypot(offsetX, offsetY)
    if (distance >= body.radius + collider.halfThickness + tolerance) {
      continue
    }
    const normalY = distance > 1e-6 ? offsetY / distance : 1
    if (normalY >= groundNormalY) {
      isGrounded = true
      if (collider.isCrayon) {
        isOnCrayon = true
      }
    }
  }

  return { isGrounded, isOnCrayon }
}

export interface FallbackStepOptions {
  deltaSeconds: number;
  gravityY: number;
  maxFallSpeed: number;
  horizontalDamping: number;
  maxSpeed: number;
  restitution: number;
  tangentRetention: number;
}

/** 限制速度「量值」而非逐軸夾值：逐軸夾值在斜向高速時仍能合成出超標的總速，
 * 而且會扭曲行進方向，長斜坡的軌跡會被拉歪
 */
function limitBodySpeed(body: CircleBodyState, maxSpeed: number) {
  const speed = Math.hypot(body.velocityX, body.velocityY)
  if (speed <= maxSpeed || speed < 1e-6) {
    return
  }
  const scale = maxSpeed / speed
  body.velocityX *= scale
  body.velocityY *= scale
}

/** 無 Havok 時的完整運動步進：重力、終端速度、水平阻尼、限速、碰撞解算。
 * 這是降級路徑真正在跑的東西，不是佔位用的空殼
 */
export function stepFallbackFish(
  body: CircleBodyState,
  colliderList: readonly SegmentCollider[],
  options: FallbackStepOptions,
): CollisionSolveResult {
  const stepCount = Math.max(1, Math.ceil(options.deltaSeconds / MAX_FALLBACK_STEP_SECONDS))
  const stepSeconds = options.deltaSeconds / stepCount

  let isGrounded = false
  let isOnCrayon = false
  let contactCount = 0

  for (let step = 0; step < stepCount; step++) {
    body.velocityY += options.gravityY * stepSeconds
    if (body.velocityY < -options.maxFallSpeed) {
      body.velocityY = -options.maxFallSpeed
    }
    body.velocityX *= Math.exp(-options.horizontalDamping * stepSeconds)
    limitBodySpeed(body, options.maxSpeed)

    body.x += body.velocityX * stepSeconds
    body.y += body.velocityY * stepSeconds

    const result = solveCircleAgainstSegmentList(body, colliderList, {
      restitution: options.restitution,
      tangentRetention: options.tangentRetention,
    })
    // 碰撞會把法向速度轉成切向，解算後再限一次速才真的封得住上限
    limitBodySpeed(body, options.maxSpeed)
    isGrounded = isGrounded || result.isGrounded
    isOnCrayon = isOnCrayon || result.isOnCrayon
    contactCount += result.contactCount
  }

  return { isGrounded, isOnCrayon, contactCount }
}

// --- 深度計分與結束判定 ---
export type RunEndReason = 'stalled'

export interface DepthTrackerOptions {
  startY: number;
  /** 停滯超過這麼久判定結束 */
  stallLimitSeconds: number;
  /** 下潛超過這個距離才算有進展 */
  stallProgressThreshold: number;
}

export interface DepthTrackerFrame {
  score: number;
  hasScoreChanged: boolean;
  endReason: RunEndReason | null;
  stallSeconds: number;
}

export interface DepthTrackerUpdateParams {
  deltaSeconds: number;
  fishY: number;
  /** 玩家最近有沒有在畫線或擦線。有輸入就不算卡住，正在想辦法的人不該被判死 */
  hasRecentInput?: boolean;
}

export interface DepthTracker {
  update: (params: DepthTrackerUpdateParams) => DepthTrackerFrame;
  getScore: () => number;
  getMinY: () => number;
}

export function createDepthTracker(options: DepthTrackerOptions): DepthTracker {
  let minY = options.startY
  /** 停滯錨點：看的是「魚有沒有實際移動」，與最深紀錄無關。
   * 被彈回上方後重新下落的魚沒破紀錄但明明在動，用紀錄判停滯會冤枉它
   */
  let restAnchorY = options.startY
  let score = 0
  let stallSeconds = 0
  let endReason: RunEndReason | null = null

  return {
    update({ deltaSeconds, fishY, hasRecentInput = false }) {
      if (Math.abs(fishY - restAnchorY) > options.stallProgressThreshold) {
        restAnchorY = fishY
        stallSeconds = 0
      }
      else if (hasRecentInput) {
        stallSeconds = 0
      }
      else {
        stallSeconds += deltaSeconds
      }

      minY = Math.min(minY, fishY)
      const nextScore = Math.max(0, Math.floor(options.startY - minY))
      const hasScoreChanged = nextScore !== score
      score = nextScore

      if (!endReason && stallSeconds >= options.stallLimitSeconds) {
        endReason = 'stalled'
      }

      return { score, hasScoreChanged, endReason, stallSeconds }
    },
    getScore: () => score,
    getMinY: () => minY,
  }
}

// --- 回饋判定 ---
export interface NearMissWatcherOptions {
  /** 最近距離小於等於此淨空才算擦身 */
  triggerClearance: number;
  /** 魚要潛到障礙下方這麼遠才結算，避免還在障礙旁邊就提前喝采 */
  passMargin: number;
}

interface NearMissRecord {
  minClearance: number;
  hasResolved: boolean;
}

export interface NearMissWatcher {
  /** 回傳本幀是否剛完成一次「貼著海膽擦過去」 */
  update: (params: {
    fishX: number;
    fishY: number;
    fishRadius: number;
    hazardList: readonly CanyonHazardSpec[];
  }) => boolean;
}

/** 以障礙物件參照為鍵追蹤最近淨空：段落存活期間 spec 物件不變，
 * 段落回收後自動從追蹤中剔除
 */
export function createNearMissWatcher(options: NearMissWatcherOptions): NearMissWatcher {
  const recordMap = new Map<CanyonHazardSpec, NearMissRecord>()

  return {
    update({ fishX, fishY, fishRadius, hazardList }) {
      let hasNearMiss = false

      for (const hazard of hazardList) {
        let record = recordMap.get(hazard)
        if (!record) {
          record = { minClearance: Number.POSITIVE_INFINITY, hasResolved: false }
          recordMap.set(hazard, record)
        }
        if (record.hasResolved) {
          continue
        }

        const clearance = Math.hypot(fishX - hazard.x, fishY - hazard.y)
          - fishRadius - hazard.radius
        record.minClearance = Math.min(record.minClearance, clearance)

        if (fishY < hazard.y - options.passMargin) {
          record.hasResolved = true
          if (record.minClearance > 0 && record.minClearance <= options.triggerClearance) {
            hasNearMiss = true
          }
        }
      }

      // 清掉已回收段落的殘留，追蹤表不會隨遊玩時間無限長大
      if (recordMap.size > hazardList.length) {
        const activeSet = new Set(hazardList)
        for (const hazard of recordMap.keys()) {
          if (!activeSet.has(hazard)) {
            recordMap.delete(hazard)
          }
        }
      }

      return hasNearMiss
    },
  }
}

/** 分數跨過整數倍里程碑時回傳該里程碑，否則 null */
export function findCrossedMilestone(
  previousScore: number,
  currentScore: number,
  step: number,
): number | null {
  if (step <= 0) {
    return null
  }
  const previousLevel = Math.floor(previousScore / step)
  const currentLevel = Math.floor(currentScore / step)
  if (currentLevel > previousLevel && currentLevel > 0) {
    return currentLevel * step
  }
  return null
}
