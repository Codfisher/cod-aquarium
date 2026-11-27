import { diffAngle } from './drift-track'

/**
 * 神遊的運鏡
 *
 * 鏡頭的「位置」沿著預先算好的軌道走（見 drift-track），「看哪裡」另外決定：
 * 每一段散步、飛行或停留各抽一種鏡位（shot），鏡位決定視線怎麼擺——
 * 看前進方向、看向目的地、側著看（側移）、回頭看（拉遠揭露）、看向一個固定的景物（視差）、
 * 緩慢橫搖、繞著景物走半圈、升降。位置永遠在驗證過的格子與空域上，視線隨便轉也不會穿牆。
 *
 * 鏡位是一張資料表（SHOT_TABLE），加權抽籤，要調整頻率或幅度改這張表就好
 */

export type ShotId = 'follow' | 'dollyIn' | 'truck' | 'pullBack' | 'parallax' | 'orbit' | 'crane' | 'pan' | 'hold'
export type ShotPhase = 'walk' | 'fly' | 'linger'

export interface ShotDefinition {
  id: ShotId;
  /** 在哪些階段會被抽到 */
  phaseList: ShotPhase[];
  weight: number;
}

/**
 * 鏡位表
 *
 * - follow：看前進方向，最平常的一種，權重最高，免得每一段都在變花樣
 * - dollyIn：邊走邊看向目的地，越走越近
 * - truck：側移，視線與前進方向差六十到九十度（略朝前，畫面前方留著去路）
 * - pullBack：邊走邊回頭看來處，風景在背後慢慢展開（拉遠揭露）
 * - parallax：看向側面一個固定的景物，沿路的樹與石柱從前景掠過（視差）
 * - orbit：停留時繞著一個景物走一段弧，景物維持在畫面裡
 * - crane：停留時鏡頭緩緩升高幾格再降回來，同時橫搖
 * - pan：停留時視線緩慢掃過一片景色（日出日落時對著太陽那一側）
 * - hold：幾乎不動，隨意環顧
 */
export const SHOT_TABLE: ShotDefinition[] = [
  { id: 'follow', phaseList: ['walk', 'fly'], weight: 3 },
  { id: 'dollyIn', phaseList: ['walk', 'fly'], weight: 2 },
  { id: 'truck', phaseList: ['walk', 'fly'], weight: 2 },
  { id: 'pullBack', phaseList: ['walk', 'fly'], weight: 1.5 },
  { id: 'parallax', phaseList: ['walk'], weight: 1.5 },
  { id: 'orbit', phaseList: ['linger'], weight: 2 },
  { id: 'crane', phaseList: ['linger'], weight: 1.5 },
  { id: 'pan', phaseList: ['linger'], weight: 3 },
  { id: 'hold', phaseList: ['linger'], weight: 2 },
]

/**
 * 側移的視線偏角範圍（弧度），約六十到九十度
 *
 * 只往前半面偏，不偏到身後：視線略朝前進方向，畫面前方留著「去路」（引導空間），
 * 側面流過的景物也比朝後看時不容易讓人覺得在倒退
 */
