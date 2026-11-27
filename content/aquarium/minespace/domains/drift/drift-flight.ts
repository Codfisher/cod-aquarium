import type { RealmDriftFlight } from '../realm/realm-definition'
import type { DriftGrid } from './drift-grid'
import type { DriftSteps } from './drift-job'
import type { GridPoint } from './drift-path'
import type { DriftPoint } from './drift-point'
import type { DriftTrack } from './drift-track'
import { getSurfaceY } from '../world/world-access'
import { runStepsSync } from './drift-job'
import { LONG_NODE_LIMIT, PATH_SAMPLE_SPACING, planWalkPathSteps, resamplePolyline, smoothHeightList, smoothWithSpline, subdivideWaypoint } from './drift-path'
import { createDriftTrackSteps, resampleUniform } from './drift-track'
import { itemAt } from './drift-util'

/**
 * 神遊的無人機軌道
 *
 * 與散步同一套：一排等間距的點。差別在高度與平面路線——
 * 平面是幾個轉折點串起來的曲線（或沿著散步的路線飛），
 * 高度是「路徑兩側最高的東西」加上一段會慢慢起伏的距離，起降用平滑的高度漸變接回地面，
 * 所以與散步無縫銜接，不需要瞬移
 */

/** 一趟飛行大約多長（格），以巡航速度三格每秒換算（含起降與過彎減速）是四十到九十秒 */
const FLIGHT_LENGTH_MIN = 80
const FLIGHT_LENGTH_MAX = 170
/** 最多串幾個中途的轉折點 */
const WAYPOINT_COUNT_MAX = 4
/** 沿地面路線時，相鄰兩個停留點的距離範圍 */
const LEG_DISTANCE_MIN = 24
const LEG_DISTANCE_MAX = 170
/** 自由路線的空中轉折點：相鄰兩點的距離範圍，以及不要靠近場景邊緣（半徑的幾成以內） */
const AIR_LEG_MIN = 45
const AIR_LEG_MAX = 100
const AIR_REGION_RATIO = 0.8
/**
 * 繞外緣的路線（站得高、要往外看的場景）：轉折點在離中心這個比例的半徑上，沿同一個方向一段一段往前
 * （段長範圍，格）。鏡頭沿著外緣滑，視線朝外就是越過邊緣的雲海與遠景，不是飛到哪看到哪
 */
const RIM_RADIUS_RATIO = 0.8
const RIM_LEG_RANGE: readonly [number, number] = [40, 70]
/** 轉彎角度超過這個（弧度）的下一站不選，免得曲線在原地打圈 */
const TURN_ANGLE_MAX = (Math.PI * 3) / 4
/** 控制點間距：曲線跟著轉折點走，補點讓它不要在長線段上盪出去 */
const WAYPOINT_SPACING = 14
/** 探測障礙的點：路徑中心與左右前後各這麼遠 */
const PROBE_RADIUS = 2
/**
 * 障礙高度用「斜率錐」膨脹：每個障礙往兩側放出一道最陡 OBSTACLE_SLOPE 的斜坡，
 * 無人機在遠處就開始爬升，不會貼到樹冠才猛拉；膨脹後多抬 OBSTACLE_LIFT，
 * 因為接著的平滑會把尖峰削低一些
 */
const OBSTACLE_SLOPE = 0.45
const OBSTACLE_LIFT = 1.4
const OBSTACLE_SMOOTH_RADIUS = 8
/** 起降的高度漸變長度（格）：落差越大越長，最短二十二格、最長六十格 */
const RAMP_LENGTH_MIN = 22
const RAMP_LENGTH_MAX = 60
const RAMP_PER_HEIGHT = 2.8
/** 起飛前先垂直升到接下來幾公尺路徑的障礙之上：看多遠、最多升多高（格） */
const TAKEOFF_LOOKAHEAD = 10
const RISE_HEIGHT_MAX = 22
/** 貼著障礙飛的最小餘裕（格） */
const SAFETY_MARGIN = 0.8
/** 巡航時鏡頭微微俯視的基準角度（弧度） */
const CRUISE_PITCH = 0.14
const PITCH_MIN = -0.04
const PITCH_MAX = 0.4
/** 爬升與下降時俯仰跟著坡度走的比例：只讓視線輕輕點一下頭，不要因為高度起伏讓畫面上下擺動 */
const PITCH_SLOPE_GAIN = 0.3
/**
 * 垂直段接水平段的轉角要磨圓：磨圓的半寬（取樣點數）與先抬高多少（格）
 *
 * 直角的轉角會讓速度方向瞬間從往上變成往前；磨圓後路徑往轉角內側縮一點（約一格），
 * 所以起降的頂點多抬一些，縮進去之後還是在障礙之上
 */
