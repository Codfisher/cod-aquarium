import type { DriftSteps } from './drift-job'
import type { DriftTrack, DriftTrackSample } from './drift-track'
import { runStepsSync } from './drift-job'
import { isSolidAt } from './drift-solid'
import { diffAngle, sampleDriftTrack } from './drift-track'

/**
 * 神遊的構圖量測與看哪裡的挑選
 *
 * 鏡位要不要用、視線朝哪裡，都看「畫面裡實際有什麼」：側移時側面貼著樹幹會一格一格閃過去（頻閃），
 * 視差要前景有東西掠過、而且正中央看得到景物，拉遠揭露要身後夠開闊，環顧要朝向有縱深的方向。
 * 這裡沿軌道往視線方向探幾束水平射線（體素格上逐格前進），量出前景的疏密、視線被擋的比例與周圍開闊程度。
 * 只在每段鏡位開始時算一次，不進每幀
 */

/** 每隔多少格（沿軌道）取一個量測點 */
const PROBE_SPACING = 2.5
/** 射線最遠探幾格、每步幾格 */
const PROBE_RANGE = 18
const PROBE_STEP = 1
/** 三維射線每步半格 */
const RAY_STEP = 0.5
/** 距離小於這個算「貼臉的前景」（近景會頻閃），介於這個與 MID_END 之間算「中景」（視差的主角） */
const NEAR_END = 4
const MID_END = 16
/** 視線被擋住的距離：正前方這麼近就有東西，畫面會被一面牆或樹幹塞滿 */
const BLOCKED_END = 10
/** 前景量測時，中央視線左右各偏多少弧度再探一束 */
const SIDE_RAY_OFFSET = 0.3
/** 量周圍開闊程度的射線數與距離：八方向，十二格內沒擋到才算開 */
const SURROUND_RAY_COUNT = 8
const SURROUND_OPEN_DISTANCE = 12
/** 量開闊程度時往上仰的角度（弧度，約二十度） */
const UP_RAY_PITCH = 0.35
/** 挑環顧方向時，探幾個方向、最遠探多遠 */
const LOOK_RAY_COUNT = 24
const LOOK_RAY_RANGE = 50
/** 探縱深的三束射線上下各差多少弧度、納入候選的景物權重下限、縱深至少要有附近最長視線的幾成 */
const DEPTH_RAY_SPREAD = 0.25
const INTEREST_WEIGHT_MIN = 0.25
/** 景物離得比這近（格）不當看點：畫面會被一個東西塞滿 */
const INTEREST_DISTANCE_MIN = 8
const RELATIVE_DEPTH_MIN = 0.4
/** 朝景物看時，畫面正中央至少要通到景物距離的幾成（或 minDepth，取小的） */
const INTEREST_CENTER_DEPTH_RATIO = 0.7
/** 縱深的上限是正前方（俯仰不變的那束）距離的幾倍：上下兩束越過近在眼前的樹幹不能讓這個方向算開闊 */
const CENTER_DEPTH_FACTOR = 1.8

export interface ViewMeasure {
  /** 視線方向上近景（四格內有實心方塊）的取樣比例 */
  nearFraction: number;
  /** 正前方八格內被擋住的取樣比例：畫面會被牆塞滿 */
  blockedFraction: number;
  /** 正前方十八格內完全沒擋到的取樣比例：看得遠、看得到景物 */
  clearFraction: number;
  /** 左右偏開的視線在中景（四到十六格）有東西的取樣比例：畫面邊緣的前景（掠過的樹與石柱） */
  foregroundFraction: number;
}

/** 沿水平視線探，回傳第一個實心方塊的距離（格），沒有擋到就是 maxDistance */
export function probeViewDistance(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  yaw: number,
  maxDistance: number = PROBE_RANGE,
): number {
  const dirX = Math.sin(yaw)
  const dirZ = Math.cos(yaw)
  for (let distance = PROBE_STEP; distance <= maxDistance; distance += PROBE_STEP) {
    const blockX = Math.round(x + dirX * distance)
    const blockZ = Math.round(z + dirZ * distance)
    /** 眼睛高度與胸口高度各看一次：樹幹、石柱兩者都會擋到，草與矮灌木不算 */
    if (isSolidAt(worldState, blockX, Math.floor(eyeY + 0.5), blockZ) || isSolidAt(worldState, blockX, Math.floor(eyeY - 0.5), blockZ))
      return distance
  }
  return maxDistance
}