export const TRUCK_ANGLE_RANGE: readonly [number, number] = [1.05, 1.6]
/** 看向景物時，景物偏離畫面中央的角度（弧度）：三分法的位置，不要正中央 */
/** 側移時鎖定的世界方向再慢慢漂的速度範圍（弧度／秒）：每秒一到二度，幾乎看不出在轉 */
export const TRUCK_DRIFT_RANGE: readonly [number, number] = [0.015, 0.035]
export const THIRDS_OFFSET = 0.13
/** 升降：鏡頭升高多少格（範圍）、升降各花多久（秒）、升到頂停多久（秒範圍） */
export const CRANE_HEIGHT_RANGE: readonly [number, number] = [2.5, 4]
export const CRANE_MOVE_SECOND = 8
export const CRANE_PEAK_HOLD_RANGE: readonly [number, number] = [2, 5]
/** 橫搖的速度範圍（弧度／秒），日出日落時用較慢的那一端 */
export const PAN_RATE_RANGE: readonly [number, number] = [0.012, 0.03]
/** 一段橫搖最多掃過多少弧度（約五十七度）與持續多久（秒範圍）；掃完就是一段定格 */
export const PAN_SWEEP_MAX = 0.4
export const PAN_BEAT_RANGE: readonly [number, number] = [8, 20]
/** 定格（hold）一段多久（秒範圍） */
export const HOLD_BEAT_RANGE: readonly [number, number] = [8, 16]
/** 停留結束前多久，視線先轉向下一段路的方向（秒）：起步時畫面已經朝著要走的方向 */
export const ANTICIPATE_SECOND = 6
/** 繞景物走的弧：掃過的角度範圍（弧度）、弧長上限（格）、走的速度（格／秒）、離景物的距離範圍（格） */
export const ORBIT_SWEEP_RANGE: readonly [number, number] = [0.5, 1.3]
export const ORBIT_ARC_MAX = 22
export const ORBIT_SPEED = 0.7
export const ORBIT_RADIUS_RANGE: readonly [number, number] = [8, 30]
/** 一段移動鏡位希望持續多久（秒範圍）：縮時攝影是長長的、穩定的一個運動；軌道太長才切成幾段 */
export const TRACK_SHOT_SECOND_RANGE: readonly [number, number] = [20, 60]
/** 看向目的地時，離目的地這個距離（格，遠、近）之間視線慢慢放開、轉回前進方向 */
export const DOLLY_RELEASE_RANGE: readonly [number, number] = [14, 5]

/** 每個階段視線的轉動上限：最大角速度與最大角加速度（弧度／秒、弧度／秒平方） */
export interface GazeLimit {
  yawSpeed: number;
  yawAcceleration: number;
  pitchSpeed: number;
  pitchAcceleration: number;
}

/**
 * 視線轉動的上限
 *
 * 節奏是風景縮時攝影：畫面的轉動是「幾乎沒有」——鎖定構圖平移，或每秒一兩度的慢搖。
 * 這裡的上限只管「不得不轉」的時候（換鏡位、轉向下一段路、跟著彎道走）：典型每秒三到六度，最快約七度，
 * 比人慢慢轉頭還輕很多；角加速度更小，起轉與停轉各要花好幾秒。停留開頭要從上一段的方向轉到「有東西看」的方向，上限放寬到約十一度／秒，轉得太慢會整段停留都在掃過山壁
 */
export const GAZE_LIMIT_MAP: Record<ShotPhase, GazeLimit> = {
  walk: { yawSpeed: 0.1, yawAcceleration: 0.04, pitchSpeed: 0.05, pitchAcceleration: 0.025 },
  fly: { yawSpeed: 0.08, yawAcceleration: 0.035, pitchSpeed: 0.04, pitchAcceleration: 0.02 },
  linger: { yawSpeed: 0.2, yawAcceleration: 0.07, pitchSpeed: 0.08, pitchAcceleration: 0.04 },
}
/** 加加速度（jerk）上限是加速度上限的幾倍每秒：起轉與煞住要花約一秒把加速度漸漸帶起來，不是瞬間 */
const GAZE_JERK_RATIO = 1.2

/** 視線俯仰的上下限（弧度，正值往下看） */
const GAZE_PITCH_MIN = -0.5
const GAZE_PITCH_MAX = 0.6
/** 看向的景物離鏡頭水平距離小於這個（格）就改用備案朝向，免得貼著景物時方位亂跳 */
const SUBJECT_NEAR_DISTANCE = 6

/**
 * 視線怎麼擺
 *
 * - heading：看軌道的前進方向；俯仰是軌道給的（上坡微微仰、下坡微微低），pitch 是額外加上去的構圖偏移（走路時讓地平線落在三分線）；minPitch 是下限（往外看的場景不抬頭看迎面的坡）
 * - subject：看向世界裡一點；behind 為真時，貼近景物的備案朝向是背向前進方向（拉遠揭露）
 * - pan：從 baseYaw 起以固定速度橫搖（速度可以是零：鎖定在世界裡的一個方向，鏡頭平移時畫面構圖不變）
 * - free：隨意環顧，目標由呼叫端更新
 */