const CORNER_HALF_WIDTH = 8
const CORNER_LIFT = 1.2
/** 高度起伏的週期（格） */
const CLEARANCE_WAVE_LENGTH = 90

/**
 * 把一個轉角磨圓：轉角附近每一點取前後各 h 個點的平均，h 離轉角越遠越小（到邊緣是零），
 * 所以磨圓的範圍與沒磨的部分接得上（沒有折痕）。頭尾兩個點（起點與落點）永遠不動
 */
function roundCorner(xList: number[], yList: number[], zList: number[], corner: number, halfWidth: number) {
  const count = xList.length
  const sourceX = xList.slice()
  const sourceY = yList.slice()
  const sourceZ = zList.slice()

  for (let index = Math.max(1, corner - halfWidth); index <= Math.min(count - 2, corner + halfWidth); index++) {
    const width = Math.min(halfWidth - Math.abs(index - corner), index, count - 1 - index)
    if (width <= 0)
      continue

    let sumX = 0
    let sumY = 0
    let sumZ = 0
    for (let offset = -width; offset <= width; offset++) {
      sumX += itemAt(sourceX, index + offset)
      sumY += itemAt(sourceY, index + offset)
      sumZ += itemAt(sourceZ, index + offset)
    }
    const total = width * 2 + 1
    xList[index] = sumX / total
    yList[index] = sumY / total
    zList[index] = sumZ / total
  }
}

function smoothstep(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio))
  return clamped * clamped * (3 - 2 * clamped)
}

/** 飛行路線上的一個轉折點：停留點，或自由路線裡憑空取的空中一點 */
export interface FlightWaypoint {
  x: number;
  z: number;
  point: DriftPoint | null;
}

export interface FlightRoute {
  /** 依序經過的轉折點，最後一個是落點 */
  waypointList: FlightWaypoint[];
  landing: DriftPoint;
}

function pickWeighted<T>(itemList: T[], weightList: number[]): T {
  let pick = Math.random() * weightList.reduce((sum, weight) => sum + weight, 0)
  for (let index = 0; index < itemList.length; index++) {
    pick -= itemAt(weightList, index)
    if (pick <= 0)
      return itemAt(itemList, index)
  }
  return itemAt(itemList, itemList.length - 1)
}

function sortByDistance(pointList: DriftPoint[], from: { x: number; z: number }): DriftPoint[] {
  return pointList
    .slice()
    .sort((left, right) => Math.hypot(left.blockX - from.x, left.blockZ - from.z) - Math.hypot(right.blockX - from.x, right.blockZ - from.z))
}

/**
 * 挑一趟飛行的路線
 *
 * 自由路線（四面開闊的場景）：從目前位置出發，在場景範圍裡取幾個空中的轉折點串成大弧線，
 * 最後降在離最後一個轉折點最近的露天停留點。轉折點不必是停留點，所以不受停留點稀疏的影響
 * （湖中島只有幾個點，也飛得出四十秒的一趟）。
 * 沿地面的路線（溪谷）則是一站一站經過停留點。每一段的方向不急轉，曲線是弧線而不是繞圈。
 * 找不到露天的落點就是 null，這一趟不飛
 */