/**
 * 沿視線（含俯仰）逐半格前進，回傳第一個實心方塊的距離（格），沒有擋到就是 maxDistance
 *
 * 水平射線量不出斜坡與懸崖：山壁是斜的，眼睛高度的水平線可以從壁面上方穿過去，畫面中央卻是一整面坡。
 * 凡是在量「畫面裡看到什麼」都要用這個，帶著實際的俯仰（正值往下看）
 */
export function probeViewDistance3D(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  yaw: number,
  pitch: number,
  maxDistance: number = PROBE_RANGE,
): number {
  const horizontal = Math.cos(pitch)
  const dirX = Math.sin(yaw) * horizontal
  const dirZ = Math.cos(yaw) * horizontal
  const dirY = -Math.sin(pitch)
  for (let distance = RAY_STEP; distance <= maxDistance; distance += RAY_STEP) {
    if (isSolidAt(worldState, Math.round(x + dirX * distance), Math.floor(eyeY + dirY * distance + 0.5), Math.round(z + dirZ * distance)))
      return distance
  }
  return maxDistance
}

/**
 * 從這裡看向一個有高度的點，中間有沒有被擋住（景物自己所在的格子不算，容許 margin 格的誤差）
 *
 * 三維視線：瀑布、溪面這種有高度的景物，水平射線會從山坡上方穿過去，誤判成看得到
 */
export function isSightlineClear3D(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  margin = 1.5,
): boolean {
  const length = Math.hypot(targetX - x, targetY - eyeY, targetZ - z)
  if (length <= margin)
    return true

  const reach = Math.min(length - margin, LOOK_RAY_RANGE)
  const stepX = (targetX - x) / length
  const stepY = (targetY - eyeY) / length
  const stepZ = (targetZ - z) / length
  for (let distance = RAY_STEP; distance <= reach; distance += RAY_STEP) {
    if (isSolidAt(worldState, Math.round(x + stepX * distance), Math.floor(eyeY + stepY * distance + 0.5), Math.round(z + stepZ * distance)))
      return false
  }
  return true
}

/** 從這裡水平看向一點，中間有沒有被擋住（景物自己所在的格子不算，容許 margin 格的誤差） */
export function isSightlineClear(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  targetX: number,
  targetZ: number,
  margin = 1.5,
): boolean {
  const distance = Math.hypot(targetX - x, targetZ - z)
  if (distance <= margin)
    return true
  return probeViewDistance(worldState, x, eyeY, z, Math.atan2(targetX - x, targetZ - z), Math.min(distance - margin, LOOK_RAY_RANGE)) >= Math.min(distance - margin, LOOK_RAY_RANGE)
}

/** 一個量測點的視線方向：相對前進方向的固定偏角，或朝向世界裡的一點 */
export type ViewDirection =
  | { kind: 'offset'; offset: number }
  | { kind: 'yaw'; yaw: number }
  | { kind: 'point'; x: number; z: number }
  | { kind: 'radial'; centerX: number; centerZ: number; isOutward: boolean }

/** 沿軌道的一段（沿軌道距離 startDistance 到 endDistance），量視線方向上的前景疏密與被擋的比例 */
export function measureView(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
  direction: ViewDirection,
  /** 這段的視線俯仰（正值往下看）；量的是畫面中央實際會看到的東西 */
  pitch = 0,
): ViewMeasure {
  return runStepsSync(measureViewSteps(worldState, track, startDistance, endDistance, direction, pitch))
}

/** 每量幾個取樣點讓出一次（一個取樣點三束射線，冷的程式碼要零點幾毫秒） */
const SAMPLE_YIELD_INTERVAL = 2