export type Gaze =
  | { kind: 'heading'; pitch?: number; minPitch?: number }
  | { kind: 'subject'; x: number; y: number; z: number; thirds: number; behind: boolean; releaseRange?: readonly [number, number] }
  | { kind: 'pan'; baseYaw: number; rate: number; pitch: number }
  | { kind: 'free' }

export interface GazeContext {
  x: number;
  eyeY: number;
  z: number;
  /** 軌道在這一點的前進方向與俯仰 */
  pathYaw: number;
  pathPitch: number;
  /** 這個鏡位已經過了多久（秒） */
  elapsed: number;
  /** 隨意環顧的目標 */
  freeYaw: number;
  freePitch: number;
  /** 視線俯仰的範圍（弧度，正值往下看）；沒給就用全域上下限 */
  pitchMin?: number;
  pitchMax?: number;
}

/** 依視線設定與當下位置，算出這一刻想看的方向 */
export function resolveGaze(gaze: Gaze, context: GazeContext): { yaw: number; pitch: number } {
  switch (gaze.kind) {
    case 'heading':
      return { yaw: context.pathYaw, pitch: clampPitch(Math.max(gaze.minPitch ?? Number.NEGATIVE_INFINITY, context.pathPitch + (gaze.pitch ?? 0)), context) }
    case 'subject': {
      const dx = gaze.x - context.x
      const dz = gaze.z - context.z
      const distance = Math.hypot(dx, dz)
      if (distance < SUBJECT_NEAR_DISTANCE) {
        return { yaw: context.pathYaw + (gaze.behind ? Math.PI : 0), pitch: clampPitch(context.pathPitch, context) }
      }

      const subjectYaw = Math.atan2(dx, dz) + gaze.thirds
      const subjectPitch = clampPitch(Math.atan2(context.eyeY - gaze.y, distance), context)
      if (!gaze.releaseRange)
        return { yaw: subjectYaw, pitch: subjectPitch }

      /** 走近目的地時視線慢慢放開、轉回前進方向：最後一段貼著目的地繞過去時，不必追著它快速橫掃 */
      const [far, near] = gaze.releaseRange
      const release = smoothRatio((far - distance) / (far - near))
      return {
        yaw: subjectYaw + diffAngle(context.pathYaw, subjectYaw) * release,
        pitch: subjectPitch + (clampPitch(context.pathPitch, context) - subjectPitch) * release,
      }
    }
    case 'pan':
      return { yaw: gaze.baseYaw + gaze.rate * context.elapsed, pitch: clampPitch(gaze.pitch, context) }
    case 'free':
      return { yaw: context.freeYaw, pitch: clampPitch(context.freePitch, context) }
  }
}

function clampPitch(pitch: number, context: GazeContext): number {
  return Math.min(context.pitchMax ?? GAZE_PITCH_MAX, Math.max(context.pitchMin ?? GAZE_PITCH_MIN, pitch))
}

/** 一個角度軸的追隨狀態；acceleration 是三階（加加速度受限）追隨用的，沒給就當零 */
export interface AngleFollower {
  value: number;
  velocity: number;
  acceleration?: number;
}

/** 平滑的 S 曲線，輸入夾在零到一 */
export function smoothRatio(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  return clamped * clamped * (3 - 2 * clamped)
}

/** 平滑的最小值：兩個數字交會處是圓角，不是折角（折角會讓加速度瞬間跳一階） */
export function softMin(left: number, right: number, width: number): number {
  const low = Math.min(left, right)
  return low - width * Math.log(Math.exp(-(left - low) / width) + Math.exp(-(right - low) / width))
}