export function chooseFlightRoute(
  pointList: DriftPoint[],
  from: { x: number; z: number },
  recentIdList: string[],
  options: { region: { x: number; z: number; radius: number } | null; mode: 'free' | 'ground' | 'rim' },
): FlightRoute | null {
  const targetLength = FLIGHT_LENGTH_MIN + Math.random() * (FLIGHT_LENGTH_MAX - FLIGHT_LENGTH_MIN)
  const openList = pointList.filter((point) => point.isOpenSky)
  if (openList.length === 0)
    return null

  let last = { x: from.x, z: from.z }
  let heading: number | null = null
  let total = 0

  if (options.mode === 'rim' && options.region) {
    const { region } = options
    const rimRadius = region.radius * RIM_RADIUS_RATIO
    const waypointList: FlightWaypoint[] = []
    /** 從現在的位置接上外緣，朝順時針或逆時針繞；離外緣很遠（在中心附近）就先斜切過去 */
    let angle = Math.atan2(from.x - region.x, from.z - region.z)
    const sign = Math.random() < 0.5 ? -1 : 1
    while (waypointList.length < WAYPOINT_COUNT_MAX && total < targetLength) {
      const legLength = RIM_LEG_RANGE[0] + Math.random() * (RIM_LEG_RANGE[1] - RIM_LEG_RANGE[0])
      angle += sign * (legLength / rimRadius)
      const next = { x: region.x + Math.sin(angle) * rimRadius, z: region.z + Math.cos(angle) * rimRadius }
      total += Math.hypot(next.x - last.x, next.z - last.z)
      last = next
      waypointList.push({ x: next.x, z: next.z, point: null })
    }

    const nearList = sortByDistance(openList, last).slice(0, 3)
    const landing = pickWeighted(nearList, nearList.map((point) => (recentIdList.includes(point.id) ? 0.2 : 1)))
    waypointList.push({ x: landing.blockX, z: landing.blockZ, point: landing })
    return { waypointList, landing }
  }

  if (options.mode === 'free' && options.region) {
    const { region } = options
    const waypointList: FlightWaypoint[] = []

    while (waypointList.length < WAYPOINT_COUNT_MAX && total < targetLength) {
      /** 一段的長度依場景大小縮放：湖中島只有三十幾格半徑，不能照一百格的段長挑 */
      const legMin = Math.min(AIR_LEG_MIN, region.radius * 0.5)
      const legMax = Math.min(AIR_LEG_MAX, region.radius * 1.3)
      const reach = region.radius * AIR_REGION_RATIO

      let next: { x: number; z: number } | null = null
      for (let attempt = 0; attempt < 30 && !next; attempt++) {
        /** 在範圍內均勻抽一點，段長與轉角合格才收；轉角限制讓路線是弧線而不是來回折返 */
        const angle = Math.random() * Math.PI * 2
        const radius = Math.sqrt(Math.random()) * reach
        const x = region.x + Math.sin(angle) * radius
        const z = region.z + Math.cos(angle) * radius
        const distance = Math.hypot(x - last.x, z - last.z)
        if (distance < legMin || distance > legMax)
          continue
        if (heading !== null) {
          const direction = Math.atan2(x - last.x, z - last.z)
          if (Math.abs(Math.atan2(Math.sin(direction - heading), Math.cos(direction - heading))) > TURN_ANGLE_MAX)
            continue
        }
        next = { x, z }
      }
      /** 抽不到合格的點：穿過場景中心飛到對面 */
      next ??= {
        x: region.x + (region.x - last.x) * 0.6,
        z: region.z + (region.z - last.z) * 0.6,
      }

      total += Math.hypot(next.x - last.x, next.z - last.z)
      heading = Math.atan2(next.x - last.x, next.z - last.z)
      last = next
      waypointList.push({ x: next.x, z: next.z, point: null })
    }

    /** 落點：最後一個轉折點附近三個露天停留點裡挑一個，最近去過的降權 */
    const nearList = sortByDistance(openList, last).slice(0, 3)
    const landing = pickWeighted(nearList, nearList.map((point) => (recentIdList.includes(point.id) ? 0.2 : 1)))
    waypointList.push({ x: landing.blockX, z: landing.blockZ, point: landing })
    return { waypointList, landing }
  }

  const visitedList: DriftPoint[] = []
  while (visitedList.length < WAYPOINT_COUNT_MAX && total < targetLength) {
    const candidateList = pointList.filter((point) => {
      if (visitedList.includes(point))
        return false

      const distance = Math.hypot(point.blockX - last.x, point.blockZ - last.z)
      if (distance < LEG_DISTANCE_MIN || distance > LEG_DISTANCE_MAX)
        return false

      if (heading === null)
        return true

      const direction = Math.atan2(point.blockX - last.x, point.blockZ - last.z)
      return Math.abs(Math.atan2(Math.sin(direction - heading), Math.cos(direction - heading))) <= TURN_ANGLE_MAX
    })
    if (candidateList.length === 0)
      break

    /** 最近去過的降權，路線不要老是飛同幾個點 */
    const chosen = pickWeighted(candidateList, candidateList.map((point) => (recentIdList.includes(point.id) ? 0.15 : 1)))
    total += Math.hypot(chosen.blockX - last.x, chosen.blockZ - last.z)
    heading = Math.atan2(chosen.blockX - last.x, chosen.blockZ - last.z)
    last = { x: chosen.blockX, z: chosen.blockZ }
    visitedList.push(chosen)
  }
  if (visitedList.length === 0)
    return null

  /** 落點必須露天：最後一站不是的話，接最近的一個露天停留點 */
  if (!itemAt(visitedList, visitedList.length - 1).isOpenSky) {
    const nearest = sortByDistance(openList.filter((point) => !visitedList.includes(point)), last)[0]
    if (!nearest)
      return null
    visitedList.push(nearest)
  }

  return {
    waypointList: visitedList.map((point) => ({ x: point.blockX, z: point.blockZ, point })),
    landing: itemAt(visitedList, visitedList.length - 1),
  }
}

