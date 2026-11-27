import type { DriftSteps } from './drift-job'
import { runStepsSync } from './drift-job'
import { PATH_SAMPLE_SPACING, smoothHeightList } from './drift-path'
import { itemAt } from './drift-util'

/**
 * 神遊的軌道
 *
 * 散步與飛行共用同一種東西：一排等間距的點（x、z 與鏡頭高度），鏡頭沿著它走。
 * 這裡預先算好每一點的朝向（切線）與轉彎處的減速倍率，每幀只要用走過的距離查表，
 * 不做任何搜尋或碰撞
 */

/** 朝向看多遠的切線（取樣點數）：三公尺，轉彎時鏡頭會「預見」彎道而不是貼著當下的方向 */
const HEADING_LOOKAHEAD = 10
/** 量轉彎幅度的距離（取樣點數）：六公尺內轉了多少角度 */
const CURVE_WINDOW = 12
/** 轉彎減速：每一弧度的轉角讓速度少多少，以及最慢剩幾成 */
const CURVE_SLOWDOWN_PER_RADIAN = 1.6
const CURVE_SPEED_FLOOR = 0.4
/** 軌道上每走一格高度變化超過這個比例（升降坡度）就開始限速，以及提前幾個樣本開始減速 */
const CLIMB_SLOPE_FREE = 0.5
const CLIMB_LOOKAHEAD = 16

/**
 * 各種軌道的速度上限（物理量，與巡航速度無關）
 *
 * - lateralAcceleration：過彎時的向心加速度（格／秒平方），速度上限 = √(加速度 ÷ 曲率)
 * - verticalSpeed：垂直速度上限（格／秒）
 * - deceleration：往前看的煞車（格／秒平方）：入彎前就把速度收下來，不是到了彎裡才急煞
 */
const TRACK_LIMIT_MAP = {
  walk: { lateralAcceleration: 0.7, verticalSpeed: 0.9, deceleration: 0.6 },
  fly: { lateralAcceleration: 0.6, verticalSpeed: 1.3, deceleration: 0.7 },
}
/** 量曲率用的取樣點數（單邊）：兩公尺，比取樣間距長得多，才不會被取樣的鋸齒騙到 */
const CURVATURE_WINDOW = 4
/** 散步軌道俯仰跟著坡度走的比例，與量坡度的取樣點數（單邊） */
const WALK_PITCH_SLOPE_GAIN = 0.6
const WALK_PITCH_SLOPE_SPAN = 8
/** 沒有限制的地方填這個數（有限值，內插時不會算出無限減無限的 NaN） */
const SPEED_CAP_MAX = 99

export interface DriftTrack {
  kind: 'walk' | 'fly';
  /** 每一點的速度上限（格／秒）：彎道與垂直段的限制，已經往前推算過煞車距離 */
  speedCapList: number[];
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
  /** 這一點的速度上限（格／秒） */
  speedCap: number;
}

/**
 * 把一條三維折線重新排成等間距（沿弧長）的取樣點，頭尾兩點不動
 *
 * 軌道的速度是「每秒走幾格取樣點」，取樣點之間的實際距離不一致，鏡頭的實際速度就會跟著忽快忽慢
 * （垂直段與水平段的接縫、磨圓過的轉角都會讓間距不一）。所有軌道最後都經過這一步
 */
export function resampleUniform(xList: number[], yList: number[], zList: number[], spacing: number): { xList: number[]; yList: number[]; zList: number[] } {
  const count = xList.length
  const lengthList: number[] = [0]
  for (let index = 1; index < count; index++) {
    lengthList.push(itemAt(lengthList, index - 1) + Math.hypot(
      itemAt(xList, index) - itemAt(xList, index - 1),
      itemAt(yList, index) - itemAt(yList, index - 1),
      itemAt(zList, index) - itemAt(zList, index - 1),
    ))
  }
  const total = itemAt(lengthList, count - 1)
  const resultCount = Math.max(2, Math.round(total / spacing) + 1)
  const step = total / (resultCount - 1)
  const result = { xList: [] as number[], yList: [] as number[], zList: [] as number[] }

  let cursor = 0
  for (let index = 0; index < resultCount; index++) {
    const distance = index * step
    while (cursor < count - 2 && itemAt(lengthList, cursor + 1) < distance)
      cursor++

    const from = itemAt(lengthList, cursor)
    const span = itemAt(lengthList, cursor + 1) - from
    const ratio = span > 1e-9 ? Math.min(1, Math.max(0, (distance - from) / span)) : 0
    result.xList.push(itemAt(xList, cursor) + (itemAt(xList, cursor + 1) - itemAt(xList, cursor)) * ratio)
    result.yList.push(itemAt(yList, cursor) + (itemAt(yList, cursor + 1) - itemAt(yList, cursor)) * ratio)
    result.zList.push(itemAt(zList, cursor) + (itemAt(zList, cursor + 1) - itemAt(zList, cursor)) * ratio)
  }
  return result
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
  return runStepsSync(createDriftTrackSteps(kind, xList, zList, yList, pitchList))
}