/**
 * 視線追著目標轉：三階追隨，角速度、角加速度、加加速度都有上限
 *
 * 想要的角速度取三者最小：速度上限、「剛好來得及煞住」的速度（√(2ad)，不會衝過頭）、
 * 與剩餘角度成正比（接近目標時收斂得乾淨）。實際角加速度逼近「想要的角速度」，
 * 而加速度本身再受加加速度上限約束：目標突然換到另一邊時，轉速是 S 形漸漸起來、漸漸收掉，
 * 起轉與煞住的那一刻沒有瞬間跳動的加速度（只有速度上限、沒有加速度斜坡的話，起轉會像被推一把）。
 * 所有量都乘 deltaTime，所以不管幀率多少，畫面上的軌跡一樣
 */
export function followAngle(
  follower: AngleFollower,
  target: number,
  deltaTime: number,
  speedLimit: number,
  accelerationLimit: number,
): void {
  const remaining = diffAngle(target, follower.value)
  const desiredSpeed = Math.min(speedLimit, Math.sqrt(2 * accelerationLimit * Math.abs(remaining)) * 0.6, Math.abs(remaining) * 1.2)
  const desired = Math.sign(remaining) * desiredSpeed
  const wanted = Math.min(accelerationLimit, Math.max(-accelerationLimit, (desired - follower.velocity) * 1.6))
  const jerkStep = accelerationLimit * GAZE_JERK_RATIO * deltaTime
  const acceleration = follower.acceleration ?? 0
  follower.acceleration = acceleration + Math.min(jerkStep, Math.max(-jerkStep, wanted - acceleration))
  follower.velocity += follower.acceleration * deltaTime
  follower.value += follower.velocity * deltaTime
}

/** 沿軌道前進的速度狀態 */
export interface SpeedFollower {
  value: number;
  acceleration: number;
}

export interface SpeedLimit {
  /** 加速與減速的上限（格／秒平方） */
  acceleration: number;
  deceleration: number;
  /** 加加速度上限（格／秒立方） */
  jerk: number;
}

/**
 * 速度追著目標速度走，加速度與加速度的變化率都有上限（S 形的加減速）
 *
 * 想要的加速度跟剩餘的速度差的平方根成正比（√(2·jerk·差)）：差越小加速度越早收，
 * 到達目標速度的那一刻加速度剛好是零，不衝過頭
 */
export function followSpeed(follower: SpeedFollower, goal: number, deltaTime: number, limit: SpeedLimit): void {
  const difference = goal - follower.value
  const cap = difference >= 0 ? limit.acceleration : limit.deceleration
  const wanted = Math.sign(difference) * Math.min(cap, Math.sqrt(2 * limit.jerk * Math.abs(difference)) * 0.85)
  const jerkStep = limit.jerk * deltaTime
  follower.acceleration += Math.min(jerkStep, Math.max(-jerkStep, wanted - follower.acceleration))
  follower.value = Math.max(0, follower.value + follower.acceleration * deltaTime)
}

/** 依權重抽一個鏡位；canUse 讓呼叫端排除此刻做不到的（例如沒有露天、找不到景物），weigh 依情境調整權重 */
export function pickShot(
  phase: ShotPhase,
  canUse: (id: ShotId) => boolean,
  weigh: (id: ShotId) => number = () => 1,
): ShotDefinition {
  const candidateList = SHOT_TABLE.filter((shot) => shot.phaseList.includes(phase) && canUse(shot.id))
  const weightList = candidateList.map((shot) => shot.weight * Math.max(0, weigh(shot.id)))
  const total = weightList.reduce((sum, weight) => sum + weight, 0)
  let pick = Math.random() * total
  for (const [index, shot] of candidateList.entries()) {
    pick -= weightList[index] ?? 0
    if (pick <= 0 && (weightList[index] ?? 0) > 0)
      return shot
  }
  return candidateList.find((shot) => shot.id === 'follow') ?? candidateList[candidateList.length - 1] ?? SHOT_TABLE[0] as ShotDefinition
}