export interface BuildFlightParam {
  worldState: Uint8Array;
  grid: DriftGrid;
  flight: RealmDriftFlight;
  /** 起飛的位置（鏡頭實際位置）與鏡頭高度 */
  start: { x: number; z: number; eyeY: number; blockY: number };
  route: FlightRoute;
  eyeHeight: number;
}

/** 平面上的路線：轉折點之間的曲線，或沿著散步的路線（分段版：沿地面飛行時每一段尋路之間可以讓出一幀） */
function* buildSpineSteps(param: BuildFlightParam): DriftSteps<GridPoint[] | null> {
  const { grid, flight, start, route } = param
  const startPoint = { x: start.x, z: start.z }

  if (flight.routeMode === 'ground') {
    const legList: GridPoint[] = []
    let from = { x: start.x, z: start.z, blockY: start.blockY }
    for (const { point } of route.waypointList) {
      if (!point)
        return null

      const leg = yield * planWalkPathSteps(grid, from, { blockX: point.blockX, blockZ: point.blockZ, blockY: point.blockY }, LONG_NODE_LIMIT)
      if (!leg)
        return null

      legList.push(...leg.xList.map((x, index) => ({ x, z: itemAt(leg.zList, index) })))
      from = { x: point.blockX, z: point.blockZ, blockY: point.blockY }
    }

    /** 各段在停留點接起來有個小折角，磨掉；兩端用原值，起降位置不動 */
    const xList = smoothHeightList(legList.map((point) => point.x), 5, 2)
    const zList = smoothHeightList(legList.map((point) => point.z), 5, 2)
    xList[0] = itemAt(legList, 0).x
    zList[0] = itemAt(legList, 0).z
    xList[xList.length - 1] = itemAt(legList, legList.length - 1).x
    zList[zList.length - 1] = itemAt(legList, legList.length - 1).z
    return xList.map((x, index) => ({ x, z: itemAt(zList, index) }))
  }

  const waypointList = [startPoint, ...route.waypointList.map((waypoint) => ({ x: waypoint.x, z: waypoint.z }))]
  return smoothWithSpline(subdivideWaypoint(waypointList, WAYPOINT_SPACING), 12)
}

/**
 * 組出一條飛行軌道
 *
 * 高度 = 路徑兩側探到的最高處（樹冠、岩壁、水面），先用斜率錐往兩側膨脹再平滑，
 * 加上一段在場景設定的範圍裡起伏的餘裕；兩端以平滑的高度漸變接回地面的鏡頭高度
 */
export function buildFlightTrack(param: BuildFlightParam): DriftTrack | null {
  return runStepsSync(buildFlightTrackSteps(param))
}

/** 每量幾個取樣點旁邊的最高處就讓出一次（一個點要問五柱，每柱往下找到第一個非空氣） */
const OBSTACLE_YIELD_INTERVAL = 48

