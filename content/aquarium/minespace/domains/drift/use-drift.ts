import type { Scene, UniversalCamera } from '@babylonjs/core'
import type { useFpsController } from '../../composables/use-fps-controller'
import type { DriftFeature, RealmDefinition, RealmDriftFlight } from '../realm/realm-definition'
import type { RenderInputMessage } from '../render-host/protocol'
import type { DriftDebugSnapshot } from './drift-debug'
import type { CoverageLedger, DaySlot, VisitPlanId } from './drift-direction'
import type { LookBias, LookInterest } from './drift-framing'
import type { DriftSteps } from './drift-job'
import type { DriftEmitter, DriftPoint } from './drift-point'
import type { AngleFollower, Gaze, GazeContext, LookRoom, PathGaze, ShotId, SpeedFollower, SpeedLimit } from './drift-shot'
import type { DriftTrack, DriftTrackSample } from './drift-track'
import { clamp } from 'remeda'
import { checkOverlap, PLAYER_EYE_HEIGHT } from '../player/collision'
import { getDayPhase } from '../weather/day-night'
import { createCoverageLedger, DAY_PACE_MAP, FEATURE_DIRECTION_MAP, getBurnEmphasis, getCoverageSector, getDaySlot, getFeatureSlotWeight, isFeatureActive } from './drift-direction'
import { buildFlightTrackSteps, chooseFlightRoute } from './drift-flight'
import { getDriftFlight, getDriftRegion } from './drift-flight-config'
import { chooseLookYawSteps, getBiasFactor, isSightlineClear, isSightlineClear3D, measureMaxDepthSteps, measureOpennessAt, measureOpennessSteps, measureSubjectVisibilitySteps, measureViewSteps, probeViewDistance3D } from './drift-framing'
import { buildGlideFootListSteps, GLIDE_LIFT_RANGE, GLIDE_SPEED_SCALE } from './drift-glide'
import { createDriftGrid } from './drift-grid'
import { createJobQueue, runStepsSync } from './drift-job'
import { collectReachableSet, collectReachableSetSteps, LONG_NODE_LIMIT, PATH_SAMPLE_SPACING, planArcPath, planWalkPathSteps, ReachedSet } from './drift-path'
import { collectDriftPointSteps, findLoudestEmitter, findReachableSpot, listDriftEmitter } from './drift-point'
import {
  ANTICIPATE_SECOND,
  CRANE_HEIGHT_RANGE,
  CRANE_MOVE_SECOND,
  CRANE_PEAK_HOLD_RANGE,
  createPathGaze,
  DOLLY_RELEASE_RANGE,
  followAngle,
  followSpeed,
  GAZE_LIMIT_MAP,
  LEAD_ALONG_DISTANCE_MAX,
  LEAD_RELEASE_RANGE,
  locateLeadPoint,
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
  TILT_EXTENT_RATIO,
  TILT_RATE,
  TILT_SECOND_MIN,
  TILT_SPAN_MIN,
  TILT_START_DELAY,
  TRACK_SHOT_SECOND_RANGE,
  TRUCK_ANGLE_RANGE,
  TRUCK_DRIFT_RANGE,
  VISIT_PITCH_RANGE,
  ZOOM_ACCELERATION,
  ZOOM_DEPTH_MAX,
  ZOOM_IN_RATE,
  ZOOM_OUT_RATE,
  ZOOM_RESTORE_SECOND,
} from './drift-shot'
import { isSolidAt } from './drift-solid'
import { createWalkTrackSteps, diffAngle, sampleDriftTrack } from './drift-track'
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
/**
 * 雲整片燒起來的晨昏，停留再加長幾成、鏡頭再仰幾度、更常朝太陽那一側看
 *
 * 火燒雲是整片天的事（頭頂的雲底、太陽那一側的金邊），不靠太陽入鏡；
 * 鏡頭仰起來、停久一點，一次停留就看得完金、橘、紅到暗的一大半。
 * 加碼的程度由燃燒強度換算（見 drift-direction 的 getBurnEmphasis），平淡的傍晚是零
 */
const LINGER_BURN_BONUS_RATIO = 0.35
const BURN_PITCH_BONUS = 0.07
const BURN_SKY_INTEREST_BONUS = 0.6
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
const LOOK_BIAS_STRENGTH = 0.85
/** 偏好方向的鎖定側移：畫面中央貼臉與被擋住的取樣比例上限，比一般側移寬——起伏的雪原上偏好方向常有小丘，只要大半路段看得出去就值得 */
const LOOK_BIAS_NEAR_MAX = 0.15
const LOOK_BIAS_BLOCKED_MAX = 0.3
/** 朝外（朝內）的 radial 視線：這一段軌道離中心至少這麼遠（格）才用，近了方向轉太快 */
const RADIAL_RADIUS_MIN = 14
const RADIAL_CHECK_STEP = 5
/** 跟拍的留白：偏角候選（弧度）、最多偏多少、原方向的加權優勢（沒有明顯好處就不偏） */
const LOOK_ROOM_OFFSET_LIST = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]
const LOOK_ROOM_MAX = 1
/** 沿軌道每隔幾格挑一次偏角（散步、飛行）、換一檔的扣分、探多深、深到幾格就算夠開闊、偏角為零時的基本加成（權重）、幾格內有東西算被擋住 */
const LOOK_ROOM_STEP = 2.5
const LOOK_ROOM_FLY_STEP = 6
const LOOK_ROOM_SWITCH_COST = 0.08
const LOOK_ROOM_DEPTH_MAX = 24
const LOOK_ROOM_DEPTH_GOOD = 16
const LOOK_ROOM_CENTER_WEIGHT = 0.7
const BLOCKED_DEPTH = 10
/** 偏好方向的側移鏡位的權重加成：有視線偏好的場景，路上大部分時間都該看著偏好的方向 */
const LOOK_BIAS_TRUCK_FIT = 4
/** 看哪裡：正前方至少要有幾格縱深（不然是一面牆），音源與停留點被擋住時不當景物 */
const LOOK_MIN_DEPTH = 12
/** 看向景物的最近距離（格）：再近畫面會被一個東西塞滿 */
const SUBJECT_DISTANCE_MIN = 8
/** 視線俯仰的範圍（弧度，正值往下看）：走路 -十度到 +十二度，飛行 零到 +二十八度 */
const WALK_PITCH_RANGE: readonly [number, number] = [-0.17, 0.22]
const FLY_PITCH_RANGE: readonly [number, number] = [0, 0.5]

/** 下一站的距離偏好：太近太遠都扣分（格） */
const STOP_IDEAL_DISTANCE = 80
const STOP_DISTANCE_SIGMA = 50
const STOP_DISTANCE_MIN = 14
/**
 * 低飛的一趟（見 drift-glide）：挑遠一點的站（理想距離、容許的範圍、最近多近，格），最多試幾個候選；
 * 構圖的俯仰微微低頭（弧度）：鏡頭比走路高，看的是腳邊的溪面、樹根與林間小徑
 */
const GLIDE_IDEAL_DISTANCE = 130
const GLIDE_DISTANCE_SIGMA = 60
const GLIDE_DISTANCE_MIN = 40
const GLIDE_ATTEMPT_MAX = 4
const GLIDE_COMPOSITION_PITCH = 0.08
/** 走去露天停留點準備起飛時，近一點也行（格） */
const OPEN_WALK_DISTANCE_MIN = 4
/** 補的露天停留點：編號前綴、最多補幾個、離現在最多往外找幾格 */
const SKY_POINT_ID_PREFIX = 'sky-'
const SKY_POINT_MAX = 4
const SKY_SEARCH_RADIUS = 60
/** 特色主體的觀賞站位被選為下一站的加權（乘上主體的 weight）：路線優先去看得到特色的地方 */
const FEATURE_DESTINATION_BONUS = 4
/** 主體不在演出的時段（夜裡才亮的燈在白天），它的觀賞站位當目的地的權重 */
const INACTIVE_DESTINATION_WEIGHT = 0.3
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
/** 一路看著某個景物的鏡位（看向目的地、拉遠、視差）：這一段裡看得到那個景物的取樣比例下限 */
const SUBJECT_VISIBLE_MIN = 0.7
/** 被圍在牆裡（四面八方縱深都不到 LOOK_MIN_DEPTH）時，停留縮成幾秒，並把這個停留點降權 */
const ENCLOSED_LINGER_SECOND = 3
const ENCLOSED_POINT_WEIGHT = 0.05
/** 側移時畫面中央被擋住（十格內有東西，含坡面）的取樣比例上限：峽谷裡側面就是山壁，幾乎都不合格 */
const TRUCK_BLOCKED_MAX = 0.15
/** 看向目的地：正前方（朝目的地）三維視線被擋的取樣比例上限 */
const DESTINATION_BLOCKED_MAX = 0.35
/** 往外看的場景，視線俯仰的下限（弧度，正值往下看）：不抬頭看迎面的坡 */
const OUTWARD_PITCH_MIN = 0.02
const PARALLAX_FOREGROUND_MIN = 0.2
/** 切鏡位時，視線要轉多大的角度權重就剩一半左右（弧度）：不選要大幅轉頭的鏡位 */
const SHOT_TURN_SCALE = 1.8
/** 停留尾聲轉向下一段路的方向，看軌道第幾個取樣點的切線 */
const ANTICIPATE_LOOKAHEAD_SAMPLE = 8

/**
 * 造訪一個特色主體（站在它的觀賞站位、或停留時看得到它）：開場的運動做完之後鎖定構圖細看多久（秒範圍）、
 * 繞弧時離主體的距離範圍（格，比繞音源寬：遠處的地標也能繞一小段弧，背景慢慢錯開）、整次造訪最長多久（秒）
 */
const VISIT_DETAIL_SECOND_RANGE: readonly [number, number] = [7, 11]
const VISIT_PUSH_SECOND_RANGE: readonly [number, number] = [11, 16]
const VISIT_ORBIT_RADIUS_RANGE: readonly [number, number] = [8, 60]
const VISIT_SECOND_MAX = 60
/**
 * 造訪主體時畫面正中央至少要有多深（格；主體比這近就取到主體距離的七成）：
 * 「看得到主體」只代表有一條視線通，畫面正中央（含三分線的偏角）近處還是可能塞著一根樹幹、一面牆
 */
const VISIT_CENTER_DEPTH_MIN = 10
const VISIT_CENTER_DEPTH_RATIO = 0.7
/** 仰搖：離主體至少這麼遠（格），也至少是主體尺寸的幾成——貼著主體仰頭只看得到屋簷與樹幹 */
const TILT_DISTANCE_MIN = 10
/** 仰搖的頂與底：那個俯仰看出去近處就有東西（腳邊的地面、頭頂的樹冠）時，往主體中心收，每次收這麼多弧度 */
const TILT_TRIM_STEP = 0.05
/** 仰搖一路上畫面正中央至少要有多深（格）：比一般的造訪嚴，整段搖過去都不能貼著東西 */
const TILT_CENTER_DEPTH_MIN = 12
/** 有視線偏好的場景（雪稜往外看）：主體的方位符合偏好的程度低於這個就不造訪它，免得一次次停留都背對著雲海 */
const VISIT_BIAS_FACTOR_MIN = 0.5
const TILT_DISTANCE_SIZE_RATIO = 0.8
/** 不在觀賞站位、只是停留時看得到某個主體：這麼高的機率照造訪計畫拍它（其餘照平常的停留） */
const VISIT_PASSING_CHANCE = 0.7
/** 日出日落時這個機率降到多少：留一半以上的停留給天空與太陽（朝太陽那一側橫搖、太陽放在三分線上的定格） */
const VISIT_PASSING_CHANCE_GOLDEN = 0.35
/** 升降：升起每格花幾秒、降回每格花幾秒（都不短於 CRANE_MOVE_SECOND）；越高升得越久，垂直速度維持在每秒半格上下 */
const CRANE_UP_SECOND_PER_BLOCK = 2.2
const CRANE_DOWN_SECOND_PER_BLOCK = 1.6
/**
 * 升起揭露：站著看不到（被近處的樹梢、岩稜擋住）、升高之後看得到的主體，鏡頭升起來讓它從遮擋物後面露出來
 *
 * 試哪幾個高度（格）、主體至少多重要、至少多遠（格）、條件成立時做的機率
 */
const REVEAL_HEIGHT_LIST = [4, 6.5]
const REVEAL_WEIGHT_MIN = 0.4
const REVEAL_DISTANCE_MIN = 12
const REVEAL_CHANCE = 0.6
/** 日出日落（與夜裡的月亮）：太陽放在畫面的三分線上，視線偏開這麼多弧度（約十五度） */
const SUN_THIRDS_OFFSET = 0.26
/** 逆光剪影：日出日落時，方位離太陽這麼近（弧度）的主體權重乘多少 */
const SILHOUETTE_ANGLE = 0.5
const SILHOUETTE_BONUS = 1.6
/** 夜裡月亮那一側的看點權重 */
const MOON_INTEREST_WEIGHT = 0.7
/** 沿線跟拍：這一段裡看得到前方那一點的取樣比例下限、鏡位的基本適合度、量幾個取樣點 */
const LEAD_VISIBLE_MIN = 0.7
const LEAD_SHOT_FIT = 2.2
const LEAD_SAMPLE_COUNT = 6
/**
 * 繞飛（無人機繞著一個地標飛大半圈）：一趟飛行改成繞飛的機率、圓的半徑範圍（格）、主體離現在最遠多遠（格）、
 * 圓要落在場景半徑的幾成以內、這一段看得到主體的取樣比例下限、鏡位的適合度
 */
const ARC_FLIGHT_CHANCE = 0.5
const ARC_FLIGHT_RADIUS_RANGE: readonly [number, number] = [18, 45]
const ARC_FLIGHT_REACH = 140
const ARC_REGION_RATIO = 0.92
const ARC_VISIBLE_MIN = 0.6
const ARC_SHOT_FIT = 8

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

/**
 * 結束時從空中降到地面：垂直速度不超過這個（格／秒），頭尾各用一段緩起緩停（秒）
 *
 * 落差二十格也不加快，改成拉長時間（二十格約十六秒）：從飛行中按鍵離開是使用者自己的動作，
 * 急降（以前每秒三五格）比多等幾秒更讓人頭暈
 */