/** measureView 的分段版 */
export function* measureViewSteps(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
  direction: ViewDirection,
  pitch = 0,
): DriftSteps<ViewMeasure> {
  const sample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }
  let total = 0
  let near = 0
  let blocked = 0
  let clear = 0
  let foreground = 0

  for (let distance = startDistance; distance <= endDistance; distance += PROBE_SPACING) {
    if (total % SAMPLE_YIELD_INTERVAL === SAMPLE_YIELD_INTERVAL - 1)
      yield
    sampleDriftTrack(track, distance, sample)
    const yaw = direction.kind === 'offset'
      ? sample.yaw + direction.offset
      : direction.kind === 'yaw'
        ? direction.yaw
        : direction.kind === 'radial'
          ? Math.atan2(sample.x - direction.centerX, sample.z - direction.centerZ) + (direction.isOutward ? 0 : Math.PI)
          : Math.atan2(direction.x - sample.x, direction.z - sample.z)
    const center = probeViewDistance3D(worldState, sample.x, sample.y, sample.z, yaw, pitch)
    total++
    if (center < NEAR_END)
      near++
    if (center < BLOCKED_END)
      blocked++
    if (center >= PROBE_RANGE)
      clear++

    const left = probeViewDistance3D(worldState, sample.x, sample.y, sample.z, yaw - SIDE_RAY_OFFSET, pitch)
    const right = probeViewDistance3D(worldState, sample.x, sample.y, sample.z, yaw + SIDE_RAY_OFFSET, pitch)
    if ((left >= NEAR_END && left < MID_END) || (right >= NEAR_END && right < MID_END))
      foreground++
  }

  if (total === 0)
    return { nearFraction: 0, blockedFraction: 0, clearFraction: 1, foregroundFraction: 0 }
  return {
    nearFraction: near / total,
    blockedFraction: blocked / total,
    clearFraction: clear / total,
    foregroundFraction: foreground / total,
  }
}

export interface SubjectVisibility {
  /** 看得到景物（三維視線沒被擋、而且離得夠遠不會塞滿畫面）的取樣比例 */
  visibleFraction: number;
}

/**
 * 沿軌道的一段，量鏡頭一路看著某個景物（有高度的點）時，看不看得到它
 *
 * 景物在視野正中央不代表看得到：峽谷彎來彎去，轉個彎景物就被山壁擋住，視線卻還對著那個方向，
 * 畫面就是一面牆。距離不到 minDistance 的取樣不算（畫面被一個東西塞滿）
 */
export function measureSubjectVisibility(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
  subject: { x: number; y: number; z: number },
  minDistance: number,
): SubjectVisibility {
  return runStepsSync(measureSubjectVisibilitySteps(worldState, track, startDistance, endDistance, subject, minDistance))
}

/** measureSubjectVisibility 的分段版 */
export function* measureSubjectVisibilitySteps(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
  subject: { x: number; y: number; z: number },
  minDistance: number,
): DriftSteps<SubjectVisibility> {
  const sample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }
  let total = 0
  let visible = 0

  for (let distance = startDistance; distance <= endDistance; distance += PROBE_SPACING) {
    if (total % SAMPLE_YIELD_INTERVAL === SAMPLE_YIELD_INTERVAL - 1)
      yield
    sampleDriftTrack(track, distance, sample)
    total++
    if (Math.hypot(subject.x - sample.x, subject.z - sample.z) < minDistance)
      continue
    if (isSightlineClear3D(worldState, sample.x, sample.y, sample.z, subject.x, subject.y, subject.z))
      visible++
  }

  return { visibleFraction: total === 0 ? 1 : visible / total }
}

/** 站在這裡，各方向（含略仰與略俯）縱深的最大值：小於一定值就是被圍在牆裡，沒有地方可看 */
export function measureMaxDepth(worldState: Uint8Array, x: number, eyeY: number, z: number, pitch = 0): number {
  return runStepsSync(measureMaxDepthSteps(worldState, x, eyeY, z, pitch))
}

/** 每探幾個方向讓出一次（分幀工作的切點：一個方向三束射線，約十微秒） */
const DEPTH_YIELD_INTERVAL = 3

/** measureMaxDepth 的分段版 */
export function* measureMaxDepthSteps(worldState: Uint8Array, x: number, eyeY: number, z: number, pitch = 0): DriftSteps<number> {
  let maxDepth = 0
  for (let index = 0; index < LOOK_RAY_COUNT; index++) {
    if (index % DEPTH_YIELD_INTERVAL === DEPTH_YIELD_INTERVAL - 1)
      yield
    const yaw = (index / LOOK_RAY_COUNT) * Math.PI * 2
    const up = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch - DEPTH_RAY_SPREAD, LOOK_RAY_RANGE)
    const center = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch, LOOK_RAY_RANGE)
    const down = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch + DEPTH_RAY_SPREAD, LOOK_RAY_RANGE)
    maxDepth = Math.max(maxDepth, (up + center * 2 + down) / 4)
  }
  return maxDepth
}

/** 周圍開闊程度：零是在林子裡、洞裡，一是四面八方十二格內都沒東西 */
export function measureOpenness(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
): number {
  return runStepsSync(measureOpennessSteps(worldState, track, startDistance, endDistance))
}

