/** 靈感溯源的純邏輯層：石陣生成、蓄力曲線、跳躍距離映射、落點評價與連段、
 * 荷葉下沉與浮木漂移的狀態推進。
 *
 * 不依賴 Babylon，所有函式都是「輸入狀態 → 輸出新狀態」的純函式或封閉狀態機，
 * 方便在 node 環境直接單元測試，也讓場景層只負責把數字畫出來。
 */
import { clamp, createRandomGenerator } from '../../shared/random-generator'

export type PlatformKind = 'stone' | 'mossStone' | 'lilyPad' | 'driftwood'

export interface PlatformSpec {
  /** 全域序號，也是分數（步數）的依據。0 為起點石 */
  index: number;
  kind: PlatformKind;
  /** 靜止基準的水平位置。浮木以此為漂移中心 */
  centerX: number;
  centerZ: number;
  /** 俯視半徑，落點評價以此為尺規 */
  radius: number;
  /** 浮木橫向漂移振幅（其餘型別為 0） */
  driftAmplitude: number;
  /** 浮木漂移角速度（rad/s） */
  driftAngularSpeed: number;
  /** 浮木漂移初相位，讓每根木頭各走各的 */
  driftPhase: number;
}

// --- 地形生成參數 ---
/** 起步間距。比最小跳躍距離大，逼玩家一開始就得蓄一點力 */
const FIRST_GAP = 3
/** 每往前一步間距增加量，與上限一起構成難度曲線 */
const GAP_GROWTH = 0.11
/** 間距上限與最大跳躍距離互相牽制：上限加上側移、漂移與落點偏心的最壞情況，
 * 仍必須落在 MAX_HOP_DISTANCE 之內，否則會生出跳不過去的死局
 */
const MAX_GAP = 5.6
const GAP_JITTER = 0.5
/** 石頭半徑隨進度縮小，判定越後面越嚴苛 */
const FIRST_RADIUS = 1.25
const MIN_RADIUS = 0.72
const RADIUS_SHRINK = 0.018
const RADIUS_JITTER = 0.08
/** 單步側向位移上限與其成長速度。側移只影響取景與浮木預判，
 * 太大會讓中心距離超過最大跳躍距離，變成無解關卡
 */
const LATERAL_STEP_GROWTH = 0.06
const MAX_LATERAL_STEP = 1.2
/** 溪流可用寬度的一半，石頭不會排到岸上 */
const MAX_LATERAL = 2.2
/** 前幾顆固定是普通石頭，讓玩家先把蓄力手感練起來 */
const TUTORIAL_PLATFORM_COUNT = 4
const LILY_PAD_FROM_INDEX = 5
const DRIFTWOOD_FROM_INDEX = 9
const MOSS_STONE_FROM_INDEX = 13
const LILY_PAD_WEIGHT = 0.2
const DRIFTWOOD_WEIGHT = 0.18
const MOSS_STONE_WEIGHT = 0.18

/** 起點石：位置固定、半徑放大，開場站得穩、看得清楚 */
export const START_PLATFORM: PlatformSpec = {
  index: 0,
  kind: 'stone',
  centerX: 0,
  centerZ: 0,
  radius: 1.45,
  driftAmplitude: 0,
  driftAngularSpeed: 0,
  driftPhase: 0,
}

/** 以段落序號散開後當種子。直接用 index 當種子時相鄰段的亂數序列會過於相似，
 * 乘上大質數再偏移可讓相鄰石頭的形貌與型別真正獨立
 */
function createPlatformRandom(index: number): () => number {
  return createRandomGenerator(index * 1103515245 + 12345)
}

/** 挑落腳點型別。特殊落腳點不連續出現：連兩顆會沉會漂的東西太難，
 * 中間插一顆實心石讓玩家喘口氣
 */
function pickPlatformKind(
  index: number,
  previousKind: PlatformKind,
  random: () => number,
): PlatformKind {
  if (index < TUTORIAL_PLATFORM_COUNT || previousKind !== 'stone') {
    return 'stone'
  }

  const roll = random()
  let threshold = 0
  if (index >= LILY_PAD_FROM_INDEX) {
    threshold += LILY_PAD_WEIGHT
    if (roll < threshold) {
      return 'lilyPad'
    }
  }
  if (index >= DRIFTWOOD_FROM_INDEX) {
    threshold += DRIFTWOOD_WEIGHT
    if (roll < threshold) {
      return 'driftwood'
    }
  }
  if (index >= MOSS_STONE_FROM_INDEX) {
    threshold += MOSS_STONE_WEIGHT
    if (roll < threshold) {
      return 'mossStone'
    }
  }
  return 'stone'
}

