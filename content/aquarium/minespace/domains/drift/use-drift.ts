import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { useFpsController } from '../../composables/use-fps-controller'
import type { RealmDefinition } from '../realm/realm-definition'
import type { RenderInputMessage } from '../render-host/protocol'
import type { LookBias, LookInterest } from './drift-framing'
import type { DriftEmitter, DriftPoint } from './drift-point'
import type { AngleFollower, Gaze, GazeContext, ShotId, SpeedFollower, SpeedLimit } from './drift-shot'
import type { DriftTrack, DriftTrackSample } from './drift-track'
import { clamp } from 'remeda'
import { checkOverlap, PLAYER_EYE_HEIGHT } from '../player/collision'
import { getDayPhase } from '../weather/day-night'
import { buildFlightTrack, chooseFlightRoute } from './drift-flight'
import { getDriftFlight, getDriftRegion } from './drift-flight-config'
import { chooseLookYaw, getBiasFactor, isSightlineClear, isSightlineClear3D, measureOpenness, measureOpennessAt, measureView, probeViewDistance3D } from './drift-framing'
import { createDriftGrid } from './drift-grid'
import { collectReachableSet, PATH_SAMPLE_SPACING, planArcPath, planWalkPath } from './drift-path'
import { collectDriftPoint, findLoudestEmitter, findReachableSpot, listDriftEmitter } from './drift-point'
import {
  ANTICIPATE_SECOND,
  CRANE_HEIGHT_RANGE,
  CRANE_MOVE_SECOND,
  CRANE_PEAK_HOLD_RANGE,
  DOLLY_RELEASE_RANGE,
  followAngle,
  followSpeed,
  GAZE_LIMIT_MAP,
  ORBIT_ARC_MAX,
  ORBIT_RADIUS_RANGE,
  ORBIT_SPEED,
  ORBIT_SWEEP_RANGE,
  PAN_BEAT_RANGE,
  PAN_RATE_RANGE,
  PAN_SWEEP_MAX,
  pickShot,
  resolveGaze,
  smoothRatio,
  softMin,
  THIRDS_OFFSET,
  TRACK_SHOT_SECOND_RANGE,
  TRUCK_ANGLE_RANGE,
  TRUCK_DRIFT_RANGE,
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

/**
 * 散步與飛行的巡航速度（格／秒）
 *
 * 節奏是風景縮時攝影：長長的、穩定的一個運動，不是趕路。一格約一公尺，散步每秒一格、飛行二點五格是慢慢滑過去，
 * 畫面的主角是天空、雲與光線的變化，不是鏡頭本身。速度只在一段運動的頭尾緩緩收放，中間不忽快忽慢
 */
const WALK_SPEED = 1
const FLY_SPEED = 2.5
/**
 * 加速、減速（格／秒平方）與加加速度（格／秒立方）上限：速度是 S 形漸漸帶起來、漸漸收掉
 * （見 followSpeed），起步與煞停的那一刻加速度是零，不是瞬間跳到某個值
 */
const WALK_ACCELERATION = 0.3
const FLY_ACCELERATION = 0.3
const WALK_DECELERATION = 0.4
const FLY_DECELERATION = 0.4
const WALK_JERK = 0.25
const FLY_JERK = 0.25
/** 接近終點時的煞停（格／秒平方）與圓角寬度（格／秒）：用 √(2ad) 的上限收到終點，交會處是圓角 */
const WALK_STOP_DECELERATION = 0.35
const FLY_STOP_DECELERATION = 0.4
const STOP_BLEND_WIDTH = 0.35
/** 抵達時的最低速度（格／秒）：速度曲線在終點收成零會永遠到不了，這個速度小到看不出，也沒有急停 */
const ARRIVE_SPEED_FLOOR = 0.05
/** 到終點的剩餘距離小於這個就算抵達 */
const ARRIVE_DISTANCE = 0.01
/** 停留時繞景物走弧的移動參數：比散步更慢更輕 */
const ORBIT_ACCELERATION = 0.2
const ORBIT_DECELERATION = 0.25
const ORBIT_JERK = 0.15
const ORBIT_STOP_DECELERATION = 0.25
/**
 * 視線還沒轉到鏡位要看的方向時放慢身體（弧度）：看向差多少、速度降到最低，以及最低是幾成
 *
 * 所有鏡位都適用——一邊快速平移一邊大幅轉頭最容易讓人頭暈，轉頭的時候腳步放慢，轉完再提速
 */
const TURN_SLOWDOWN_ANGLE = 0.5
const TURN_SPEED_FLOOR = 0.3
/**
 * 起步時鏡頭高度與軌道高度的落差，用 S 曲線在這段時間（秒）內收掉
 *
 * 落差越大收得越久（每公尺五秒，最短二點五、最長八秒），垂直速度不超過每秒零點三格。
 * 以前用指數收斂：第一幀的垂直速度就是落差除以時間常數，起步像被拉了一把
 */
const HEIGHT_OFFSET_SECOND_MIN = 2.5
const HEIGHT_OFFSET_SECOND_MAX = 8
const HEIGHT_OFFSET_SECOND_PER_BLOCK = 5

/**
 * 停留時間（秒）
 *
 * 停留是「定格的縮時」：一個運動結束，鎖定構圖看八到十六秒（只有幾乎看不出的慢漂），再開始下一個運動。
 * 日出日落與開闊的景點偶爾久一點（二十到三十秒），那幾次會有繞弧或升降，不是站著不動
 */
const LINGER_MIN = 8
const LINGER_MAX = 16
const LINGER_LONG_MIN = 16
const LINGER_LONG_MAX = 24
/** 抵達開闊景點時改成長停留的機率 */
const LINGER_VISTA_CHANCE = 0.25
/** 日出日落時的停留（秒） */
const LINGER_GOLDEN_MIN = 20
const LINGER_GOLDEN_MAX = 30
/** 飛行落地後的短暫停留（秒） */
const LINGER_AFTER_FLIGHT_MIN = 8
const LINGER_AFTER_FLIGHT_MAX = 12
/** 剛開始神遊的停留（秒），給介面淡出與眼睛適應 */
const LINGER_START_MIN = 4
const LINGER_START_MAX = 7
/** 找不到下一站時等多久再試（秒）：馬上重算，不在原地乾等 */
const REPLAN_DELAY = 3

/** 視線偏好（往外／往內）：離中心至少這麼遠才有「外」的方向，偏好的強度（零到一） */
const LOOK_BIAS_CENTER_RADIUS_MIN = 6
const LOOK_BIAS_STRENGTH = 0.7
/** 看哪裡：正前方至少要有幾格縱深（不然是一面牆），音源與停留點被擋住時不當景物 */
const LOOK_MIN_DEPTH = 12
/** 看向景物的最近距離（格）：再近畫面會被一個東西塞滿 */
const SUBJECT_DISTANCE_MIN = 8
/** 視線俯仰的範圍（弧度，正值往下看）：走路 -十度到 +二十度，飛行 零到 +二十八度 */
const WALK_PITCH_RANGE: readonly [number, number] = [-0.17, 0.35]
const FLY_PITCH_RANGE: readonly [number, number] = [0, 0.5]

/** 下一站的距離偏好：太近太遠都扣分（格） */
const STOP_IDEAL_DISTANCE = 80
const STOP_DISTANCE_SIGMA = 50
const STOP_DISTANCE_MIN = 14
/** 特色主體的觀賞站位被選為下一站的加權（乘上主體的 weight）：路線優先去看得到特色的地方 */
const FEATURE_DESTINATION_BONUS = 4
/** 最近去過的幾站大幅降權 */
const RECENT_STOP_COUNT = 5
const RECENT_STOP_WEIGHT = 0.08
/** 一次最多試幾個候選站 */
const PLAN_ATTEMPT_MAX = 8
/** 軌道至少多長才值得走 */
const TRACK_LENGTH_MIN = 8

/** 運鏡：停留要多長才做繞弧與升降（秒）、繞弧開始前先停多久（秒）、側面景物的偏角範圍（弧度）與距離（格） */
const ORBIT_DURATION_MIN = 18
const MOTION_START_DELAY = 2
const SIDE_SUBJECT_ANGLE_RANGE: readonly [number, number] = [1.05, 1.75]
const SIDE_SUBJECT_DISTANCE_RANGE: readonly [number, number] = [10, 90]
/** 看向景物時瞄準的高度：離地多高（格） */
const SUBJECT_HEIGHT = 1.3
/** 日出日落時橫搖朝向太陽那一側，速度取範圍裡慢的一端再打折 */
const GOLDEN_PAN_RATE_RATIO = 0.5
/** 量路徑拐彎程度的取樣間隔（格）；走直線的鏡位（看前進方向）在鋸齒小徑上權重要降，免得視線跟著小彎一路轉 */
const CURVINESS_STEP = 2
const FOLLOW_CURVINESS_SCALE = 6
/** 線狀主體最多取幾個點當看點 */
const FEATURE_PATH_SAMPLE_MAX = 8
/** 側移與視差：貼臉前景（會頻閃）的取樣比例上限、視差要有的前景比例下限 */
const NEAR_FOREGROUND_MAX = 0.1
/** 側移時畫面中央被擋住（十格內有東西，含坡面）的取樣比例上限：峽谷裡側面就是山壁，幾乎都不合格 */
const TRUCK_BLOCKED_MAX = 0.15
/** 往外看的場景，視線俯仰的下限（弧度，正值往下看）：不抬頭看迎面的坡 */
const OUTWARD_PITCH_MIN = 0.02
const PARALLAX_FOREGROUND_MIN = 0.2
/** 切鏡位時，視線要轉多大的角度權重就剩一半左右（弧度）：不選要大幅轉頭的鏡位 */
const SHOT_TURN_SCALE = 1.8
/** 停留尾聲轉向下一段路的方向，看軌道第幾個取樣點的切線 */
const ANTICIPATE_LOOKAHEAD_SAMPLE = 8

/** 兩次飛行之間隔多久（秒），第一次提早一點 */
const FLIGHT_INTERVAL_MIN = 420
const FLIGHT_INTERVAL_MAX = 720
const FLIGHT_FIRST_MIN = 150
const FLIGHT_FIRST_MAX = 300

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
/** 降落時落點離正下方多遠（格）以上算要橫著挪；橫移的速度（格／秒）、水平段佔多少比例、高度從哪個進度才開始降 */
const SETTLE_LATERAL_MIN = 1
const SETTLE_LATERAL_SPEED = 2.2
const SETTLE_HORIZONTAL_SHARE = 0.65
const SETTLE_VERTICAL_START = 0.3
/** 起飛前檢查身體左右各多遠（格）碰到的格子是不是都露天 */
const TAKEOFF_PROBE_OFFSET_LIST = [-0.3, 0.3]
/** 降落找落點時離原位最多往外找幾格 */
const SETTLE_SEARCH_RADIUS = 14
/** 結束時交給控制器的腳底最多比站立面高多少，剩下的交給重力，不會突然下沉 */
const HANDBACK_HEIGHT_MAX = 0.4
/** 交還的位置卡進方塊時往格子中心退的比例（由小到大，最後一個是整個退到中心） */
const HANDBACK_RETREAT_RATIO_LIST = [0.4, 0.7, 1]
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
interface MotionParam extends SpeedLimit {
  cruise: number;
  /** 接近終點的煞停加速度 */
  stopDeceleration: number;
}

const WALK_MOTION: MotionParam = { cruise: WALK_SPEED, acceleration: WALK_ACCELERATION, deceleration: WALK_DECELERATION, jerk: WALK_JERK, stopDeceleration: WALK_STOP_DECELERATION }
const FLY_MOTION: MotionParam = { cruise: FLY_SPEED, acceleration: FLY_ACCELERATION, deceleration: FLY_DECELERATION, jerk: FLY_JERK, stopDeceleration: FLY_STOP_DECELERATION }
const ORBIT_MOTION: MotionParam = { cruise: ORBIT_SPEED, acceleration: ORBIT_ACCELERATION, deceleration: ORBIT_DECELERATION, jerk: ORBIT_JERK, stopDeceleration: ORBIT_STOP_DECELERATION }

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
  /** 停留時繞景物走的弧與升降的設定，沒有就是 null */
  motionTrack: DriftTrack | null;
  motionDistance: number;
  motionSpeed: number;
  /** 沿軌道速度的加速度（速度 S 形變化用的狀態）；motion 是停留時繞弧的那一份 */
  motionAcceleration: number;
  motionStartAt: number;
  /** 升降的時程（停留經過的秒數）：開始升、開始降、全部結束 */
  crane: { height: number; startAt: number; downAt: number; endAt: number } | null;
  /** 停留現在這一段在做什麼；一段做完才換下一段（見 updateLingerBeat） */
  lingerBeat: { kind: 'hold' | 'pan' | 'orbit' | 'crane' | 'anticipate'; endAt: number };
  /** 這次停留橫搖的方向：同一次停留裡一路往同一個方向，不來回掃 */
  panSign: 1 | -1;
  /** 上一段散步／飛行的鏡位與上一次停留的開頭，不連續重複 */
  lastTrackShotId: ShotId | null;
  lastLingerShotId: ShotId | null;
  /** 這一趟換鏡位的軌道距離，與下一個要換的是第幾個 */
  shotCutList: number[];
  shotCutIndex: number;

  track: DriftTrack | null;
  trackDistance: number;
  speed: number;
  speedAcceleration: number;
  /** 視線離鏡位想看的方向還差多少（弧度，取絕對值），身體據此放慢 */
  gazeYawError: number;
  /** 軌道起點與鏡頭實際高度的落差，隨時間收掉 */
  heightOffset: number;
  /** 高度落差收掉的進度：起始落差、已經過幾秒、總共幾秒（S 曲線，起頭與收尾的垂直速度都是零） */
  heightOffsetStart: number;
  heightOffsetElapsed: number;
  heightOffsetSecond: number;

  lingerElapsed: number;
  lingerDuration: number;
  nextPlan: NextPlan | null;
  /** 目前待在哪個停留點，起步時是 null */
  currentPoint: DriftPoint | null;
  recentIdList: string[];
  /** 隨意環顧（free 視線）的目標 */
  lookTargetYaw: number;
  lookTargetPitch: number;
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
  settle: { fromX: number; fromZ: number; fromEyeY: number; toX: number; toZ: number; toEyeY: number; lateral: number; duration: number; elapsed: number } | null;
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
  const sample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }
  /** 規劃鏡位時查軌道用，與每幀的 sample 分開，免得互相蓋掉 */
  const scratch: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }
  const probeSample: DriftTrackSample = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, curveScale: 1, speedCap: 99 }

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
        const base = (Math.exp(-(((distance - STOP_IDEAL_DISTANCE) / STOP_DISTANCE_SIGMA) ** 2)) + 0.03) * (1 + (point.feature?.weight ?? 0) * FEATURE_DESTINATION_BONUS)
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

    /**
     * 垂直升起的那一柱要乾淨
     *
     * 繞弧之後停在格子邊緣時，只查腳下那一格會漏掉隔壁：鏡頭貼著隔壁的樹葉往上升。
     * 身體左右各零點三格碰到的格子都要露天；停在格子中心（一般的停留點）時只會碰到自己那一格
     */
    for (const offsetX of TAKEOFF_PROBE_OFFSET_LIST) {
      for (const offsetZ of TAKEOFF_PROBE_OFFSET_LIST) {
        const neighbor = target.grid.getCellNear(Math.round(target.x + offsetX), Math.round(target.z + offsetZ), here.blockY)
        if (!neighbor?.isOpenSky)
          return null
      }
    }

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
    target.speedAcceleration = 0
    target.track = null
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

  /** 重設高度落差：接續時鏡頭與軌道起點的高度差，之後慢慢收掉，沒有跳動 */
  function setHeightOffset(target: DriftSession, offset: number) {
    target.heightOffset = offset
    target.heightOffsetStart = offset
    target.heightOffsetElapsed = 0
    target.heightOffsetSecond = clamp(Math.abs(offset) * HEIGHT_OFFSET_SECOND_PER_BLOCK, { min: HEIGHT_OFFSET_SECOND_MIN, max: HEIGHT_OFFSET_SECOND_MAX })
  }

  function startTrack(target: DriftSession, plan: NextPlan) {
    target.track = plan.track
    target.trackDistance = 0
    target.speed = 0
    target.speedAcceleration = 0
    target.stuckClock = 0
    target.stuckX = target.x
    target.stuckY = target.eyeY
    target.stuckZ = target.z
    target.motionTrack = null
    target.crane = null
    target.craneY = 0
    /** 軌道起點與鏡頭實際位置的高度差慢慢收掉，接續時沒有跳動 */
    setHeightOffset(target, target.eyeY - itemAt(plan.track.yList, 0))
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

  /** 這一段軌道中點附近，在側面（約六十到一百度）的景物：停留點或音源 */
  function findSideSubject(target: DriftSession, track: DriftTrack, midDistance: number): { x: number; z: number; y: number } | null {
    sampleDriftTrack(track, midDistance, scratch)
    const { x: midX, y: midY, z: midZ, yaw: heading } = scratch

    /** 特色主體排第一：視差與側移要「看著」的東西，優先是溪、瀑布、建物，不是任一個停留點 */
    const featureList = (target.realm.driftFeatureList ?? []).flatMap((feature) => {
      const pathList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : [feature]
      return pathList.map((point) => ({ x: point.x, z: point.z, y: point.y, weight: 1 + feature.weight * 6, near: feature.viewDistance[0] * 0.6, far: feature.viewDistance[1] * 1.6 }))
    })
    const candidateList: { x: number; z: number; y: number; weight: number; near: number; far: number }[] = [
      ...featureList,
      ...target.pointList.map((point) => ({ x: point.blockX, z: point.blockZ, y: point.footY + SUBJECT_HEIGHT, weight: 0.3, near: SIDE_SUBJECT_DISTANCE_RANGE[0], far: SIDE_SUBJECT_DISTANCE_RANGE[1] })),
      ...target.emitterList.map((emitter) => ({ x: emitter.x, z: emitter.z, y: midY - 0.4, weight: 0.1, near: SIDE_SUBJECT_DISTANCE_RANGE[0], far: SIDE_SUBJECT_DISTANCE_RANGE[1] })),
    ].filter((candidate) => {
      const distance = Math.hypot(candidate.x - midX, candidate.z - midZ)
      if (distance < Math.max(SUBJECT_DISTANCE_MIN, candidate.near) || distance > candidate.far)
        return false

      const side = Math.abs(diffAngle(Math.atan2(candidate.x - midX, candidate.z - midZ), heading))
      return side >= SIDE_SUBJECT_ANGLE_RANGE[0] && side <= SIDE_SUBJECT_ANGLE_RANGE[1]
    })

    let pick = Math.random() * candidateList.reduce((sum, candidate) => sum + candidate.weight, 0)
    for (const candidate of candidateList) {
      pick -= candidate.weight
      if (pick <= 0)
        return candidate
    }
    return candidateList[candidateList.length - 1] ?? null
  }

  /**
   * 這一趟要在哪些軌道距離換鏡位
   *
   * 一個鏡位連拍一分鐘會膩，也沒有「運鏡」的樣子：每段約十一到二十秒，切成幾段各抽一個鏡位。
   * 切點挑在附近最平直（速度上限最高）的地方，換鏡位時視線的變化不會疊在轉彎上
   */
  function planShotCutList(track: DriftTrack, cruise: number): number[] {
    const averageSecond = (TRACK_SHOT_SECOND_RANGE[0] + TRACK_SHOT_SECOND_RANGE[1]) / 2
    const segmentCount = Math.max(1, Math.round(track.length / (cruise * 0.8) / averageSecond))
    const cutList: number[] = []

    for (let index = 1; index < segmentCount; index++) {
      const ideal = (track.length * index) / segmentCount
      const reach = (track.length / segmentCount) * 0.25
      let best = ideal
      let bestCap = -1
      /** 從理想位置往兩側找，最平直的取；一樣平直（速度上限相同）就留離理想位置近的 */
      for (let offset = 0; offset <= reach; offset += PATH_SAMPLE_SPACING * 2) {
        for (const sign of [1, -1]) {
          const distance = ideal + offset * sign
          const cap = itemAt(track.speedCapList, clamp(Math.round(distance / PATH_SAMPLE_SPACING), { min: 0, max: track.speedCapList.length - 1 }))
          if (cap > bestCap + 1e-6) {
            bestCap = cap
            best = distance
          }
        }
      }
      cutList.push(best)
    }
    return cutList
  }

  /** 軌道上某一點的前進方向 */
  function getHeadingAt(track: DriftTrack, distance: number): number {
    sampleDriftTrack(track, distance, probeSample)
    return probeSample.yaw
  }

  /** 這一段路拐彎的程度：每格路平均轉多少弧度（直路接近零，鋸齒小徑很大） */
  function measureCurviness(track: DriftTrack, startDistance: number, endDistance: number): number {
    let total = 0
    let previous = getHeadingAt(track, startDistance)
    for (let distance = startDistance + CURVINESS_STEP; distance <= endDistance; distance += CURVINESS_STEP) {
      const heading = getHeadingAt(track, distance)
      total += Math.abs(diffAngle(heading, previous))
      previous = heading
    }
    return total / Math.max(CURVINESS_STEP, endDistance - startDistance)
  }

  /**
   * 構圖的俯仰：地平線落在畫面三分線上（縮時攝影的主角是天空與光）
   *
   * 走路時開闊處略微仰起，天空佔上面三分之二（日出日落與夜晚更多）；樹林裡水平看。
   * 飛行時略微低頭，地平線在上三分之一，看得到大地與雲影；日出日落與夜晚平視，天空佔滿
   */
  function getCompositionPitch(isFly: boolean, openness: number, isOutward = false): number {
    const isSkyShot = isGoldenHour() || getDayRatio() <= 0.5
    /** 站在高處往外看：微微低頭，視線越過邊緣落在雲海與遠方，地平線在上三分之一；不仰頭看近處的坡與峰頂 */
    if (isOutward)
      return isFly ? 0.18 : 0.1
    if (isFly)
      return isSkyShot ? 0.03 : 0.12
    if (openness < 0.45)
      return 0
    return isSkyShot ? -0.14 : -0.08
  }

  /**
   * 散步與飛行的一段鏡位
   *
   * 每個鏡位先備好「這一段做得出來嗎、畫面裡有沒有東西可看」，做不出來的根本不進候選：
   * 側移要側面沒有貼臉的樹幹（會頻閃）、正前方不被牆塞滿；視差要正中央看得到景物、畫面邊緣真的有前景掠過；
   * 拉遠揭露要身後看得遠；看向目的地只在最後一段，而且看得到它。
   * 再依「從現在的視線轉過去要多大幅度」與「是不是和上一段一樣」調整權重：
   * 鏡位之間接得起來（先正面、再側移、再回頭，往同一個方向慢慢轉），不會前一秒看前面、下一秒看身後
   */
  function beginTrackShot(target: DriftSession, plan: NextPlan, startDistance: number, endDistance: number, isLast: boolean) {
    const { track } = plan
    const isFly = plan.kind === 'fly'
    sampleDriftTrack(track, startDistance, scratch)
    const context: GazeContext = { ...createGazeContext(target), pathYaw: scratch.yaw, pathPitch: scratch.pitch, elapsed: 0 }
    const thirds = THIRDS_OFFSET * randomSign()
    const openness = measureOpenness(target.worldState, track, startDistance, endDistance)
    const isOpen = openness > 0.6
    const candidateMap = new Map<ShotId, { gaze: Gaze; fit: number }>()

    /** 看前進方向：最平常，林子裡更適合（視線不被側面的樹幹拉走） */
    const isOutward = target.realm.driftLookBias === 'outward'
    const compositionPitch = getCompositionPitch(isFly, openness, isOutward)
    const lookBias = getLookBias(target)
    const curviness = measureCurviness(track, startDistance, endDistance)
    const aheadView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'offset', offset: 0 }, compositionPitch)
    candidateMap.set('follow', {
      gaze: isFly ? { kind: 'heading' } : { kind: 'heading', pitch: compositionPitch, minPitch: isOutward ? OUTWARD_PITCH_MIN : undefined },
      fit: (openness < 0.45 ? 2 : 1) * Math.exp(-curviness * FOLLOW_CURVINESS_SCALE) * (1 - aheadView.blockedFraction * 0.7),
    })

    /** 看向目的地：只在最後一段，目的地大致在前方、夠遠、而且看得到它 */
    /** 目的地是為了欣賞某個特色主體而設的站位，就一路看著那個主體走過去，不是看著站位本身 */
    const subjectPoint = plan.destination.feature
      ? { x: plan.destination.feature.x, y: plan.destination.feature.y, z: plan.destination.feature.z }
      : { x: plan.destination.blockX, y: plan.destination.footY + SUBJECT_HEIGHT, z: plan.destination.blockZ }
    const destinationDistance = Math.hypot(subjectPoint.x - target.x, subjectPoint.z - target.z)
    const bearing = Math.atan2(subjectPoint.x - target.x, subjectPoint.z - target.z)
    if (isLast && destinationDistance >= SUBJECT_DISTANCE_MIN && Math.abs(diffAngle(bearing, scratch.yaw)) <= 1) {
      const destinationView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'point', x: subjectPoint.x, z: subjectPoint.z }, compositionPitch)
      if (destinationView.blockedFraction <= 0.5) {
        candidateMap.set('dollyIn', {
          gaze: {
            kind: 'subject',
            x: subjectPoint.x,
            y: subjectPoint.y,
            z: subjectPoint.z,
            thirds,
            behind: false,
            releaseRange: DOLLY_RELEASE_RANGE,
          },
          fit: openness < 0.45 ? 1.8 : 1,
        })
      }
    }

    /**
     * 側移（滑軌）：鎖定世界裡的一個方向，鏡頭平移、構圖不變，只有每秒一兩度的慢漂（朝前進方向，前方留著去路）。
     * 兩側都量一下，挑貼臉前景少的那一側；兩側都有貼臉的樹、或正前方老被擋住就不用
     */
    const truckOffset = randomBetween(TRUCK_ANGLE_RANGE[0], TRUCK_ANGLE_RANGE[1])
    const midHeading = getHeadingAt(track, (startDistance + endDistance) / 2)
    const leftYaw = midHeading - truckOffset
    const rightYaw = midHeading + truckOffset
    const leftView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'yaw', yaw: leftYaw }, compositionPitch)
    const rightView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'yaw', yaw: rightYaw }, compositionPitch)
    const truckSign = leftView.nearFraction === rightView.nearFraction ? randomSign() : leftView.nearFraction < rightView.nearFraction ? -1 : 1
    const truckView = truckSign === -1 ? leftView : rightView
    if (truckView.nearFraction <= NEAR_FOREGROUND_MAX && truckView.blockedFraction <= TRUCK_BLOCKED_MAX) {
      candidateMap.set('truck', {
        gaze: {
          kind: 'pan',
          baseYaw: truckSign === -1 ? leftYaw : rightYaw,
          rate: -truckSign * randomBetween(TRUCK_DRIFT_RANGE[0], TRUCK_DRIFT_RANGE[1]),
          pitch: compositionPitch,
        },
        fit: isOpen ? 1.5 : 0.7,
      })
    }

    /** 拉遠揭露：回頭看來處，身後要看得遠才有風景可揭 */
    const backView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'offset', offset: Math.PI }, compositionPitch)
    if (backView.blockedFraction <= 0.25) {
      candidateMap.set('pullBack', {
        gaze: { kind: 'subject', x: target.x, y: target.eyeY - 0.6, z: target.z, thirds, behind: true },
        fit: isOpen ? 1.5 : 0.5,
      })
    }

    /** 視差：固定一個側面的景物，正中央看得到它、畫面邊緣有前景（樹與石柱）掠過，而且不貼臉 */
    const side = findSideSubject(target, track, (startDistance + endDistance) / 2)
    if (side) {
      const sideView = measureView(target.worldState, track, startDistance, endDistance, { kind: 'point', x: side.x, z: side.z }, compositionPitch)
      if (sideView.clearFraction >= 0.5 && sideView.foregroundFraction >= PARALLAX_FOREGROUND_MIN && sideView.nearFraction <= NEAR_FOREGROUND_MAX) {
        candidateMap.set('parallax', {
          gaze: { kind: 'subject', x: side.x, y: side.y, z: side.z, thirds: thirds * 0.6, behind: false },
          fit: 1 + sideView.foregroundFraction * 3,
        })
      }
    }

    const shot = pickShot(
      plan.kind,
      (id) => candidateMap.has(id),
      (id) => {
        const candidate = candidateMap.get(id)
        if (!candidate || id === target.lastTrackShotId)
          return 0

        /** 從現在的視線轉到這個鏡位的起始方向越遠越不選：大幅轉頭要放慢腳步，轉得多就是一段爬行 */
        const view = resolveGaze(candidate.gaze, context)
        const turn = Math.abs(diffAngle(view.yaw, target.yawFollower.value))
        return candidate.fit * (Math.exp(-((turn / SHOT_TURN_SCALE) ** 2)) + 0.03) * getBiasFactor(lookBias, view.yaw)
      },
    )

    const shotId: ShotId = candidateMap.has(shot.id) ? shot.id : 'follow'
    target.lastTrackShotId = shotId
    setShot(target, shotId, candidateMap.get(shotId)?.gaze ?? { kind: 'heading' })
  }

  /** 一趟開始：算好切點，第一段鏡位 */
  function startTrackShot(target: DriftSession, plan: NextPlan) {
    target.shotCutList = planShotCutList(plan.track, plan.kind === 'fly' ? FLY_SPEED : WALK_SPEED)
    target.shotCutIndex = 0
    beginTrackShot(target, plan, 0, target.shotCutList[0] ?? plan.track.length, target.shotCutList.length === 0)
  }

  /** 走到切點就換下一段鏡位 */
  function updateTrackShot(target: DriftSession, plan: NextPlan) {
    const cut = target.shotCutList[target.shotCutIndex]
    if (cut === undefined || target.trackDistance < cut)
      return

    target.shotCutIndex++
    const next = target.shotCutList[target.shotCutIndex]
    beginTrackShot(target, plan, cut, next ?? plan.track.length, next === undefined)
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

  /** 停留的開頭是不是日出日落 */
  function isGoldenHour(): boolean {
    const dayPhase = getDayPhase(getTimeOfDay())
    return dayPhase === 'sunrise' || dayPhase === 'sunset'
  }

  /** 太陽那一側的方向（弧度），算不出就是 null */
  function getSunYaw(): number | null {
    const sun = getSunDirection()
    return Math.hypot(sun.x, sun.z) > 0.01 ? Math.atan2(sun.x, sun.z) : null
  }

  /**
   * 看得到、夠遠的景物
   *
   * 音源常常藏在岩石裡、水底或樹冠背後，直接當瞄準點會看到一面牆或一片空無。
   * 這裡只留「從這裡水平看過去中間沒被擋、而且離得夠遠（不然畫面被一個東西塞滿）」的
   */
  function findVisibleSubject(target: DriftSession): { x: number; z: number } | null {
    const subject = findLingerSubject(target)
    if (!subject)
      return null
    if (Math.hypot(subject.x - target.x, subject.z - target.z) < SUBJECT_DISTANCE_MIN)
      return null
    return isSightlineClear(target.worldState, target.x, target.eyeY, target.z, subject.x, subject.z) ? subject : null
  }

  /**
   * 特色主體換成看點清單
   *
   * 線狀的主體（溪流、木棧、長廊）取幾個點沿線排開；距離落在 viewDistance 內才算全價，
   * 太近（畫面被塞滿）略過，太遠打折。方向上看不看得到由 chooseLookYaw 的射線判斷
   */
  function listFeatureInterest(target: DriftSession): LookInterest[] {
    const interestList: LookInterest[] = []
    for (const feature of target.realm.driftFeatureList ?? []) {
      const pathList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : [feature]
      const step = Math.max(1, Math.ceil(pathList.length / FEATURE_PATH_SAMPLE_MAX))
      for (let index = 0; index < pathList.length; index += step) {
        const point = itemAt(pathList, index)
        const distance = Math.hypot(point.x - target.x, point.z - target.z)
        if (distance < SUBJECT_DISTANCE_MIN)
          continue

        const [near, far] = feature.viewDistance
        const bandRatio = distance >= near * 0.6 && distance <= far * 1.6 ? 1 : 0.35
        interestList.push({ x: point.x, y: point.y, z: point.z, weight: (0.5 + feature.weight * 1.5) * bandRatio })
      }
    }
    return interestList
  }

  /**
   * 環顧時挑一個值得看的方向
   *
   * 環繞一圈探縱深，擋在八格內的方向淘汰；有景物（最響的音源、其他音源、停留點、日出日落的太陽）
   * 而且視線沒被擋的方向加分；離目前視線近的優先。一個方向都不合格就看下一段路的方向，再不然維持原樣
   */
  function chooseLingerView(target: DriftSession, isNearCurrent = false): { yaw: number; pitch: number } {
    /** 特色主體（溪、瀑布、建物、遠景…）是主要的看點；音源與停留點只是弱弱的偏向，而且要看得到才算 */
    const interestList: LookInterest[] = listFeatureInterest(target)
    const loudest = findLingerSubject(target)
    if (loudest)
      interestList.push({ x: loudest.x, z: loudest.z, weight: 0.3 })
    for (const emitter of target.emitterList)
      interestList.push({ x: emitter.x, z: emitter.z, weight: 0.1 })
    for (const point of target.pointList)
      interestList.push({ x: point.blockX, z: point.blockZ, weight: 0.15 })
    const sunYaw = isGoldenHour() ? getSunYaw() : null
    if (sunYaw !== null)
      interestList.push({ x: target.x + Math.sin(sunYaw) * 100, z: target.z + Math.cos(sunYaw) * 100, weight: 1.2 })

    const basePitch = getLingerPitch(target)
    const chosen = chooseLookYaw(target.worldState, target.x, target.eyeY, target.z, {
      currentYaw: target.yawFollower.value,
      interestList,
      minDepth: LOOK_MIN_DEPTH,
      turnScale: isNearCurrent ? 0.9 : 1.6,
      pitch: basePitch,
      bias: getLookBias(target),
    })
    if (chosen) {
      /** 看的是有高度的主體（瀑布頂、溪面、雲海）就把俯仰對準它，構圖俯仰佔兩成 */
      const { interest } = chosen
      if (interest?.y !== undefined) {
        const distance = Math.max(1, Math.hypot(interest.x - target.x, interest.z - target.z))
        return { yaw: chosen.yaw, pitch: Math.atan2(target.eyeY - interest.y, distance) * 0.8 + basePitch * 0.2 }
      }
      return { yaw: chosen.yaw, pitch: basePitch }
    }

    const plan = target.nextPlan
    return {
      yaw: plan ? itemAt(plan.track.yawList, Math.min(plan.track.yawList.length - 1, ANTICIPATE_LOOKAHEAD_SAMPLE)) : target.yawFollower.value,
      pitch: basePitch,
    }
  }

  /**
   * 場景的視線偏好：往外（離開中心）或往內
   *
   * 站得高的場景（雪稜）要越過邊緣往外看；沒設就是沒有偏好。中心取神遊範圍的圓心，站在中心附近時方向不定義，不套用
   */
  function getLookBias(target: DriftSession): LookBias | undefined {
    const bias = target.realm.driftLookBias
    if (bias !== 'outward' && bias !== 'inward')
      return undefined

    const region = getDriftRegion(target.realm)
    if (!region || Math.hypot(target.x - region.x, target.z - region.z) < LOOK_BIAS_CENTER_RADIUS_MIN)
      return undefined

    const awayYaw = Math.atan2(target.x - region.x, target.z - region.z)
    return { yaw: bias === 'outward' ? awayYaw : awayYaw + Math.PI, strength: LOOK_BIAS_STRENGTH }
  }

  /**
   * 停留的開頭鏡位
   *
   * 繞弧要有看得到的景物、停留夠長、而且弧線上每一點都走得到（planArcPath 會在站不住的地方截斷）；
   * 升降要頭頂是開闊的、停留夠長。條件不成立的鏡位根本不會被抽到。
   * 平常的停留只有六到十四秒：開頭一段橫搖或定格，尾聲轉向下一段路；
   * 日出日落與開闊景點的長停留才會有繞弧或升降
   */
  function startLingerShot(target: DriftSession) {
    target.motionTrack = null
    target.crane = null
    target.craneY = 0
    target.panSign = randomSign()
    const duration = target.lingerDuration
    const subject = findVisibleSubject(target)
    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    const footY = target.eyeY - PLAYER_EYE_HEIGHT
    const usableDuration = duration - ANTICIPATE_SECOND

    let orbitTrack: DriftTrack | null = null
    if (subject && duration >= ORBIT_DURATION_MIN) {
      const distance = Math.hypot(subject.x - target.x, subject.z - target.z)
      if (distance >= ORBIT_RADIUS_RANGE[0] && distance <= ORBIT_RADIUS_RANGE[1]) {
        /** 掃過的角度有上限：半徑小的時候同樣的弧長會繞掉大半圈，景物在畫面裡轉得太快 */
        const arcLength = Math.min(
          ORBIT_ARC_MAX,
          distance * randomBetween(ORBIT_SWEEP_RANGE[0], ORBIT_SWEEP_RANGE[1]),
          (usableDuration - MOTION_START_DELAY - 3) * ORBIT_SPEED * 0.6,
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
    const craneMinDuration = MOTION_START_DELAY + CRANE_MOVE_SECOND * 2 + CRANE_PEAK_HOLD_RANGE[0] + ANTICIPATE_SECOND + 1
    const canCrane = (here?.isOpenSky ?? false) && duration >= craneMinDuration
    const isGolden = isGoldenHour()
    const shot = pickShot(
      'linger',
      (id) => {
        if (id === 'orbit')
          return orbitTrack !== null
        if (id === 'crane')
          return canCrane
        return true
      },
      /** 與上一次停留的開頭不重複；日出日落偏向橫搖（朝太陽那一側） */
      (id) => (id === target.lastLingerShotId ? 0 : id === 'pan' && (isGolden || findPathPan(target) !== null) ? 2 : 1),
    )
    target.lastLingerShotId = shot.id

    const lookTarget = subject ? { x: subject.x, y: footY + SUBJECT_HEIGHT, z: subject.z } : null

    switch (shot.id) {
      case 'orbit':
        if (orbitTrack && lookTarget) {
          target.motionTrack = orbitTrack
          target.motionDistance = 0
          target.motionSpeed = 0
          target.motionAcceleration = 0
          target.motionStartAt = MOTION_START_DELAY
          setShot(target, 'orbit', { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false })
          target.lingerBeat = { kind: 'orbit', endAt: Number.POSITIVE_INFINITY }
          return
        }
        break
      case 'crane': {
        const upAt = MOTION_START_DELAY
        const peakHold = Math.max(0, Math.min(
          randomBetween(CRANE_PEAK_HOLD_RANGE[0], CRANE_PEAK_HOLD_RANGE[1]),
          usableDuration - 1 - upAt - CRANE_MOVE_SECOND * 2,
        ))
        const downAt = upAt + CRANE_MOVE_SECOND + peakHold
        target.crane = {
          height: randomBetween(CRANE_HEIGHT_RANGE[0], CRANE_HEIGHT_RANGE[1]),
          startAt: upAt,
          downAt,
          endAt: downAt + CRANE_MOVE_SECOND,
        }
        setShot(target, 'crane', lookTarget
          ? { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false }
          : { kind: 'pan', baseYaw: chooseLingerView(target, true).yaw, rate: target.panSign * PAN_RATE_RANGE[0], pitch: getLingerPitch(target) })
        target.lingerBeat = { kind: 'crane', endAt: target.crane.endAt }
        return
      }
      case 'pan':
        startPanBeat(target, true)
        return
      default:
        break
    }

    startHoldBeat(target)
  }

  /** 停留的構圖俯仰：依這裡四周的開闊程度 */
  function getLingerPitch(target: DriftSession): number {
    return getCompositionPitch(false, measureOpennessAt(target.worldState, target.x, target.eyeY, target.z), target.realm.driftLookBias === 'outward')
  }

  /**
   * 定格：鎖定構圖看著，不再轉動（縮時攝影的定點定格）
   *
   * 開頭那一段挑一個有東西的方向（最響的音源、停留點、日出日落的太陽，要看得到才算）；
   * 開頭的動作（橫搖、繞弧、升降）做完之後就維持目前的方向不動，直到尾聲轉向下一段路
   */
  function startHoldBeat(target: DriftSession, isLockOff = false) {
    if (isLockOff) {
      target.lookTargetYaw = target.yawFollower.value
      target.lookTargetPitch = target.pitchFollower.value
    }
    else {
      const view = chooseLingerView(target)
      target.lookTargetYaw = view.yaw
      target.lookTargetPitch = view.pitch
    }
    setShot(target, 'hold', { kind: 'free' })
    target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
  }

  /**
   * 線狀的特色主體（溪流、木棧、長廊）：找一條看得到、距離合適的，回傳它的方位與「往較遠的那一端橫搖」的方向
   *
   * 橫搖沿著它掃，像視線順著溪水望出去
   */
  function findPathPan(target: DriftSession): { yaw: number; sign: 1 | -1 } | null {
    let best: { yaw: number; sign: 1 | -1 } | null = null
    let bestScore = 0

    for (const feature of target.realm.driftFeatureList ?? []) {
      const { pathList } = feature
      if (!pathList || pathList.length < 2)
        continue

      for (const point of pathList) {
        const distance = Math.hypot(point.x - target.x, point.z - target.z)
        if (distance < SUBJECT_DISTANCE_MIN || distance > feature.viewDistance[1] * 1.6)
          continue

        const score = feature.weight / (1 + distance / 50)
        if (score <= bestScore || !isSightlineClear3D(target.worldState, target.x, target.eyeY, target.z, point.x, point.y, point.z))
          continue

        const yaw = Math.atan2(point.x - target.x, point.z - target.z)
        const first = itemAt(pathList, 0)
        const last = itemAt(pathList, pathList.length - 1)
        const toFirst = diffAngle(Math.atan2(first.x - target.x, first.z - target.z), yaw)
        const toLast = diffAngle(Math.atan2(last.x - target.x, last.z - target.z), yaw)
        const farther = Math.abs(toLast) > Math.abs(toFirst) ? toLast : toFirst
        bestScore = score
        best = { yaw, sign: farther < 0 ? -1 : 1 }
      }
    }
    return best
  }

  /**
   * 橫搖一小段（掃過約五十度以內）
   *
   * 起點是目前的視線（開頭那一段以有景物的方向為中心，日出日落以太陽為中心）；
   * 掃到的終點正前方被擋住的話換個方向掃，不會一路掃進一面牆
   */
  function startPanBeat(target: DriftSession, isOpener = false) {
    const isGolden = isGoldenHour()
    const sunYaw = isGolden ? getSunYaw() : null
    const rateSize = randomBetween(PAN_RATE_RANGE[0], PAN_RATE_RANGE[1]) * (isGolden ? GOLDEN_PAN_RATE_RATIO : 1)
    const beat = Math.min(randomBetween(PAN_BEAT_RANGE[0], PAN_BEAT_RANGE[1]), PAN_SWEEP_MAX / rateSize)
    const pathPan = isOpener && sunYaw === null ? findPathPan(target) : null
    if (pathPan)
      target.panSign = pathPan.sign
    const center = isOpener ? (sunYaw ?? pathPan?.yaw ?? chooseLingerView(target, true).yaw) : null

    for (let attempt = 0; attempt < 2; attempt++) {
      const rate = rateSize * target.panSign
      const baseYaw = center === null ? target.yawFollower.value : center - rate * beat * 0.5
      const endYaw = baseYaw + rate * beat
      if (probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, endYaw, getLingerPitch(target), LOOK_MIN_DEPTH * 2) >= LOOK_MIN_DEPTH || attempt === 1) {
        setShot(target, 'pan', { kind: 'pan', baseYaw, rate, pitch: getLingerPitch(target) })
        target.lingerBeat = { kind: 'pan', endAt: target.lingerElapsed + beat }
        return
      }
      target.panSign = target.panSign === 1 ? -1 : 1
    }
  }

  /** 停留尾聲：視線先轉向下一段路的方向，起步時畫面已經朝著要走的地方 */
  function startAnticipateBeat(target: DriftSession, plan: NextPlan) {
    const index = Math.min(plan.track.yawList.length - 1, ANTICIPATE_LOOKAHEAD_SAMPLE)
    target.lookTargetYaw = itemAt(plan.track.yawList, index)
    target.lookTargetPitch = 0
    setShot(target, 'hold', { kind: 'free' })
    target.lingerBeat = { kind: 'anticipate', endAt: Number.POSITIVE_INFINITY }
  }

  /* ───────────────────────── 每幀 ───────────────────────── */

  /**
   * 停留的節奏：一段做完就換下一段，不是同一個視線撐到底
   *
   * 開頭的動作（繞弧、升降、橫搖或定格）做完之後，定格與橫搖輪流，每段幾秒；
   * 剩下 ANTICIPATE_SECOND 秒時轉向下一段路的方向（動作還沒結束就等它結束）
   */
  function updateLingerBeat(target: DriftSession) {
    const beat = target.lingerBeat
    if (beat.kind === 'anticipate')
      return

    const elapsed = target.lingerElapsed
    const anticipateAt = target.lingerDuration - ANTICIPATE_SECOND
    if (elapsed >= anticipateAt && target.nextPlan && !target.motionTrack) {
      startAnticipateBeat(target, target.nextPlan)
      return
    }

    const isDone = beat.kind === 'orbit' ? target.motionTrack === null : elapsed >= beat.endAt
    if (!isDone)
      return

    /** 開頭的動作做完：鎖定在目前的方向，直到尾聲 */
    startHoldBeat(target, true)
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

    /** 視線還沒轉到鏡位要看的方向時放慢：邊走邊大幅轉頭最容易頭暈，轉頭時腳步收慢，轉完再提速 */
    const turnFactor = clamp(1 - target.gazeYawError / TURN_SLOWDOWN_ANGLE, { min: TURN_SPEED_FLOOR, max: 1 })
    /** 目標速度：巡航 × 彎道前的減速倍率 × 轉頭倍率，再受軌道本身的速度上限（過彎向心加速度、垂直速度）管 */
    const goal = Math.min(motion.cruise * sample.curveScale * turnFactor, sample.speedCap)

    /** 速度與加速度各自是狀態，追著目標走（S 形的加減速，見 followSpeed）；motion 是停留時繞弧那一份 */
    const follower: SpeedFollower = distanceKey === 'trackDistance'
      ? { value: target.speed, acceleration: target.speedAcceleration }
      : { value: target.motionSpeed, acceleration: target.motionAcceleration }
    followSpeed(follower, goal, deltaTime, motion)
    if (distanceKey === 'trackDistance') {
      target.speed = follower.value
      target.speedAcceleration = follower.acceleration
    }
    else {
      target.motionSpeed = follower.value
      target.motionAcceleration = follower.acceleration
    }

    /** 接近終點：用 √(2ad) 的上限收到終點，交會處是圓角，不是折角；到站時速度只剩一個小到看不出的值 */
    const stopCap = Math.sqrt(2 * motion.stopDeceleration * Math.max(0, remaining))
    const appliedSpeed = follower.value > 0 ? Math.max(ARRIVE_SPEED_FLOOR, softMin(follower.value, stopCap, STOP_BLEND_WIDTH)) : 0
    target[distanceKey] = Math.min(track.length, target[distanceKey] + appliedSpeed * deltaTime)

    sampleDriftTrack(track, target[distanceKey], sample)
    target.x = sample.x
    target.z = sample.z
    target.eyeY = sample.y + target.heightOffset
    target.pathYaw = sample.yaw
    target.pathPitch = sample.pitch

    return track.length - target[distanceKey] <= ARRIVE_DISTANCE
  }

  /** 視線解算用的環境：位置、軌道方向、環顧目標與這個階段的俯仰範圍 */
  function createGazeContext(target: DriftSession): GazeContext {
    const [rangeMin, pitchMax] = target.phase === 'fly' || target.phase === 'settle' ? FLY_PITCH_RANGE : WALK_PITCH_RANGE
    const pitchMin = target.realm.driftLookBias === 'outward' ? Math.max(rangeMin, OUTWARD_PITCH_MIN) : rangeMin
    return {
      x: target.x,
      eyeY: target.eyeY + target.craneY,
      z: target.z,
      pathYaw: target.pathYaw,
      pathPitch: target.pathPitch,
      elapsed: target.shotElapsed,
      freeYaw: target.lookTargetYaw,
      freePitch: target.lookTargetPitch,
      pitchMin,
      pitchMax,
    }
  }

  /** 視線追著鏡位要看的方向轉（有角速度與角加速度上限），這是畫面轉動的唯一出口 */
  function updateGaze(target: DriftSession, deltaTime: number) {
    const limit = GAZE_LIMIT_MAP[target.phase === 'settle' ? 'fly' : target.phase]
    target.shotElapsed += deltaTime
    const view = resolveGaze(target.gaze, createGazeContext(target))
    target.gazeYawError = Math.abs(diffAngle(view.yaw, target.yawFollower.value))
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

    const up = smoothRatio((target.lingerElapsed - crane.startAt) / CRANE_MOVE_SECOND)
    const down = 1 - smoothRatio((target.lingerElapsed - crane.downAt) / CRANE_MOVE_SECOND)
    target.craneY = crane.height * up * down
  }

  /** 這次停留多久：日出日落與開闊的景點久一點（有繞弧或升降），其餘是匆匆一瞥 */
  function pickLingerDuration(plan: NextPlan): number {
    if (isGoldenHour())
      return randomBetween(LINGER_GOLDEN_MIN, LINGER_GOLDEN_MAX)
    if (plan.kind === 'fly')
      return randomBetween(LINGER_AFTER_FLIGHT_MIN, LINGER_AFTER_FLIGHT_MAX)
    if (plan.destination.isOpenSky && Math.random() < LINGER_VISTA_CHANCE)
      return randomBetween(LINGER_LONG_MIN, LINGER_LONG_MAX)
    return randomBetween(LINGER_MIN, LINGER_MAX)
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
      pickLingerDuration(plan),
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

        updateTrackShot(target, activePlan)

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
        updateLingerBeat(target)

        /** 繞弧：停一小段之後沿著弧慢慢走，走到頭就停在那裡；位置換了，所在的高度層跟著換 */
        if (target.motionTrack && target.lingerElapsed >= target.motionStartAt) {
          /** 起步前（還沒動）每幀對一次：弧的第一點與鏡頭實際高度的落差併進高度補償，起步時沒有跳動 */
          if (target.motionDistance === 0 && target.motionSpeed === 0)
            setHeightOffset(target, target.eyeY - itemAt(target.motionTrack.yList, 0))

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
        /** 要橫著挪時先挪再降：前段水平走完，後段才把高度降下來，不會斜著切過樹冠 */
        const isLateral = settle.lateral > SETTLE_LATERAL_MIN
        const horizontalRatio = isLateral ? clamp(ratio / SETTLE_HORIZONTAL_SHARE, { min: 0, max: 1 }) : ratio
        const verticalRatio = isLateral ? clamp((ratio - SETTLE_VERTICAL_START) / (1 - SETTLE_VERTICAL_START), { min: 0, max: 1 }) : ratio
        const horizontalEased = horizontalRatio * horizontalRatio * (3 - 2 * horizontalRatio)
        const verticalEased = verticalRatio * verticalRatio * (3 - 2 * verticalRatio)
        target.x = settle.fromX + (settle.toX - settle.fromX) * horizontalEased
        target.z = settle.fromZ + (settle.toZ - settle.fromZ) * horizontalEased
        target.eyeY = settle.fromEyeY + (settle.toEyeY - settle.fromEyeY) * verticalEased
        if (ratio >= 1) {
          finishStop(target)
          return
        }
        break
      }
    }

    /** 高度落差慢慢收掉（散步、停留與飛行都一樣） */
    target.heightOffsetElapsed += deltaTime
    target.heightOffset = target.heightOffsetStart * (1 - smoothRatio(target.heightOffsetElapsed / target.heightOffsetSecond))

    updateGaze(target, deltaTime)

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
    const eyeY = target.eyeY + target.craneY

    const { position } = controller
    position.x = target.x
    position.y = eyeY - PLAYER_EYE_HEIGHT
    position.z = target.z

    camera.position.set(target.x, eyeY, target.z)
    camera.rotation.y = target.yawFollower.value + target.lookYawOffset
    camera.rotation.x = clamp(target.pitchFollower.value + target.lookPitchOffset, { min: -PITCH_LIMIT, max: PITCH_LIMIT })
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
      motionTrack: null,
      motionDistance: 0,
      motionSpeed: 0,
      motionAcceleration: 0,
      motionStartAt: 0,
      crane: null,
      lingerBeat: { kind: 'hold', endAt: 0 },
      panSign: 1,
      lastTrackShotId: null,
      lastLingerShotId: null,
      shotCutList: [],
      shotCutIndex: 0,
      track: null,
      trackDistance: 0,
      speed: 0,
      speedAcceleration: 0,
      gazeYawError: 0,
      heightOffset: 0,
      heightOffsetStart: 0,
      heightOffsetElapsed: 0,
      heightOffsetSecond: HEIGHT_OFFSET_SECOND_MIN,
      lingerElapsed: 0,
      lingerDuration: 0,
      nextPlan: null,
      currentPoint: null,
      recentIdList: [],
      lookTargetYaw: camera.rotation.y,
      lookTargetPitch: 0,
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
      try {
        updateSession(current, deltaTime)
      }
      catch (error) {
        bailOut(current, error)
        return
      }

      /** 算出 NaN 或無限大（除以零、軌道退化）也當作出錯，用上一幀的位置交還 */
      if (session === current && ![current.x, current.eyeY, current.z].every(Number.isFinite))
        bailOut(current, new Error(`位置不是有限數字：${current.x}, ${current.eyeY}, ${current.z}`))
      else if (session === current)
        lastSafePose = { x: current.x, y: current.eyeY - PLAYER_EYE_HEIGHT, z: current.z }
    }, undefined, true)

    lastSafePose = { x, y: eyeY - PLAYER_EYE_HEIGHT, z }
    try {
      startLinger(created, randomBetween(LINGER_START_MIN, LINGER_START_MAX))
      writePose(created)
    }
    catch (error) {
      bailOut(created, error)
      return false
    }
    onChange()
    return true
  }

  /** 最近一幀確認過沒問題的腳底位置，出錯時交還控制器用 */
  let lastSafePose: { x: number; y: number; z: number } | null = null

  /**
   * 神遊自己出了錯：記下來、把控制交還，人留在原地
   *
   * 這支觀察者排在每一幀算繪的最前面，例外一路丟出去會讓整個畫面停住，
   * 所以神遊的任何失敗都只能結束神遊，不能影響算繪
   */
  function bailOut(target: DriftSession, error: unknown) {
    console.error('[Drift] 神遊出錯，已結束:', error)
    release(target)
    if (lastSafePose)
      controller.teleport(lastSafePose.x, lastSafePose.y, lastSafePose.z)
    onChange()
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

    /**
     * 身體不能卡進方塊
     *
     * 路徑只驗「身體四角各有一個站得住的格子」，那一格可以比腳下高一格，
     * 所以貼著一格高的台階走時，腳底的方框會削進台階側面；降落的落點也沒取整數，可能擠進旁邊的樹幹。
     * 控制器接手時已經卡進方塊會動彈不得，這裡往格子中心退，退到不重疊為止（中心上方三格是空的，一定放得下）
     */
    const centerX = Math.round(target.x)
    const centerZ = Math.round(target.z)
    let handbackX = target.x
    let handbackZ = target.z
    if (cell && checkOverlap(target.worldState, handbackX, handbackY + 0.01, handbackZ)) {
      handbackX = centerX
      handbackZ = centerZ
      for (const ratio of HANDBACK_RETREAT_RATIO_LIST) {
        const nextX = target.x + (centerX - target.x) * ratio
        const nextZ = target.z + (centerZ - target.z) * ratio
        if (!checkOverlap(target.worldState, nextX, handbackY + 0.01, nextZ)) {
          handbackX = nextX
          handbackZ = nextZ
          break
        }
      }
    }

    release(target)
    controller.teleport(handbackX, handbackY, handbackZ)
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

    /** 一路上下坡走過來，記著的高度層還是出發時的；不先對一次，腳下明明是地面也會被當成在空中，白白降落一趟 */
    if (target.phase !== 'fly')
      syncBlockY(target)

    const footY = target.eyeY - PLAYER_EYE_HEIGHT
    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    const isAirborne = target.phase === 'fly' || !here || footY - here.footY > AIRBORNE_HEIGHT
    if (!isAirborne) {
      finishStop(target)
      return
    }

    /**
     * 落點：正下方的站立面，而且頭上要開闊
     *
     * 正下方是樹冠底下的地面時，鏡頭會穿過樹葉與樹幹落下去，所以先找最近的開闊處；
     * 附近沒有開闊處才接受樹下，沒有（飛在水面或岩壁上）就找最近的、走得到的地方
     */
    let destination = { x: target.x, z: target.z, footY: 0, blockY: target.blockY }
    const belowCell = target.grid.getCellAtHeight(Math.round(target.x), Math.round(target.z), footY)
    const below = belowCell && belowCell.footY <= footY + 0.5 && belowCell.waterDepth === 0 ? belowCell : null
    const spot = below?.isOpenSky ? null : findReachableSpot(target, target.x, target.z, footY, SETTLE_SEARCH_RADIUS, true)
    if (spot) {
      destination = { x: spot.blockX, z: spot.blockZ, footY: spot.footY, blockY: spot.blockY }
    }
    else if (below) {
      /** 落在那一格的中心：沒取整的話，停在格子邊緣的鏡頭貼著隔壁的樹幹降下去，落地時身體也卡進隔壁 */
      destination = { x: Math.round(target.x), z: Math.round(target.z), footY: below.footY, blockY: below.blockY }
    }
    else {
      const anySpot = findReachableSpot(target, target.x, target.z, footY, SETTLE_SEARCH_RADIUS)
      if (anySpot)
        destination = { x: anySpot.blockX, z: anySpot.blockZ, footY: anySpot.footY, blockY: anySpot.blockY }
      else
        destination = { x: target.x, z: target.z, footY: Math.max(0, footY - 4), blockY: target.blockY }
    }

    const drop = Math.max(0, target.eyeY - (destination.footY + PLAYER_EYE_HEIGHT))
    const lateral = Math.hypot(destination.x - target.x, destination.z - target.z)
    target.settleBlockY = destination.blockY
    target.settle = {
      fromX: target.x,
      fromZ: target.z,
      fromEyeY: target.eyeY,
      toX: destination.x,
      toZ: destination.z,
      toEyeY: destination.footY + PLAYER_EYE_HEIGHT,
      lateral,
      /** 要橫著挪的話，高度只用後段降下來，時間跟著拉長；橫移的時間依距離算，不然幾格的距離擠在一兩秒裡是橫衝過去 */
      duration: Math.max(
        clamp(Math.sqrt(drop) * 0.7, { min: SETTLE_DURATION_MIN, max: SETTLE_DURATION_MAX }) / (lateral > SETTLE_LATERAL_MIN ? 1 - SETTLE_VERTICAL_START : 1),
        lateral / SETTLE_LATERAL_SPEED,
      ),
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

  /** 沿軌道的速度狀態，除錯與驗證用 */
  function getMotion(): { speed: number; acceleration: number; gazeYawError: number } | null {
    return session ? { speed: session.speed, acceleration: session.speedAcceleration, gazeYawError: session.gazeYawError } : null
  }

  return { start, stop, abort, applyLook, isDrifting, getPhase, getShotId, getGaze, getMotion }
}
