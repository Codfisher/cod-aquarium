import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { useFpsController } from '../../composables/use-fps-controller'
import type { RealmDefinition } from '../realm/realm-definition'
import type { RenderInputMessage } from '../render-host/protocol'
import type { DriftEmitter, DriftPoint } from './drift-point'
import type { AngleFollower, Gaze, ShotId } from './drift-shot'
import type { DriftTrack, DriftTrackSample } from './drift-track'
import { clamp } from 'remeda'
import { PLAYER_EYE_HEIGHT } from '../player/collision'
import { getDayPhase } from '../weather/day-night'
import { buildFlightTrack, chooseFlightRoute } from './drift-flight'
import { getDriftFlight, getDriftRegion } from './drift-flight-config'
import { createDriftGrid } from './drift-grid'
import { collectReachableSet, planArcPath, planWalkPath } from './drift-path'
import { collectDriftPoint, findLoudestEmitter, findReachableSpot, listDriftEmitter } from './drift-point'
import {
  CRANE_HEIGHT_RANGE,
  CRANE_MOVE_SECOND,
  followAngle,
  GAZE_LIMIT_MAP,
  ORBIT_ARC_RANGE,
  ORBIT_RADIUS_RANGE,
  ORBIT_SPEED,
  PAN_RATE_RANGE,
  pickShot,
  resolveGaze,
  SWAY_HEIGHT,
  SWAY_PITCH,
  SWAY_YAW,
  THIRDS_OFFSET,
  TRUCK_ANGLE_RANGE,
} from './drift-shot'
import { createWalkTrack, diffAngle, sampleDriftTrack } from './drift-track'
import { itemAt } from './drift-util'

/**
 * 神遊：鏡頭自己在這座大場景裡散步、偶爾升空俯瞰
 *
 * 散步與飛行都不經過漫遊控制器，鏡頭直接沿預先算好的曲線走（見 drift-track）：
 * 速度、轉向與高度全由曲線決定，沒有控制器的加減速、上台階的頓挫與碰撞抖動。
 * 神遊期間控制器被暫停（setSuspended），只負責照鏡頭腳下的位置套霧與光；
 * 結束時在鏡頭正下方找站得住的位置把控制交回去。
 *
 * 狀態機：walk（沿著路徑走）→ linger（停下來環顧）→ walk …；
 * 每隔幾分鐘或遇到日出日落，linger 之後改飛一趟 fly，落地再 linger。
 * 路徑與飛行軌道都在 linger 開頭算好（尋路只在這時做一次），每幀只是查表。
 */

/** 散步與飛行的巡航速度（格／秒）；自由漫遊是 5.2，散步取一半，從容 */
const WALK_SPEED = 2.6
const FLY_SPEED = 5
/** 起步的加速與停步的減速（格／秒平方）：停步用 v² = 2ad 的曲線，緩緩收到終點 */
const WALK_ACCELERATION = 1
const FLY_ACCELERATION = 1.2
const WALK_DECELERATION = 1.1
const FLY_DECELERATION = 1.6
/** 到終點的剩餘距離小於這個就算抵達 */
const ARRIVE_DISTANCE = 0.02
/** 停留時繞景物走弧的移動參數（格／秒、格／秒平方）：比散步更慢更輕 */
const ORBIT_ACCELERATION = 0.4
const ORBIT_DECELERATION = 0.5
/** 鏡位為「看前進方向」時，視線與前進方向差多少（弧度）速度降到最低 */
const TURN_SLOWDOWN_ANGLE = 1
const TURN_SPEED_FLOOR = 0.2
/** 起步時鏡頭高度與軌道高度的落差，以這個時間常數（秒）收掉 */
const HEIGHT_OFFSET_TAU = 1.2
/** 落差很大時收回來的速度上限（格／秒），免得從高空猛然掉下來 */
const HEIGHT_OFFSET_RATE_MAX = 2

/** 停留時間（秒） */
const LINGER_MIN = 30
const LINGER_MAX = 90
/** 飛行落地後的短暫停留（秒） */
const LINGER_AFTER_FLIGHT_MIN = 10
const LINGER_AFTER_FLIGHT_MAX = 22
/** 剛開始神遊的停留（秒），給介面淡出與眼睛適應 */
const LINGER_START_MIN = 5
const LINGER_START_MAX = 9
/** 找不到下一站時等多久再試（秒） */
const REPLAN_DELAY = 12

/** 環顧：多久換一次目標、偏離基準方向多少（弧度）；轉動速度由視線的角速度上限管（見 drift-shot） */
const LOOK_AROUND_INTERVAL_MIN = 6
const LOOK_AROUND_INTERVAL_MAX = 12
const LOOK_AROUND_SPREAD = 0.9
/** 偏向最響音源的機率，其餘是隨意看看 */
const LOOK_AROUND_BIAS_CHANCE = 0.65

/** 下一站的距離偏好：太近太遠都扣分（格） */
const STOP_IDEAL_DISTANCE = 70
const STOP_DISTANCE_SIGMA = 40
const STOP_DISTANCE_MIN = 14
/** 最近去過的幾站大幅降權 */
const RECENT_STOP_COUNT = 5
const RECENT_STOP_WEIGHT = 0.08
/** 一次最多試幾個候選站 */
const PLAN_ATTEMPT_MAX = 4
/** 軌道至少多長才值得走 */
const TRACK_LENGTH_MIN = 8

/** 運鏡：停留要多長才做繞弧與升降（秒）、繞弧開始前先停多久（秒）、側面景物的偏角範圍（弧度）與距離（格） */
const ORBIT_DURATION_MIN = 20
const MOTION_START_DELAY = 3
const SIDE_SUBJECT_ANGLE_RANGE: readonly [number, number] = [1.05, 1.75]
const SIDE_SUBJECT_DISTANCE_RANGE: readonly [number, number] = [10, 90]
/** 看向景物時瞄準的高度：離地多高（格） */
const SUBJECT_HEIGHT = 1.3
/** 日出日落時橫搖朝向太陽那一側，速度取範圍裡慢的一端再打折 */
const GOLDEN_PAN_RATE_RATIO = 0.5
/** 走路與飛行時側移鏡位的視線俯仰（弧度） */
const TRUCK_PITCH_WALK = 0.03
const TRUCK_PITCH_FLY = 0.22