/** 接續上一顆生成下一顆。只依賴上一顆與序號，
 * 因此整條溪流從 START_PLATFORM 推導出來永遠一模一樣
 */
export function appendPlatform(previous: PlatformSpec): PlatformSpec {
  const index = previous.index + 1
  const random = createPlatformRandom(index)

  const gap = Math.min(MAX_GAP, FIRST_GAP + index * GAP_GROWTH)
    + (random() - 0.5) * 2 * GAP_JITTER
  const lateralStep = Math.min(MAX_LATERAL_STEP, index * LATERAL_STEP_GROWTH)
  // 往中線收 0.65 倍再加隨機側移，石陣才會沿著溪心蜿蜒而不是一路偏到岸邊
  const centerX = clamp(
    previous.centerX * 0.65 + (random() - 0.5) * 2 * lateralStep,
    -MAX_LATERAL,
    MAX_LATERAL,
  )
  const kind = pickPlatformKind(index, previous.kind, random)
  const radius = Math.max(
    MIN_RADIUS,
    FIRST_RADIUS - index * RADIUS_SHRINK + (random() - 0.5) * 2 * RADIUS_JITTER,
  )

  const isDriftwood = kind === 'driftwood'
  return {
    index,
    kind,
    centerX,
    centerZ: previous.centerZ + gap,
    // 浮木本身細長，俯視判定半徑略縮，踩中心的難度才對得上視覺
    radius: isDriftwood ? radius * 0.85 : radius,
    driftAmplitude: isDriftwood ? Math.min(1.2, 0.5 + index * 0.02) : 0,
    driftAngularSpeed: isDriftwood ? 0.65 + random() * 0.45 : 0,
    driftPhase: isDriftwood ? random() * Math.PI * 2 : 0,
  }
}

/** 從起點石往前長出 count 顆（不含起點石） */
export function createPlatformList(count: number): PlatformSpec[] {
  const platformList: PlatformSpec[] = [START_PLATFORM]
  for (let step = 0; step < count; step++) {
    platformList.push(appendPlatform(platformList[platformList.length - 1]!))
  }
  return platformList
}

/** 當下的水平位置。浮木會左右漂，其餘型別恆等於 centerX */
export function getPlatformCenterX(spec: PlatformSpec, timeSeconds: number): number {
  if (spec.driftAmplitude === 0) {
    return spec.centerX
  }
  return spec.centerX
    + spec.driftAmplitude * Math.sin(timeSeconds * spec.driftAngularSpeed + spec.driftPhase)
}

// --- 蓄力與跳躍距離 ---
/** 力道往復一趟（0→1）的秒數倒數。往復式蓄力逼玩家抓時機，
 * 比單向增長多一層節奏感
 */
export const CHARGE_CYCLE_SPEED = 0.8
export const MIN_HOP_DISTANCE = 1.8
export const MAX_HOP_DISTANCE = 8.2

export interface ChargeState {
  /** 0~1 的力道 */
  power: number;
  /** 力道正在往上爬（false = 到頂後回彈中） */
  isRising: boolean;
}

export const INITIAL_CHARGE_STATE: ChargeState = { power: 0, isRising: true }

/** 推進往復式蓄力。以三角波折返，單幀 delta 再大也不會卡在端點或衝出範圍 */
export function advanceChargePower(
  state: ChargeState,
  deltaSeconds: number,
  cycleSpeed = CHARGE_CYCLE_SPEED,
): ChargeState {
  // 把（力道, 方向）攤平成週期 2 的單調行程，加上位移後再折回來
  const traveled = (state.isRising ? state.power : 2 - state.power)
    + cycleSpeed * deltaSeconds
  let phase = traveled % 2
  if (phase < 0) {
    phase += 2
  }
  return phase <= 1
    ? { power: phase, isRising: true }
    : { power: 2 - phase, isRising: false }
}

/** 力道映射到跳躍距離。刻意用線性：預測環已經把落點畫在地上，
 * 線性才能讓玩家心裡的「壓多久」與「跳多遠」一一對應
 */
export function getHopDistance(power: number): number {
  return MIN_HOP_DISTANCE
    + (MAX_HOP_DISTANCE - MIN_HOP_DISTANCE) * clamp(power, 0, 1)
}

// --- 落點評價與連段 ---
export type LandingGrade = 'perfect' | 'good' | 'edge' | 'miss'

/** 完美判定：距心 25% 半徑內 */
export const PERFECT_RADIUS_RATIO = 0.25
/** 良好判定上限，之後到邊界都算踉蹌 */
export const GOOD_RADIUS_RATIO = 0.72

