/** 快門無雙的純邏輯層：完全不依賴 Babylon，可在 node 環境測試。
 *
 * 這款的設計核心是把「被包圍」從危機翻轉成機會——一張照片框住越多隻，
 * 倍率越高。所以扇形範圍與團體照加成是連動的：蓄得越滿框得越廣，
 * 一次收服越多分數也越高，玩家才會願意冒險放敵人靠近、聚成一團再按快門。
 */

export type EnemyKind = 'shrimp' | 'crab' | 'jelly' | 'starfish' | 'octopus'

export interface EnemyStats {
  kind: EnemyKind;
  /** 移動速度（世界單位／秒） */
  moveSpeed: number;
  /** 要被拍幾次才會被收服 */
  captureHitCount: number;
  /** 身體半徑。入鏡判定會把它算進去，擦到邊也算拍到 */
  bodyRadius: number;
  /** 收服後計入幾隻。頭目一隻抵十隻 */
  captureValue: number;
  /** 撞到鱈魚的判定半徑 */
  contactRadius: number;
}

// 入鏡判定從寬：bodyRadius 對齊視覺輪廓的外緣（蝦含尾扇、蟹含螯、章魚含腕足），
// 閃光看起來有掃到就要算拍到，玩家才不會覺得被騙
export const ENEMY_STATS_MAP: Record<EnemyKind, EnemyStats> = {
  // 雜兵：快、脆、成群。無雙感的數量來源
  shrimp: { kind: 'shrimp', moveSpeed: 2.7, captureHitCount: 1, bodyRadius: 0.62, captureValue: 1, contactRadius: 0.5 },
  // 橫著走，偶爾突然衝刺，逼玩家不能只盯正面
  crab: { kind: 'crab', moveSpeed: 1.8, captureHitCount: 1, bodyRadius: 0.62, captureValue: 1, contactRadius: 0.58 },
  // 慢慢飄，收服時會分裂成兩隻小水母——清得越快場上反而越亂
  jelly: { kind: 'jelly', moveSpeed: 1.05, captureHitCount: 1, bodyRadius: 0.44, captureValue: 1, contactRadius: 0.56 },
  // 耐拍，而且擋在前面，會替後面的雜兵擋掉一次閃光
  starfish: { kind: 'starfish', moveSpeed: 1.25, captureHitCount: 2, bodyRadius: 0.58, captureValue: 2, contactRadius: 0.62 },
  // 頭目：定期出現，要拍很多次，倒下時給一大筆
  octopus: { kind: 'octopus', moveSpeed: 1.45, captureHitCount: 8, bodyRadius: 1.15, captureValue: 10, contactRadius: 1.05 },
}

/** 水母被收服時分裂出的小水母數量。
 * 只有原生水母（出怪排程生出來的）會分裂，分裂出的小水母被拍到不會再分裂，
 * 否則場上水母只會越打越多、永遠清不完——這條上限由呼叫端（game.ts）的
 * generation 旗標負責，這裡只定義「一次分幾隻」
 */
export const JELLY_SPLIT_COUNT = 2

// --- 場地與移動 ---

/** 圓形擂台半徑。敵人從圓周外湧進來，鱈魚固定站在正中央 */
export const ARENA_RADIUS = 9

/** 指標離畫面中心小於這個距離（畫面高度比例）就不改變朝向。
 * 正中央的方向是未定義的，硬算會讓魚在原地亂指
 */
const AIM_DEAD_ZONE_RATIO = 0.04

export interface AimCommand {
  /** 世界空間的單位方向向量 */
  directionX: number;
  directionZ: number;
  /** 指標太靠近中心時為 false，此時沿用上一個朝向 */
  hasDirection: boolean;
}

/** 把指標在畫面上的位置換算成世界空間的瞄準方向。
 *
 * 用「相對畫面中心」而不是「相對按下的位置」：鱈魚就站在畫面中心，
 * 所以手指按在哪一側就是朝哪一側，不必先拖一段才知道方向。
 *
 * 兩個容易搞錯的地方：
 * 1. xRatio 是畫面「寬度」的比例、yRatio 是「高度」的比例，尺度不同。
 *    先把水平分量乘上 aspectRatio 換算成同一單位，否則寬螢幕上的斜角會偏。
 * 2. 相機架在 -Z 往 +Z 看，所以螢幕往下是朝鏡頭走，對應世界的 -Z。
 */