const SETTLE_DESCENT_SPEED = 1.5
const SETTLE_RAMP_SECOND = 3
const SETTLE_DURATION_MIN = 1.2
/** 降落時落點離正下方多遠（格）以上算要橫著挪；橫移的速度（格／秒）、水平段佔多少比例、高度從哪個進度才開始降 */
const SETTLE_LATERAL_MIN = 1
const SETTLE_LATERAL_PEAK_SPEED = 2
/** 橫移走到這個比例才開始降 */
const SETTLE_VERTICAL_START = 0.35
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
/**
 * 分幀工作每一幀最多花多少毫秒（見 drift-job）
 *
 * 規劃下一趟、算鏡位、收集停留點每一件都是好幾毫秒，一幀做完鏡頭會頓一下；
 * 現在每幀只給這麼一點時間往下做，做不完留到下一幀（停留有八秒以上，慢慢算來得及）。
 * 要連同呼叫的那一幀一口氣做完（驗證腳本比對與舊版逐幀相同的結果）就傳 Infinity
 */
const JOB_BUDGET_MS = 0.3
/** 開發模式下，神遊一幀的更新超過這麼久（毫秒）就在 console 警告 */
const FRAME_COST_WARN_MS = 3

export type DriftPhase = 'walk' | 'linger' | 'fly'

type InternalPhase = DriftPhase | 'settle'

interface NextPlan {
  kind: 'walk' | 'fly';
  track: DriftTrack;
  /** 這一趟的終點，抵達後記為目前所在的停留點 */
  destination: DriftPoint;
  /** 沿途經過的停留點，記進最近去過 */
  visitedList: DriftPoint[];
  /** 繞飛的那一趟：繞著哪個主體、圓的半徑；鏡位據此鎖定視線 */
  arc?: { feature: DriftFeature; radius: number };
  /** 低飛的那一趟：軌道是墊高過的散步路徑，走得比散步快（見 drift-glide） */
  isGlide?: boolean;
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
  reachedSet: ReachedSet;
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
  /** 升降的時程（停留經過的秒數）：開始升、開始降、全部結束；升與降各花多久 */
  crane: { height: number; startAt: number; downAt: number; endAt: number; upSecond: number; downSecond: number } | null;
  /** 停留現在這一段在做什麼；一段做完才換下一段（見 updateLingerBeat） */
  lingerBeat: { kind: 'hold' | 'pan' | 'orbit' | 'crane' | 'tilt' | 'anticipate'; endAt: number };
  /** 這次停留橫搖的方向：同一次停留裡一路往同一個方向，不來回掃 */
  panSign: 1 | -1;
  /** 上一段散步／飛行的鏡位與上一次停留的開頭，不連續重複 */
  lastTrackShotId: ShotId | null;
  /** 站過之後發現被圍在牆裡（沒有地方可看）的停留點，下次不太去 */
  enclosedIdList: string[];
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
  /** 下一趟還在算（分幀工作沒做完）：停留時間到了也要等它算好 */
  isPlanning: boolean;

  flightClock: number;
  flightDueAt: number;
  isFlightDue: boolean;
  lastDayPhase: string;

  /** 卡住偵測：這個時間窗已經過了多久，以及窗口開始時沿軌道走到哪裡 */
  stuckClock: number;
  stuckTrackDistance: number;

  /** 這一場神遊的短代號（除錯快照用，使用者回報時對得上是哪一場） */
  sessionId: string;
  /** 這一場神遊已經過了多久（秒），涵蓋紀錄的時間軸 */
  clock: number;
  /** 涵蓋紀錄：哪個主體從哪個方位、用哪種計畫拍過（見 drift-direction） */
  ledger: CoverageLedger;
  /** 現在這一段在拍什麼（除錯與驗證用）：段落的名字與主體；lookNote 是定格時視線是怎麼決定的 */
  sequenceId: string;
  lookNote: string;
  subjectFeature: DriftFeature | null;
  /** 造訪主體時放寬的俯仰範圍（仰搖要抬頭看瀑頂、樹冠），平常是 null */
  pitchRange: readonly [number, number] | null;
  /** 這一趟的速度倍率（依出發時的時段，夜裡慢一些），整趟不變 */
  paceScale: number;
  /**
   * 視野呼吸：value 是視野相對於使用者設定的比例（一是原樣），追著 zoomGoal 走；
   * detailZoom 是開場的運動做完、鎖定構圖細看時要收窄的幅度
   */
  zoomFollower: AngleFollower;
  zoomGoal: number;
  detailZoom: number;

  /** 使用者轉頭疊加的偏移與離上次輸入多久 */
  lookYawOffset: number;
  lookPitchOffset: number;
  lookIdle: number;

  /** 結束的降落（settle）：起點、終點與進度 */
  settle: { fromX: number; fromZ: number; fromEyeY: number; toX: number; toZ: number; toEyeY: number; lateral: number; duration: number; elapsed: number; horizontalSecond: number; verticalStart: number; verticalSecond: number } | null;
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
  getSunDirection: () => { x: number; y?: number; z: number };
  /** 這個清晨或黃昏的燃燒強度（零到一，見 cloud-daily-weather）；沒給就當平淡 */
  getBurnIntensity?: () => number;
  /** 狀態變了（開始、結束、階段切換），渲染執行期據此立刻補送一份狀態 */
  onChange: () => void;
  /** 分幀工作每幀的時間預算（毫秒），預設 JOB_BUDGET_MS；Infinity 是同一幀跑完 */
  jobBudgetMs?: number;
}

/** 降落一段垂直距離要多久：有巡航段（速度恆定）的梯形速度曲線，沒有巡航段就是整段 S 曲線，峰值速度都不超過 SETTLE_DESCENT_SPEED */
function getSettleSecond(distance: number): number {
  if (distance >= SETTLE_DESCENT_SPEED * SETTLE_RAMP_SECOND)
    return distance / SETTLE_DESCENT_SPEED + SETTLE_RAMP_SECOND
  return Math.max(SETTLE_DURATION_MIN, (distance * 1.5) / SETTLE_DESCENT_SPEED)
}