export function evaluateLandingGrade(
  distanceFromCenter: number,
  radius: number,
): LandingGrade {
  const ratio = distanceFromCenter / radius
  if (ratio <= PERFECT_RADIUS_RATIO) {
    return 'perfect'
  }
  if (ratio <= GOOD_RADIUS_RATIO) {
    return 'good'
  }
  if (ratio <= 1) {
    return 'edge'
  }
  return 'miss'
}

export function hasLandedOnPlatform(grade: LandingGrade): boolean {
  return grade !== 'miss'
}

/** 連段：完美與良好都續段，踩到邊緣或落水就歸零 */
export function getNextCombo(combo: number, grade: LandingGrade): number {
  if (grade === 'perfect' || grade === 'good') {
    return combo + 1
  }
  return 0
}

// --- 荷葉下沉 ---
/** 踩上去到開始下沉的緩衝，逼玩家接著馬上跳 */
export const LILY_PAD_SINK_DELAY = 1.2
export const LILY_PAD_SINK_SPEED = 0.6
/** 沉到這個深度就算落水 */
export const LILY_PAD_FATAL_DEPTH = 0.5

/** 荷葉被踩後的下沉深度。離開後仍持續下沉（視覺上比較合理），
 * 故只吃「累積站立時間」而不需要知道魚還在不在上面
 */
export function getLilyPadSinkDepth(standElapsedSeconds: number): number {
  return Math.max(0, standElapsedSeconds - LILY_PAD_SINK_DELAY) * LILY_PAD_SINK_SPEED
}

export function isLilyPadSunk(sinkDepth: number): boolean {
  return sinkDepth >= LILY_PAD_FATAL_DEPTH
}

// --- 苔石打滑 ---
/** 打滑總位移收斂到 speed / decay（約 0.61 單位，半徑的六成）。
 *
 * 上限由「完美落點滑完仍站得住」定死：完美的落點誤差在 0.25 半徑內
 * （PERFECT_RADIUS_RATIO），0.25 + 0.61 = 0.86 仍在半徑之內。
 * 良好落點（到 0.72）滑完就會被推出去——苔石的風險就落在這個區間，
 * 想踩苔石就得踩得夠準，不是踩得到就好。
 *
 * 衰減也放慢（4.6 → 3.5，時間常數 0.22 → 0.29 秒）：滑得遠之外還要滑得久，
 * 「一路滑出去」的無力感才出得來，瞬間位移只會讀成落點被判錯
 */
export const MOSS_SLIDE_SPEED = 2.15
export const MOSS_SLIDE_DECAY = 3.5

/** 打滑位移：初速指數衰減的積分。用解析解而非逐幀積分，
 * 才不會因幀率不同滑出不同距離
 */
export function getMossSlideOffset(
  elapsedSeconds: number,
  initialSpeed = MOSS_SLIDE_SPEED,
  decayRate = MOSS_SLIDE_DECAY,
): number {
  return (initialSpeed / decayRate) * (1 - Math.exp(-decayRate * elapsedSeconds))
}

// --- 跳躍弧線 ---
/** 手感常數承襲 flop-controller 的預設值（單跳 0.34 秒為基礎往上加），
 * 讓這款的跳躍與箱庭裡的鱈魚是同一隻魚
 */
export const HOP_MIN_DURATION = 0.4
export const HOP_MAX_DURATION = 0.72
export const HOP_MIN_HEIGHT = 1
export const HOP_MAX_HEIGHT = 2.5
export const HOP_PITCH_AMPLITUDE = 0.4
export const HOP_ROLL_AMPLITUDE = 0.55
/** 蓄力壓扁的最大量（力道滿時壓到 0.8 倍），與 flop-controller 的 crouchSquashAmount 一致 */
export const CROUCH_SQUASH_AMOUNT = 0.2
/** 起跳伸展與落地壓縮給彈簧的速度衝擊量 */
export const STRETCH_IMPULSE = 0.16
export const LANDING_IMPULSE = 0.18
export const SQUASH_STIFFNESS = 1200
export const SQUASH_DAMPING = 20

export interface HopArc {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  /** 起跳當下的朝向（rad，atan2(dx, dz) 的 Babylon 慣例） */
  heading: number;
  distance: number;
  duration: number;
  height: number;
}

function getDistanceRatio(distance: number): number {
  return clamp(
    (distance - MIN_HOP_DISTANCE) / (MAX_HOP_DISTANCE - MIN_HOP_DISTANCE),
    0,
    1,
  )
}

/** 跳越遠飛越久、拋得越高，重量感才對 */
export function getHopDuration(distance: number): number {
  return HOP_MIN_DURATION + (HOP_MAX_DURATION - HOP_MIN_DURATION) * getDistanceRatio(distance)
}