/** 呼吸起伏淡入淡出的時間常數（秒） */
const SWAY_FADE_SECOND = 2

/** 兩次飛行之間隔多久（秒），第一次提早一點 */
const FLIGHT_INTERVAL_MIN = 150
const FLIGHT_INTERVAL_MAX = 270
const FLIGHT_FIRST_MIN = 60
const FLIGHT_FIRST_MAX = 120

/** 卡住偵測：這麼久（秒）內位移小於門檻（格）就放棄這一站 */
const STUCK_WINDOW = 6
const STUCK_DISTANCE = 0.5

/** 使用者轉頭 */
const LOOK_SENSITIVITY = 1 / 1600
/** 最後一次轉頭之後多久開始轉回來（秒），以及轉回來的係數 */
const LOOK_RETURN_DELAY = 4
const LOOK_RETURN_EASE = 1.2
const LOOK_PITCH_LIMIT = 1.2
const PITCH_LIMIT = Math.PI / 2 - 0.01

/** 結束時從空中降到地面的時間範圍（秒），依落差調整 */
const SETTLE_DURATION_MIN = 1.2
const SETTLE_DURATION_MAX = 3.2
/** 結束時交給控制器的腳底最多比站立面高多少，剩下的交給重力，不會突然下沉 */
const HANDBACK_HEIGHT_MAX = 0.4
/** 鏡頭離站立面多高以上就算在空中 */
const AIRBORNE_HEIGHT = 1
/** 找起點時離控制器位置最多往外找幾格 */
const START_SEARCH_RADIUS = 20
/** 起點所在的連通區塊小於這個格數就換一個起點試試 */
const REACHABLE_SIZE_MIN = 400

export type DriftPhase = 'walk' | 'linger' | 'fly'

type InternalPhase = DriftPhase | 'settle'

interface NextPlan {
  kind: 'walk' | 'fly';
  track: DriftTrack;
  /** 這一趟的終點，抵達後記為目前所在的停留點 */
  destination: DriftPoint;
  /** 沿途經過的停留點，記進最近去過 */
  visitedList: DriftPoint[];
}

/** 沿軌道移動的參數 */
interface MotionParam {
  cruise: number;
  acceleration: number;
  deceleration: number;
}

const WALK_MOTION: MotionParam = { cruise: WALK_SPEED, acceleration: WALK_ACCELERATION, deceleration: WALK_DECELERATION }
const FLY_MOTION: MotionParam = { cruise: FLY_SPEED, acceleration: FLY_ACCELERATION, deceleration: FLY_DECELERATION }
const ORBIT_MOTION: MotionParam = { cruise: ORBIT_SPEED, acceleration: ORBIT_ACCELERATION, deceleration: ORBIT_DECELERATION }

interface DriftSession {
  realm: RealmDefinition;
  worldState: Uint8Array;
  grid: ReturnType<typeof createDriftGrid>;
  reachedSet: Set<number>;
  pointList: DriftPoint[];
  emitterList: DriftEmitter[];
  observer: ReturnType<Scene['onBeforeRenderObservable']['add']>;

  phase: InternalPhase;
  /** 鏡頭此刻的位置（眼睛），落在軌道上，不含使用者轉頭 */
  x: number;
  z: number;
  eyeY: number;
  /** 腳下的高度層，尋路時當參考 */
  blockY: number;
  /** 升降鏡位（crane）此刻讓鏡頭比軌道高多少（格），不是升降時是零 */
  craneY: number;
  /**
   * 系統的視線（不含使用者轉頭）：追著 gaze 要看的方向轉，角速度與角加速度都有上限
   *
   * 視線與位置分開——位置沿軌道走，看哪裡由鏡位決定（見 drift-shot）
   */
  yawFollower: AngleFollower;
  pitchFollower: AngleFollower;
  gaze: Gaze;
  shotId: ShotId;
  /** 這個鏡位已經過了多久（秒），橫搖靠它 */
  shotElapsed: number;
  /** 軌道在目前這一點的前進方向與俯仰，視線為 heading 時就看這個 */
  pathYaw: number;
  pathPitch: number;
  /** 呼吸起伏的時鐘與強度（飛行時收掉，變化要慢，不然開關的那一幀視線會抖一下） */
  swayClock: number;
  swayRatio: number;
  /** 停留時繞景物走的弧與升降的設定，沒有就是 null */
  motionTrack: DriftTrack | null;
  motionDistance: number;
  motionSpeed: number;
  motionStartAt: number;
  crane: { height: number; startAt: number } | null;

  track: DriftTrack | null;
  trackDistance: number;
  speed: number;
  /** 軌道起點與鏡頭實際高度的落差，隨時間收掉 */
  heightOffset: number;

  lingerElapsed: number;
  lingerDuration: number;
  nextPlan: NextPlan | null;
  /** 目前待在哪個停留點，起步時是 null */
  currentPoint: DriftPoint | null;
  recentIdList: string[];
  /** 隨意環顧（free 視線）的目標 */
  lookTargetYaw: number;
  lookTargetPitch: number;
  lookChangeAt: number;
  replanFailureCount: number;

  flightClock: number;
  flightDueAt: number;
  isFlightDue: boolean;
  lastDayPhase: string;

  stuckClock: number;
  stuckX: number;
  stuckY: number;
  stuckZ: number;

  /** 使用者轉頭疊加的偏移與離上次輸入多久 */
  lookYawOffset: number;
  lookPitchOffset: number;
  lookIdle: number;

  /** 結束的降落（settle）：起點、終點與進度 */
  settle: { fromX: number; fromZ: number; fromEyeY: number; toX: number; toZ: number; toEyeY: number; duration: number; elapsed: number } | null;
  /** 降落完要交給控制器的站立面 */
  settleBlockY: number;
}

