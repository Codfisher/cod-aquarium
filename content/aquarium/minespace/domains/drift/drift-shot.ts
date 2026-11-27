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
 * - truck：側移，視線與前進方向差七十到一百一十度
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

/** 側移的視線偏角範圍（弧度），約七十到一百一十度 */
export const TRUCK_ANGLE_RANGE: readonly [number, number] = [1.22, 1.92]
/** 看向景物時，景物偏離畫面中央的角度（弧度）：三分法的位置，不要正中央 */
export const THIRDS_OFFSET = 0.13
/** 升降：鏡頭升高多少格（範圍）、升降各花多久（秒） */
export const CRANE_HEIGHT_RANGE: readonly [number, number] = [2.5, 5]
export const CRANE_MOVE_SECOND = 9
/** 橫搖的速度範圍（弧度／秒），日出日落時用較慢的那一端 */
export const PAN_RATE_RANGE: readonly [number, number] = [0.04, 0.085]
/** 繞景物走的弧：弧長範圍（格）、走的速度（格／秒）、離景物的距離範圍（格） */
export const ORBIT_ARC_RANGE: readonly [number, number] = [8, 22]
export const ORBIT_SPEED = 0.9
export const ORBIT_RADIUS_RANGE: readonly [number, number] = [5, 30]

/** 每個階段視線的轉動上限：最大角速度與最大角加速度（弧度／秒、弧度／秒平方） */
export interface GazeLimit {
  yawSpeed: number;
  yawAcceleration: number;
  pitchSpeed: number;
  pitchAcceleration: number;
}

export const GAZE_LIMIT_MAP: Record<ShotPhase, GazeLimit> = {
  walk: { yawSpeed: 0.55, yawAcceleration: 0.7, pitchSpeed: 0.3, pitchAcceleration: 0.45 },
  fly: { yawSpeed: 0.42, yawAcceleration: 0.55, pitchSpeed: 0.25, pitchAcceleration: 0.4 },
  linger: { yawSpeed: 0.4, yawAcceleration: 0.5, pitchSpeed: 0.22, pitchAcceleration: 0.35 },
}

/** 微微的呼吸起伏：只有幾分之一度，看不出在晃，但畫面不會死板得像相片（零就是關掉） */
export const SWAY_PITCH = 0.004
export const SWAY_YAW = 0.003
export const SWAY_HEIGHT = 0.012

/** 視線俯仰的上下限（弧度，正值往下看） */
const GAZE_PITCH_MIN = -0.5
const GAZE_PITCH_MAX = 0.6
/** 看向的景物離鏡頭水平距離小於這個（格）就改用備案朝向，免得貼著景物時方位亂跳 */
const SUBJECT_NEAR_DISTANCE = 3

/**
 * 視線怎麼擺
 *
 * - heading：看軌道的前進方向（含軌道給的俯仰）
 * - relative：維持相對前進方向的固定偏角（側移）
 * - subject：看向世界裡一點；behind 為真時，貼近景物的備案朝向是背向前進方向（拉遠揭露）
 * - pan：從 baseYaw 起以固定速度橫搖
 * - free：隨意環顧，目標由呼叫端更新
 */
export type Gaze =
  | { kind: 'heading' }
  | { kind: 'relative'; offset: number; pitch: number }
  | { kind: 'subject'; x: number; y: number; z: number; thirds: number; behind: boolean }
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
}

/** 依視線設定與當下位置，算出這一刻想看的方向 */
export function resolveGaze(gaze: Gaze, context: GazeContext): { yaw: number; pitch: number } {
  switch (gaze.kind) {
    case 'heading':
      return { yaw: context.pathYaw, pitch: clampPitch(context.pathPitch) }
    case 'relative':
      return { yaw: context.pathYaw + gaze.offset, pitch: clampPitch(gaze.pitch) }
    case 'subject': {
      const dx = gaze.x - context.x
      const dz = gaze.z - context.z
      const distance = Math.hypot(dx, dz)
      if (distance < SUBJECT_NEAR_DISTANCE) {
        return { yaw: context.pathYaw + (gaze.behind ? Math.PI : 0), pitch: clampPitch(context.pathPitch) }
      }

      return {
        yaw: Math.atan2(dx, dz) + gaze.thirds,
        pitch: clampPitch(Math.atan2(context.eyeY - gaze.y, distance)),
      }
    }
    case 'pan':
      return { yaw: gaze.baseYaw + gaze.rate * context.elapsed, pitch: clampPitch(gaze.pitch) }
    case 'free':
      return { yaw: context.freeYaw, pitch: clampPitch(context.freePitch) }
  }
}

function clampPitch(pitch: number): number {
  return Math.min(GAZE_PITCH_MAX, Math.max(GAZE_PITCH_MIN, pitch))
}

/** 一個角度軸的追隨狀態 */
export interface AngleFollower {
  value: number;
  velocity: number;
}

/**
 * 視線追著目標轉，角速度與角加速度都有上限
 *
 * 想要的角速度取三者最小：速度上限、「剛好來得及煞住」的速度（v = √(2ad)，所以不會衝過頭）、
 * 與剩餘角度成正比（接近目標時收斂得乾淨）。實際角速度再以加速度上限逼近它：
 * 目標突然跳到另一邊時，鏡頭是慢慢起轉、慢慢停下，不會彈過去
 */
export function followAngle(
  follower: AngleFollower,
  target: number,
  deltaTime: number,
  speedLimit: number,
  accelerationLimit: number,
): void {
  const remaining = diffAngle(target, follower.value)
  const desiredSpeed = Math.min(speedLimit, Math.sqrt(2 * accelerationLimit * Math.abs(remaining)) * 0.9, Math.abs(remaining) * 2.5)
  const desired = Math.sign(remaining) * desiredSpeed
  const maxChange = accelerationLimit * deltaTime
  follower.velocity += Math.min(maxChange, Math.max(-maxChange, desired - follower.velocity))
  follower.value += follower.velocity * deltaTime
}

/** 依權重抽一個鏡位；canUse 讓呼叫端排除此刻做不到的（例如沒有露天、找不到景物） */
export function pickShot(phase: ShotPhase, canUse: (id: ShotId) => boolean): ShotDefinition {
  const candidateList = SHOT_TABLE.filter((shot) => shot.phaseList.includes(phase) && canUse(shot.id))
  const total = candidateList.reduce((sum, shot) => sum + shot.weight, 0)
  let pick = Math.random() * total
  for (const shot of candidateList) {
    pick -= shot.weight
    if (pick <= 0)
      return shot
  }
  return candidateList[candidateList.length - 1] ?? SHOT_TABLE[0] as ShotDefinition
}