/** measureOpenness 的分段版（一個取樣點八方向十六束射線，每個取樣點讓出一次） */
export function* measureOpennessSteps(
  worldState: Uint8Array,
  track: DriftTrack,
  startDistance: number,
  endDistance: number,
): DriftSteps<number> {
  const sample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }
  let total = 0
  let open = 0

  for (let distance = startDistance; distance <= endDistance; distance += PROBE_SPACING * 2) {
    yield
    sampleDriftTrack(track, distance, sample)
    for (let ray = 0; ray < SURROUND_RAY_COUNT; ray++) {
      total++
      if (isRayOpen(worldState, sample.x, sample.y, sample.z, (ray / SURROUND_RAY_COUNT) * Math.PI * 2))
        open++
    }
  }

  return total === 0 ? 1 : open / total
}

/**
 * 這個方向算不算開闊：水平與往上仰二十度的視線，十二格內都沒東西
 *
 * 只看水平會把山谷誤認成開闊（水平線從谷壁的坡面上方穿過去）；往上仰的那一束碰到谷壁、樹冠、洞頂就被擋住，
 * 平地與天空不會
 */
function isRayOpen(worldState: Uint8Array, x: number, eyeY: number, z: number, yaw: number): boolean {
  return probeViewDistance3D(worldState, x, eyeY, z, yaw, 0, SURROUND_OPEN_DISTANCE) >= SURROUND_OPEN_DISTANCE
    && probeViewDistance3D(worldState, x, eyeY, z, yaw, -UP_RAY_PITCH, SURROUND_OPEN_DISTANCE) >= SURROUND_OPEN_DISTANCE
}

/** 站在這裡四面八方的開闊程度（零是林子裡、洞裡，一是十二格內都沒東西） */
export function measureOpennessAt(worldState: Uint8Array, x: number, eyeY: number, z: number): number {
  let open = 0
  for (let ray = 0; ray < SURROUND_RAY_COUNT; ray++) {
    if (isRayOpen(worldState, x, eyeY, z, (ray / SURROUND_RAY_COUNT) * Math.PI * 2))
      open++
  }
  return open / SURROUND_RAY_COUNT
}

/** 值得看的方向：世界裡的一點（景物、音源、太陽的方向）與多想看它 */
export interface LookInterest {
  x: number;
  z: number;
  /** 景物的高度（世界座標）；有給就用三維視線判斷看不看得到，也能把視線的俯仰對準它 */
  y?: number;
  weight: number;
}

export interface LookYawParam {
  /** 目前的視線：離它越近的方向越好（轉得少） */
  currentYaw: number;
  interestList: LookInterest[];
  /** 正前方至少要有這麼遠的縱深，不然畫面是一面牆 */
  minDepth: number;
  /** 轉角的容忍度（弧度）：越小越偏愛不用轉太多的方向 */
  turnScale?: number;
  /** 構圖的視線俯仰（弧度，正值往下看）：探縱深時用這個角度看出去 */
  pitch?: number;
  /** 偏好的方向：往外（離開中心）或往內；yaw 是偏好的方向，strength 零到一，越大越不選背向的方向 */
  bias?: LookBias;
}

export interface LookBias {
  yaw: number;
  strength: number;
}

/** 一個方向符合偏好的程度（零到一）：正對偏好方向是一，九十度以外是零 */
export function getBiasFactor(bias: LookBias | undefined, yaw: number): number {
  if (!bias)
    return 1
  return 1 - bias.strength + bias.strength * Math.max(0, Math.cos(diffAngle(yaw, bias.yaw)))
}

/**
 * 挑一個「看起來有東西」的方向
 *
 * 兩種方向可以選：
 * 1. 朝向一個看得到的景物（特色主體為主）：三維視線沒被擋住就行，不管它離得多近；
 * 2. 沒有景物時，朝向「縱深最長的方向」。縱深用三維的三束射線（略仰、水平、略俯）平均，
 *    斜坡與懸崖也量得到；而且門檻是相對的：至少要有附近最長視線的四成，不是固定幾格，
 *    不然峽谷裡二三十格外的山壁也算「很開闊」。
 * 縱深夠的方向之間，離目前視線近的稍微優先（少轉），但不會為了少轉而選一面牆。
 * 一個方向都不合格就回 null，呼叫端改看下一段路的方向
 */
export function chooseLookYaw(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  param: LookYawParam,
): { yaw: number; depth: number; interest: LookInterest | null } | null {
  return runStepsSync(chooseLookYawSteps(worldState, x, eyeY, z, param))
}