export function resolveAimDirection(
  pointerXRatio: number,
  pointerYRatio: number,
  aspectRatio: number,
): AimCommand {
  const offsetX = (pointerXRatio - 0.5) * aspectRatio
  const offsetY = pointerYRatio - 0.5
  const distance = Math.hypot(offsetX, offsetY)
  if (distance < AIM_DEAD_ZONE_RATIO) {
    return { directionX: 0, directionZ: 0, hasDirection: false }
  }
  return {
    directionX: offsetX / distance,
    directionZ: -offsetY / distance,
    hasDirection: true,
  }
}

/** 鱈魚模型是 +Z 朝前（與 flop-controller 同一套慣例），
 * 所以朝向角要用 atan2(x, z) 而不是數學慣例的 atan2(z, x)
 */
export function getFacingHeading(directionX: number, directionZ: number): number {
  return Math.atan2(directionX, directionZ)
}

/** 角度的最短路徑插值。
 * 直接對兩個角度做線性趨近，在 ±π 交界會繞遠路轉一大圈——
 * 那會讓魚在轉向時突然整圈亂甩
 */
export function dampAngle(
  currentRadians: number,
  targetRadians: number,
  rate: number,
  deltaSeconds: number,
): number {
  const difference = normalizeAngle(targetRadians - currentRadians)
  return currentRadians + difference * (1 - Math.exp(-rate * deltaSeconds))
}

// --- 蓄力與閃光扇形 ---

/** 蓄到滿所需秒數。太短會讓大絕變成無腦連發，太長則卡住節奏 */
export const CHARGE_FULL_SECONDS = 0.85
/** 扇形半角：輕點是窄而集中的速射，蓄滿幾乎是半圈 */
export const MIN_CONE_HALF_ANGLE = 0.34
export const MAX_CONE_HALF_ANGLE = 1.12
/** 扇形射程 */
export const MIN_CONE_RANGE = 4.4
export const MAX_CONE_RANGE = 8.6

export interface FlashCone {
  halfAngleRadians: number;
  range: number;
}

export function getChargeRatio(chargeSeconds: number): number {
  return Math.min(1, Math.max(0, chargeSeconds / CHARGE_FULL_SECONDS))
}

/** 蓄力比例換算成扇形。角度與射程一起長，蓄滿的一發是真的能框住一片 */
export function computeFlashCone(chargeRatio: number): FlashCone {
  const ratio = Math.min(1, Math.max(0, chargeRatio))
  return {
    halfAngleRadians: MIN_CONE_HALF_ANGLE + (MAX_CONE_HALF_ANGLE - MIN_CONE_HALF_ANGLE) * ratio,
    range: MIN_CONE_RANGE + (MAX_CONE_RANGE - MIN_CONE_RANGE) * ratio,
  }
}

/** 把角度差收斂到 -π ~ π */
export function normalizeAngle(radians: number): number {
  let value = radians
  while (value > Math.PI) {
    value -= Math.PI * 2
  }
  while (value < -Math.PI) {
    value += Math.PI * 2
  }
  return value
}

/** 目標是否落在閃光扇形內。
 * 把目標的身體半徑換算成額外的角度寬容，擦到邊也算拍到——
 * 用中心點判定會讓大隻的敵人明明被閃光蓋住卻沒事，玩家會覺得被騙
 */
export function isTargetInCone(
  originX: number,
  originZ: number,
  aimRadians: number,
  cone: FlashCone,
  targetX: number,
  targetZ: number,
  targetRadius: number,
): boolean {
  const offsetX = targetX - originX
  const offsetZ = targetZ - originZ
  const distance = Math.hypot(offsetX, offsetZ)
  if (distance > cone.range + targetRadius) {
    return false
  }
  // 貼在臉上的目標一律算中，否則角度計算會因為距離趨近零而失去意義
  if (distance <= targetRadius) {
    return true
  }
  const angleDifference = Math.abs(normalizeAngle(Math.atan2(offsetZ, offsetX) - aimRadians))
  const radiusAllowance = Math.asin(Math.min(1, targetRadius / distance))
  return angleDifference <= cone.halfAngleRadians + radiusAllowance
}