interface UseDriftParam {
  scene: Scene;
  camera: UniversalCamera;
  controller: ReturnType<typeof useFpsController>;
  /** 目前場景與方塊資料，換場景之後會變，所以給函式 */
  getWorld: () => { realm: RealmDefinition; worldState: Uint8Array } | null;
  getTimeOfDay: () => number;
  getDayRatio: () => number;
  /** 由世界中心指向太陽的向量，日出日落的橫搖要朝它 */
  getSunDirection: () => { x: number; z: number };
  /** 狀態變了（開始、結束、階段切換），渲染執行期據此立刻補送一份狀態 */
  onChange: () => void;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function useDrift({ scene, camera, controller, getWorld, getTimeOfDay, getDayRatio, getSunDirection, onChange }: UseDriftParam) {
  let session: DriftSession | null = null
  const sample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1 }

  function isDrifting(): boolean {
    return session !== null
  }

  /** 對外的階段：降落（settle）也算 fly，介面只分三種 */
  function getPhase(): DriftPhase | null {
    if (!session)
      return null
    return session.phase === 'settle' ? 'fly' : session.phase
  }

  function setPhase(target: DriftSession, phase: InternalPhase) {
    const before = target.phase
    target.phase = phase
    if ((before === 'settle' ? 'fly' : before) !== (phase === 'settle' ? 'fly' : phase))
      onChange()
  }

  /* ───────────────────────── 規劃下一站 ───────────────────────── */

  /** 加權隨機挑下一站、尋路、組成散步軌道；候選全走不到就是 null */
  function planWalk(target: DriftSession, isOpenSkyOnly = false): NextPlan | null {
    const candidateList = target.pointList.filter((point) =>
      point !== target.currentPoint
      && (!isOpenSkyOnly || point.isOpenSky)
      && Math.hypot(point.blockX - target.x, point.blockZ - target.z) >= STOP_DISTANCE_MIN)

    for (let attempt = 0; attempt < PLAN_ATTEMPT_MAX && candidateList.length > 0; attempt++) {
      const weightList = candidateList.map((point) => {
        const distance = Math.hypot(point.blockX - target.x, point.blockZ - target.z)
        const base = Math.exp(-(((distance - STOP_IDEAL_DISTANCE) / STOP_DISTANCE_SIGMA) ** 2)) + 0.03
        return target.recentIdList.includes(point.id) ? base * RECENT_STOP_WEIGHT : base
      })

      let pick = Math.random() * weightList.reduce((sum, weight) => sum + weight, 0)
      let index = candidateList.length - 1
      for (let cursor = 0; cursor < weightList.length; cursor++) {
        pick -= itemAt(weightList, cursor)
        if (pick <= 0) {
          index = cursor
          break
        }
      }

      const point = itemAt(candidateList.splice(index, 1), 0)
      const polyline = planWalkPath(
        target.grid,
        { x: target.x, z: target.z, blockY: target.blockY },
        { blockX: point.blockX, blockZ: point.blockZ, blockY: point.blockY },
      )
      if (!polyline || polyline.xList.length < 2)
        continue

      const track = createWalkTrack(polyline.xList, polyline.zList, polyline.footYList, PLAYER_EYE_HEIGHT)
      if (track.length < TRACK_LENGTH_MIN)
        continue

      return { kind: 'walk', track, destination: point, visitedList: [point] }
    }

    return null
  }

  /** 組一趟飛行：只在露天的地方起飛，場景關掉飛行或找不到落點就是 null */
  function planFlight(target: DriftSession): NextPlan | null {
    const flight = getDriftFlight(target.realm)
    if (!flight.isEnabled)
      return null

    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    if (!here?.isOpenSky)
      return null

    for (let attempt = 0; attempt < 2; attempt++) {
      const route = chooseFlightRoute(target.pointList, { x: target.x, z: target.z }, target.recentIdList, {
        region: getDriftRegion(target.realm),
        mode: flight.routeMode ?? 'free',
      })
      if (!route)
        return null

      const track = buildFlightTrack({
        worldState: target.worldState,
        grid: target.grid,
        flight,
        start: { x: target.x, z: target.z, eyeY: target.eyeY, blockY: target.blockY },
        route,
        eyeHeight: PLAYER_EYE_HEIGHT,
      })
      if (track && track.length >= TRACK_LENGTH_MIN)
        return { kind: 'fly', track, destination: route.landing, visitedList: route.waypointList.flatMap((waypoint) => (waypoint.point ? [waypoint.point] : [])) }
    }

    return null
  }

  /** 停留開始時把下一趟算好，停留結束就能直接出發 */
  function prepareNext(target: DriftSession) {
    target.nextPlan = null

    if (target.isFlightDue) {
      if (!getDriftFlight(target.realm).isEnabled) {
        target.isFlightDue = false
      }
      else {
        target.nextPlan = planFlight(target)
        /** 這裡不是露天（林子裡、洞口內）起飛會穿過樹冠：先走去最近的露天停留點，下一次停留再飛 */
        const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
        if (!target.nextPlan && !here?.isOpenSky)
          target.nextPlan = planWalk(target, true)
      }
    }
    target.nextPlan ??= planWalk(target)
  }

  function startLinger(target: DriftSession, duration: number) {
    setPhase(target, 'linger')
    target.lingerElapsed = 0
    target.lingerDuration = duration
    target.speed = 0
    target.track = null
    target.lookChangeAt = 0
    prepareNext(target)

    /** 算不出下一站就多等一會兒再試，期間照常環顧 */
    if (!target.nextPlan) {
      target.replanFailureCount++
      target.lingerDuration = Math.min(duration, REPLAN_DELAY)
    }
    else {
      target.replanFailureCount = 0
    }

    startLingerShot(target)
  }

  function startTrack(target: DriftSession, plan: NextPlan) {
    target.track = plan.track
    target.trackDistance = 0
    target.speed = 0
    target.stuckClock = 0
    target.stuckX = target.x
    target.stuckY = target.eyeY
    target.stuckZ = target.z
    target.motionTrack = null
    target.crane = null
    target.craneY = 0
    /** 軌道起點與鏡頭實際位置的高度差慢慢收掉，接續時沒有跳動 */
    target.heightOffset = target.eyeY - itemAt(plan.track.yList, 0)
    if (plan.kind === 'fly') {
      target.isFlightDue = false
      target.flightDueAt = target.flightClock + randomBetween(FLIGHT_INTERVAL_MIN, FLIGHT_INTERVAL_MAX)
    }
    setPhase(target, plan.kind)
    startTrackShot(target, plan)
  }

