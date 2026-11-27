import { PATH_SAMPLE_SPACING } from './drift-path'
import { itemAt } from './drift-util'

/**
 * 神遊的軌道
 *
 * 散步與飛行共用同一種東西：一排等間距的點（x、z 與鏡頭高度），鏡頭沿著它走。
 * 這裡預先算好每一點的朝向（切線）與轉彎處的減速倍率，每幀只要用走過的距離查表，
 * 不做任何搜尋或碰撞
 */

/** 朝向看多遠的切線（取樣點數）：三公尺，轉彎時鏡頭會「預見」彎道而不是貼著當下的方向 */
const HEADING_LOOKAHEAD = 6
/** 量轉彎幅度的距離（取樣點數）：六公尺內轉了多少角度 */
const CURVE_WINDOW = 12
/** 轉彎減速：每一弧度的轉角讓速度少多少，以及最慢剩幾成 */
const CURVE_SLOWDOWN_PER_RADIAN = 1.6
const CURVE_SPEED_FLOOR = 0.4
/** 軌道上每走一格高度變化超過這個比例（升降坡度）就開始限速，以及提前幾個樣本開始減速 */
const CLIMB_SLOPE_FREE = 0.5
const CLIMB_LOOKAHEAD = 16

export interface DriftTrack {
  kind: 'walk' | 'fly';
  xList: number[];
  zList: number[];
  /** 鏡頭高度（眼睛，不是腳底） */
  yList: number[];
  /** 俯仰（弧度，正值往下看） */
  pitchList: number[];
  /** 每一點的朝向（弧度，與漫遊控制器同一個定義：零是朝 +Z） */
  yawList: number[];
  /** 轉彎處的速度倍率，零到一 */
  curveScaleList: number[];
  /** 軌道總長（格） */
  length: number;
}

export interface DriftTrackSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  curveScale: number;
}

/** 兩個角度的差，落在負 π 到 π 之間 */
export function diffAngle(target: number, current: number): number {
  let diff = (target - current) % (Math.PI * 2)
  if (diff > Math.PI)
    diff -= Math.PI * 2
  if (diff < -Math.PI)
    diff += Math.PI * 2
  return diff
}

export function createDriftTrack(
  kind: DriftTrack['kind'],
  xList: number[],
  zList: number[],
  yList: number[],
  pitchList?: number[],
): DriftTrack {
  const count = xList.length
  const yawList: number[] = []

  for (let index = 0; index < count; index++) {
    /** 尾端不夠往前看，改用最後一段的方向，鏡頭停下時朝向不會亂轉 */
    const toIndex = Math.min(count - 1, index + HEADING_LOOKAHEAD)
    const fromIndex = Math.min(index, Math.max(0, toIndex - HEADING_LOOKAHEAD))
    const dx = itemAt(xList, toIndex) - itemAt(xList, fromIndex)
    const dz = itemAt(zList, toIndex) - itemAt(zList, fromIndex)
    yawList.push(dx === 0 && dz === 0 ? Number.NaN : Math.atan2(dx, dz))
  }
  /**
   * 原地升降的那幾段沒有前進方向：頭尾的空缺用最近的有效朝向補
   * （起飛時朝向第一段水平路徑、降落時維持最後一段的方向）
   */
  for (let index = count - 2; index >= 0; index--) {
    if (Number.isNaN(itemAt(yawList, index)))
      yawList[index] = itemAt(yawList, index + 1)
  }
  for (let index = 1; index < count; index++) {
    if (Number.isNaN(itemAt(yawList, index)))
      yawList[index] = itemAt(yawList, index - 1)
  }
  if (Number.isNaN(itemAt(yawList, 0)))
    yawList.fill(0)

  const turnScaleList = yawList.map((yaw, index) => {
    const ahead = itemAt(yawList, Math.min(count - 1, index + CURVE_WINDOW))
    const turn = Math.abs(diffAngle(ahead, yaw))
    return Math.max(CURVE_SPEED_FLOOR, 1 / (1 + turn * CURVE_SLOWDOWN_PER_RADIAN))
  })

  /**
   * 爬升與下降的速度倍率
   *
   * 軌道上每個樣本隔半格，但原地升降的那幾段水平不動，沿軌道走一格其實是升降好幾格。
   * 照每個樣本的實際高度變化限制：垂直速度不超過巡航速度的一半左右，
   * 並且往前看一段（取窗口內最小值）提早減速，進入升降段時速度已經收下來
   */
  const climbScaleList = yList.map((_, index) => {
    const slope = Math.abs(itemAt(yList, Math.min(count - 1, index + 1)) - itemAt(yList, Math.max(0, index - 1))) / (2 * PATH_SAMPLE_SPACING)
    return slope > CLIMB_SLOPE_FREE ? CLIMB_SLOPE_FREE / slope : 1
  })
  const curveScaleList = turnScaleList.map((turnScale, index) => {
    let climbScale = 1
    for (let offset = 0; offset <= CLIMB_LOOKAHEAD && index + offset < count; offset++) {
      climbScale = Math.min(climbScale, itemAt(climbScaleList, index + offset))
    }
    return turnScale * climbScale
  })

  return {
    kind,
    xList,
    zList,
    yList,
    pitchList: pitchList ?? yList.map(() => 0),
    yawList,
    curveScaleList,
    length: Math.max(0, (count - 1) * PATH_SAMPLE_SPACING),
  }
}

/** 取軌道上走了 distance 格的那一點（線性內插） */
export function sampleDriftTrack(track: DriftTrack, distance: number, out: DriftTrackSample): void {
  const last = track.xList.length - 1
  const position = Math.min(last, Math.max(0, distance / PATH_SAMPLE_SPACING))
  const index = Math.max(0, Math.min(last - 1, Math.floor(position)))
  const ratio = position - index
  const next = Math.min(last, index + 1)

  out.x = itemAt(track.xList, index) + (itemAt(track.xList, next) - itemAt(track.xList, index)) * ratio
  out.z = itemAt(track.zList, index) + (itemAt(track.zList, next) - itemAt(track.zList, index)) * ratio
  out.y = itemAt(track.yList, index) + (itemAt(track.yList, next) - itemAt(track.yList, index)) * ratio
  out.pitch = itemAt(track.pitchList, index) + (itemAt(track.pitchList, next) - itemAt(track.pitchList, index)) * ratio
  out.yaw = itemAt(track.yawList, index) + diffAngle(itemAt(track.yawList, next), itemAt(track.yawList, index)) * ratio
  out.curveScale = itemAt(track.curveScaleList, index) + (itemAt(track.curveScaleList, next) - itemAt(track.curveScaleList, index)) * ratio
}

/** 把散步路徑換成軌道：鏡頭高度是腳底高度加眼睛高度 */
export function createWalkTrack(xList: number[], zList: number[], footYList: number[], eyeHeight: number): DriftTrack {
  return createDriftTrack('walk', xList, zList, footYList.map((footY) => footY + eyeHeight))
}