// --- 電量 ---

export const BATTERY_CAPACITY = 100
/** 每秒回充。輕點幾乎可以連發，蓄滿的大招需要等一下 */
export const BATTERY_RECHARGE_PER_SECOND = 27
export const MIN_SHUTTER_COST = 17
export const MAX_SHUTTER_COST = 48

export function getShutterCost(chargeRatio: number): number {
  const ratio = Math.min(1, Math.max(0, chargeRatio))
  return MIN_SHUTTER_COST + (MAX_SHUTTER_COST - MIN_SHUTTER_COST) * ratio
}

/** 電量不足時，把蓄力比例壓到現在付得起的程度。
 * 直接讓玩家按不出來會很挫折，改成「按得出來但只有小範圍」比較好懂
 */
export function capChargeRatioByBattery(chargeRatio: number, battery: number): number {
  if (battery >= getShutterCost(chargeRatio)) {
    return chargeRatio
  }
  if (battery < MIN_SHUTTER_COST) {
    return 0
  }
  return (battery - MIN_SHUTTER_COST) / (MAX_SHUTTER_COST - MIN_SHUTTER_COST)
}

export function canFireShutter(battery: number): boolean {
  return battery >= MIN_SHUTTER_COST
}

export function advanceBattery(battery: number, deltaSeconds: number): number {
  return Math.min(BATTERY_CAPACITY, battery + BATTERY_RECHARGE_PER_SECOND * deltaSeconds)
}

// --- 團體照、連段、無雙槽 ---

/** 一張照片拍到 N 隻的加成倍率。
 * 刻意是超線性的：拍到 6 隻要明顯比分兩次各拍 3 隻划算，
 * 玩家才會願意冒險放敵人靠近、聚成一團
 */
export function getGroupBonusMultiplier(captureCount: number): number {
  if (captureCount <= 1) {
    return 1
  }
  return 1 + (captureCount - 1) * 0.42
}

/** 團體照的播報門檻。低於這個數不跳字，免得畫面一直閃 */
export const GROUP_TOAST_THRESHOLD = 4

// --- 無雙必殺：蓄滿後由玩家自己選時機放，不是自動連續開火 ---

export const MUSOU_GAUGE_MAX = 100

/** 無雙槽的累積量：單純吃收服數，不再疊乘團體照倍率——
 * 團體照的誘因已經直接灌進分數，這裡疊乘會變成同一個行為拿兩次獎勵
 */
export function getMusouGaugeGain(captureCount: number): number {
  return captureCount * 3.4
}

export function advanceMusouGauge(gauge: number, gain: number): number {
  return Math.min(MUSOU_GAUGE_MAX, gauge + gain)
}

export function isMusouReady(gauge: number): boolean {
  return gauge >= MUSOU_GAUGE_MAX
}

/** 必殺的判定範圍：蓋過整座擂台再多留一截緩衝，貼著台緣走進來的敵人也收得到。
 * 半角 π＝整整一圈，一次性框住站得住的一切，不是分好幾發連續掃射
 */
export const MUSOU_ULTIMATE_CONE: FlashCone = {
  halfAngleRadians: Math.PI,
  range: ARENA_RADIUS + 3,
}

// --- 鎮定（失敗條件）---

export const COMPOSURE_MAX = 3
/** 被撞到後的無敵時間，避免被一群雜兵連續撞到瞬間結束 */
export const INVULNERABLE_SECONDS = 1.3
/** 被撞到時把周圍敵人推開的距離，給玩家喘息的空間 */
export const KNOCKBACK_DISTANCE = 3.2

export interface ComposureState {
  composure: number;
  invulnerableRemainSeconds: number;
}

export const INITIAL_COMPOSURE_STATE: ComposureState = {
  composure: COMPOSURE_MAX,
  invulnerableRemainSeconds: 0,
}

export function advanceInvulnerable(state: ComposureState, deltaSeconds: number): ComposureState {
  if (state.invulnerableRemainSeconds <= 0) {
    return state
  }
  return {
    ...state,
    invulnerableRemainSeconds: Math.max(0, state.invulnerableRemainSeconds - deltaSeconds),
  }
}