/** 降落走了幾成（零到一）：頭尾是平滑加減速（速度是 S 曲線），中間巡航；速度與加速度都連續，起降時沒有跳動 */
function getSettleRatio(elapsed: number, distance: number): number {
  const total = getSettleSecond(distance)
  if (distance <= 0 || elapsed <= 0)
    return 0
  if (elapsed >= total)
    return 1

  if (distance < SETTLE_DESCENT_SPEED * SETTLE_RAMP_SECOND) {
    const ratio = elapsed / total
    return ratio * ratio * (3 - 2 * ratio)
  }

  /** 速度 v(u) = vmax·smoothstep(u/ramp)；位移是它的積分，S 曲線的積分是 ramp·(w³ − w⁴/2) */
  const ramp = SETTLE_RAMP_SECOND
  const slope = (value: number) => ramp * (value ** 3 - (value ** 4) / 2)
  if (elapsed < ramp)
    return (SETTLE_DESCENT_SPEED * slope(elapsed / ramp)) / distance
  if (elapsed > total - ramp)
    return 1 - (SETTLE_DESCENT_SPEED * slope((total - elapsed) / ramp)) / distance
  return (SETTLE_DESCENT_SPEED * (ramp / 2 + (elapsed - ramp))) / distance
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function useDrift({ scene, camera, controller, getWorld, getTimeOfDay, getDayRatio, getSunDirection, getBurnIntensity = () => 0, onChange, jobBudgetMs = JOB_BUDGET_MS }: UseDriftParam) {
  let session: DriftSession | null = null
  /** 分幀工作：規劃、鏡位、停留點收集都排在這裡，每幀在 updateSession 開頭跑一小段 */
  const jobQueue = createJobQueue()
  const isInline = !Number.isFinite(jobBudgetMs)
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

  /** 排進分幀工作；預算是無限大就當場跑完（與沒有分幀時完全相同） */
  function scheduleJob(name: string, steps: DriftSteps) {
    jobQueue.push({ name, steps })
    if (isInline)
      jobQueue.pump(Number.POSITIVE_INFINITY)
  }

  /* ───────────────────────── 導演：時段、節奏、涵蓋 ───────────────────────── */

  /** 現在的時段；地底沒有日夜，一律當白天（節奏不變、主體不分時段） */
  function getSlot(target: DriftSession): DaySlot {
    return target.realm.isUnderground ? 'day' : getDaySlot(getTimeOfDay())
  }

  /** 一個主體此刻的時段權重（零是不在演出）；地底的場景不分時段，只看 activeAt */
  function getSlotWeight(target: DriftSession, feature: DriftFeature): number {
    const isDay = getDayRatio() > 0.5
    if (target.realm.isUnderground)
      return isFeatureActive(feature, isDay) ? 1 : 0
    return getFeatureSlotWeight(feature, getDaySlot(getTimeOfDay()), isDay)
  }

  /**
   * 一個停留點因為它的特色主體而得到的權重倍率
   *
   * 主體越重要、這個時段越適合拍它、越沒拍過（或沒從這個站位的方位拍過）就越高；
   * 剛拍過的幾分鐘內壓得很低，隔久了慢慢回來。不是觀賞站位的停留點是一
   */
  function getDestinationFactor(target: DriftSession, point: DriftPoint): number {
    const feature = point.feature?.source
    if (!feature)
      return 1

    const slotWeight = getSlotWeight(target, feature)
    if (slotWeight <= 0)
      return INACTIVE_DESTINATION_WEIGHT
    const novelty = target.ledger.getNovelty(feature, getCoverageSector(feature, point.blockX, point.blockZ), target.clock)
    return 1 + feature.weight * FEATURE_DESTINATION_BONUS * slotWeight * novelty
  }

  /** 記下這一段在拍什麼；有主體就記進涵蓋紀錄（planId 是造訪計畫，路上看著它經過時是 null） */
  function setSequence(target: DriftSession, sequenceId: string, feature: DriftFeature | null, planId: VisitPlanId | null = null) {
    target.sequenceId = sequenceId
    target.subjectFeature = feature
    if (feature)
      target.ledger.noteVisit(feature, getCoverageSector(feature, target.x, target.z), planId, target.clock)
  }

  /** 加權隨機挑下一站、尋路、組成散步軌道；候選全走不到就是 null（分段版） */
  function* planWalk(target: DriftSession, isOpenSkyOnly = false, glideFlight: RealmDriftFlight | null = null): DriftSteps<NextPlan | null> {
    /** 低飛的一趟挑遠一點的站：一趟要夠長才像飛過去，不是走兩步就停 */
    const distanceMin = glideFlight ? GLIDE_DISTANCE_MIN : isOpenSkyOnly ? OPEN_WALK_DISTANCE_MIN : STOP_DISTANCE_MIN
    const idealDistance = glideFlight ? GLIDE_IDEAL_DISTANCE : STOP_IDEAL_DISTANCE
    const distanceSigma = glideFlight ? GLIDE_DISTANCE_SIGMA : STOP_DISTANCE_SIGMA
    const candidateList = target.pointList.filter((point) =>
      point !== target.currentPoint
      && (!isOpenSkyOnly || point.isOpenSky)
      && Math.hypot(point.blockX - target.x, point.blockZ - target.z) >= distanceMin)

    for (let attempt = 0; attempt < (glideFlight ? GLIDE_ATTEMPT_MAX : PLAN_ATTEMPT_MAX) && candidateList.length > 0; attempt++) {
      const weightList = candidateList.map((point) => {
        const distance = Math.hypot(point.blockX - target.x, point.blockZ - target.z)
        const base = (Math.exp(-(((distance - idealDistance) / distanceSigma) ** 2)) + 0.03) * getDestinationFactor(target, point) * (target.enclosedIdList.includes(point.id) ? ENCLOSED_POINT_WEIGHT : 1)
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
      const polyline = yield * planWalkPathSteps(
        target.grid,
        { x: target.x, z: target.z, blockY: target.blockY },
        { blockX: point.blockX, blockZ: point.blockZ, blockY: point.blockY },
        glideFlight ? LONG_NODE_LIMIT : undefined,
      )
      if (!polyline || polyline.xList.length < 2)
        continue

      /** 低飛：沿路量頭頂的空間，把腳底墊高；一路都是矮枝墊不起來就換一站 */
      const footYList = glideFlight
        ? yield * buildGlideFootListSteps(target.worldState, polyline, PLAYER_EYE_HEIGHT, glideFlight.glideLiftRange ?? GLIDE_LIFT_RANGE)
        : polyline.footYList
      if (!footYList)
        continue

      const track = yield * createWalkTrackSteps(polyline.xList, polyline.zList, footYList, PLAYER_EYE_HEIGHT)
      if (track.length < TRACK_LENGTH_MIN)
        continue

      return { kind: 'walk', track, destination: point, visitedList: [point], isGlide: glideFlight !== null }
    }

    return null
  }

  /** 組一趟飛行：只在露天的地方起飛，場景關掉飛行或找不到落點就是 null（分段版） */
  function* planFlight(target: DriftSession): DriftSteps<NextPlan | null> {
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

    const arcSubject = pickArcSubject(target, flight.routeMode ?? 'free')
    for (let attempt = 0; attempt < 2; attempt++) {
      /** 第一次先試繞飛（有合適的地標時），軌道組不出來就照平常的路線 */
      const arc = attempt === 0 ? arcSubject : null
      const route = chooseFlightRoute(target.pointList, { x: target.x, z: target.z }, target.recentIdList, {
        region: getDriftRegion(target.realm),
        /** 要往外看的場景（雪稜）飛外緣：視線朝外時鏡頭才一路都在看雲海 */
        mode: arc ? 'orbit' : target.realm.driftLookBias === 'outward' && (flight.routeMode ?? 'free') === 'free' ? 'rim' : (flight.routeMode ?? 'free'),
        orbit: arc ? { x: arc.feature.x, z: arc.feature.z, radius: arc.radius } : undefined,
      })
      if (!route)
        return null

      const track = yield * buildFlightTrackSteps({
        worldState: target.worldState,
        grid: target.grid,
        flight,
        start: { x: target.x, z: target.z, eyeY: target.eyeY, blockY: target.blockY },
        route,
        eyeHeight: PLAYER_EYE_HEIGHT,
      })
      if (track && track.length >= TRACK_LENGTH_MIN)
        return { kind: 'fly', track, destination: route.landing, visitedList: route.waypointList.flatMap((waypoint) => (waypoint.point ? [waypoint.point] : [])), arc: arc ?? undefined }
    }

    return null
  }

  /**
   * 這一趟飛行要不要改成繞著一個地標飛：挑一個適合從空中繞的主體，回傳它與圓的半徑
   *
   * 沿地面飛的場景（溪谷，高度壓在峽谷邊緣之下）不繞；整個圓要落在場景範圍裡，放不下就縮小，縮到下限還放不下就不選；
   * 這個時段適合、還沒拍過的優先
   */
  function pickArcSubject(target: DriftSession, routeMode: 'free' | 'ground'): { feature: DriftFeature; radius: number } | null {
    /** 往外看的場景（雪稜）飛外緣看雲海，不繞著場景裡的地標飛（那是背對雲海） */
    if (routeMode === 'ground' || target.realm.driftLookBias === 'outward' || Math.random() >= ARC_FLIGHT_CHANCE)
      return null

    const region = getDriftRegion(target.realm)
    const candidateList: { feature: DriftFeature; radius: number; weight: number }[] = []
    for (const feature of target.realm.driftFeatureList ?? []) {
      if (!FEATURE_DIRECTION_MAP[feature.kind].canAerialOrbit)
        continue

      const slotWeight = getSlotWeight(target, feature)
      if (slotWeight <= 0 || Math.hypot(feature.x - target.x, feature.z - target.z) > ARC_FLIGHT_REACH)
        continue

      let radius = clamp(feature.size * 0.8 + 14, { min: ARC_FLIGHT_RADIUS_RANGE[0], max: ARC_FLIGHT_RADIUS_RANGE[1] })
      if (region)
        radius = Math.min(radius, region.radius * ARC_REGION_RATIO - Math.hypot(feature.x - region.x, feature.z - region.z))
      if (radius < ARC_FLIGHT_RADIUS_RANGE[0])
        continue

      const novelty = target.ledger.getNovelty(feature, getCoverageSector(feature, target.x, target.z), target.clock)
      candidateList.push({ feature, radius, weight: (0.2 + feature.weight) * slotWeight * novelty })
    }

    let pick = Math.random() * candidateList.reduce((sum, candidate) => sum + candidate.weight, 0)
    for (const candidate of candidateList) {
      pick -= candidate.weight
      if (pick <= 0)
        return candidate
    }
    return candidateList[candidateList.length - 1] ?? null
  }

  /**
   * 停留開始時把下一趟排進分幀工作，算好就放進 nextPlan，停留結束就能直接出發
   *
   * isInitial 是剛抵達（startLinger）：算不出來要記失敗次數、把這次停留縮短；
   * 繞弧走完位置變了重算（不是 initial）：算不出來只是不要等太久
   */
  function prepareNext(target: DriftSession, isInitial: boolean) {
    target.nextPlan = null
    target.isPlanning = true
    scheduleJob('規劃下一趟', planNext(target, isInitial))
  }

  function* planNext(target: DriftSession, isInitial: boolean): DriftSteps {
    let plan: NextPlan | null = null

    if (target.isFlightDue) {
      const flight = getDriftFlight(target.realm)
      const glideChance = flight.glideChance ?? 0
      if (!flight.isEnabled) {
        target.isFlightDue = false
      }
      else if (Math.random() < glideChance) {
        /**
         * 這一趟改成低飛（霧濃、樹冠密的場景升空看不到東西，見 drift-flight-config）。
         * 排不出來（頭頂一路都是矮枝）就照平常散步，下一趟飛行的時間重新算；不退回升空——只低飛的場景本來就不該升空
         */
        plan = yield * planWalk(target, false, flight)
        if (!plan) {
          target.isFlightDue = false
          target.flightDueAt = target.flightClock + randomBetween(FLIGHT_INTERVAL_MIN, FLIGHT_INTERVAL_MAX) * 0.5
        }
      }
      else if (glideChance >= 1) {
        target.isFlightDue = false
      }
      else {
        plan = yield * planFlight(target)
        /** 這裡不是露天（林子裡、洞口內）起飛會穿過樹冠：先走去最近的露天停留點，下一次停留再飛 */
        const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
        if (!plan && !here?.isOpenSky) {
          plan = yield * planWalk(target, true)
          /** 連一個露天的停留點都沒有（密林）：就近補一塊頭上全空的地，起降才有地方用 */
          if (!plan && addSkyPoint(target))
            plan = yield * planWalk(target, true)
        }
      }
    }
    plan ??= yield * planWalk(target)

    target.nextPlan = plan
    target.isPlanning = false
    if (isInitial) {
      /** 算不出下一站就多等一會兒再試，期間照常環顧 */
      if (plan) {
        target.replanFailureCount = 0
      }
      else {
        target.replanFailureCount++
        target.lingerDuration = Math.min(target.lingerDuration, REPLAN_DELAY)
      }
    }
    else if (!plan) {
      target.lingerDuration = Math.min(target.lingerDuration, target.lingerElapsed + REPLAN_DELAY)
    }
  }

  /**
   * 就近補一個露天的停留點
   *
   * 露天要一路空到世界頂（無人機垂直起降，樹冠再高也會穿過），高樹的林子可能一個停留點都不算。
   * 找不到就是 false；補到上限也不再補，免得停留點清單一直長
   */
  function addSkyPoint(target: DriftSession): boolean {
    if (target.pointList.filter((point) => point.id.startsWith(SKY_POINT_ID_PREFIX)).length >= SKY_POINT_MAX)
      return false

    const spot = findReachableSpot(target, target.x, target.z, target.eyeY - PLAYER_EYE_HEIGHT, SKY_SEARCH_RADIUS, true)
    if (!spot)
      return false

    const id = `${SKY_POINT_ID_PREFIX}${spot.blockX},${spot.blockZ}`
    if (target.pointList.some((point) => point.id === id))
      return false

    target.pointList.push({ ...spot, id, kind: 'clearing' })
    return true
  }

  function startLinger(target: DriftSession, duration: number, prelude?: DriftSteps) {
    setPhase(target, 'linger')
    target.lingerElapsed = 0
    target.lingerDuration = duration
    target.speed = 0
    target.speedAcceleration = 0
    target.track = null
    target.pitchRange = null
    target.detailZoom = 0
    target.zoomGoal = 1
    /** 上一個脈絡（走路中的鏡位量測、上一次停留）排的工作都作廢，從這裡重新排：先算下一趟，再決定這次停留的鏡位 */
    jobQueue.clear()
    if (prelude)
      scheduleJob('停留點', prelude)
    prepareNext(target, true)
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
    target.stuckTrackDistance = 0
    target.motionTrack = null
    /** 升降還沒降完就出發（正常不會，停留會等它降完）：剩下的高度併進基準高度，由下面的高度落差慢慢收掉，不會瞬間掉下來 */
    target.eyeY += target.craneY
    target.crane = null
    target.craneY = 0
    target.pitchRange = null
    target.zoomGoal = 1
    target.paceScale = DAY_PACE_MAP[getSlot(target)].speedScale * (plan.isGlide ? GLIDE_SPEED_SCALE : 1)
    /** 軌道起點與鏡頭實際位置的高度差慢慢收掉，接續時沒有跳動 */
    setHeightOffset(target, target.eyeY - itemAt(plan.track.yList, 0))
    if (plan.kind === 'fly' || plan.isGlide) {
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
      /** 不在演出的主體不看；時段適合的（夜裡的燈、日出日落的遠景）優先 */
      const slotWeight = getSlotWeight(target, feature)
      if (slotWeight <= 0)
        return []
      const pathList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : [feature]
      return pathList.map((point) => ({ x: point.x, z: point.z, y: point.y, weight: (1 + feature.weight * 6) * slotWeight, near: feature.viewDistance[0] * 0.6, far: feature.viewDistance[1] * 1.6 }))
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
    /** 雲燒起來的晨昏再仰幾度，把頭頂燒紅的雲底收進來 */
    const burnLift = getGoldenBurnEmphasis() * BURN_PITCH_BONUS
    if (isFly)
      return (isSkyShot ? 0.03 : 0.12) - burnLift
    if (openness < 0.45)
      return 0
    return (isSkyShot ? -0.14 : -0.08) - burnLift
  }

  /** 前方看得到的特色主體：看的那一點與它屬於哪個主體 */
  interface AheadSubject { x: number; y: number; z: number; feature: DriftFeature }
  /** 上一次量到的前方特色主體（findAheadFeature 的記憶） */
  let aheadCache: { track: DriftTrack; startDistance: number; endDistance: number; result: AheadSubject | null } | null = null

  /**
   * 這一段前方（正前方一弧度內）看得到的、離得合適的特色主體；一路都看得到才算
   *
   * 線狀主體取幾個點，挑權重高、離得近的那一點
   */
  function* findAheadFeature(target: DriftSession, track: DriftTrack, startDistance: number, endDistance: number): DriftSteps<AheadSubject | null> {
    /** 同一段量兩次（留白的偏角與看向前方的主體）：答案只看軌道與場景資料，記下上一次的 */
    const cached = aheadCache
    if (cached && cached.track === track && cached.startDistance === startDistance && cached.endDistance === endDistance)
      return cached.result

    const midDistance = (startDistance + endDistance) / 2
    sampleDriftTrack(track, midDistance, probeSample)
    const { x: midX, z: midZ, yaw: heading } = probeSample

    let best: AheadSubject | null = null
    let bestScore = 0
    for (const feature of target.realm.driftFeatureList ?? []) {
      const slotWeight = getSlotWeight(target, feature)
      if (slotWeight <= 0)
        continue
      const pointList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : [feature]
      const step = Math.max(1, Math.ceil(pointList.length / FEATURE_PATH_SAMPLE_MAX))
      for (let index = 0; index < pointList.length; index += step) {
        const point = itemAt(pointList, index)
        const distance = Math.hypot(point.x - midX, point.z - midZ)
        if (distance < Math.max(SUBJECT_DISTANCE_MIN, feature.viewDistance[0] * 0.6) || distance > feature.viewDistance[1] * 1.6)
          continue
        if (Math.abs(diffAngle(Math.atan2(point.x - midX, point.z - midZ), heading)) > 1)
          continue
        /** 每個候選點要沿軌道量一遍看不看得到，之間讓出一次 */
        yield

        const score = ((0.3 + feature.weight) * slotWeight) / (1 + distance / 60)
        if (score > bestScore && (yield * measureSubjectVisibilitySteps(target.worldState, track, startDistance, endDistance, point, SUBJECT_DISTANCE_MIN)).visibleFraction >= SUBJECT_VISIBLE_MIN) {
          bestScore = score
          best = { x: point.x, y: point.y, z: point.z, feature }
        }
      }
    }
    aheadCache = { track, startDistance, endDistance, result: best }
    return best
  }

  /** 這一段軌道離圓心（場景中心）最近有多近（格） */
  function getMinRadius(track: DriftTrack, startDistance: number, endDistance: number, region: { x: number; z: number }): number {
    let minRadius = Number.POSITIVE_INFINITY
    for (let distance = startDistance; distance <= endDistance; distance += RADIAL_CHECK_STEP) {
      sampleDriftTrack(track, distance, probeSample)
      minRadius = Math.min(minRadius, Math.hypot(probeSample.x - region.x, probeSample.z - region.z))
    }
    sampleDriftTrack(track, endDistance, probeSample)
    return Math.min(minRadius, Math.hypot(probeSample.x - region.x, probeSample.z - region.z))
  }

  /**
   * 跟拍的留白（look room）：視線在前進方向之外偏幾度，偏角沿軌道慢慢變
   *
   * 純粹看軌道的切線，轉彎與林間小徑會一頭撞進山壁與樹幹；攝影的做法是朝著開闊、或有特色主體的那一側多留一點空間。
   * 沿軌道每隔一段取一個點，每個偏角（左右各十四到五十七度）依「三維視線有多深」、有視線偏好的場景加上
   * 「符不符合偏好」、有特色主體在前方加上「主體在那一側」打分，原本的方向有加成，沒有明顯好處就不偏。
   * 偏角序列用動態規劃挑：相鄰兩點最多差一檔（所以偏角變化的速度有上限，不會看到哪裡有空就一下子甩過去），
   * 總分最高的一條；最後輕輕平滑一次，轉折處是圓角
   */
  function* chooseLookRoom(
    target: DriftSession,
    track: DriftTrack,
    startDistance: number,
    endDistance: number,
    pitch: number,
    lookBias: LookBias | undefined,
    step: number,
  ): DriftSteps<{ lookRoom: LookRoom; blockedFraction: number }> {
    const ahead = yield * findAheadFeature(target, track, startDistance, endDistance)
    const levelList = LOOK_ROOM_OFFSET_LIST
    const scoreTable: number[][] = []
    const depthTable: number[][] = []
    for (let distance = startDistance; distance <= endDistance + step * 0.5; distance += step) {
      /** 每個取樣點要探九束射線，兩點之間讓出一次 */
      yield
      sampleDriftTrack(track, Math.min(distance, track.length), probeSample)
      const { x, y, z, yaw } = probeSample
      const featureOffset = ahead ? clamp(diffAngle(Math.atan2(ahead.x - x, ahead.z - z), yaw), { min: -LOOK_ROOM_MAX, max: LOOK_ROOM_MAX }) : null
      const depthList = levelList.map((offset) => probeViewDistance3D(target.worldState, x, y, z, yaw + offset, pitch, LOOK_ROOM_DEPTH_MAX))
      depthTable.push(depthList)
      scoreTable.push(levelList.map((offset, index) => {
        const featureBonus = featureOffset === null ? 0 : Math.exp(-(((offset - featureOffset) / 0.25) ** 2)) * 0.5
        return (Math.min(1, itemAt(depthList, index) / LOOK_ROOM_DEPTH_GOOD) + featureBonus)
          * (LOOK_ROOM_CENTER_WEIGHT + (1 - LOOK_ROOM_CENTER_WEIGHT) * Math.exp(-((offset / 0.7) ** 2)))
          * getBiasFactor(lookBias, yaw + offset)
      }))
    }

    /** 動態規劃：total[i][k] 是走到第 i 點、偏角檔位 k 的最高總分；檔位每一點最多換一檔 */
    const count = scoreTable.length
    const total: number[][] = []
    const from: number[][] = []
    for (let index = 0; index < count; index++) {
      const row: number[] = []
      const back: number[] = []
      for (let level = 0; level < levelList.length; level++) {
        let bestPrevious = 0
        let bestValue = Number.NEGATIVE_INFINITY
        if (index === 0) {
          /** 起點：從原本的視線（偏角零）出發，只能偏一檔以內 */
          const zeroLevel = levelList.indexOf(0)
          bestValue = Math.abs(levelList.indexOf(levelList[level] ?? 0) - zeroLevel) <= 1 ? 0 : Number.NEGATIVE_INFINITY
        }
        else {
          for (let previous = Math.max(0, level - 1); previous <= Math.min(levelList.length - 1, level + 1); previous++) {
            const value = itemAt(itemAt(total, index - 1), previous) - (previous === level ? 0 : LOOK_ROOM_SWITCH_COST)
            if (value > bestValue) {
              bestValue = value
              bestPrevious = previous
            }
          }
        }
        row.push(bestValue + itemAt(itemAt(scoreTable, index), level))
        back.push(bestPrevious)
      }
      total.push(row)
      from.push(back)
    }

    const pathLevelList: number[] = []
    if (count > 0) {
      let level = 0
      let bestValue = Number.NEGATIVE_INFINITY
      for (const [candidate, value] of itemAt(total, count - 1).entries()) {
        if (value > bestValue) {
          bestValue = value
          level = candidate
        }
      }
      for (let index = count - 1; index >= 0; index--) {
        pathLevelList[index] = level
        level = itemAt(itemAt(from, index), level)
      }
    }

    let blockedCount = 0
    const rawList = pathLevelList.map((level, index) => {
      if (itemAt(itemAt(depthTable, index), level) < BLOCKED_DEPTH)
        blockedCount++
      return itemAt(levelList, level)
    })
    /** 輕輕平滑一次：前後各一點取平均，換檔的折角變圓 */
    const offsetList = rawList.map((_, index) => {
      const before = rawList[Math.max(0, index - 1)] ?? 0
      const after = rawList[Math.min(rawList.length - 1, index + 1)] ?? 0
      return (before + (rawList[index] ?? 0) * 2 + after) / 4
    })
    return { lookRoom: { startDistance, step, offsetList }, blockedFraction: rawList.length > 0 ? blockedCount / rawList.length : 0 }
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
  function* beginTrackShot(target: DriftSession, plan: NextPlan, startDistance: number, endDistance: number, isLast: boolean): DriftSteps {
    const { track } = plan
    const isFly = plan.kind === 'fly'
    sampleDriftTrack(track, startDistance, scratch)
    const context: GazeContext = { ...createGazeContext(target), pathYaw: scratch.yaw, pathPitch: scratch.pitch, elapsed: 0 }
    const thirds = THIRDS_OFFSET * randomSign()
    const openness = yield * measureOpennessSteps(target.worldState, track, startDistance, endDistance)
    const isOpen = openness > 0.6
    const candidateMap = new Map<ShotId, { gaze: Gaze; fit: number }>()

    /** 看前進方向：最平常，林子裡更適合（視線不被側面的樹幹拉走） */
    const isOutward = target.realm.driftLookBias === 'outward'
    const compositionPitch = plan.isGlide ? GLIDE_COMPOSITION_PITCH : getCompositionPitch(isFly, openness, isOutward)
    const lookBias = getLookBias(target)
    const curviness = measureCurviness(track, startDistance, endDistance)
    yield
    const lookRoom = yield * chooseLookRoom(target, track, startDistance, endDistance, compositionPitch, lookBias, isFly ? LOOK_ROOM_FLY_STEP : LOOK_ROOM_STEP)
    candidateMap.set('follow', {
      gaze: isFly
        ? { kind: 'heading', lookRoom: lookRoom.lookRoom }
        : { kind: 'heading', pitch: compositionPitch, minPitch: isOutward ? OUTWARD_PITCH_MIN : openness < 0.45 ? 0 : undefined, lookRoom: lookRoom.lookRoom },
      fit: (openness < 0.45 ? 2 : 1) * Math.exp(-curviness * FOLLOW_CURVINESS_SCALE) * (1 - lookRoom.blockedFraction * 0.7),
    })

    /** 看向目的地：只在最後一段，目的地大致在前方、夠遠、而且看得到它 */
    /** 目的地是為了欣賞某個特色主體而設的站位，就一路看著那個主體走過去，不是看著站位本身 */
    const subjectPoint = plan.destination.feature
      ? { x: plan.destination.feature.x, y: plan.destination.feature.y, z: plan.destination.feature.z }
      : { x: plan.destination.blockX, y: plan.destination.footY + SUBJECT_HEIGHT, z: plan.destination.blockZ }
    const destinationDistance = Math.hypot(subjectPoint.x - target.x, subjectPoint.z - target.z)
    const bearing = Math.atan2(subjectPoint.x - target.x, subjectPoint.z - target.z)
    /** 各鏡位看的是哪個主體（選中之後記進涵蓋紀錄） */
    let dollyFeature: DriftFeature | null = null
    let leadFeature: DriftFeature | null = null
    if (isLast && destinationDistance >= SUBJECT_DISTANCE_MIN && Math.abs(diffAngle(bearing, scratch.yaw)) <= 1 && (!isFly || plan.destination.feature)) {
      const destinationView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'point', x: subjectPoint.x, z: subjectPoint.z }, compositionPitch)
      yield
      const destinationSight = yield * measureSubjectVisibilitySteps(target.worldState, track, startDistance, endDistance, subjectPoint, SUBJECT_DISTANCE_MIN)
      if (destinationView.blockedFraction <= DESTINATION_BLOCKED_MAX && destinationSight.visibleFraction >= SUBJECT_VISIBLE_MIN) {
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
          fit: (openness < 0.45 ? 1.8 : 1) * (1 - destinationView.blockedFraction),
        })
        dollyFeature = plan.destination.feature?.source ?? null
      }
    }

    /**
     * 沒有目的地可看的時候（不是最後一段、目的地不是特色），改看前方看得到的特色主體：
     * 峽谷與樹林裡側面都是牆，往前看向瀑布、溪的彎處、木橋才有東西可看
     */
    if (!candidateMap.has('dollyIn')) {
      const ahead = yield * findAheadFeature(target, track, startDistance, endDistance)
      if (ahead) {
        candidateMap.set('dollyIn', {
          gaze: { kind: 'subject', x: ahead.x, y: ahead.y, z: ahead.z, thirds, behind: false },
          fit: openness < 0.45 ? 1.8 : 1,
        })
        dollyFeature = ahead.feature
      }
    }

    /**
     * 側移（滑軌）：鎖定世界裡的一個方向，鏡頭平移、構圖不變，只有每秒一兩度的慢漂（朝前進方向，前方留著去路）。
     * 兩側都量一下，挑貼臉前景少的那一側；兩側都有貼臉的樹、或正前方老被擋住就不用
     */
    yield
    const truckOffset = randomBetween(TRUCK_ANGLE_RANGE[0], TRUCK_ANGLE_RANGE[1])
    const midHeading = getHeadingAt(track, (startDistance + endDistance) / 2)
    const leftYaw = midHeading - truckOffset
    const rightYaw = midHeading + truckOffset
    const leftView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'yaw', yaw: leftYaw }, compositionPitch)
    yield
    const rightView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'yaw', yaw: rightYaw }, compositionPitch)
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
        /** 側面越常被擋越少選：窄谷與林子裡側面的牆（或樹幹）近在眼前，就是一面牆 */
        fit: (isOpen ? 1.5 : 0.7) * (1 - truckView.blockedFraction * 4),
      })
    }

    /**
     * 有視線偏好的場景（往外看的雪稜）：側移直接鎖定在偏好的方向，不管那個方向與前進方向差多少，
     * 只要畫面中央一路看得出去。鏡頭沿著路平移，畫面始終是越過邊緣的雲海與遠山
     */
    const region = getDriftRegion(target.realm)
    if (lookBias && region && getMinRadius(track, startDistance, endDistance, region) >= RADIAL_RADIUS_MIN) {
      /** 視線是「離開（或朝向）中心」，隨位置即時算：繞著外緣飛時一路朝外，不是鎖死一個世界方向 */
      const isOutward = target.realm.driftLookBias === 'outward'
      yield
      const biasView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'radial', centerX: region.x, centerZ: region.z, isOutward }, compositionPitch)
      if (biasView.nearFraction <= LOOK_BIAS_NEAR_MAX && biasView.blockedFraction <= LOOK_BIAS_BLOCKED_MAX) {
        candidateMap.set('truck', {
          gaze: { kind: 'radial', centerX: region.x, centerZ: region.z, isOutward, pitch: compositionPitch },
          fit: LOOK_BIAS_TRUCK_FIT,
        })
      }
    }

    yield
    /** 拉遠揭露：回頭看來處，身後要看得遠才有風景可揭 */
    const backView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'offset', offset: Math.PI }, compositionPitch)
    yield
    const startPoint = { x: target.x, y: target.eyeY - 0.6, z: target.z }
    const backSight = yield * measureSubjectVisibilitySteps(target.worldState, track, startDistance, endDistance, startPoint, SUBJECT_DISTANCE_MIN)
    if (backView.blockedFraction <= 0.25 && backSight.visibleFraction >= SUBJECT_VISIBLE_MIN) {
      candidateMap.set('pullBack', {
        gaze: { kind: 'subject', x: target.x, y: target.eyeY - 0.6, z: target.z, thirds, behind: true },
        fit: isOpen ? 1.5 : 0.5,
      })
    }

    yield
    /** 視差：固定一個側面的景物，正中央看得到它、畫面邊緣有前景（樹與石柱）掠過，而且不貼臉 */
    const side = findSideSubject(target, track, (startDistance + endDistance) / 2)
    if (side) {
      const sideView = yield * measureViewSteps(target.worldState, track, startDistance, endDistance, { kind: 'point', x: side.x, z: side.z }, compositionPitch)
      yield
      const sideSight = yield * measureSubjectVisibilitySteps(target.worldState, track, startDistance, endDistance, side, SUBJECT_DISTANCE_MIN)
      if (sideSight.visibleFraction >= SUBJECT_VISIBLE_MIN && sideView.foregroundFraction >= PARALLAX_FOREGROUND_MIN && sideView.nearFraction <= NEAR_FOREGROUND_MAX) {
        candidateMap.set('parallax', {
          gaze: { kind: 'subject', x: side.x, y: side.y, z: side.z, thirds: thirds * 0.6, behind: false },
          fit: 1 + sideView.foregroundFraction * 3,
        })
      }
    }

    /**
     * 沿線跟拍：這一段路貼著一條線狀的主體（溪、岸、木棧）走，視線落在它前方十幾格的地方，一路順著它望過去；
     * 窄的地方（溪谷）更適合——側面都是牆，順著溪看才有縱深
     */
    if (!isFly) {
      yield
      const lead = yield * findLeadPath(target, track, startDistance, endDistance)
      if (lead) {
        candidateMap.set('lead', { gaze: lead.gaze, fit: LEAD_SHOT_FIT * (openness < 0.45 ? 1.5 : 1) })
        leadFeature = lead.feature
      }
    }

    /** 繞飛的那一趟：視線鎖在繞著的地標上，置中；這一段大半看得到它才用（被樹冠、山頭擋住就照平常的鏡位） */
    if (plan.arc) {
      yield
      const { feature } = plan.arc
      const arcSight = yield * measureSubjectVisibilitySteps(target.worldState, track, startDistance, endDistance, feature, SUBJECT_DISTANCE_MIN)
      if (arcSight.visibleFraction >= ARC_VISIBLE_MIN) {
        candidateMap.set('arc', {
          gaze: { kind: 'subject', x: feature.x, y: feature.y, z: feature.z, thirds: 0, behind: false },
          fit: ARC_SHOT_FIT,
        })
      }
    }

    yield
    const shot = pickShot(
      plan.kind,
      (id) => candidateMap.has(id),
      (id) => {
        const candidate = candidateMap.get(id)
        /**
         * 與上一段同樣的鏡位不連用；三種例外的畫面本來就接得起來，沒有換鏡的感覺：
         * 視線朝外（朝內）的 radial 側移、繞飛（同一個地標繞到底）、沿線跟拍（同一條溪一路跟下去）
         */
        if (!candidate || (id === target.lastTrackShotId && candidate.gaze.kind !== 'radial' && id !== 'arc' && id !== 'lead'))
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
    if (shotId === 'arc')
      setSequence(target, 'aerialOrbit', plan.arc?.feature ?? null)
    else if (shotId === 'lead')
      setSequence(target, 'pathFollow', leadFeature)
    else if (shotId === 'dollyIn' && dollyFeature)
      setSequence(target, 'approach', dollyFeature)
    else
      setSequence(target, plan.isGlide ? 'glide' : 'travel', null)
  }

  /** 線狀主體的點列裡離 (x, z) 最近的是第幾個點、離多遠 */
  function findNearestPathPoint(pathList: readonly { x: number; z: number }[], x: number, z: number): { index: number; distance: number } {
    let index = 0
    let distance = Number.POSITIVE_INFINITY
    for (const [cursor, point] of pathList.entries()) {
      const gap = Math.hypot(point.x - x, point.z - z)
      if (gap < distance) {
        distance = gap
        index = cursor
      }
    }
    return { index, distance }
  }

  /**
   * 這一段路是不是貼著一條線狀主體走：頭、中、尾三處都在線旁邊，而且沿著線有前進（不是橫著穿過去）
   *
   * 是的話回傳沿線跟拍的視線設定；沿路取幾個點，確認看得到「前方那一點」的比例夠高
   */
  function* findLeadPath(target: DriftSession, track: DriftTrack, startDistance: number, endDistance: number): DriftSteps<{ gaze: PathGaze; feature: DriftFeature } | null> {
    let best: { gaze: PathGaze; feature: DriftFeature } | null = null
    let bestScore = 0

    for (const feature of target.realm.driftFeatureList ?? []) {
      const { pathList } = feature
      if (!pathList || pathList.length < 3)
        continue
      const slotWeight = getSlotWeight(target, feature)
      const score = (0.3 + feature.weight) * slotWeight
      if (score <= bestScore)
        continue

      sampleDriftTrack(track, startDistance, probeSample)
      const startNear = findNearestPathPoint(pathList, probeSample.x, probeSample.z)
      sampleDriftTrack(track, (startDistance + endDistance) / 2, probeSample)
      const midNear = findNearestPathPoint(pathList, probeSample.x, probeSample.z)
      sampleDriftTrack(track, endDistance, probeSample)
      const endNear = findNearestPathPoint(pathList, probeSample.x, probeSample.z)
      if (Math.max(startNear.distance, midNear.distance, endNear.distance) > LEAD_ALONG_DISTANCE_MAX || startNear.index === endNear.index)
        continue
      yield

      const segmentMax = pathList.length - 2
      const gaze = createPathGaze(pathList, endNear.index > startNear.index ? 1 : -1, Math.min(segmentMax, startNear.index))
      /** 走到線的盡頭附近時看的那一點就在腳邊（視線會放開、轉回前進方向），那幾個取樣不算；剩下的要大半看得到 */
      let visibleCount = 0
      let validCount = 0
      for (let step = 0; step < LEAD_SAMPLE_COUNT; step++) {
        sampleDriftTrack(track, startDistance + ((endDistance - startDistance) * (step + 0.5)) / LEAD_SAMPLE_COUNT, probeSample)
        gaze.cursor = Math.min(segmentMax, findNearestPathPoint(pathList, probeSample.x, probeSample.z).index)
        const point = locateLeadPoint(gaze, probeSample.x, probeSample.z)
        if (Math.hypot(point.x - probeSample.x, point.z - probeSample.z) < LEAD_RELEASE_RANGE[0])
          continue
        validCount++
        if (isSightlineClear3D(target.worldState, probeSample.x, probeSample.y, probeSample.z, point.x, point.y, point.z))
          visibleCount++
      }
      gaze.cursor = Math.min(segmentMax, startNear.index)
      if (validCount >= LEAD_SAMPLE_COUNT / 2 && visibleCount / validCount >= LEAD_VISIBLE_MIN) {
        bestScore = score
        best = { gaze, feature }
      }
    }
    return best
  }

  /** 一趟開始：算好切點，第一段鏡位 */
  function startTrackShot(target: DriftSession, plan: NextPlan) {
    target.shotCutList = planShotCutList(plan.track, plan.kind === 'fly' ? FLY_SPEED : WALK_SPEED)
    target.shotCutIndex = 0
    /** 量鏡位要好幾毫秒，排成分幀工作；做好之前先沿用上一段的視線（停留尾聲已經轉向路的方向） */
    jobQueue.clear()
    scheduleJob('走路的鏡位', beginTrackShot(target, plan, 0, target.shotCutList[0] ?? plan.track.length, target.shotCutList.length === 0))
  }

  /** 走到切點就換下一段鏡位 */
  function updateTrackShot(target: DriftSession, plan: NextPlan) {
    const cut = target.shotCutList[target.shotCutIndex]
    if (cut === undefined || target.trackDistance < cut)
      return

    target.shotCutIndex++
    const next = target.shotCutList[target.shotCutIndex]
    jobQueue.clear()
    scheduleJob('走路的鏡位', beginTrackShot(target, plan, cut, next ?? plan.track.length, next === undefined))
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

  /** 停留的開頭是不是日出日落（含太陽落下之後雲還燒著的那一段，見 drift-direction 的 getDaySlot） */
  function isGoldenHour(): boolean {
    return getDaySlot(getTimeOfDay()) === 'golden'
  }

  /** 日出日落時，這一次的雲燒得多兇要加碼幾成（零到一）；其他時段是零 */
  function getGoldenBurnEmphasis(): number {
    return isGoldenHour() ? getBurnEmphasis(getBurnIntensity()) : 0
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
    /** 日出日落：方位貼近太陽的主體是逆光的剪影，加權（太陽與主體一起入鏡） */
    const sunYaw = getSlot(target) === 'golden' ? getSunYaw() : null
    for (const feature of target.realm.driftFeatureList ?? []) {
      /** 時段權重：夜裡看燈火、日出日落看遠景；不在演出的主體（權重零）不看 */
      const slotWeight = getSlotWeight(target, feature)
      if (slotWeight <= 0)
        continue
      const pathList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : [feature]
      const step = Math.max(1, Math.ceil(pathList.length / FEATURE_PATH_SAMPLE_MAX))
      for (let index = 0; index < pathList.length; index += step) {
        const point = itemAt(pathList, index)
        const distance = Math.hypot(point.x - target.x, point.z - target.z)
        if (distance < SUBJECT_DISTANCE_MIN)
          continue

        const [near, far] = feature.viewDistance
        const bandRatio = distance >= near * 0.6 && distance <= far * 1.6 ? 1 : 0.35
        const isBacklit = sunYaw !== null && Math.abs(diffAngle(Math.atan2(point.x - target.x, point.z - target.z), sunYaw)) <= SILHOUETTE_ANGLE
        interestList.push({ x: point.x, y: point.y, z: point.z, weight: (0.5 + feature.weight * 1.5) * bandRatio * slotWeight * (isBacklit ? SILHOUETTE_BONUS : 1) })
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
  function* chooseLingerView(target: DriftSession, isNearCurrent = false): DriftSteps<{ yaw: number; pitch: number; note: string }> {
    /** 特色主體（溪、瀑布、建物、遠景…）是主要的看點；音源與停留點只是弱弱的偏向，而且要看得到才算 */
    const interestList: LookInterest[] = listFeatureInterest(target)
    const loudest = findLingerSubject(target)
    if (loudest)
      interestList.push({ x: loudest.x, z: loudest.z, weight: 0.3 })
    for (const emitter of target.emitterList)
      interestList.push({ x: emitter.x, z: emitter.z, weight: 0.1 })
    for (const point of target.pointList)
      interestList.push({ x: point.blockX, z: point.blockZ, weight: 0.15 })
    /** 天上的看點：日出日落的太陽，晨昏與夜裡的月亮（太陽的正對面） */
    const sky = getSkyInterest(target)
    const skyInterest: LookInterest | null = sky ? { x: target.x + Math.sin(sky.yaw) * 100, z: target.z + Math.cos(sky.yaw) * 100, weight: sky.weight } : null
    if (skyInterest)
      interestList.push(skyInterest)

    const basePitch = getLingerPitch(target)
    const chosen = yield * chooseLookYawSteps(target.worldState, target.x, target.eyeY, target.z, {
      currentYaw: target.yawFollower.value,
      interestList,
      minDepth: LOOK_MIN_DEPTH,
      turnScale: isNearCurrent ? 0.9 : 1.6,
      pitch: basePitch,
      bias: getLookBias(target),
    })
    if (chosen) {
      const { interest } = chosen
      /**
       * 看的是太陽（月亮）：不放正中央，偏到畫面的三分線上，另外三分之二留給被它照亮的風景；
       * 往縱深比較長的那一側偏
       */
      if (interest !== null && interest === skyInterest) {
        const leftDepth = probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, chosen.yaw - SUN_THIRDS_OFFSET, basePitch, LOOK_ROOM_DEPTH_MAX)
        const rightDepth = probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, chosen.yaw + SUN_THIRDS_OFFSET, basePitch, LOOK_ROOM_DEPTH_MAX)
        const side = leftDepth === rightDepth ? randomSign() : leftDepth > rightDepth ? -1 : 1
        return { yaw: chosen.yaw + side * SUN_THIRDS_OFFSET, pitch: basePitch, note: 'sky' }
      }
      /** 看的是有高度的主體（瀑布頂、溪面、雲海）就把俯仰對準它，構圖俯仰佔兩成 */
      if (interest?.y !== undefined) {
        const distance = Math.max(1, Math.hypot(interest.x - target.x, interest.z - target.z))
        return { yaw: chosen.yaw, pitch: Math.atan2(target.eyeY - interest.y, distance) * 0.8 + basePitch * 0.2, note: 'feature' }
      }
      return { yaw: chosen.yaw, pitch: basePitch, note: interest ? 'sound-source' : 'fallback:open-direction' }
    }

    const plan = target.nextPlan
    return {
      yaw: plan ? itemAt(plan.track.yawList, Math.min(plan.track.yawList.length - 1, ANTICIPATE_LOOKAHEAD_SAMPLE)) : target.yawFollower.value,
      pitch: basePitch,
      note: plan ? 'next-path' : 'fallback:keep',
    }
  }

  /**
   * 天上此刻值得看的方向：日出日落是太陽那一側，晨昏與夜裡是月亮那一側（月亮在太陽的正對面）
   *
   * 地底沒有天空；太陽的高度有給（y）時，月亮要太陽落到地平線下才算
   */
  function getSkyInterest(target: DriftSession): { yaw: number; weight: number } | null {
    if (target.realm.isUnderground)
      return null

    const sunYaw = getSunYaw()
    if (sunYaw === null)
      return null

    const slot = getSlot(target)
    if (slot === 'golden')
      return { yaw: sunYaw, weight: 1.2 + BURN_SKY_INTEREST_BONUS * getGoldenBurnEmphasis() }
    if ((slot === 'blue' || slot === 'night') && (getSunDirection().y ?? -1) < 0)
      return { yaw: sunYaw + Math.PI, weight: MOON_INTEREST_WEIGHT }
    return null
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
    /**
     * 先把上一次停留的繞弧與升降收掉，排好之前（算下一趟、量縱深要幾毫秒）先定格：視線維持原樣，
     * 鏡位算好才換。這幾件事都在這一幀做完的話，鏡頭會頓一下
     */
    target.motionTrack = null
    target.crane = null
    target.craneY = 0
    target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
    scheduleJob('停留的鏡位', planLingerShot(target))
  }

  function* planLingerShot(target: DriftSession): DriftSteps {
    target.panSign = randomSign()
    setSequence(target, 'scenery', null)
    /** 被圍在牆裡（站在山壁下的小凹處）：沒有地方可看，不要對著牆發呆，匆匆一瞥就走，這個點之後少來 */
    const isEnclosed = (yield * measureMaxDepthSteps(target.worldState, target.x, target.eyeY, target.z, getLingerPitch(target))) < LOOK_MIN_DEPTH
    if (isEnclosed) {
      target.lingerDuration = Math.min(target.lingerDuration, ENCLOSED_LINGER_SECOND)
      if (target.currentPoint && !target.enclosedIdList.includes(target.currentPoint.id))
        target.enclosedIdList.push(target.currentPoint.id)
    }
    /**
     * 還剩多久（從現在算起）
     *
     * 這件事在分幀工作裡，可能在停留開始之後才算好；繞弧與升降的時程是「停留經過的秒數」，
     * 都要以現在為起點，不然升降會從一半的地方跳出來。剛抵達就算好時 startElapsed 是零，與以前相同
     */
    const startElapsed = target.lingerElapsed

    /**
     * 有特色主體可拍（站在它的觀賞站位，或從這裡看得到一個）：照那種主體的造訪計畫拍，
     * 開場一個運動、接一段鎖定構圖的細看；沒有的話，看有沒有「升起來才看得到」的主體可以揭露；
     * 都沒有才是下面平常的停留（橫搖、定格，偶爾繞著音源走或升降）
     */
    if (!isEnclosed) {
      const visit = yield * findVisitSubject(target)
      if (visit && (yield * planFeatureVisit(target, visit, startElapsed)))
        return

      yield
      const reveal = yield * findRevealSubject(target)
      if (reveal && Math.random() < REVEAL_CHANCE) {
        startCrane(target, reveal.height, startElapsed, randomBetween(CRANE_PEAK_HOLD_RANGE[0], CRANE_PEAK_HOLD_RANGE[1]) + 2)
        setShot(target, 'crane', { kind: 'subject', x: reveal.feature.x, y: reveal.feature.y, z: reveal.feature.z, thirds: THIRDS_OFFSET * randomSign(), behind: false })
        target.pitchRange = VISIT_PITCH_RANGE
        target.detailZoom = 0
        target.lingerDuration = Math.min(VISIT_SECOND_MAX, Math.max(target.lingerDuration, (target.crane?.endAt ?? 0) + 3 + ANTICIPATE_SECOND))
        setSequence(target, 'reveal', reveal.feature, 'crane')
        target.lastLingerShotId = 'crane'
        return
      }
    }

    const duration = target.lingerDuration - startElapsed
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
            orbitTrack = yield * createWalkTrackSteps(polyline.xList, polyline.zList, polyline.footYList, PLAYER_EYE_HEIGHT)
            break
          }
        }
      }
    }
    yield
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
        /** 仰搖要有一個高的主體，只在造訪計畫裡用（見 planFeatureVisit） */
        if (id === 'tilt')
          return false
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
          target.motionStartAt = startElapsed + MOTION_START_DELAY
          setShot(target, 'orbit', { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false })
          target.lingerBeat = { kind: 'orbit', endAt: Number.POSITIVE_INFINITY }
          return
        }
        break
      case 'crane': {
        const upAt = startElapsed + MOTION_START_DELAY
        const peakHold = Math.max(0, Math.min(
          randomBetween(CRANE_PEAK_HOLD_RANGE[0], CRANE_PEAK_HOLD_RANGE[1]),
          usableDuration - 1 - MOTION_START_DELAY - CRANE_MOVE_SECOND * 2,
        ))
        const downAt = upAt + CRANE_MOVE_SECOND + peakHold
        target.crane = {
          height: randomBetween(CRANE_HEIGHT_RANGE[0], CRANE_HEIGHT_RANGE[1]),
          startAt: upAt,
          downAt,
          endAt: downAt + CRANE_MOVE_SECOND,
          upSecond: CRANE_MOVE_SECOND,
          downSecond: CRANE_MOVE_SECOND,
        }
        setShot(target, 'crane', lookTarget
          ? { kind: 'subject', ...lookTarget, thirds: THIRDS_OFFSET * randomSign(), behind: false }
          : { kind: 'pan', baseYaw: (yield * chooseLingerView(target, true)).yaw, rate: target.panSign * PAN_RATE_RANGE[0], pitch: getLingerPitch(target) })
        target.lingerBeat = { kind: 'crane', endAt: target.crane.endAt }
        return
      }
      case 'pan':
        yield * startPanBeat(target, true)
        return
      default:
        break
    }

    yield * startHoldBeat(target)
  }

  /** 造訪的對象：哪個主體、視線對準它的哪一點（線狀主體取看得到的那一點）、是不是站在它的觀賞站位 */
  interface VisitSubject { feature: DriftFeature; x: number; y: number; z: number; isStand: boolean }

  /**
   * 這次停留有沒有特色主體可拍
   *
   * 站在某個主體的觀賞站位（而且它此刻在演出、從這裡看得到）就是它；
   * 否則從這裡看得到、距離合適的主體裡挑一個（重要、時段適合、還沒拍過的優先），有一定機率才拍——
   * 不是每一次停留都對著主體，留一些給單純的風景
   */
  function* findVisitSubject(target: DriftSession): DriftSteps<VisitSubject | null> {
    /** 場景的視線偏好（雪稜往外看）：方位不合的主體不造訪，合的照合的程度加權 */
    const lookBias = getLookBias(target)
    const getFit = (point: { x: number; z: number }) => getBiasFactor(lookBias, Math.atan2(point.x - target.x, point.z - target.z))

    const stand = target.currentPoint?.feature?.source
    if (stand && getSlotWeight(target, stand) > 0 && getFit(stand) >= VISIT_BIAS_FACTOR_MIN
      && Math.hypot(stand.x - target.x, stand.z - target.z) >= SUBJECT_DISTANCE_MIN
      && isSightlineClear3D(target.worldState, target.x, target.eyeY, target.z, stand.x, stand.y, stand.z, Math.max(1.5, stand.size / 2))) {
      return { feature: stand, x: stand.x, y: stand.y, z: stand.z, isStand: true }
    }
    /** 日出日落：主角是天空，路過的主體少拍一些；方位貼近太陽的主體（逆光剪影、與太陽一起入鏡）優先 */
    const sunYaw = getSlot(target) === 'golden' ? getSunYaw() : null
    if (Math.random() >= (sunYaw === null ? VISIT_PASSING_CHANCE : VISIT_PASSING_CHANCE_GOLDEN))
      return null

    let best: VisitSubject | null = null
    let bestScore = 0
    for (const feature of target.realm.driftFeatureList ?? []) {
      const slotWeight = getSlotWeight(target, feature)
      if (slotWeight <= 0)
        continue
      yield

      const novelty = target.ledger.getNovelty(feature, getCoverageSector(feature, target.x, target.z), target.clock)
      const pathList = feature.pathList && feature.pathList.length > 0 ? feature.pathList : []
      const step = Math.max(1, Math.ceil(pathList.length / FEATURE_PATH_SAMPLE_MAX))
      const pointList: { x: number; y: number; z: number }[] = [feature]
      for (let index = 0; index < pathList.length; index += step)
        pointList.push(itemAt(pathList, index))

      for (const point of pointList) {
        const distance = Math.hypot(point.x - target.x, point.z - target.z)
        if (distance < Math.max(SUBJECT_DISTANCE_MIN, feature.viewDistance[0] * 0.6) || distance > feature.viewDistance[1] * 1.6)
          continue

        const isBacklit = sunYaw !== null && Math.abs(diffAngle(Math.atan2(point.x - target.x, point.z - target.z), sunYaw)) <= SILHOUETTE_ANGLE
        const fit = getFit(point) * (isBacklit ? SILHOUETTE_BONUS : 1)
        const score = ((0.2 + feature.weight) * slotWeight * novelty * fit) / (1 + distance / 60)
        if (fit < VISIT_BIAS_FACTOR_MIN || score <= bestScore || !isSightlineClear3D(target.worldState, target.x, target.eyeY, target.z, point.x, point.y, point.z))
          continue
        bestScore = score
        best = { feature, x: point.x, y: point.y, z: point.z, isStand: false }
      }
    }
    return best
  }

  /** 升降用的那一柱是不是乾淨的：腳下露天，身體左右各零點三格碰到的格子也露天（停在格子邊緣時不會貼著隔壁的樹葉升上去） */
  function isCraneColumnOpen(target: DriftSession): boolean {
    const here = target.grid.getCellNear(Math.round(target.x), Math.round(target.z), target.blockY)
    if (!here?.isOpenSky)
      return false
    for (const offsetX of TAKEOFF_PROBE_OFFSET_LIST) {
      for (const offsetZ of TAKEOFF_PROBE_OFFSET_LIST) {
        if (!target.grid.getCellNear(Math.round(target.x + offsetX), Math.round(target.z + offsetZ), here.blockY)?.isOpenSky)
          return false
      }
    }
    return true
  }

  /**
   * 排一次升降：停一下、升起、在頂端停 peakHold 秒、降回來
   *
   * 升與降的時間跟著高度走（垂直速度維持在每秒半格上下），降得比升得快一些：升起是揭露，降回只是收尾
   */
  function startCrane(target: DriftSession, height: number, startElapsed: number, peakHold: number) {
    const upSecond = Math.max(CRANE_MOVE_SECOND, height * CRANE_UP_SECOND_PER_BLOCK)
    const downSecond = Math.max(CRANE_MOVE_SECOND, height * CRANE_DOWN_SECOND_PER_BLOCK)
    const upAt = startElapsed + MOTION_START_DELAY
    const downAt = upAt + upSecond + peakHold
    target.crane = { height, startAt: upAt, downAt, endAt: downAt + downSecond, upSecond, downSecond }
    target.lingerBeat = { kind: 'crane', endAt: downAt + downSecond }
  }

  /**
   * 照主體的造訪計畫安排這次停留；一種計畫都做不到就回 false（呼叫端照平常的停留）
   *
   * 計畫的候選與權重在 drift-direction 的 FEATURE_DIRECTION_MAP；這裡負責判斷此刻做不做得到：
   * 繞弧要弧線走得通、弧的終點還看得到主體；升降要頭頂露天；仰搖要主體夠高（頂與底的俯仰差夠大）；沿線橫搖要線狀主體看得到。
   * 與這個主體上次用過的計畫不重複。停留的長度由計畫決定（開場運動 + 細看 + 尾聲轉向下一段路）
   */
  function* planFeatureVisit(target: DriftSession, visit: VisitSubject, startElapsed: number): DriftSteps<boolean> {
    const { feature } = visit
    const direction = FEATURE_DIRECTION_MAP[feature.kind]
    const distance = Math.hypot(visit.x - target.x, visit.z - target.z)
    const bearing = Math.atan2(visit.x - target.x, visit.z - target.z)

    /**
     * 主體放在三分線的哪一側（置中的主體不偏）：畫面正中央那一束視線要有縱深，哪一側近處沒有東西擋著就偏哪一側，
     * 兩側都不行就置中，連置中都被近處的樹幹或牆擋住就不拍這個主體
     */
    const aimPitch = clamp(Math.atan2(target.eyeY - visit.y, Math.max(1, distance)), { min: VISIT_PITCH_RANGE[0], max: VISIT_PITCH_RANGE[1] })
    const depthNeed = Math.min(VISIT_CENTER_DEPTH_MIN, distance * VISIT_CENTER_DEPTH_RATIO)
    const firstSide = randomSign()
    const thirds = (direction.isCentered ? [0] : [THIRDS_OFFSET * firstSide, -THIRDS_OFFSET * firstSide, 0])
      .find((offset) => probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, bearing + offset, aimPitch, depthNeed + 0.5) >= depthNeed)
    if (thirds === undefined)
      return false
    const hasPlan = (id: VisitPlanId) => direction.planList.some((choice) => choice.id === id)

    let orbitTrack: DriftTrack | null = null
    if (hasPlan('orbit') && distance >= VISIT_ORBIT_RADIUS_RANGE[0] && distance <= VISIT_ORBIT_RADIUS_RANGE[1]) {
      const arcLength = Math.min(ORBIT_ARC_MAX, distance * randomBetween(ORBIT_SWEEP_RANGE[0], ORBIT_SWEEP_RANGE[1]))
      const firstSign = randomSign()
      for (const sign of [firstSign, firstSign === 1 ? -1 : 1] as const) {
        const polyline = planArcPath(target.grid, { x: target.x, z: target.z, blockY: target.blockY }, { x: visit.x, z: visit.z }, arcLength, sign)
        if (!polyline || polyline.xList.length < 2)
          continue
        /**
         * 弧的中點與終點也要看得到主體，而且朝它看過去畫面正中央有縱深：繞到樹後、牆後、貼著岩壁走就不繞這一邊
         * （只驗起點的話，弧走到一半主體被擋住，鏡頭對著一面牆慢慢橫移）
         */
        const last = polyline.xList.length - 1
        const isArcFramed = [Math.floor(last / 2), last].every((index) => {
          const pointX = itemAt(polyline.xList, index)
          const pointZ = itemAt(polyline.zList, index)
          const pointEyeY = itemAt(polyline.footYList, index) + PLAYER_EYE_HEIGHT
          return isSightlineClear3D(target.worldState, pointX, pointEyeY, pointZ, visit.x, visit.y, visit.z, Math.max(1.5, feature.size / 2))
            && probeViewDistance3D(target.worldState, pointX, pointEyeY, pointZ, Math.atan2(visit.x - pointX, visit.z - pointZ) + thirds, aimPitch, depthNeed + 0.5) >= depthNeed
        })
        if (!isArcFramed)
          continue
        orbitTrack = yield * createWalkTrackSteps(polyline.xList, polyline.zList, polyline.footYList, PLAYER_EYE_HEIGHT)
        break
      }
    }
    yield

    /** 仰搖：從主體的底部搖到頂部，俯仰夾在造訪的範圍裡；差太小就不搖 */
    const clampVisitPitch = (pitch: number) => clamp(pitch, { min: VISIT_PITCH_RANGE[0], max: VISIT_PITCH_RANGE[1] })
    let topPitch = clampVisitPitch(Math.atan2(target.eyeY - (visit.y + feature.size * TILT_EXTENT_RATIO), distance))
    let bottomPitch = clampVisitPitch(Math.atan2(target.eyeY - (visit.y - feature.size * TILT_EXTENT_RATIO), distance))
    /** 頂與底那兩個俯仰看出去近處就有東西（低頭是腳邊的地面，抬頭是頭頂的樹冠）：往主體中心收，收到畫面正中央有縱深為止 */
    const tiltDepthNeed = Math.min(TILT_CENTER_DEPTH_MIN, distance * 0.8)
    const isDeepAt = (pitch: number) => probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, bearing + thirds, pitch, tiltDepthNeed + 0.5) >= tiltDepthNeed
    while (bottomPitch > aimPitch && !isDeepAt(bottomPitch))
      bottomPitch -= TILT_TRIM_STEP
    while (topPitch < aimPitch && !isDeepAt(topPitch))
      topPitch += TILT_TRIM_STEP
    const canTilt = bottomPitch - topPitch >= TILT_SPAN_MIN && isDeepAt((bottomPitch + topPitch) / 2)
    const pathPan = hasPlan('panAlong') ? findPathPan(target, feature) : null
    const isFeasible = (id: VisitPlanId) => {
      switch (id) {
        case 'orbit':
          return orbitTrack !== null
        case 'crane':
          return isCraneColumnOpen(target)
        case 'tiltUp':
          return canTilt && distance >= Math.max(TILT_DISTANCE_MIN, feature.size * TILT_DISTANCE_SIZE_RATIO)
        case 'panAlong':
          return pathPan !== null
        default:
          return true
      }
    }

    const choiceList = direction.planList.filter((choice) => isFeasible(choice.id))
    const weightList = choiceList.map((choice) => choice.weight * target.ledger.getPlanFactor(feature, choice.id))
    let pick = Math.random() * weightList.reduce((sum, weight) => sum + weight, 0)
    let planId: VisitPlanId | null = null
    for (const [index, choice] of choiceList.entries()) {
      pick -= itemAt(weightList, index)
      if (pick <= 0) {
        planId = choice.id
        break
      }
    }
    planId ??= choiceList[choiceList.length - 1]?.id ?? null
    if (planId === null)
      return false

    const pace = DAY_PACE_MAP[getSlot(target)]
    const detailSecond = randomBetween(VISIT_DETAIL_SECOND_RANGE[0], VISIT_DETAIL_SECOND_RANGE[1]) * pace.lingerScale
    const lookGaze: Gaze = { kind: 'subject', x: visit.x, y: visit.y, z: visit.z, thirds, behind: false }
    target.pitchRange = VISIT_PITCH_RANGE
    target.detailZoom = Math.min(ZOOM_DEPTH_MAX, direction.zoomDepth)

    /** 開場的運動在停留的第幾秒做完；之後鎖定構圖細看 detailSecond 秒，再轉向下一段路 */
    let openerEndAt = startElapsed
    switch (planId) {
      case 'orbit': {
        const track = orbitTrack as DriftTrack
        target.motionTrack = track
        target.motionDistance = 0
        target.motionSpeed = 0
        target.motionAcceleration = 0
        target.motionStartAt = startElapsed + MOTION_START_DELAY
        setShot(target, 'orbit', lookGaze)
        target.lingerBeat = { kind: 'orbit', endAt: Number.POSITIVE_INFINITY }
        /** 弧走多久是估的（起步與收尾各有緩衝），停留本來就會等弧走完才結束 */
        openerEndAt = target.motionStartAt + (track.length / ORBIT_SPEED) * 1.2 + 4
        break
      }
      case 'crane':
        startCrane(target, randomBetween(direction.craneHeightRange[0], direction.craneHeightRange[1]), startElapsed, randomBetween(CRANE_PEAK_HOLD_RANGE[0], CRANE_PEAK_HOLD_RANGE[1]))
        setShot(target, 'crane', lookGaze)
        openerEndAt = target.lingerBeat.endAt
        break
      case 'tiltUp': {
        const second = Math.max(TILT_SECOND_MIN, (bottomPitch - topPitch) / TILT_RATE)
        setShot(target, 'tilt', { kind: 'tilt', yaw: bearing + thirds, fromPitch: bottomPitch, toPitch: topPitch, delay: TILT_START_DELAY, second })
        openerEndAt = startElapsed + TILT_START_DELAY + second + 1.5
        target.lingerBeat = { kind: 'tilt', endAt: openerEndAt }
        break
      }
      case 'panAlong':
        yield * startPanBeat(target, true, pathPan)
        /** 橫搖的終點被擋住時會退成定格（沒有結束時間）：那就當成定格細看 */
        if (target.lingerBeat.kind === 'pan')
          openerEndAt = target.lingerBeat.endAt
        else
          target.zoomGoal = 1 - target.detailZoom
        break
      case 'pushIn':
        /** 定格看著主體，視野從一開始就慢慢收窄；看得久一些，推近才走得完 */
        setShot(target, 'hold', lookGaze)
        target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
        target.zoomGoal = 1 - target.detailZoom
        openerEndAt = startElapsed + (randomBetween(VISIT_PUSH_SECOND_RANGE[0], VISIT_PUSH_SECOND_RANGE[1]) - VISIT_DETAIL_SECOND_RANGE[0]) * pace.lingerScale
        break
      default:
        target.detailZoom = 0
        setShot(target, 'hold', lookGaze)
        target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
        break
    }

    target.lingerDuration = Math.min(VISIT_SECOND_MAX, Math.max(target.lingerDuration, openerEndAt + detailSecond + ANTICIPATE_SECOND))
    setSequence(target, `visit:${planId}`, feature, planId)
    target.lastLingerShotId = target.shotId
    return true
  }

  /**
   * 升起來才看得到的主體（升起揭露）
   *
   * 站著的視線被近處的樹梢、岩稜、屋脊擋住，升高幾格之後看得到：鏡頭升起來，主體從遮擋物後面露出來。
   * 要頭頂露天才升得上去；回傳主體與要升多高（試過的高度裡最低、看得到的那個）
   */
  function* findRevealSubject(target: DriftSession): DriftSteps<{ feature: DriftFeature; height: number } | null> {
    if (!isCraneColumnOpen(target))
      return null

    let best: { feature: DriftFeature; height: number } | null = null
    let bestScore = 0
    for (const feature of target.realm.driftFeatureList ?? []) {
      const slotWeight = getSlotWeight(target, feature)
      const distance = Math.hypot(feature.x - target.x, feature.z - target.z)
      if (slotWeight <= 0 || feature.weight < REVEAL_WEIGHT_MIN || distance < REVEAL_DISTANCE_MIN || distance > feature.viewDistance[1] * 2)
        continue

      const score = feature.weight * slotWeight * target.ledger.getNovelty(feature, getCoverageSector(feature, target.x, target.z), target.clock)
      if (score <= bestScore)
        continue
      yield
      /** 站著就看得到的不是揭露 */
      if (isSightlineClear3D(target.worldState, target.x, target.eyeY, target.z, feature.x, feature.y, feature.z))
        continue
      const height = REVEAL_HEIGHT_LIST.find((rise) => isSightlineClear3D(target.worldState, target.x, target.eyeY + rise, target.z, feature.x, feature.y, feature.z))
      if (height !== undefined) {
        bestScore = score
        best = { feature, height }
      }
    }
    return best
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
  function* startHoldBeat(target: DriftSession, isLockOff = false): DriftSteps {
    if (isLockOff) {
      target.lookTargetYaw = target.yawFollower.value
      target.lookTargetPitch = target.pitchFollower.value
      target.lookNote = 'locked-hold'
    }
    else {
      const view = yield * chooseLingerView(target)
      target.lookTargetYaw = view.yaw
      target.lookTargetPitch = view.pitch
      target.lookNote = view.note
    }
    setShot(target, 'hold', { kind: 'free' })
    target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
  }

  /**
   * 線狀的特色主體（溪流、木棧、長廊）：找一條看得到、距離合適的，回傳它的方位與「往較遠的那一端橫搖」的方向
   *
   * 橫搖沿著它掃，像視線順著溪水望出去
   */
  function findPathPan(target: DriftSession, only?: DriftFeature): { yaw: number; pitch: number; sign: 1 | -1 } | null {
    let best: { yaw: number; pitch: number; sign: 1 | -1 } | null = null
    let bestScore = 0

    for (const feature of only ? [only] : target.realm.driftFeatureList ?? []) {
      const { pathList } = feature
      if (!pathList || pathList.length < 2 || getSlotWeight(target, feature) <= 0)
        continue

      for (const point of pathList) {
        const distance = Math.hypot(point.x - target.x, point.z - target.z)
        if (distance < SUBJECT_DISTANCE_MIN || distance > feature.viewDistance[1] * 1.6)
          continue

        const score = (0.05 + feature.weight) / (1 + distance / 50)
        if (score <= bestScore || !isSightlineClear3D(target.worldState, target.x, target.eyeY, target.z, point.x, point.y, point.z))
          continue

        const yaw = Math.atan2(point.x - target.x, point.z - target.z)
        const first = itemAt(pathList, 0)
        const last = itemAt(pathList, pathList.length - 1)
        const toFirst = diffAngle(Math.atan2(first.x - target.x, first.z - target.z), yaw)
        const toLast = diffAngle(Math.atan2(last.x - target.x, last.z - target.z), yaw)
        const farther = Math.abs(toLast) > Math.abs(toFirst) ? toLast : toFirst
        bestScore = score
        /** 溪面在視線下方：俯仰要對準它，水平看出去只會看到岸邊的山壁 */
        best = { yaw, pitch: Math.atan2(target.eyeY - point.y, distance), sign: farther < 0 ? -1 : 1 }
      }
    }
    return best
  }

  /**
   * 橫搖一小段（掃過約五十度以內）
   *
   * 起點是目前的視線（開頭那一段以有景物的方向為中心，日出日落以太陽為中心）。
   * 每一種中心都要驗證：太陽那一側被山壁擋住就不用；掃到的終點被擋住就換個方向掃；
   * 兩個方向都不行就不橫搖，改成定格在縱深最長的方向（不會一路掃進一面牆）
   */
  function* startPanBeat(target: DriftSession, isOpener = false, givenPathPan: { yaw: number; pitch: number; sign: 1 | -1 } | null = null): DriftSteps {
    const isGolden = isGoldenHour()
    const sunYaw = isGolden ? getSunYaw() : null
    const rateSize = randomBetween(PAN_RATE_RANGE[0], PAN_RATE_RANGE[1]) * (isGolden ? GOLDEN_PAN_RATE_RATIO : 1)
    const beat = Math.min(randomBetween(PAN_BEAT_RANGE[0], PAN_BEAT_RANGE[1]), PAN_SWEEP_MAX / rateSize)
    const basePitch = getLingerPitch(target)
    const isOpenToward = (yaw: number, pitch: number) => probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, yaw, pitch, LOOK_MIN_DEPTH * 2) >= LOOK_MIN_DEPTH

    let center: { yaw: number; pitch: number } | null = null
    if (isOpener) {
      const pathPan = givenPathPan ?? (sunYaw === null ? findPathPan(target) : null)
      if (!givenPathPan && sunYaw !== null && isOpenToward(sunYaw, basePitch)) {
        center = { yaw: sunYaw, pitch: basePitch }
      }
      else if (pathPan) {
        center = { yaw: pathPan.yaw, pitch: pathPan.pitch }
        target.panSign = pathPan.sign
      }
      else {
        center = yield * chooseLingerView(target, true)
      }
    }
    const pitch = center?.pitch ?? target.pitchFollower.value

    for (let attempt = 0; attempt < 2; attempt++) {
      const rate = rateSize * target.panSign
      const baseYaw = center === null ? target.yawFollower.value : center.yaw - rate * beat * 0.5
      const endYaw = baseYaw + rate * beat
      if (isOpenToward(endYaw, pitch)) {
        setShot(target, 'pan', { kind: 'pan', baseYaw, rate, pitch })
        target.lingerBeat = { kind: 'pan', endAt: target.lingerElapsed + beat }
        return
      }
      target.panSign = target.panSign === 1 ? -1 : 1
    }

    yield * startHoldBeat(target)
  }

  /** 停留尾聲：視線先轉向下一段路的方向，起步時畫面已經朝著要走的地方 */
  function startAnticipateBeat(target: DriftSession, plan: NextPlan) {
    const index = Math.min(plan.track.yawList.length - 1, ANTICIPATE_LOOKAHEAD_SAMPLE)
    const pathYaw = itemAt(plan.track.yawList, index)
    const pitch = target.realm.driftLookBias === 'outward' ? getLingerPitch(target) : 0
    const lookBias = getLookBias(target)

    /**
     * 朝著下一段路的方向，但路徑起點常貼著樹幹、山壁：在前進方向左右各六十度內挑縱深最好的（略偏向原本的方向、符合場景視線偏好的），
     * 起步時畫面朝著開闊的地方，而不是一面牆
     */
    let bestOffset = 0
    let bestScore = -1
    for (const offset of LOOK_ROOM_OFFSET_LIST) {
      const depth = probeViewDistance3D(target.worldState, target.x, target.eyeY, target.z, pathYaw + offset, pitch, LOOK_ROOM_DEPTH_MAX)
      const score = Math.min(1, depth / LOOK_ROOM_DEPTH_GOOD)
        * (LOOK_ROOM_CENTER_WEIGHT + (1 - LOOK_ROOM_CENTER_WEIGHT) * Math.exp(-((offset / 0.7) ** 2)))
        * getBiasFactor(lookBias, pathYaw + offset)
      if (score > bestScore) {
        bestScore = score
        bestOffset = offset
      }
    }
    target.lookTargetYaw = pathYaw + bestOffset
    target.lookTargetPitch = pitch
    /** 出發前把收窄的視野放回來：鏡頭開始走的時候視野已經（或幾乎）回到原樣，不會邊走邊變焦 */
    target.zoomGoal = 1
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

    /**
     * 開頭的動作做完：
     * 造訪主體時接著細看——視線留在主體上（繞弧走完位置換了、升降降回來高度換了，鎖死方向的話畫面正中央可能剛好是一根樹幹），視野慢慢收窄；
     * 其他情況鎖定在目前的方向，直到尾聲（鎖定不探射線，一步就做完）
     */
    if (target.subjectFeature && (target.gaze.kind === 'subject' || target.gaze.kind === 'tilt')) {
      target.shotId = 'hold'
      target.lingerBeat = { kind: 'hold', endAt: Number.POSITIVE_INFINITY }
    }
    else {
      runStepsSync(startHoldBeat(target, true))
    }
    target.zoomGoal = 1 - target.detailZoom
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
    const paceScale = distanceKey === 'trackDistance' ? target.paceScale : 1
    const goal = Math.min(motion.cruise * paceScale * sample.curveScale * turnFactor, sample.speedCap)

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
    const [rangeMin, pitchMax] = target.phase === 'fly' || target.phase === 'settle' ? FLY_PITCH_RANGE : target.pitchRange ?? WALK_PITCH_RANGE
    const pitchMin = target.realm.driftLookBias === 'outward' ? Math.max(rangeMin, OUTWARD_PITCH_MIN) : rangeMin
    return {
      x: target.x,
      eyeY: target.eyeY + target.craneY,
      z: target.z,
      pathYaw: target.pathYaw,
      pathPitch: target.pathPitch,
      elapsed: target.shotElapsed,
      trackDistance: target.trackDistance,
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

    const up = smoothRatio((target.lingerElapsed - crane.startAt) / crane.upSecond)
    const down = 1 - smoothRatio((target.lingerElapsed - crane.downAt) / crane.downSecond)
    target.craneY = crane.height * up * down
  }

  /** 這次停留多久：日出日落與開闊的景點久一點（有繞弧或升降），其餘是匆匆一瞥 */
  function pickLingerDuration(target: DriftSession, plan: NextPlan): number {
    if (isGoldenHour())
      return randomBetween(LINGER_GOLDEN_MIN, LINGER_GOLDEN_MAX) * (1 + LINGER_BURN_BONUS_RATIO * getGoldenBurnEmphasis())
    /** 夜裡與晨昏停得久一些（見 drift-direction 的 DAY_PACE_MAP） */
    const { lingerScale } = DAY_PACE_MAP[getSlot(target)]
    if (plan.kind === 'fly')
      return randomBetween(LINGER_AFTER_FLIGHT_MIN, LINGER_AFTER_FLIGHT_MAX) * lingerScale
    if (plan.destination.isOpenSky && Math.random() < LINGER_VISTA_CHANCE)
      return randomBetween(LINGER_LONG_MIN, LINGER_LONG_MAX) * lingerScale
    return randomBetween(LINGER_MIN, LINGER_MAX) * lingerScale
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
      pickLingerDuration(target, plan),
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

    /** 排著的規劃、量鏡位、收集停留點每幀做一小段（預算是 jobBudgetMs），做不完的下一幀接著做 */
    jobQueue.pump(jobBudgetMs)

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

        /**
         * 卡住偵測：軌道是預先算好的不會真的卡，但速度鎖死或軌道退化時要能自救
         *
         * 看的是「沿軌道前進了多少」，不是位置差多少：軌道在終點前折返（溪谷沿地面飛的路線，落點前繞一小圈）時，
         * 六秒前後的位置幾乎相同，鏡頭其實一直在走。以前用位置判斷，會在半空中被當成卡住而放棄這一趟，
         * 接著從空中找不到路，就一直停在半空（河谷實測有一成多的場次這樣，一停就是半小時）
         */
        target.stuckClock += deltaTime
        if (target.stuckClock >= STUCK_WINDOW) {
          if (target.trackDistance - target.stuckTrackDistance < STUCK_DISTANCE) {
            /** 飛行中真的走不動：不能在半空放棄（從空中找不到路），改成結束神遊、平順降落，把控制交還 */
            if (track.kind === 'fly') {
              console.warn('[Drift] 飛行軌道走不動，結束神遊')
              stop()
              return
            }
            syncBlockY(target)
            activePlan = null
            startLinger(target, REPLAN_DELAY)
          }
          target.stuckClock = 0
          target.stuckTrackDistance = target.trackDistance
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
            /** 下一站是在原地算的，繞完弧位置變了，路徑要從新的位置重算，不然起步會跳回去（舊的規劃作廢） */
            jobQueue.clear()
            prepareNext(target, false)
          }
        }
        updateCrane(target)

        /** 弧還沒走完就多等一下（弧長是照停留時間算的，只有被拖慢時才會用到） */
        /** 升降也一樣：還沒降回來不出發 */
        const isCraneBusy = target.crane !== null && target.lingerElapsed < target.crane.endAt
        if (target.lingerElapsed >= target.lingerDuration && !target.motionTrack && !isCraneBusy) {
          if (target.nextPlan) {
            activePlan = target.nextPlan
            target.nextPlan = null
            startTrack(target, activePlan)
          }
          else if (!target.isPlanning) {
            /** 上次沒算出來，趁這次停留重算（還在算的話就多停一會兒，算好就出發） */
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
        /** 要橫著挪時先挪再降：橫移走到三成多才開始降，不會斜著切過樹冠；垂直段有速度上限，落差大就拉長時間 */
        const horizontalRatio = clamp(settle.elapsed / settle.horizontalSecond, { min: 0, max: 1 })
        const horizontalEased = horizontalRatio * horizontalRatio * (3 - 2 * horizontalRatio)
        const verticalEased = getSettleRatio(settle.elapsed - settle.verticalStart, Math.abs(settle.fromEyeY - settle.toEyeY))
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
    target.clock += deltaTime
    updateZoom(target, deltaTime)

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

  /**
   * 視野呼吸：視野的比例追著目標走，速度與加速度都有上限（與視線同一個三階追隨），起停是 S 形
   *
   * 收窄（推近）慢、放開快一些；到了目標就停住，平常這裡什麼都不做
   */
  function updateZoom(target: DriftSession, deltaTime: number) {
    const follower = target.zoomFollower
    const remaining = target.zoomGoal - follower.value
    if (remaining === 0 && follower.velocity === 0)
      return

    followAngle(follower, target.zoomGoal, deltaTime, remaining > 0 ? ZOOM_OUT_RATE : ZOOM_IN_RATE, ZOOM_ACCELERATION)
    if (Math.abs(target.zoomGoal - follower.value) < 1e-4 && Math.abs(follower.velocity) < 1e-4) {
      follower.value = target.zoomGoal
      follower.velocity = 0
      follower.acceleration = 0
    }
  }

  /**
   * 使用者設定的視野（弧度），神遊的視野呼吸以它為基準；鏡頭沒有 fov（驗證用的假鏡頭）就是 null，整個視野呼吸不做。
   * fovWritten 是上一幀寫進鏡頭的值：鏡頭上的值與它不同，表示外面（設定面板）改了視野，改用新的當基準
   */
  let fovBase: number | null = null
  let fovWritten = 0
  /** 離開神遊時視野還收著：用一小段時間放回去的那個觀察者與它的終點 */
  let fovRestore: { observer: DriftSession['observer']; goal: number; getWritten: () => number } | null = null

  /** 把視野寫進鏡頭（只在數值變了的時候寫） */
  function writeFov(target: DriftSession) {
    if (fovBase === null)
      return
    if (camera.fov !== fovWritten)
      fovBase = camera.fov

    const fov = fovBase * target.zoomFollower.value
    if (fov !== camera.fov)
      camera.fov = fov
    fovWritten = camera.fov
  }

  /** 視野放回使用者的設定：平滑地放（離開神遊時），途中外面改了視野就不再碰 */
  function startFovRestore(from: number, goal: number) {
    let elapsed = 0
    let written = from
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (camera.fov !== written) {
        finishFovRestore(false)
        return
      }
      elapsed += clamp(scene.getEngine().getDeltaTime() / 1000, { min: 0, max: 0.05 })
      const ratio = smoothRatio(elapsed / ZOOM_RESTORE_SECOND)
      written = ratio >= 1 ? goal : from + (goal - from) * ratio
      camera.fov = written
      if (ratio >= 1)
        finishFovRestore(false)
    })
    fovRestore = { observer, goal, getWritten: () => written }
  }

  /** 收掉視野的復原；isSnap 是直接放到終點（換場景、重新開始神遊時，不能留一個還在跑的觀察者） */
  function finishFovRestore(isSnap: boolean) {
    const restore = fovRestore
    if (!restore)
      return

    fovRestore = null
    scene.onBeforeRenderObservable.remove(restore.observer)
    if (isSnap && camera.fov === restore.getWritten())
      camera.fov = restore.goal
  }

  /** 把鏡頭擺上去：控制器的 position 是腳下，它自己會加上眼睛高度；視線疊上使用者轉頭與微微的呼吸起伏 */
  function writePose(target: DriftSession) {
    writeFov(target)

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

    /** 上一次離開時視野還在放回去：直接放到終點，下面讀到的才是使用者的設定 */
    finishFovRestore(true)

    const { realm, worldState } = world
    const grid = createDriftGrid(worldState, realm)
    const { position } = controller

    const startCell = findStartCell(grid, position.x, position.y, position.z)
    if (!startCell)
      return false

    /**
     * 起點落在一小塊孤立的地（樹上的平台、牆內的小院），換附近一個連得更廣的
     *
     * 這裡只問「連通區塊夠不夠大」，數到 REACHABLE_SIZE_MIN 格就停（collectReachableSet 的 sizeLimit），不必掃完整片地圖；
     * 完整的連通範圍留給後面的分幀工作（prepareWorld）
     */
    let startRef = { blockX: startCell.blockX, blockZ: startCell.blockZ, blockY: startCell.cell.blockY }
    let startSize = collectReachableSet(grid, startRef, REACHABLE_SIZE_MIN).size
    let startFootY = startCell.cell.footY
    for (let ring = 1; startSize < REACHABLE_SIZE_MIN && ring <= 6; ring++) {
      for (let step = 0; step < 8 && startSize < REACHABLE_SIZE_MIN; step++) {
        const angle = (step / 8) * Math.PI * 2
        const probe = findStartCell(grid, startCell.blockX + Math.cos(angle) * ring * 8, startCell.cell.footY, startCell.blockZ + Math.sin(angle) * ring * 8)
        if (!probe)
          continue

        const probeRef = { blockX: probe.blockX, blockZ: probe.blockZ, blockY: probe.cell.blockY }
        const probeSize = collectReachableSet(grid, probeRef, REACHABLE_SIZE_MIN).size
        if (probeSize > startSize) {
          startSize = probeSize
          startRef = probeRef
          startFootY = probe.cell.footY
        }
      }
    }

    /**
     * 連通範圍與停留點：整片地圖掃一遍要幾十毫秒，排成分幀工作（這段時間鏡頭先在原地定格，停留本來就有四到七秒）；
     * 預算是無限大時（驗證腳本）當場做完，與沒有分幀時相同
     */
    const prepareWorld = function* (): DriftSteps<{ reachedSet: ReachedSet; pointList: DriftPoint[] }> {
      const reachedSet = yield * collectReachableSetSteps(grid, startRef)
      const pointList = yield * collectDriftPointSteps({ realm, worldState, grid, reachedSet })
      return { reachedSet, pointList }
    }
    const prepared = isInline ? runStepsSync(prepareWorld()) : null

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
      reachedSet: prepared?.reachedSet ?? new ReachedSet(0),
      pointList: prepared?.pointList ?? [],
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
      enclosedIdList: [],
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
      isPlanning: false,
      flightClock: 0,
      flightDueAt: clock,
      isFlightDue: false,
      lastDayPhase: getDayPhase(getTimeOfDay()),
      stuckClock: 0,
      stuckTrackDistance: 0,
      sessionId: Math.random().toString(36).slice(2, 6),
      clock: 0,
      ledger: createCoverageLedger(),
      sequenceId: 'scenery',
      lookNote: 'fallback:open-direction',
      subjectFeature: null,
      pitchRange: null,
      paceScale: 1,
      zoomFollower: { value: 1, velocity: 0 },
      zoomGoal: 1,
      detailZoom: 0,
      lookYawOffset: 0,
      lookPitchOffset: 0,
      lookIdle: 0,
      settle: null,
      settleBlockY: startRef.blockY,
    }
    fovBase = typeof camera.fov === 'number' && Number.isFinite(camera.fov) ? camera.fov : null
    fovWritten = fovBase ?? 0

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
        const frameStart = import.meta.env.DEV ? performance.now() : 0
        updateSession(current, deltaTime)
        /** 開發模式：神遊這一幀花超過幾毫秒就警告，鏡頭運鏡的那一幀頓了使用者看得出來 */
        if (import.meta.env.DEV) {
          const frameCost = performance.now() - frameStart
          if (frameCost > FRAME_COST_WARN_MS)
            console.warn(`[Drift] 這一幀神遊更新花了 ${frameCost.toFixed(1)} 毫秒（階段 ${current.phase}），鏡頭可能頓一下`)
        }
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
      startLinger(created, randomBetween(LINGER_START_MIN, LINGER_START_MAX), prepared
        ? undefined
        : (function* (): DriftSteps {
            const result = yield * prepareWorld()
            created.reachedSet = result.reachedSet
            created.pointList = result.pointList
          })())
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
    /** 視野還收著就平滑地放回使用者的設定（外面剛改過視野就不碰） */
    if (fovBase !== null && camera.fov === fovWritten && camera.fov !== fovBase)
      startFovRestore(camera.fov, fovBase)
    fovBase = null
    /** 還沒做完的分幀工作與量測記憶一起丟掉：格子、停留點、軌道都跟著這一次神遊結束，不留在記憶體裡 */
    jobQueue.clear()
    aheadCache = null
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

    /** 還排著的規劃與鏡位量測都作廢：降落期間視線與位置由降落自己管，不能被它們中途改掉 */
    jobQueue.clear()
    target.isPlanning = false

    /** 升降鏡位進行到一半時，高度併進基準高度，之後的降落從這裡接著走 */
    target.eyeY += target.craneY
    target.craneY = 0
    target.crane = null
    target.motionTrack = null
    /** 視野放回原樣（降落期間慢慢放；在地面上當場交還時由 release 接著放完） */
    target.zoomGoal = 1
    target.pitchRange = null

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
    const isLateral = lateral > SETTLE_LATERAL_MIN
    const verticalSecond = getSettleSecond(drop)
    /** 幾乎在正下方（一格內）的小挪移跟著垂直段一起走完 */
    const horizontalSecond = isLateral ? (lateral * 1.5) / SETTLE_LATERAL_PEAK_SPEED : verticalSecond
    const verticalStart = isLateral ? horizontalSecond * SETTLE_VERTICAL_START : 0
    target.settleBlockY = destination.blockY
    target.settle = {
      fromX: target.x,
      fromZ: target.z,
      fromEyeY: target.eyeY,
      toX: destination.x,
      toZ: destination.z,
      toEyeY: destination.footY + PLAYER_EYE_HEIGHT,
      lateral,
      /** 橫移的時間依距離算（S 曲線的峰值是平均的一點五倍），不然幾格的距離擠在一兩秒裡是橫衝過去；垂直段排在橫移的後面，總時間是兩者較晚結束的 */
      duration: Math.max(horizontalSecond, verticalStart + verticalSecond),
      elapsed: 0,
      horizontalSecond,
      verticalStart,
      verticalSecond,
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
    if (!target) {
      /** 已經離開、視野還在放回去的途中：直接放到終點 */
      finishFovRestore(true)
      return
    }

    release(target)
    finishFovRestore(true)
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

  /** 分幀工作的狀態，除錯與驗證用：下一趟還在算、佇列裡還有沒有工作 */
  function getJobState(): { isPlanning: boolean; isBusy: boolean; hasNextPlan: boolean } | null {
    return session ? { isPlanning: session.isPlanning, isBusy: jobQueue.isBusy(), hasNextPlan: session.nextPlan !== null } : null
  }

  /** 導演的狀態，除錯與驗證用：現在這一段的名字與主體、時段、視野比例、涵蓋紀錄的摘要 */
  function getDirectorState(): { sequence: string; isGlide: boolean; subject: string | null; slot: DaySlot; zoom: number; seenCount: number; multiAngleCount: number } | null {
    if (!session)
      return null
    return {
      sequence: session.sequenceId,
      isGlide: activePlan?.isGlide ?? false,
      subject: session.subjectFeature?.name ?? null,
      slot: getSlot(session),
      zoom: session.zoomFollower.value,
      ...session.ledger.summarize(),
    }
  }

  /** 除錯快照：畫面正中央那一束視線最遠探幾格、不到幾格算近牆、往下找地面最多找幾格 */
  const DEBUG_DEPTH_MAX = 50
  const DEBUG_WALL_DEPTH = 10
  const DEBUG_GROUND_REACH = 96

  /**
   * 除錯快照（開發模式的除錯面板每秒要四次，見 drift-debug）
   *
   * 有人要才算（兩束射線加幾個查表），不在每幀的路徑上；沒在神遊是 null
   */
  function getDebugSnapshot(): DriftDebugSnapshot | null {
    const target = session
    if (!target)
      return null

    const { gaze } = target
    const eyeY = target.eyeY + target.craneY
    const yaw = target.yawFollower.value + target.lookYawOffset
    const pitch = clamp(target.pitchFollower.value + target.lookPitchOffset, { min: -PITCH_LIMIT, max: PITCH_LIMIT })
    const isLinger = target.phase === 'linger'
    const feature = target.subjectFeature

    /** 視線對著什麼，以及對著的那一點（有的話） */
    let look = 'fallback:open-direction'
    let aim: { x: number; y: number; z: number } | null = null
    switch (gaze.kind) {
      case 'heading':
        look = gaze.lookRoom && gaze.lookRoom.offsetList.some((offset) => Math.abs(offset) > 0.05) ? 'path-tangent+room' : 'path-tangent'
        break
      case 'radial':
        look = gaze.isOutward ? 'outward' : 'inward'
        break
      case 'pan':
        look = isLinger ? 'pan' : 'locked-direction'
        break
      case 'free':
        look = target.lingerBeat.kind === 'anticipate' ? 'next-path' : target.lookNote
        break
      case 'subject':
        aim = { x: gaze.x, y: gaze.y, z: gaze.z }
        if (feature)
          look = 'feature'
        else if (target.shotId === 'pullBack')
          look = 'origin'
        else if (target.shotId === 'parallax')
          look = 'side-subject'
        else if (target.shotId === 'dollyIn')
          look = 'destination'
        else
          look = 'sound-source'
        break
      case 'tilt':
        look = 'feature'
        aim = feature ? { x: feature.x, y: feature.y, z: feature.z } : null
        break
      case 'path': {
        look = 'path-lead'
        const point = locateLeadPoint(gaze, target.x, target.z)
        aim = { x: point.x, y: point.y, z: point.z }
        break
      }
    }

    /** 這個鏡位預計多久：路上是這一段的長度除以巡航速度（估計），停留是這一段的結束時間（沒有就是整次停留剩下的） */
    let shotTotal: number | null = null
    let tripProgress: number | null = null
    const { track } = target
    if (track && !isLinger) {
      const segmentStart = target.shotCutIndex > 0 ? target.shotCutList[target.shotCutIndex - 1] ?? 0 : 0
      const segmentEnd = target.shotCutList[target.shotCutIndex] ?? track.length
      const cruise = (track.kind === 'fly' ? FLY_SPEED : WALK_SPEED) * target.paceScale
      shotTotal = (segmentEnd - segmentStart) / Math.max(0.1, cruise)
      tripProgress = track.length > 0 ? target.trackDistance / track.length : null
    }
    else if (isLinger) {
      const shotStartAt = target.lingerElapsed - target.shotElapsed
      shotTotal = (Number.isFinite(target.lingerBeat.endAt) ? target.lingerBeat.endAt : target.lingerDuration) - shotStartAt
    }

    const viewDepth = probeViewDistance3D(target.worldState, target.x, eyeY, target.z, yaw, pitch, DEBUG_DEPTH_MAX)
    let groundY = Math.floor(eyeY)
    for (let step = 0; step < DEBUG_GROUND_REACH && groundY > 0 && !isSolidAt(target.worldState, Math.round(target.x), groundY, Math.round(target.z)); step++)
      groundY--

    const destination = activePlan?.destination ?? target.nextPlan?.destination ?? null
    return {
      sessionId: target.sessionId,
      clock: target.clock,
      realmId: target.realm.id,
      timeOfDay: getTimeOfDay(),
      slot: getSlot(target),
      x: target.x,
      y: eyeY,
      z: target.z,
      yawDegree: (((yaw * 180) / Math.PI) % 360 + 360) % 360,
      pitchDegree: (pitch * 180) / Math.PI,
      fovDegree: typeof camera.fov === 'number' ? (camera.fov * 180) / Math.PI : null,
      zoom: target.zoomFollower.value,
      phase: getPhase() ?? 'none',
      sequence: target.sequenceId,
      shot: target.shotId,
      shotElapsed: target.shotElapsed,
      shotTotal,
      tripProgress,
      lingerElapsed: isLinger ? target.lingerElapsed : null,
      lingerDuration: isLinger ? target.lingerDuration : null,
      beat: isLinger ? target.lingerBeat.kind : null,
      look,
      targetName: aim && feature ? feature.name : null,
      targetKind: aim && feature ? feature.kind : null,
      targetDistance: aim ? Math.hypot(aim.x - target.x, aim.z - target.z) : null,
      isTargetVisible: aim ? isSightlineClear3D(target.worldState, target.x, eyeY, target.z, aim.x, aim.y, aim.z) : null,
      viewDepth,
      isNearWall: viewDepth < DEBUG_WALL_DEPTH,
      speed: isLinger ? target.motionSpeed : target.speed,
      destination: destination ? (destination.feature ? `${destination.id}(${destination.feature.name})` : destination.id) : null,
      altitude: eyeY - (groundY + 0.5),
      isGlide: activePlan?.isGlide ?? false,
      userYawDegree: (diffAngle(target.lookYawOffset, 0) * 180) / Math.PI,
    }
  }

  return { start, stop, abort, applyLook, isDrifting, getPhase, getShotId, getGaze, getMotion, getJobState, getDirectorState, getDebugSnapshot }
}