  /* ───────────────────────── 運鏡 ───────────────────────── */

  function setShot(target: DriftSession, shotId: ShotId, gaze: Gaze) {
    target.shotId = shotId
    target.gaze = gaze
    target.shotElapsed = 0
  }

  function randomSign(): 1 | -1 {
    return Math.random() < 0.5 ? -1 : 1
  }

  /** 從軌道中段找一個在側面（約六十到一百度）的景物：停留點或音源 */
  function findSideSubject(target: DriftSession, track: DriftTrack): { x: number; z: number; y: number } | null {
    const mid = Math.floor(track.xList.length / 2)
    const midX = itemAt(track.xList, mid)
    const midZ = itemAt(track.zList, mid)
    const heading = itemAt(track.yawList, mid)

    const candidateList: { x: number; z: number; y: number }[] = [
      ...target.pointList.map((point) => ({ x: point.blockX, z: point.blockZ, y: point.footY + SUBJECT_HEIGHT })),
      ...target.emitterList.map((emitter) => ({ x: emitter.x, z: emitter.z, y: itemAt(track.yList, mid) - 0.4 })),
    ].filter((candidate) => {
      const distance = Math.hypot(candidate.x - midX, candidate.z - midZ)
      if (distance < SIDE_SUBJECT_DISTANCE_RANGE[0] || distance > SIDE_SUBJECT_DISTANCE_RANGE[1])
        return false

      const side = Math.abs(diffAngle(Math.atan2(candidate.x - midX, candidate.z - midZ), heading))
      return side >= SIDE_SUBJECT_ANGLE_RANGE[0] && side <= SIDE_SUBJECT_ANGLE_RANGE[1]
    })

    return candidateList.length > 0 ? itemAt(candidateList, Math.floor(Math.random() * candidateList.length)) : null
  }

  /** 散步與飛行這一段的鏡位 */
  function startTrackShot(target: DriftSession, plan: NextPlan) {
    const isFly = plan.kind === 'fly'
    const side = findSideSubject(target, plan.track)
    const shot = pickShot(plan.kind, (id) => id !== 'parallax' || side !== null)
    const thirds = THIRDS_OFFSET * randomSign()

    switch (shot.id) {
      case 'dollyIn':
        setShot(target, 'dollyIn', {
          kind: 'subject',
          x: plan.destination.blockX,
          y: plan.destination.footY + SUBJECT_HEIGHT,
          z: plan.destination.blockZ,
          thirds,
          behind: false,
        })
        break
      case 'truck':
        setShot(target, 'truck', {
          kind: 'relative',
          offset: randomSign() * randomBetween(TRUCK_ANGLE_RANGE[0], TRUCK_ANGLE_RANGE[1]),
          pitch: isFly ? TRUCK_PITCH_FLY : TRUCK_PITCH_WALK,
        })
        break
      case 'pullBack':
        /** 回頭看出發的地方：風景在背後慢慢展開 */
        setShot(target, 'pullBack', {
          kind: 'subject',
          x: target.x,
          y: target.eyeY - 0.6,
          z: target.z,
          thirds,
          behind: true,
        })
        break
      case 'parallax':
        setShot(target, 'parallax', side
          ? { kind: 'subject', x: side.x, y: side.y, z: side.z, thirds: thirds * 0.6, behind: false }
          : { kind: 'heading' })
        break
      default:
        setShot(target, 'follow', { kind: 'heading' })
        break
    }
  }

  /** 此刻聽得最清楚的音源（沒有就是停留點自己指的方向）離這裡多遠，當作繞弧與橫搖的景物 */
  function findLingerSubject(target: DriftSession): { x: number; z: number } | null {
    const loudest = findLoudestEmitter(target.emitterList, target.x, target.z, getDayRatio() > 0.5)
    if (loudest)
      return { x: loudest.x, z: loudest.z }

    const point = target.currentPoint
    if (point?.lookX !== undefined && point.lookZ !== undefined)
      return { x: point.lookX, z: point.lookZ }

    return null
  }