export function isVulnerable(state: ComposureState): boolean {
  return state.invulnerableRemainSeconds <= 0 && state.composure > 0
}

/** 被撞到：扣一格鎮定並進入無敵。已在無敵中就完全不受影響 */
export function applyContactDamage(state: ComposureState): ComposureState {
  if (!isVulnerable(state)) {
    return state
  }
  return {
    composure: Math.max(0, state.composure - 1),
    invulnerableRemainSeconds: INVULNERABLE_SECONDS,
  }
}

export function isDefeated(state: ComposureState): boolean {
  return state.composure <= 0
}

// --- 出怪排程 ---

/** 場上同時存在的上限。超過就暫停生成，避免手機被拖垮 */
export const MAX_ACTIVE_ENEMY_COUNT = 90

/** 出怪間隔隨時間縮短，約兩分鐘後達到最密。
 * 用指數趨近而非線性，開場的鬆弛感才夠玩家熟悉操作
 */
export function getSpawnIntervalSeconds(elapsedSeconds: number): number {
  const rampRatio = 1 - Math.exp(-elapsedSeconds / 42)
  return 1.15 - (1.15 - 0.2) * rampRatio
}

/** 一次生成幾隻。後期改成成群出現，才有被包圍的壓迫感 */
export function getSpawnBatchCount(elapsedSeconds: number): number {
  if (elapsedSeconds < 20) {
    return 1
  }
  if (elapsedSeconds < 55) {
    return 2
  }
  return elapsedSeconds < 100 ? 3 : 4
}

/** 頭目的出現間隔 */
export const OCTOPUS_INTERVAL_SECONDS = 34
/** 開場先讓玩家玩一陣子再放頭目 */
export const OCTOPUS_FIRST_SECONDS = 26

interface EnemyWeight {
  kind: EnemyKind;
  /** 權重隨時間從 startWeight 線性移到 endWeight */
  startWeight: number;
  endWeight: number;
}

/** 開場幾乎全是蝦兵，後期螃蟹、水母、海星逐漸接手 */
const ENEMY_WEIGHT_LIST: EnemyWeight[] = [
  { kind: 'shrimp', startWeight: 1, endWeight: 0.34 },
  { kind: 'crab', startWeight: 0.12, endWeight: 0.3 },
  { kind: 'jelly', startWeight: 0.04, endWeight: 0.22 },
  { kind: 'starfish', startWeight: 0, endWeight: 0.18 },
]

/** 難度爬升的參考時長：到這個秒數時權重完全走到 endWeight */
const WEIGHT_RAMP_SECONDS = 95

export function getEnemyWeightList(elapsedSeconds: number): { kind: EnemyKind; weight: number }[] {
  const rampRatio = Math.min(1, Math.max(0, elapsedSeconds / WEIGHT_RAMP_SECONDS))
  return ENEMY_WEIGHT_LIST.map((entry) => ({
    kind: entry.kind,
    weight: entry.startWeight + (entry.endWeight - entry.startWeight) * rampRatio,
  }))
}

/** 依當下權重抽一種雜兵。random 需回傳 0~1 */
export function pickEnemyKind(elapsedSeconds: number, random: () => number): EnemyKind {
  const weightList = getEnemyWeightList(elapsedSeconds)
  const totalWeight = weightList.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = random() * totalWeight
  for (const entry of weightList) {
    cursor -= entry.weight
    if (cursor <= 0) {
      return entry.kind
    }
  }
  return 'shrimp'
}

/** 生成位置：擂台外緣一圈，讓敵人從畫面邊界走進來 */
export const SPAWN_RING_RADIUS = ARENA_RADIUS + 2.6

export function resolveSpawnPosition(angleRadians: number): { x: number; z: number } {
  return {
    x: Math.cos(angleRadians) * SPAWN_RING_RADIUS,
    z: Math.sin(angleRadians) * SPAWN_RING_RADIUS,
  }
}

// --- 照片評價（取景框顏色用）---

export type PhotoGrade = 'excellent' | 'fine' | 'poor'

export function evaluatePhotoGrade(captureCount: number): PhotoGrade {
  if (captureCount >= GROUP_TOAST_THRESHOLD) {
    return 'excellent'
  }
  return captureCount > 0 ? 'fine' : 'poor'
}