/** buildFlightTrack 的分段版：尋路、障礙高度、起降與軌道各階段之間都可以讓出一幀；結果與一口氣跑完的版本相同 */
export function* buildFlightTrackSteps(param: BuildFlightParam): DriftSteps<DriftTrack | null> {
  const { worldState, flight, start, route, eyeHeight } = param
  const { landing } = route
  const spine = yield * buildSpineSteps(param)
  if (!spine || spine.length < 2)
    return null

  const sampleList = resamplePolyline(spine, PATH_SAMPLE_SPACING)
  if (sampleList.length < 8)
    return null
  yield

  /** 每個取樣點旁邊最高的東西 */
  const columnMap = new Map<number, number>()
  function readTop(blockX: number, blockZ: number): number {
    const key = blockX * 1000 + blockZ
    let top = columnMap.get(key)
    if (top === undefined) {
      top = getSurfaceY(worldState, blockX, blockZ) - 0.5
      columnMap.set(key, top)
    }
    return top
  }
  const obstacleList: number[] = []
  for (const [index, sample] of sampleList.entries()) {
    if (index % OBSTACLE_YIELD_INTERVAL === OBSTACLE_YIELD_INTERVAL - 1)
      yield

    const blockX = Math.round(sample.x)
    const blockZ = Math.round(sample.z)
    obstacleList.push(Math.max(
      readTop(blockX, blockZ),
      readTop(blockX + PROBE_RADIUS, blockZ),
      readTop(blockX - PROBE_RADIUS, blockZ),
      readTop(blockX, blockZ + PROBE_RADIUS),
      readTop(blockX, blockZ - PROBE_RADIUS),
    ))
  }

  /** 斜率錐膨脹：來回掃兩遍，每個障礙往兩側放出斜坡 */
  const coneStep = OBSTACLE_SLOPE * PATH_SAMPLE_SPACING
  const coneList = obstacleList.map((height) => height + OBSTACLE_LIFT)
  for (let index = 1; index < coneList.length; index++) {
    coneList[index] = Math.max(itemAt(coneList, index), itemAt(coneList, index - 1) - coneStep)
  }
  for (let index = coneList.length - 2; index >= 0; index--) {
    coneList[index] = Math.max(itemAt(coneList, index), itemAt(coneList, index + 1) - coneStep)
  }
  const envelopeList = smoothHeightList(coneList, OBSTACLE_SMOOTH_RADIUS, 2)
  yield

  yield

  const phase = Math.random() * Math.PI * 2
  const cruiseList = envelopeList.map((envelope, index) => {
    const wave = 0.5 + 0.5 * Math.sin((index * PATH_SAMPLE_SPACING / CLEARANCE_WAVE_LENGTH) * Math.PI * 2 + phase)
    const height = envelope + eyeHeight + flight.clearanceMin + (flight.clearanceMax - flight.clearanceMin) * wave
    const capped = flight.altitudeMax === undefined ? height : Math.min(height, flight.altitudeMax)
    return Math.max(capped, envelope + SAFETY_MARGIN + eyeHeight)
  })

  const landingEyeY = landing.footY + eyeHeight
  const lastIndex = sampleList.length - 1
  const floorList = envelopeList.map((envelope) => envelope + eyeHeight * 0.5 + SAFETY_MARGIN)

  /**
   * 起降是垂直的
   *
   * 起飛點與落點旁邊常有樹或岩，斜著爬會從它們旁邊（甚至裡面）擦過去。
   * 所以先原地升到「接下來八公尺路徑上最高的障礙之上」，再沿曲線走；降落反過來，
   * 先沿曲線飛到落點正上方那個高度，再原地降下去。落點頭上本來就是空的（露天停留點）
   */
  const nearCount = Math.round(TAKEOFF_LOOKAHEAD / PATH_SAMPLE_SPACING)
  const startRef = Math.min(
    start.eyeY + RISE_HEIGHT_MAX,
    Math.max(start.eyeY, ...floorList.slice(0, nearCount)),
  )
  const endRef = Math.min(
    landingEyeY + RISE_HEIGHT_MAX,
    Math.max(landingEyeY, ...floorList.slice(Math.max(0, lastIndex - nearCount))),
  )
  /** 有垂直段才有轉角要磨圓，頂點多抬 CORNER_LIFT；沒有垂直段（本來就貼著高度）維持原樣 */
  const startTop = startRef - start.eyeY > 1 ? startRef + CORNER_LIFT : startRef
  const endTop = endRef - landingEyeY > 1 ? endRef + CORNER_LIFT : endRef

  /** 水平段的漸變長度：爬得越高越長，坡度才不會太陡 */
  const cruiseMax = cruiseList.reduce((peak, value) => Math.max(peak, value), 0)
  const startRamp = Math.min(RAMP_LENGTH_MAX, Math.max(RAMP_LENGTH_MIN, (cruiseMax - startTop) * RAMP_PER_HEIGHT)) / PATH_SAMPLE_SPACING
  const endRamp = Math.min(RAMP_LENGTH_MAX, Math.max(RAMP_LENGTH_MIN, (cruiseMax - endTop) * RAMP_PER_HEIGHT)) / PATH_SAMPLE_SPACING
  const mainYList = cruiseList.map((cruise, index) => {
    const height = startTop + (cruise - startTop) * smoothstep(index / startRamp)
    const blended = endTop + (height - endTop) * smoothstep((lastIndex - index) / endRamp)
    return Math.max(blended, itemAt(floorList, index))
  })
  yield
  const smoothMainList = smoothHeightList(mainYList, 4, 1)
  smoothMainList[0] = startTop
  smoothMainList[lastIndex] = endTop
  yield

  /**
   * 垂直段：平面位置不動，高度等間距，每一格軌道樣本是半公尺
   *
   * 等間距很重要：軌道的速度是「每秒走幾格樣本」，樣本之間的實際距離要一致，速度才是真的速度。
   * 以前用 S 曲線排樣本（兩頭密、中間疏），垂直段尾端實際速度趨近零、接上水平段又突然跳回全速。
   * 起停的緩急交給速度曲線（followSpeed）處理
   */
  function buildVertical(fromY: number, toY: number): number[] {
    const count = Math.max(0, Math.round(Math.abs(toY - fromY) / PATH_SAMPLE_SPACING) - 1)
    return Array.from({ length: count }, (_, index) => fromY + (toY - fromY) * ((index + 1) / (count + 1)))
  }
  const riseList = buildVertical(start.eyeY, startTop)
  const descendList = buildVertical(endTop, landingEyeY)

  const xList = [
    ...riseList.map(() => itemAt(sampleList, 0).x),
    ...sampleList.map((sample) => sample.x),
    ...descendList.map(() => itemAt(sampleList, lastIndex).x),
  ]
  const zList = [
    ...riseList.map(() => itemAt(sampleList, 0).z),
    ...sampleList.map((sample) => sample.z),
    ...descendList.map(() => itemAt(sampleList, lastIndex).z),
  ]
  /** 起點本身（高度就是鏡頭現在的高度）與落點（落地的鏡頭高度）放進頭尾，與散步無縫銜接 */
  const yList = [start.eyeY, ...riseList, ...smoothMainList, ...descendList, landingEyeY]
  xList.unshift(itemAt(sampleList, 0).x)
  zList.unshift(itemAt(sampleList, 0).z)
  xList.push(itemAt(sampleList, lastIndex).x)
  zList.push(itemAt(sampleList, lastIndex).z)

  /** 垂直段與水平段的轉角磨圓：起飛的轉角在第一個水平樣本，降落的在最後一個 */
  if (riseList.length > 0)
    roundCorner(xList, yList, zList, 1 + riseList.length, CORNER_HALF_WIDTH)
  if (descendList.length > 0)
    roundCorner(xList, yList, zList, 1 + riseList.length + sampleList.length - 1, CORNER_HALF_WIDTH)

  yield

  /** 磨圓之後取樣點的間距不一致：沿弧長重排成等間距，鏡頭的實際速度才跟速度曲線一致 */
  const uniform = resampleUniform(xList, yList, zList, PATH_SAMPLE_SPACING)
  xList.splice(0, xList.length, ...uniform.xList)
  yList.splice(0, yList.length, ...uniform.yList)
  zList.splice(0, zList.length, ...uniform.zList)

  const trackLast = yList.length - 1
  yield

  const rawPitchList = yList.map((_, index) => {
    const ahead = Math.min(trackLast, index + 4)
    const behind = Math.max(0, index - 4)
    const slope = (itemAt(yList, ahead) - itemAt(yList, behind)) / Math.max(PATH_SAMPLE_SPACING, (ahead - behind) * PATH_SAMPLE_SPACING)
    return Math.min(PITCH_MAX, Math.max(PITCH_MIN, CRUISE_PITCH - PITCH_SLOPE_GAIN * Math.atan(slope)))
  })
  const pitchList = smoothHeightList(rawPitchList, 6, 2)
  yield

  return yield * createDriftTrackSteps('fly', xList, zList, yList, pitchList)
}