  /**
   * 停留的鏡位
   *
   * 繞弧要有景物、停留夠長、而且弧線上每一點都走得到（planArcPath 會在站不住的地方截斷）；
   * 升降要頭頂是開闊的、停留夠長。條件不成立的鏡位根本不會被抽到
   */
  function startLingerShot(target: DriftSession) {
    target.motionTrack = null
    target.crane = null
    target.craneY = 0
    const duration = target.lingerDuration
    const subject = findLingerSubject(target)
    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    const footY = target.eyeY - PLAYER_EYE_HEIGHT

    let orbitTrack: DriftTrack | null = null
    if (subject && duration >= ORBIT_DURATION_MIN) {
      const distance = Math.hypot(subject.x - target.x, subject.z - target.z)
      if (distance >= ORBIT_RADIUS_RANGE[0] && distance <= ORBIT_RADIUS_RANGE[1]) {
        const arcLength = Math.min(
          randomBetween(ORBIT_ARC_RANGE[0], ORBIT_ARC_RANGE[1]),
          (duration - MOTION_START_DELAY - 6) * ORBIT_SPEED * 0.7,
        )
        const firstSign = randomSign()
        for (const sign of [firstSign, firstSign === 1 ? -1 : 1] as const) {
          const polyline = planArcPath(target.grid, { x: target.x, z: target.z, blockY: target.blockY }, subject, arcLength, sign)
          if (polyline && polyline.xList.length >= 2) {
            orbitTrack = createWalkTrack(polyline.xList, polyline.zList, polyline.footYList, PLAYER_EYE_HEIGHT)
            break
          }
        }
      }
    }
    const canCrane = (here?.isOpenSky ?? false) && duration >= CRANE_MOVE_SECOND * 2 + MOTION_START_DELAY + 6
    const shot = pickShot('linger', (id) => {
      if (id === 'orbit')
        return orbitTrack !== null
      if (id === 'crane')
        return canCrane
      return true
    })

    const dayPhase = getDayPhase(getTimeOfDay())
    const isGolden = dayPhase === 'sunrise' || dayPhase === 'sunset'
    const lookTarget = subject ? { x: subject.x, y: footY + SUBJECT_HEIGHT, z: subject.z } : null

    switch (shot.id) {
      case 'orbit':
        if (orbitTrack && lookTarget) {
          target.motionTrack = orbitTrack
          target.motionDistance = 0
          target.motionSpeed = 0
          target.motionStartAt = MOTION_START_DELAY
          setShot(target, 'orbit', { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false })
          return
        }
        break
      case 'crane':
        target.crane = { height: randomBetween(CRANE_HEIGHT_RANGE[0], CRANE_HEIGHT_RANGE[1]), startAt: MOTION_START_DELAY }
        setShot(target, 'crane', lookTarget
          ? { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false }
          : { kind: 'pan', baseYaw: target.yawFollower.value, rate: randomSign() * PAN_RATE_RANGE[0], pitch: 0.05 })
        return
      case 'pan': {
        const sun = getSunDirection()
        const baseYaw = isGolden && Math.hypot(sun.x, sun.z) > 0.01
          ? Math.atan2(sun.x, sun.z)
          : subject ? Math.atan2(subject.x - target.x, subject.z - target.z) : target.yawFollower.value
        const rate = randomBetween(PAN_RATE_RANGE[0], PAN_RATE_RANGE[1]) * (isGolden ? GOLDEN_PAN_RATE_RATIO : 1) * randomSign()
        /** 日出日落對著太陽那一側：起頭偏開一點再掃過去，太陽走進畫面而不是一開始就正中央 */
        setShot(target, 'pan', { kind: 'pan', baseYaw: baseYaw - rate * 6, rate, pitch: isGolden ? -0.02 : 0.04 })
        return
      }
      default:
        break
    }

    setShot(target, 'hold', { kind: 'free' })
  }

  /* ───────────────────────── 每幀 ───────────────────────── */

  /** 停留時的環顧：每隔一陣子換一個目標，偏向此刻最響的音源（沒有就偏向停留點自己指的方向） */
  function updateLookAround(target: DriftSession) {
    if (target.lingerElapsed < target.lookChangeAt)
      return

    target.lookChangeAt = target.lingerElapsed + randomBetween(LOOK_AROUND_INTERVAL_MIN, LOOK_AROUND_INTERVAL_MAX)

    const subject = findLingerSubject(target)
    if (subject && Math.random() < LOOK_AROUND_BIAS_CHANCE)
      target.lookTargetYaw = Math.atan2(subject.x - target.x, subject.z - target.z) + (Math.random() - 0.5) * LOOK_AROUND_SPREAD
    else
      target.lookTargetYaw = target.yawFollower.value + (Math.random() - 0.5) * 2 * LOOK_AROUND_SPREAD * 2
    target.lookTargetPitch = (Math.random() - 0.4) * 0.22
  }

  /**
   * 依鏡頭現在的位置重找腳下的高度層
   *
   * 路線與繞弧都可能一路上坡下坡，離上次記下的高度層差了兩層以上，
   * 拿舊的層去問格子會問不到（下一趟尋路的起點格就是 null）。只在腳踏在地面時用
   */
  function syncBlockY(target: DriftSession) {
    const footY = target.eyeY - target.heightOffset - PLAYER_EYE_HEIGHT
    const cell = target.grid.getCellAtHeight(Math.round(target.x), Math.round(target.z), footY)
    if (cell)
      target.blockY = cell.blockY
  }

  /** 沿軌道前進一幀；回傳是不是走到了終點。視線不在這裡管，只記下軌道在這一點的方向 */
  function advanceTrack(target: DriftSession, track: DriftTrack, motion: MotionParam, deltaTime: number, distanceKey: 'trackDistance' | 'motionDistance'): boolean {
    const remaining = track.length - target[distanceKey]

    sampleDriftTrack(track, target[distanceKey], sample)

    /** 視線還沒轉到前進方向時放慢（只有「看前進方向」的鏡位才需要；側移與看向景物時身體照走） */
    const turnFactor = target.gaze.kind === 'heading'
      ? clamp(1 - Math.abs(diffAngle(sample.yaw, target.yawFollower.value)) / TURN_SLOWDOWN_ANGLE, { min: TURN_SPEED_FLOOR, max: 1 })
      : 1
    const cruise = motion.cruise * sample.curveScale * turnFactor
    /** 停步用 v² = 2ad：離終點越近越慢，緩緩收到 */
    const brake = Math.sqrt(2 * motion.deceleration * Math.max(0, remaining)) + 0.12
    const goal = Math.min(cruise, brake)

    const speedKey = distanceKey === 'trackDistance' ? 'speed' : 'motionSpeed'
    target[speedKey] += clamp(goal - target[speedKey], { min: -motion.deceleration * 2 * deltaTime, max: motion.acceleration * deltaTime })
    target[distanceKey] = Math.min(track.length, target[distanceKey] + target[speedKey] * deltaTime)

    sampleDriftTrack(track, target[distanceKey], sample)
    target.x = sample.x
    target.z = sample.z
    target.eyeY = sample.y + target.heightOffset
    target.pathYaw = sample.yaw
    target.pathPitch = sample.pitch

    return track.length - target[distanceKey] <= ARRIVE_DISTANCE
  }

  /** 視線追著鏡位要看的方向轉（有角速度與角加速度上限），這是畫面轉動的唯一出口 */
  function updateGaze(target: DriftSession, deltaTime: number) {
    const limit = GAZE_LIMIT_MAP[target.phase === 'settle' ? 'fly' : target.phase]
    target.shotElapsed += deltaTime
    const view = resolveGaze(target.gaze, {
      x: target.x,
      eyeY: target.eyeY + target.craneY,
      z: target.z,
      pathYaw: target.pathYaw,
      pathPitch: target.pathPitch,
      elapsed: target.shotElapsed,
      freeYaw: target.lookTargetYaw,
      freePitch: target.lookTargetPitch,
    })
    followAngle(target.yawFollower, view.yaw, deltaTime, limit.yawSpeed, limit.yawAcceleration)
    followAngle(target.pitchFollower, view.pitch, deltaTime, limit.pitchSpeed, limit.pitchAcceleration)
  }