/** createDriftTrack 的分段版：朝向、轉彎減速、爬升限速、速度上限各算一段，之間可以讓出一幀 */
export function* createDriftTrackSteps(
  kind: DriftTrack['kind'],
  xList: number[],
  zList: number[],
  yList: number[],
  pitchList?: number[],
): DriftSteps<DriftTrack> {
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

  yield

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
  yield

  const curveScaleList = turnScaleList.map((turnScale, index) => {
    let climbScale = 1
    for (let offset = 0; offset <= CLIMB_LOOKAHEAD && index + offset < count; offset++) {
      climbScale = Math.min(climbScale, itemAt(climbScaleList, index + offset))
    }
    return turnScale * climbScale
  })

  yield

  return {
    kind,
    xList,
    zList,
    yList,
    pitchList: pitchList ?? yList.map(() => 0),
    yawList,
    curveScaleList,
    speedCapList: createSpeedCapList(kind, xList, zList, yList),
    length: Math.max(0, (count - 1) * PATH_SAMPLE_SPACING),
  }
}

/**
 * 每一點的速度上限
 *
 * 曲率取前後各兩公尺的切線夾角（三維，所以垂直段轉成水平段的折角也算進去），
 * 速度上限 = √(橫向加速度上限 ÷ 曲率)；垂直速度上限換算成沿軌道的速度；
 * 最後從終點往回掃一遍，每一點的上限不超過「從下一點煞車能收到」的速度，所以入彎前就開始減速
 */
function createSpeedCapList(kind: DriftTrack['kind'], xList: number[], zList: number[], yList: number[]): number[] {
  const limit = TRACK_LIMIT_MAP[kind]
  const count = xList.length
  const capList: number[] = []

  for (let index = 0; index < count; index++) {
    let cap = SPEED_CAP_MAX
    const before = Math.max(0, index - CURVATURE_WINDOW)
    const after = Math.min(count - 1, index + CURVATURE_WINDOW)
    if (index - before >= 2 && after - index >= 2) {
      const ux = itemAt(xList, index) - itemAt(xList, before)
      const uy = itemAt(yList, index) - itemAt(yList, before)
      const uz = itemAt(zList, index) - itemAt(zList, before)
      const wx = itemAt(xList, after) - itemAt(xList, index)
      const wy = itemAt(yList, after) - itemAt(yList, index)
      const wz = itemAt(zList, after) - itemAt(zList, index)
      const lengthU = Math.hypot(ux, uy, uz)
      const lengthW = Math.hypot(wx, wy, wz)
      if (lengthU > 1e-6 && lengthW > 1e-6) {
        const cosine = Math.min(1, Math.max(-1, (ux * wx + uy * wy + uz * wz) / (lengthU * lengthW)))
        const curvature = Math.acos(cosine) / ((lengthU + lengthW) / 2)
        if (curvature > 1e-4)
          cap = Math.sqrt(limit.lateralAcceleration / curvature)
      }
    }

    const slopeBefore = Math.max(0, index - 1)
    const slopeAfter = Math.min(count - 1, index + 1)
    const run = Math.hypot(
      itemAt(xList, slopeAfter) - itemAt(xList, slopeBefore),
      itemAt(yList, slopeAfter) - itemAt(yList, slopeBefore),
      itemAt(zList, slopeAfter) - itemAt(zList, slopeBefore),
    )
    const rise = Math.abs(itemAt(yList, slopeAfter) - itemAt(yList, slopeBefore))
    if (run > 1e-6 && rise / run > 0.02)
      cap = Math.min(cap, limit.verticalSpeed / (rise / run))

    capList.push(cap)
  }

  for (let index = count - 2; index >= 0; index--) {
    const reachable = Math.sqrt(itemAt(capList, index + 1) ** 2 + 2 * limit.deceleration * PATH_SAMPLE_SPACING)
    capList[index] = Math.min(itemAt(capList, index), reachable)
  }

  return capList
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
  out.speedCap = itemAt(track.speedCapList, index) + (itemAt(track.speedCapList, next) - itemAt(track.speedCapList, index)) * ratio
}

/** 把散步路徑換成軌道：鏡頭高度是腳底高度加眼睛高度 */
export function createWalkTrack(xList: number[], zList: number[], footYList: number[], eyeHeight: number): DriftTrack {
  return runStepsSync(createWalkTrackSteps(xList, zList, footYList, eyeHeight))
}

/** createWalkTrack 的分段版 */
export function* createWalkTrackSteps(xList: number[], zList: number[], footYList: number[], eyeHeight: number): DriftSteps<DriftTrack> {
  /** 路徑的最後一個取樣點常常離前一個很近（重新取樣留下的尾巴），重排成等間距，終點前速度才不會突然掉下去 */
  const uniform = resampleUniform(xList, footYList.map((footY) => footY + eyeHeight), zList, PATH_SAMPLE_SPACING)
  yield

  /**
   * 俯仰跟著坡度走一部分：上坡視線微微抬起、下坡微微低下，不會一路盯著迎面而來的山壁
   *
   * 坡度取前後各四公尺的平均（鏡頭不跟著每一格台階點頭），只取六成：視線略低於坡面
   */
  const pitchList = smoothHeightList(uniform.yList.map((_, index) => {
    const ahead = Math.min(uniform.yList.length - 1, index + WALK_PITCH_SLOPE_SPAN)
    const behind = Math.max(0, index - WALK_PITCH_SLOPE_SPAN)
    const run = Math.max(PATH_SAMPLE_SPACING, (ahead - behind) * PATH_SAMPLE_SPACING)
    return -WALK_PITCH_SLOPE_GAIN * Math.atan((itemAt(uniform.yList, ahead) - itemAt(uniform.yList, behind)) / run)
  }), 6, 2)
  yield
  return yield * createDriftTrackSteps('walk', uniform.xList, uniform.zList, uniform.yList, pitchList)
}
