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

export type ShotId = 'follow' | 'dollyIn' | 'truck' | 'pullBack' | 'parallax' | 'lead' | 'arc' | 'orbit' | 'crane' | 'tilt' | 'pan' | 'hold'
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
 * - lead：沿著線狀的主體（溪、岸、木棧）走時，視線落在它前方十幾格的地方，順著它一路望過去
 * - arc：無人機繞著一個地標飛大半圈，視線鎖在地標上（只有繞飛的那一趟才有，見 use-drift 的 planFlight）
 * - orbit：停留時繞著一個景物走一段弧，景物維持在畫面裡
 * - crane：停留時鏡頭緩緩升高幾格再降回來，同時橫搖
 * - tilt：停留時視線從主體的底部慢慢搖到頂部（瀑布、老樹、高塔）
 * - pan：停留時視線緩慢掃過一片景色（日出日落時對著太陽那一側）
 * - hold：幾乎不動，隨意環顧
 */
export const SHOT_TABLE: ShotDefinition[] = [
  { id: 'follow', phaseList: ['walk', 'fly'], weight: 3 },
  { id: 'dollyIn', phaseList: ['walk', 'fly'], weight: 2 },
  { id: 'truck', phaseList: ['walk', 'fly'], weight: 2 },
  { id: 'pullBack', phaseList: ['walk', 'fly'], weight: 1.5 },
  { id: 'parallax', phaseList: ['walk'], weight: 1.5 },
  { id: 'lead', phaseList: ['walk'], weight: 2 },
  { id: 'arc', phaseList: ['fly'], weight: 3 },
  { id: 'orbit', phaseList: ['linger'], weight: 2 },
  { id: 'crane', phaseList: ['linger'], weight: 1.5 },
  { id: 'tilt', phaseList: ['linger'], weight: 2 },
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

/**
 * 仰搖（tilt）：視線從主體的底部搖到頂部
 *
 * 俯仰的範圍比平常寬（平常走路只在負十到正十二度之間）：看瀑布頂與樹冠要抬頭，最多仰二十二度、俯二十度；
 * 搖的速度每秒不到兩度（弧度／秒），至少搖這麼久（秒），開始前先停一下（秒）讓視線對到底部；
 * 頂與底的俯仰差不到 TILT_SPAN_MIN 就不值得搖
 */
export const VISIT_PITCH_RANGE: readonly [number, number] = [-0.38, 0.35]
export const TILT_RATE = 0.03
export const TILT_SECOND_MIN = 8
export const TILT_START_DELAY = 3
export const TILT_SPAN_MIN = 0.12
/** 仰搖時主體上下各取多少比例的高度當頂與底（零點五就是整個主體） */
export const TILT_EXTENT_RATIO = 0.45
/**
 * 沿線跟拍（lead）：視線落在線狀主體前方幾格的地方；鏡頭離那條線多近才算「沿著它走」（格）；
 * 走近線的盡頭時視線在這個距離範圍（遠、近）之間放開、轉回前進方向
 */
export const LEAD_DISTANCE = 14
export const LEAD_ALONG_DISTANCE_MAX = 16
export const LEAD_RELEASE_RANGE: readonly [number, number] = [10, 5]
/**
 * 視野呼吸（推近）
 *
 * 定格細看時視野極慢地收窄，像鏡頭慢慢推近；只在鏡頭不走的時候做，不會有「邊走邊變焦」的滑動變焦感。
 * 比例一是使用者設定的視野，收窄最多一成二（六十度到五十三度）；
 * 推近每秒最多百分之一點二、放開每秒最多百分之三，變化率自己也有上限（S 形，起停沒有頓點）
 */
export const ZOOM_DEPTH_MAX = 0.12
export const ZOOM_IN_RATE = 0.012
export const ZOOM_OUT_RATE = 0.03
export const ZOOM_ACCELERATION = 0.012
/** 離開神遊時視野還收著，用這麼久（秒）放回使用者的設定 */
export const ZOOM_RESTORE_SECOND = 0.8

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
/** radial 視線：離中心這麼近（格）就不定義方向 */
export const RADIAL_CENTER_RADIUS_MIN = 6

/**
 * 視線怎麼擺
 *
 * - heading：看軌道的前進方向；俯仰是軌道給的（上坡微微仰、下坡微微低），pitch 是額外加上去的構圖偏移（走路時讓地平線落在三分線）；minPitch 是下限（往外看的場景不抬頭看迎面的坡）
 * - subject：看向世界裡一點；behind 為真時，貼近景物的備案朝向是背向前進方向（拉遠揭露）
 * - pan：從 baseYaw 起以固定速度橫搖（速度可以是零：鎖定在世界裡的一個方向，鏡頭平移時畫面構圖不變）
 * - radial：看「離開中心」（outward）或「看向中心」的方向，隨鏡頭所在的位置即時算：繞著場景外緣走時，視線一路朝外，不是鎖死在某個世界方向
 * - free：隨意環顧，目標由呼叫端更新
 * - tilt：鎖定一個方位，俯仰在 second 秒內從 fromPitch 平滑搖到 toPitch（先等 delay 秒）
 * - path：沿著一條折線（線狀主體）看向前方 lead 格的地方，隨鏡頭前進，看的那一點也沿著線往前滑
 *
 * heading 的 lookRoom 是留白（look room）：視線在前進方向之外多偏幾度，朝向比較開闊或有特色主體的那一側；
 * 偏角是沿軌道每隔 step 格一個的清單（已經低通過，變化很慢），依走到哪裡內插
 */
export interface LookRoom {
  startDistance: number;
  step: number;
  offsetList: number[];
}

export type Gaze =
  | { kind: 'heading'; pitch?: number; minPitch?: number; lookRoom?: LookRoom }
  | { kind: 'radial'; centerX: number; centerZ: number; isOutward: boolean; pitch: number }
  | { kind: 'subject'; x: number; y: number; z: number; thirds: number; behind: boolean; releaseRange?: readonly [number, number] }
  | { kind: 'pan'; baseYaw: number; rate: number; pitch: number }
  | { kind: 'free' }
  | { kind: 'tilt'; yaw: number; fromPitch: number; toPitch: number; delay: number; second: number }
  | PathGaze

/** 沿線跟拍的視線設定；arcList 是每個點沿線累計的距離，cursor 記著上一幀鏡頭最靠近哪一段（每幀只往前後找幾段） */
export interface PathGaze {
  kind: 'path';
  pointList: readonly { x: number; y: number; z: number }[];
  arcList: number[];
  /** 沿著點列的順向（一）或逆向（負一）看 */
  sign: 1 | -1;
  lead: number;
  cursor: number;
}

/** 由線狀主體的點列建立沿線跟拍的視線；cursor 是鏡頭一開始最靠近的那一段 */
export function createPathGaze(pointList: readonly { x: number; y: number; z: number }[], sign: 1 | -1, cursor: number): PathGaze {
  const arcList: number[] = [0]
  for (let index = 1; index < pointList.length; index++) {
    const before = pointList[index - 1] as { x: number; z: number }
    const point = pointList[index] as { x: number; z: number }
    arcList.push((arcList[index - 1] ?? 0) + Math.hypot(point.x - before.x, point.z - before.z))
  }
  return { kind: 'path', pointList, arcList, sign, lead: LEAD_DISTANCE, cursor }
}

/** 沿線跟拍此刻看的那一點（寫進共用的暫存，呼叫端馬上用掉） */
const leadPoint = { x: 0, y: 0, z: 0 }
/** 每幀只在上一幀那一段的前後各找幾段 */
const PATH_CURSOR_REACH = 2

/** 鏡頭在 (x, z) 時沿線跟拍要看的那一點，寫進 leadPoint；同時更新 cursor */
export function locateLeadPoint(gaze: PathGaze, x: number, z: number): { x: number; y: number; z: number } {
  const { pointList, arcList } = gaze
  const segmentCount = pointList.length - 1
  let bestIndex = Math.min(Math.max(0, gaze.cursor), segmentCount - 1)
  let bestRatio = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = Math.max(0, gaze.cursor - PATH_CURSOR_REACH); index <= Math.min(segmentCount - 1, gaze.cursor + PATH_CURSOR_REACH); index++) {
    const from = pointList[index] as { x: number; z: number }
    const to = pointList[index + 1] as { x: number; z: number }
    const spanX = to.x - from.x
    const spanZ = to.z - from.z
    const lengthSquared = spanX * spanX + spanZ * spanZ
    const ratio = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - from.x) * spanX + (z - from.z) * spanZ) / lengthSquared)) : 0
    const distance = Math.hypot(from.x + spanX * ratio - x, from.z + spanZ * ratio - z)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
      bestRatio = ratio
    }
  }
  gaze.cursor = bestIndex

  /** 鏡頭投影在線上的位置（沿線距離）往前 lead 格，夾在線的兩端之間 */
  const total = arcList[segmentCount] ?? 0
  const here = (arcList[bestIndex] ?? 0) + ((arcList[bestIndex + 1] ?? 0) - (arcList[bestIndex] ?? 0)) * bestRatio
  const aim = Math.min(total, Math.max(0, here + gaze.sign * gaze.lead))
  let index = bestIndex
  while (index < segmentCount - 1 && (arcList[index + 1] ?? 0) < aim)
    index++
  while (index > 0 && (arcList[index] ?? 0) > aim)
    index--
  const from = pointList[index] as { x: number; y: number; z: number }
  const to = pointList[index + 1] as { x: number; y: number; z: number }
  const span = (arcList[index + 1] ?? 0) - (arcList[index] ?? 0)
  const ratio = span > 0 ? Math.min(1, Math.max(0, (aim - (arcList[index] ?? 0)) / span)) : 0
  leadPoint.x = from.x + (to.x - from.x) * ratio
  leadPoint.y = from.y + (to.y - from.y) * ratio
  leadPoint.z = from.z + (to.z - from.z) * ratio
  return leadPoint
}