export function getHopHeight(distance: number): number {
  return HOP_MIN_HEIGHT + (HOP_MAX_HEIGHT - HOP_MIN_HEIGHT) * getDistanceRatio(distance)
}

/** 從起點朝目標方向跳出指定距離。方向由目標決定、距離由力道決定，
 * 單指操作才有辦法同時處理側向偏移的石陣
 */
export function createHopArc(
  startX: number,
  startZ: number,
  aimX: number,
  aimZ: number,
  distance: number,
): HopArc {
  const deltaX = aimX - startX
  const deltaZ = aimZ - startZ
  const length = Math.hypot(deltaX, deltaZ)
  // 目標與起點重合時退化為正前方，避免除以零
  const directionX = length > 1e-4 ? deltaX / length : 0
  const directionZ = length > 1e-4 ? deltaZ / length : 1

  return {
    startX,
    startZ,
    endX: startX + directionX * distance,
    endZ: startZ + directionZ * distance,
    heading: Math.atan2(directionX, directionZ),
    distance,
    duration: getHopDuration(distance),
    height: getHopHeight(distance),
  }
}

export interface HopSample {
  x: number;
  y: number;
  z: number;
  /** 正值為抬頭：起跳抬頭、下落低頭，兩端歸零不跳變 */
  pitch: number;
  /** 繞身體長軸的擺滾，逐跳交替方向 */
  roll: number;
  /** 與跳躍同步的擺尾相位 */
  wavePhase: number;
}

/** 取弧線上 progress（0~1）的姿態。拋物線 4p(1-p) 的峰值恰在中點且兩端為 0 */
export function sampleHopArc(arc: HopArc, progress: number, rollSign: number): HopSample {
  const ratio = clamp(progress, 0, 1)
  const wave = Math.sin(ratio * Math.PI)
  return {
    x: arc.startX + (arc.endX - arc.startX) * ratio,
    y: arc.height * 4 * ratio * (1 - ratio),
    z: arc.startZ + (arc.endZ - arc.startZ) * ratio,
    pitch: HOP_PITCH_AMPLITUDE * Math.sin(ratio * Math.PI * 2),
    roll: rollSign * HOP_ROLL_AMPLITUDE * wave,
    wavePhase: ratio * Math.PI * 2,
  }
}

// --- 擠壓彈簧 ---
/** 擠壓彈簧的積分步長上限（秒）：大 delta 分段積分，彈簧不會發散 */
const SQUASH_SPRING_MAX_STEP = 1 / 240

export interface SquashSpring {
  /** 目前的擠壓比例（1 = 原形、<1 壓扁、>1 拉長） */
  getValue: () => number;
  setTarget: (target: number) => void;
  /** 給一次速度衝擊，peak 為期望彈到的幅度 */
  applyImpulse: (peak: number) => void;
  advance: (deltaSeconds: number) => number;
  reset: () => void;
}

/** 卡通彈跳的縮放全部由這條彈簧產生：蓄力把目標壓低、放開拉回 1 自己往上彈，
 * 落地給一次負向衝擊後過衝回彈。
 *
 * 這裡沒有直接複用 FlopController：它的介面是 setTarget 導向的自動連跳
 * （自己決定何時起跳、跳多遠、跳完自動接下一跳），與本款「玩家蓄力、單次定距起跳」
 * 的控制權完全相反。改寫精簡版並沿用它的手感常數
 * （stiffness 1200、damping 20、crouchSquashAmount 0.2、pitch 0.4、roll 0.55），
 * 視覺上仍是同一隻鱈魚的彈跳。
 */
export function createSquashSpring(
  stiffness = SQUASH_STIFFNESS,
  damping = SQUASH_DAMPING,
): SquashSpring {
  let value = 1
  let velocity = 0
  let target = 1

  return {
    getValue: () => value,
    setTarget(nextTarget) {
      target = nextTarget
    },
    applyImpulse(peak) {
      velocity += peak * Math.sqrt(stiffness)
    },
    advance(deltaSeconds) {
      const stepCount = Math.max(1, Math.ceil(deltaSeconds / SQUASH_SPRING_MAX_STEP))
      const step = deltaSeconds / stepCount
      for (let index = 0; index < stepCount; index++) {
        const acceleration = (target - value) * stiffness - velocity * damping
        velocity += acceleration * step
        value += velocity * step
      }
      return value
    },
    reset() {
      value = 1
      velocity = 0
      target = 1
    },
  }
}

/** 蓄力時的擠壓目標：力道越滿蹲得越低，玩家不看力道條也感覺得到蓄了多少 */
export function getCrouchSquashTarget(power: number): number {
  return 1 - CROUCH_SQUASH_AMOUNT * clamp(power, 0, 1)
}