  /** 升降鏡位：先升、停一陣、再降回來，兩頭都是平滑的 S 曲線 */
  function updateCrane(target: DriftSession) {
    const { crane } = target
    if (!crane) {
      target.craneY = 0
      return
    }

    const smooth = (ratio: number) => {
      const clamped = clamp(ratio, { min: 0, max: 1 })
      return clamped * clamped * (3 - 2 * clamped)
    }
    const up = smooth((target.lingerElapsed - crane.startAt) / CRANE_MOVE_SECOND)
    const down = 1 - smooth((target.lingerElapsed - (target.lingerDuration - CRANE_MOVE_SECOND - 2)) / CRANE_MOVE_SECOND)
    target.craneY = crane.height * up * down
  }

  function arrive(target: DriftSession, plan: NextPlan) {
    target.blockY = plan.destination.blockY
    target.currentPoint = plan.destination
    for (const point of plan.visitedList) {
      target.recentIdList.push(point.id)
    }
    target.recentIdList = target.recentIdList.slice(-RECENT_STOP_COUNT)
    startLinger(
      target,
      plan.kind === 'fly'
        ? randomBetween(LINGER_AFTER_FLIGHT_MIN, LINGER_AFTER_FLIGHT_MAX)
        : randomBetween(LINGER_MIN, LINGER_MAX),
    )
  }

  /** 目前正走的這一趟，arrive 要用它的終點；與 track 一起存 */
  let activePlan: NextPlan | null = null

  function updateSession(target: DriftSession, deltaTime: number) {
    /** 日出日落與固定間隔都會讓下一趟改成飛行 */
    target.flightClock += deltaTime
    const dayPhase = getDayPhase(getTimeOfDay())
    if (dayPhase !== target.lastDayPhase) {
      target.lastDayPhase = dayPhase
      if (dayPhase === 'sunrise' || dayPhase === 'sunset')
        target.isFlightDue = true
    }
    if (target.flightClock >= target.flightDueAt)
      target.isFlightDue = true

    switch (target.phase) {
      case 'walk':
      case 'fly': {
        const track = target.track
        if (!track || !activePlan) {
          startLinger(target, REPLAN_DELAY)
          break
        }

        const isArrived = advanceTrack(target, track, track.kind === 'fly' ? FLY_MOTION : WALK_MOTION, deltaTime, 'trackDistance')
        if (isArrived) {
          const plan = activePlan
          activePlan = null
          arrive(target, plan)
          break
        }

        /** 卡住偵測：軌道是預先算好的不會真的卡，但速度鎖死或軌道退化時要能自救 */
        target.stuckClock += deltaTime
        if (target.stuckClock >= STUCK_WINDOW) {
          if (Math.hypot(target.x - target.stuckX, target.z - target.stuckZ, target.eyeY - target.stuckY) < STUCK_DISTANCE) {
            if (track.kind === 'walk')
              syncBlockY(target)
            activePlan = null
            startLinger(target, REPLAN_DELAY)
          }
          target.stuckClock = 0
          target.stuckX = target.x
          target.stuckY = target.eyeY
          target.stuckZ = target.z
        }
        break
      }
      case 'linger': {
        target.lingerElapsed += deltaTime
        updateLookAround(target)

        /** 繞弧：停一小段之後沿著弧慢慢走，走到頭就停在那裡；位置換了，所在的高度層跟著換 */
        if (target.motionTrack && target.lingerElapsed >= target.motionStartAt) {
          /** 起步前（還沒動）每幀對一次：弧的第一點與鏡頭實際高度的落差併進高度補償，起步時沒有跳動 */
          if (target.motionDistance === 0 && target.motionSpeed === 0)
            target.heightOffset = target.eyeY - itemAt(target.motionTrack.yList, 0)

          if (advanceTrack(target, target.motionTrack, ORBIT_MOTION, deltaTime, 'motionDistance')) {
            target.motionTrack = null
            syncBlockY(target)
            target.pathYaw = target.yawFollower.value
            /** 下一站是在原地算的，繞完弧位置變了，路徑要從新的位置重算，不然起步會跳回去 */
            prepareNext(target)
            if (!target.nextPlan)
              target.lingerDuration = Math.min(target.lingerDuration, target.lingerElapsed + REPLAN_DELAY)
          }
        }
        updateCrane(target)

        /** 弧還沒走完就多等一下（弧長是照停留時間算的，只有被拖慢時才會用到） */
        if (target.lingerElapsed >= target.lingerDuration && !target.motionTrack) {
          if (target.nextPlan) {
            activePlan = target.nextPlan
            target.nextPlan = null
            startTrack(target, activePlan)
          }
          else {
            /** 上次沒算出來，趁這次停留重算 */
            startLinger(target, randomBetween(LINGER_MIN, LINGER_MAX))
          }
        }
        break
      }
      case 'settle': {
        const settle = target.settle
        if (!settle) {
          finishStop(target)
          return
        }

        settle.elapsed += deltaTime
        const ratio = clamp(settle.elapsed / settle.duration, { min: 0, max: 1 })
        const eased = ratio * ratio * (3 - 2 * ratio)
        target.x = settle.fromX + (settle.toX - settle.fromX) * eased
        target.z = settle.fromZ + (settle.toZ - settle.fromZ) * eased
        target.eyeY = settle.fromEyeY + (settle.toEyeY - settle.fromEyeY) * eased
        if (ratio >= 1) {
          finishStop(target)
          return
        }
        break
      }
    }

    /** 高度落差慢慢收掉（散步、停留與飛行都一樣） */
    const offsetStep = target.heightOffset * (1 - Math.exp(-deltaTime / HEIGHT_OFFSET_TAU))
    target.heightOffset -= clamp(offsetStep, { min: -HEIGHT_OFFSET_RATE_MAX * deltaTime, max: HEIGHT_OFFSET_RATE_MAX * deltaTime })

    updateGaze(target, deltaTime)
    target.swayClock += deltaTime
    const swayGoal = target.phase === 'fly' || target.phase === 'settle' ? 0 : 1
    target.swayRatio += (swayGoal - target.swayRatio) * (1 - Math.exp(-deltaTime / SWAY_FADE_SECOND))

    /** 使用者轉頭：離上次輸入過了一陣子就慢慢轉回系統的視線 */
    target.lookIdle += deltaTime
    if (target.lookIdle > LOOK_RETURN_DELAY) {
      /** 轉了好幾圈也從最短的方向轉回來 */
      target.lookYawOffset = diffAngle(target.lookYawOffset, 0)
      const decay = Math.exp(-deltaTime * LOOK_RETURN_EASE)
      target.lookYawOffset *= decay
      target.lookPitchOffset *= decay
    }

    writePose(target)
  }