export interface GazeContext {
  x: number;
  eyeY: number;
  z: number;
  /** 軌道在這一點的前進方向與俯仰 */
  pathYaw: number;
  pathPitch: number;
  /** 這個鏡位已經過了多久（秒） */
  elapsed: number;
  /** 沿軌道已經走了多遠（格），查留白的偏角清單用 */
  trackDistance: number;
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
      return { yaw: context.pathYaw + getLookRoomOffset(gaze.lookRoom, context.trackDistance), pitch: clampPitch(Math.max(gaze.minPitch ?? Number.NEGATIVE_INFINITY, context.pathPitch + (gaze.pitch ?? 0)), context) }
    case 'radial': {
      const dx = context.x - gaze.centerX
      const dz = context.z - gaze.centerZ
      /** 站在中心附近方向不定義（一步之差就差一百八十度），沿用前進方向 */
      if (Math.hypot(dx, dz) < RADIAL_CENTER_RADIUS_MIN)
        return { yaw: context.pathYaw, pitch: clampPitch(context.pathPitch + gaze.pitch, context) }
      return { yaw: Math.atan2(dx, dz) + (gaze.isOutward ? 0 : Math.PI), pitch: clampPitch(gaze.pitch, context) }
    }
    case 'subject':
      return aimAtPoint(gaze.x, gaze.y, gaze.z, gaze.thirds, gaze.behind, gaze.releaseRange, context)
    case 'path': {
      const point = locateLeadPoint(gaze, context.x, context.z)
      return aimAtPoint(point.x, point.y, point.z, 0, false, LEAD_RELEASE_RANGE, context)
    }
    case 'tilt': {
      const progress = smoothRatio((context.elapsed - gaze.delay) / gaze.second)
      return { yaw: gaze.yaw, pitch: clampPitch(gaze.fromPitch + (gaze.toPitch - gaze.fromPitch) * progress, context) }
    }
    case 'pan':
      return { yaw: gaze.baseYaw + gaze.rate * context.elapsed, pitch: clampPitch(gaze.pitch, context) }
    case 'free':
      return { yaw: context.freeYaw, pitch: clampPitch(context.freePitch, context) }
  }
}