/** chooseLookYaw 的分段版：探縱深的方向與景物的視線檢查之間都可以讓出一幀；結果與一口氣跑完的版本相同 */
export function* chooseLookYawSteps(
  worldState: Uint8Array,
  x: number,
  eyeY: number,
  z: number,
  param: LookYawParam,
): DriftSteps<{ yaw: number; depth: number; interest: LookInterest | null } | null> {
  const turnScale = param.turnScale ?? 1.6
  const pitch = param.pitch ?? 0

  /** 一個方向的縱深：略仰、水平（權重二）、略俯三束的平均 */
  function measureDepth(yaw: number): number {
    const up = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch - DEPTH_RAY_SPREAD, LOOK_RAY_RANGE)
    const center = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch, LOOK_RAY_RANGE)
    const down = probeViewDistance3D(worldState, x, eyeY, z, yaw, pitch + DEPTH_RAY_SPREAD, LOOK_RAY_RANGE)
    /** 正前方很近就有東西（樹幹、岩柱）時，上下兩束射線越過它也不算開闊：平均再受正前方距離的一點八倍限制 */
    return Math.min((up + center * 2 + down) / 4, center * CENTER_DEPTH_FACTOR)
  }

  const candidateList: { yaw: number; depth: number; interest: LookInterest | null }[] = []
  let maxDepth = 0
  for (let index = 0; index < LOOK_RAY_COUNT; index++) {
    if (index % DEPTH_YIELD_INTERVAL === DEPTH_YIELD_INTERVAL - 1)
      yield
    const yaw = (index / LOOK_RAY_COUNT) * Math.PI * 2
    const depth = measureDepth(yaw)
    maxDepth = Math.max(maxDepth, depth)
    candidateList.push({ yaw, depth, interest: null })
  }
  /** 維持目前的方向也是候選：現在看的地方夠深就不必轉，鏡頭盡量少轉 */
  const currentDepth = measureDepth(param.currentYaw)
  maxDepth = Math.max(maxDepth, currentDepth)
  candidateList.push({ yaw: param.currentYaw, depth: currentDepth, interest: null })

  /** 景物的方向直接當候選（不靠離散方向湊），視線沒被擋住才算 */
  for (const interest of param.interestList) {
    if (interest.weight < INTEREST_WEIGHT_MIN)
      continue
    yield
    if (Math.hypot(interest.x - x, interest.z - z) < INTEREST_DISTANCE_MIN)
      continue

    const visible = interest.y === undefined
      ? isSightlineClear(worldState, x, eyeY, z, interest.x, interest.z)
      : isSightlineClear3D(worldState, x, eyeY, z, interest.x, interest.y, interest.z)
    if (!visible)
      continue

    /**
     * 看得到景物（有一條視線通）還不夠：畫面正中央那一束（呼叫端實際會用的俯仰：對準景物佔八成、構圖俯仰佔兩成）
     * 近處不能塞著樹幹或牆，否則鏡頭對著景物的方向，畫面卻是一面貼臉的東西
     */
    const interestDistance = Math.hypot(interest.x - x, interest.z - z)
    const interestYaw = Math.atan2(interest.x - x, interest.z - z)
    const aimPitch = interest.y === undefined ? pitch : Math.atan2(eyeY - interest.y, Math.max(1, interestDistance)) * 0.8 + pitch * 0.2
    const depthNeed = Math.min(param.minDepth, interestDistance * INTEREST_CENTER_DEPTH_RATIO)
    if (probeViewDistance3D(worldState, x, eyeY, z, interestYaw, aimPitch, depthNeed + 0.5) >= depthNeed)
      candidateList.push({ yaw: interestYaw, depth: maxDepth, interest })
  }

  const depthMin = Math.max(param.minDepth, maxDepth * RELATIVE_DEPTH_MIN)
  let best: { yaw: number; depth: number; interest: LookInterest | null } | null = null
  let bestScore = 0
  for (const candidate of candidateList) {
    if (!candidate.interest && candidate.depth < depthMin)
      continue

    const turn = Math.abs(diffAngle(candidate.yaw, param.currentYaw))
    const base = candidate.interest ? candidate.interest.weight * 2 + 0.3 : (candidate.depth / Math.max(1, maxDepth)) ** 2
    const score = base * (0.35 + 0.65 * Math.exp(-((turn / turnScale) ** 2))) * getBiasFactor(param.bias, candidate.yaw) * (0.95 + Math.random() * 0.1)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}