  /** 把鏡頭擺上去：控制器的 position 是腳下，它自己會加上眼睛高度；視線疊上使用者轉頭與微微的呼吸起伏 */
  function writePose(target: DriftSession) {
    const swayRatio = target.swayRatio
    const eyeY = target.eyeY + target.craneY + SWAY_HEIGHT * swayRatio * Math.sin(target.swayClock * 1.07)

    const { position } = controller
    position.x = target.x
    position.y = eyeY - PLAYER_EYE_HEIGHT
    position.z = target.z

    camera.position.set(target.x, eyeY, target.z)
    camera.rotation.y = target.yawFollower.value + target.lookYawOffset + SWAY_YAW * swayRatio * Math.sin(target.swayClock * 0.43 + 1.3)
    camera.rotation.x = clamp(
      target.pitchFollower.value + target.lookPitchOffset + SWAY_PITCH * swayRatio * Math.sin(target.swayClock * 0.71),
      { min: -PITCH_LIMIT, max: PITCH_LIMIT },
    )
    camera.rotation.z = 0
  }

  /* ───────────────────────── 開始與結束 ───────────────────────── */

  /** 起點：控制器腳下往外找一個站得住的格子 */
  function findStartCell(grid: ReturnType<typeof createDriftGrid>, footX: number, footY: number, footZ: number) {
    const centerX = Math.round(footX)
    const centerZ = Math.round(footZ)
    for (let radius = 0; radius <= START_SEARCH_RADIUS; radius++) {
      for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        for (let offsetZ = -radius; offsetZ <= radius; offsetZ++) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== radius)
            continue

          const cell = grid.getCellAtHeight(centerX + offsetX, centerZ + offsetZ, footY)
          if (cell && (radius > 0 || Math.abs(cell.footY - footY) <= 3))
            return { blockX: centerX + offsetX, blockZ: centerZ + offsetZ, cell }
        }
      }
    }
    return null
  }

  /**
   * 開始神遊
   *
   * 回傳有沒有開始：大廳不支援，場景還沒好、找不到起點也不開始
   */
  function start(): boolean {
    const world = getWorld()
    if (session || !world || world.realm.hasGardens)
      return false

    const { realm, worldState } = world
    const grid = createDriftGrid(worldState, realm)
    const { position } = controller

    const startCell = findStartCell(grid, position.x, position.y, position.z)
    if (!startCell)
      return false

    /** 起點落在一小塊孤立的地（樹上的平台、牆內的小院），換附近一個連得更廣的 */
    let startRef = { blockX: startCell.blockX, blockZ: startCell.blockZ, blockY: startCell.cell.blockY }
    let reachedSet = collectReachableSet(grid, startRef)
    let startFootY = startCell.cell.footY
    for (let ring = 1; reachedSet.size < REACHABLE_SIZE_MIN && ring <= 6; ring++) {
      for (let step = 0; step < 8 && reachedSet.size < REACHABLE_SIZE_MIN; step++) {
        const angle = (step / 8) * Math.PI * 2
        const probe = findStartCell(grid, startCell.blockX + Math.cos(angle) * ring * 8, startCell.cell.footY, startCell.blockZ + Math.sin(angle) * ring * 8)
        if (!probe)
          continue

        const probeRef = { blockX: probe.blockX, blockZ: probe.blockZ, blockY: probe.cell.blockY }
        const probeSet = collectReachableSet(grid, probeRef)
        if (probeSet.size > reachedSet.size) {
          reachedSet = probeSet
          startRef = probeRef
          startFootY = probe.cell.footY
        }
      }
    }

    const pointList = collectDriftPoint({ realm, worldState, grid, reachedSet })

    /**
     * 控制器腳下那一格本身就能站（而且在連通區塊裡）才從原位開始，否則挪到起點格子中心
     *
     * 抵達點常常就在傳送門前，那一帶神遊不走（見 drift-grid 的門前障礙），
     * 從原位出發尋路會找不到起點格
     */
    const isNearStart = startRef.blockX === Math.round(position.x) && startRef.blockZ === Math.round(position.z)
    const x = isNearStart ? position.x : startRef.blockX
    const z = isNearStart ? position.z : startRef.blockZ
    const eyeY = isNearStart ? Math.max(position.y, startFootY) + PLAYER_EYE_HEIGHT : startFootY + PLAYER_EYE_HEIGHT

    const clock = randomBetween(FLIGHT_FIRST_MIN, FLIGHT_FIRST_MAX)
    const created: DriftSession = {
      realm,
      worldState,
      grid,
      reachedSet,
      pointList,
      emitterList: listDriftEmitter(realm),
      observer: null as unknown as DriftSession['observer'],
      phase: 'linger',
      x,
      z,
      eyeY,
      blockY: startRef.blockY,
      craneY: 0,
      yawFollower: { value: camera.rotation.y, velocity: 0 },
      pitchFollower: { value: camera.rotation.x, velocity: 0 },
      gaze: { kind: 'free' },
      shotId: 'hold',
      shotElapsed: 0,
      pathYaw: camera.rotation.y,
      pathPitch: 0,
      swayClock: 0,
      swayRatio: 1,
      motionTrack: null,
      motionDistance: 0,
      motionSpeed: 0,
      motionStartAt: 0,
      crane: null,
      track: null,
      trackDistance: 0,
      speed: 0,
      heightOffset: 0,
      lingerElapsed: 0,
      lingerDuration: 0,
      nextPlan: null,
      currentPoint: null,
      recentIdList: [],
      lookTargetYaw: camera.rotation.y,
      lookTargetPitch: 0,
      lookChangeAt: 0,
      replanFailureCount: 0,
      flightClock: 0,
      flightDueAt: clock,
      isFlightDue: false,
      lastDayPhase: getDayPhase(getTimeOfDay()),
      stuckClock: 0,
      stuckX: x,
      stuckY: eyeY,
      stuckZ: z,
      lookYawOffset: 0,
      lookPitchOffset: 0,
      lookIdle: 0,
      settle: null,
      settleBlockY: startRef.blockY,
    }

    activePlan = null
    session = created
    controller.setSuspended(true)

    /** 排在所有觀察者最前面：控制器的那一份要讀我寫好的位置 */
    created.observer = scene.onBeforeRenderObservable.add(() => {
      const current = session
      if (!current)
        return

      const deltaTime = clamp(scene.getEngine().getDeltaTime() / 1000, { min: 0, max: 0.05 })
      updateSession(current, deltaTime)
    }, undefined, true)

    startLinger(created, randomBetween(LINGER_START_MIN, LINGER_START_MAX))
    writePose(created)
    onChange()
    return true
  }

  /** 拆掉觀察者、還給控制器 */
  function release(target: DriftSession) {
    scene.onBeforeRenderObservable.remove(target.observer)
    controller.setSuspended(false)
    activePlan = null
    session = null
  }

  /** 把控制交回去：腳下的站立面取最近的那一層，腳底最多比它高一點，剩下交給重力 */
  function finishStop(target: DriftSession) {
    const cell = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.settle ? target.settleBlockY : target.blockY)
    const footY = target.eyeY - PLAYER_EYE_HEIGHT
    const handbackY = cell
      ? clamp(footY, { min: cell.footY, max: cell.footY + HANDBACK_HEIGHT_MAX })
      : footY
    const yaw = target.yawFollower.value + target.lookYawOffset
    const pitch = clamp(target.pitchFollower.value + target.lookPitchOffset, { min: -PITCH_LIMIT, max: PITCH_LIMIT })

    release(target)
    controller.teleport(target.x, handbackY, target.z)
    camera.rotation.set(pitch, yaw, 0)
    onChange()
  }

  /**
   * 結束神遊
   *
   * 在地面上（散步、停留）就地交還；在空中先平順地落到正下方站得住的地方（降落期間仍算 fly）
   */
  function stop() {
    const target = session
    if (!target || target.phase === 'settle')
      return

    /** 升降鏡位進行到一半時，高度併進基準高度，之後的降落從這裡接著走 */
    target.eyeY += target.craneY
    target.craneY = 0
    target.crane = null
    target.motionTrack = null

    const footY = target.eyeY - PLAYER_EYE_HEIGHT
    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    const isAirborne = target.phase === 'fly' || !here || footY - here.footY > AIRBORNE_HEIGHT
    if (!isAirborne) {
      finishStop(target)
      return
    }

    /** 正下方的站立面；沒有（飛在水面或岩壁上）就往外找最近的、走得到的地方 */
    let destination = { x: target.x, z: target.z, footY: 0, blockY: target.blockY }
    const below = target.grid.getCellAtHeight(Math.round(target.x), Math.round(target.z), footY)
    if (below && below.footY <= footY + 0.5 && below.waterDepth === 0) {
      destination = { x: target.x, z: target.z, footY: below.footY, blockY: below.blockY }
    }
    else {
      const spot = findReachableSpot(target, target.x, target.z, footY, 14)
      if (spot)
        destination = { x: spot.blockX, z: spot.blockZ, footY: spot.footY, blockY: spot.blockY }
      else
        destination = { x: target.x, z: target.z, footY: Math.max(0, footY - 4), blockY: target.blockY }
    }

    const drop = Math.max(0, target.eyeY - (destination.footY + PLAYER_EYE_HEIGHT))
    target.settleBlockY = destination.blockY
    target.settle = {
      fromX: target.x,
      fromZ: target.z,
      fromEyeY: target.eyeY,
      toX: destination.x,
      toZ: destination.z,
      toEyeY: destination.footY + PLAYER_EYE_HEIGHT,
      duration: clamp(Math.sqrt(drop) * 0.7, { min: SETTLE_DURATION_MIN, max: SETTLE_DURATION_MAX }),
      elapsed: 0,
    }
    target.track = null
    activePlan = null
    target.nextPlan = null
    /** 降落時視線回到水平、朝向維持原樣 */
    target.pathYaw = target.yawFollower.value
    target.pathPitch = 0
    setShot(target, 'follow', { kind: 'heading' })
    setPhase(target, 'settle')
  }

  /** 立刻放棄神遊，不降落（換場景、收掉渲染端時用；位置之後會被放到新場景的出生點） */
  function abort() {
    const target = session
    if (!target)
      return

    release(target)
    onChange()
  }

  /** 神遊中收到的轉頭：疊加在系統的視線上，不交給控制器 */
  function applyLook(message: RenderInputMessage) {
    const target = session
    if (!target)
      return

    const deltaYaw = message.mouseDeltaX * LOOK_SENSITIVITY + message.touchLookDeltaX
    const deltaPitch = message.mouseDeltaY * LOOK_SENSITIVITY + message.touchLookDeltaY
    if (deltaYaw === 0 && deltaPitch === 0)
      return

    target.lookYawOffset += deltaYaw
    target.lookPitchOffset = clamp(target.lookPitchOffset + deltaPitch, { min: -LOOK_PITCH_LIMIT, max: LOOK_PITCH_LIMIT })
    target.lookIdle = 0
  }

  /** 目前的鏡位，除錯與驗證用 */
  function getShotId(): ShotId | null {
    return session?.shotId ?? null
  }

  /** 目前的視線設定，除錯與驗證用（量構圖偏離） */
  function getGaze(): Gaze | null {
    return session?.gaze ?? null
  }

  return { start, stop, abort, applyLook, isDrifting, getPhase, getShotId, getGaze }
}