/** 看向世界裡的一點：thirds 是偏離畫面中央的角度，太近時改用備案朝向，releaseRange 是走近時視線放開的距離範圍 */
function aimAtPoint(
  x: number,
  y: number,
  z: number,
  thirds: number,
  isBehind: boolean,
  releaseRange: readonly [number, number] | undefined,
  context: GazeContext,
): { yaw: number; pitch: number } {
  const dx = x - context.x
  const dz = z - context.z
  const distance = Math.hypot(dx, dz)
  if (distance < SUBJECT_NEAR_DISTANCE)
    return { yaw: context.pathYaw + (isBehind ? Math.PI : 0), pitch: clampPitch(context.pathPitch, context) }

  const subjectYaw = Math.atan2(dx, dz) + thirds
  const subjectPitch = clampPitch(Math.atan2(context.eyeY - y, distance), context)
  if (!releaseRange)
    return { yaw: subjectYaw, pitch: subjectPitch }

  /** 走近目的地時視線慢慢放開、轉回前進方向：最後一段貼著目的地繞過去時，不必追著它快速橫掃 */
  const [far, near] = releaseRange
  const release = smoothRatio((far - distance) / (far - near))
  return {
    yaw: subjectYaw + diffAngle(context.pathYaw, subjectYaw) * release,
    pitch: subjectPitch + (clampPitch(context.pathPitch, context) - subjectPitch) * release,
  }
}

/** 留白的偏角：在清單裡依軌道距離內插，沒有清單就是零 */
function getLookRoomOffset(lookRoom: LookRoom | undefined, trackDistance: number): number {
  if (!lookRoom || lookRoom.offsetList.length === 0)
    return 0

  const position = Math.min(lookRoom.offsetList.length - 1, Math.max(0, (trackDistance - lookRoom.startDistance) / lookRoom.step))
  const index = Math.floor(position)
  const left = lookRoom.offsetList[index] ?? 0
  const right = lookRoom.offsetList[Math.min(lookRoom.offsetList.length - 1, index + 1)] ?? left
  return left + (right - left) * (position - index)
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
