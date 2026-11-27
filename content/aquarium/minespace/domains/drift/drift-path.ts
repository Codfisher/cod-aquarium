import type { DriftCell, DriftGrid } from './drift-grid'
import { Curve3, Vector3 } from '@babylonjs/core'
import { WORLD_SIZE } from '../world/world-constants'
import { itemAt } from './drift-util'

/**
 * 神遊的散步路徑
 *
 * 流程：A* 在格子上找一條走得通的路 → 拉直成少數幾個轉折點 → Catmull-Rom 曲線串起來 →
 * 把曲線逐點對回格子驗證（每一點與身體左右各零點三格都得站得住）→ 地面高度低通平滑。
 * 驗證不過就退回轉折點更多的版本，最後一道退路是 A* 的原始格子，所以一定有答案（只要 A* 找得到）。
 * 尋路只在挑下一站時做一次，每幀的移動只是沿著算好的點走，與格子無關
 */

/** 路徑取樣的間距（格）。鏡頭沿著這排點走，速度、轉向與高度都以它為基礎 */
export const PATH_SAMPLE_SPACING = 0.5

/** A* 最多展開幾個節點，超過就當作這一站走不到 */
const NODE_LIMIT = 9000
/** 沿地面飛行的路線一次串好幾段，單段可以找久一點（只在規劃飛行時做一次） */
export const LONG_NODE_LIMIT = 30000
/** 啟發函式的權重：略大於一，換速度，路線略不最短也無妨 */
const HEURISTIC_WEIGHT = 1.2
/** 每個貼著障礙的鄰格加的成本，路線因此自然離牆遠一點 */
const OBSTACLE_PENALTY = 0.3
/** 涉水的額外成本，能走乾地就不走水 */
const WADE_PENALTY = 0.5
/** 每高低差一格加的成本 */
const HEIGHT_PENALTY = 0.6
/** 轉折點之間最遠隔幾格，再遠就補點，免得 Catmull-Rom 在長線段上盪出去 */
const WAYPOINT_SPACING_MAX = 4
/** 拉直時往前看幾格 */
const PULL_LOOKAHEAD = 30
/** 驗證時身體左右各退幾格 */
const BODY_HALF_WIDTH = 0.3
/** 地面高度低通：半徑（取樣點數）與次數；三公尺的視窗磨兩次，台階變成緩坡 */
const HEIGHT_SMOOTH_RADIUS = 6
const HEIGHT_SMOOTH_PASS = 2
/** 平滑後的腳底最多比真正的地面低多少（格） */
const FOOT_UNDERCUT_MAX = 0.35

export interface DriftPolyline {
  xList: number[];
  zList: number[];
  /** 每一點腳下的站立面高度（已低通平滑） */
  footYList: number[];
}

export interface GridPoint {
  x: number;
  z: number;
}

export interface DriftCellRef {
  blockX: number;
  blockZ: number;
  blockY: number;
}

const NEIGHBOR_LIST = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
  { dx: 1, dz: 1 },
  { dx: 1, dz: -1 },
  { dx: -1, dz: 1 },
  { dx: -1, dz: -1 },
] as const

function toKey(blockX: number, blockZ: number, blockY: number): number {
  return (blockY * WORLD_SIZE + blockZ) * WORLD_SIZE + blockX
}

interface NeighborCell {
  blockX: number;
  blockZ: number;
  cell: DriftCell;
  isDiagonal: boolean;
}

/**
 * 一格往八個方向走得到的鄰格
 *
 * 斜走要兩側的直鄰格都走得通：不然會從兩根柱子的縫隙擠過去，
 * 而鏡頭有一點寬度，沿著曲線走時會削進方塊的角
 */
function listNeighbor(grid: DriftGrid, blockX: number, blockZ: number, blockY: number): { list: NeighborCell[]; blockedCount: number } {
  const list: NeighborCell[] = []
  /** 前四個是直鄰格，斜鄰格檢查時一定已經查過 */
  const orthogonalMap = new Map<number, DriftCell | null>()
  let blockedCount = 0

  for (const { dx, dz } of NEIGHBOR_LIST) {
    const isDiagonal = dx !== 0 && dz !== 0
    const cell = grid.getCellNear(blockX + dx, blockZ + dz, blockY)
    if (!isDiagonal)
      orthogonalMap.set(dx * 3 + dz, cell)

    if (!cell) {
      blockedCount++
      continue
    }
    if (isDiagonal && (!orthogonalMap.get(dx * 3) || !orthogonalMap.get(dz)))
      continue

    list.push({ blockX: blockX + dx, blockZ: blockZ + dz, cell, isDiagonal })
  }

  return { list, blockedCount }
}

/** 最小堆積，A* 的開放清單 */
class MinHeap<T extends { f: number }> {
  private readonly itemList: T[] = []

  get size(): number {
    return this.itemList.length
  }

  private swap(left: number, right: number): void {
    const held = itemAt(this.itemList, left)
    this.itemList[left] = itemAt(this.itemList, right)
    this.itemList[right] = held
  }

  push(item: T): void {
    const itemList = this.itemList
    itemList.push(item)
    let index = itemList.length - 1
    while (index > 0) {
      const parentIndex = (index - 1) >> 1
      if (itemAt(itemList, parentIndex).f <= itemAt(itemList, index).f) {
        break
      }
      this.swap(parentIndex, index)
      index = parentIndex
    }
  }

  pop(): T | undefined {
    const itemList = this.itemList
    if (itemList.length === 0)
      return undefined

    const top = itemAt(itemList, 0)
    const last = itemList.pop() as T
    if (itemList.length > 0) {
      itemList[0] = last
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < itemList.length && itemAt(itemList, left).f < itemAt(itemList, smallest).f)
          smallest = left
        if (right < itemList.length && itemAt(itemList, right).f < itemAt(itemList, smallest).f)
          smallest = right
        if (smallest === index) {
          break
        }
        this.swap(smallest, index)
        index = smallest
      }
    }
    return top
  }
}

interface SearchNode {
  blockX: number;
  blockZ: number;
  blockY: number;
  cost: number;
  f: number;
  parent: SearchNode | null;
  isClosed: boolean;
}

/**
 * 從起點出發能走到的所有格子
 *
 * 挑停留點時用它剔除「看得到卻走不到」的地方（隔著深水的對岸、牆後的院子）。
 * 以格子識別碼（含高度層）為元素，同一格柱的不同層分開算
 */
export function collectReachableSet(grid: DriftGrid, start: DriftCellRef): Set<number> {
  const reachedSet = new Set<number>([toKey(start.blockX, start.blockZ, start.blockY)])
  const queue: DriftCellRef[] = [start]

  for (let head = 0; head < queue.length; head++) {
    const current = itemAt(queue, head)
    for (const neighbor of listNeighbor(grid, current.blockX, current.blockZ, current.blockY).list) {
      const key = toKey(neighbor.blockX, neighbor.blockZ, neighbor.cell.blockY)
      if (reachedSet.has(key))
        continue

      reachedSet.add(key)
      queue.push({ blockX: neighbor.blockX, blockZ: neighbor.blockZ, blockY: neighbor.cell.blockY })
    }
  }

  return reachedSet
}

export function isCellReachable(reachedSet: Set<number>, cell: DriftCellRef): boolean {
  return reachedSet.has(toKey(cell.blockX, cell.blockZ, cell.blockY))
}

/** A* 找一串格子，起點到終點（與終點同一高度層、水平距離一格半內就算到；不同層的話是隔著斷崖的另一邊），找不到或超過節點上限是 null */
function findCellPath(grid: DriftGrid, start: DriftCellRef, goal: DriftCellRef, nodeLimit: number): DriftCellRef[] | null {
  const startCell = grid.getCellNear(start.blockX, start.blockZ, start.blockY)
  if (!startCell)
    return null

  const nodeMap = new Map<number, SearchNode>()
  const heap = new MinHeap<SearchNode>()
  const startNode: SearchNode = {
    blockX: start.blockX,
    blockZ: start.blockZ,
    blockY: startCell.blockY,
    cost: 0,
    f: 0,
    parent: null,
    isClosed: false,
  }
  nodeMap.set(toKey(startNode.blockX, startNode.blockZ, startNode.blockY), startNode)
  heap.push(startNode)

  let expandedCount = 0
  while (heap.size > 0 && expandedCount < nodeLimit) {
    const current = heap.pop() as SearchNode
    if (current.isClosed)
      continue

    current.isClosed = true
    expandedCount++

    if (current.blockY === goal.blockY && Math.hypot(current.blockX - goal.blockX, current.blockZ - goal.blockZ) <= 1.5) {
      const path: DriftCellRef[] = []
      for (let node: SearchNode | null = current; node; node = node.parent) {
        path.push({ blockX: node.blockX, blockZ: node.blockZ, blockY: node.blockY })
      }
      return path.reverse()
    }

    const { list, blockedCount } = listNeighbor(grid, current.blockX, current.blockZ, current.blockY)
    const crowdPenalty = blockedCount * OBSTACLE_PENALTY
    for (const neighbor of list) {
      const key = toKey(neighbor.blockX, neighbor.blockZ, neighbor.cell.blockY)
      const known = nodeMap.get(key)
      if (known?.isClosed)
        continue

      const stepCost = (neighbor.isDiagonal ? Math.SQRT2 : 1)
        + crowdPenalty
        + Math.abs(neighbor.cell.blockY - current.blockY) * HEIGHT_PENALTY
        + (neighbor.cell.waterDepth > 0 ? WADE_PENALTY : 0)
      const cost = current.cost + stepCost
      if (known && known.cost <= cost)
        continue

      const dx = Math.abs(neighbor.blockX - goal.blockX)
      const dz = Math.abs(neighbor.blockZ - goal.blockZ)
      const heuristic = (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * HEURISTIC_WEIGHT
      const node: SearchNode = {
        blockX: neighbor.blockX,
        blockZ: neighbor.blockZ,
        blockY: neighbor.cell.blockY,
        cost,
        f: cost + heuristic,
        parent: current,
        isClosed: false,
      }
      nodeMap.set(key, node)
      heap.push(node)
    }
  }

  return null
}

/** 折線依固定間距重新取樣，終點一定保留 */
export function resamplePolyline(pointList: GridPoint[], spacing: number): GridPoint[] {
  if (pointList.length < 2)
    return pointList.slice()

  const result: GridPoint[] = [itemAt(pointList, 0)]
  /** 上一段尾巴剩下、還沒湊滿一個間距的長度 */
  let carried = 0
  for (let index = 1; index < pointList.length; index++) {
    const from = itemAt(pointList, index - 1)
    const to = itemAt(pointList, index)
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    if (length === 0)
      continue

    let distance = spacing - carried
    while (distance <= length) {
      const ratio = distance / length
      result.push({ x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio })
      distance += spacing
    }
    carried = length - (distance - spacing)
  }

  const last = itemAt(pointList, pointList.length - 1)
  const tail = itemAt(result, result.length - 1)
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > spacing * 0.25) {
    result.push(last)
  }
  else {
    result[result.length - 1] = last
  }
  return result
}

/** 相鄰點隔太遠就補點，Catmull-Rom 的控制點間距要大致一致才不會在長線段旁盪出去 */
export function subdivideWaypoint(pointList: GridPoint[], spacingMax: number): GridPoint[] {
  const result: GridPoint[] = []
  for (let index = 0; index < pointList.length; index++) {
    result.push(itemAt(pointList, index))
    if (index === pointList.length - 1)
      break

    const from = itemAt(pointList, index)
    const to = itemAt(pointList, index + 1)
    const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / spacingMax)
    for (let step = 1; step < count; step++) {
      const ratio = step / count
      result.push({ x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio })
    }
  }
  return result
}

/** 用 Babylon 的 Catmull-Rom 把控制點串成曲線 */
export function smoothWithSpline(pointList: GridPoint[], pointPerSegment = 10): GridPoint[] {
  if (pointList.length < 3)
    return pointList.slice()

  const spline = Curve3.CreateCatmullRomSpline(
    pointList.map((point) => new Vector3(point.x, 0, point.z)),
    pointPerSegment,
    false,
  )
  return spline.getPoints().map((point) => ({ x: point.x, z: point.z }))
}

/**
 * 把一串取樣點逐點對回格子，量出每一點腳下的站立面高度
 *
 * 每一點的中心與身體四個角（左右各零點三格）都要站得住，而且高度層一路接得起來
 * （每個點以前一點的高度層為基準找站立面）。任何一點不過就整串作廢（null）
 */
function measureFootYList(grid: DriftGrid, sampleList: GridPoint[], startBlockY: number): number[] | null {
  const footYList: number[] = []
  let referenceBlockY = startBlockY

  for (const sample of sampleList) {
    const center = grid.getCellNear(Math.round(sample.x), Math.round(sample.z), referenceBlockY)
    if (!center)
      return null

    for (const offsetX of [-BODY_HALF_WIDTH, BODY_HALF_WIDTH]) {
      for (const offsetZ of [-BODY_HALF_WIDTH, BODY_HALF_WIDTH]) {
        if (!grid.getCellNear(Math.round(sample.x + offsetX), Math.round(sample.z + offsetZ), center.blockY))
          return null
      }
    }

    footYList.push(center.footY)
    referenceBlockY = center.blockY
  }

  return footYList
}

/** 兩點之間的直線走不走得通（拉直路徑用） */
function isSegmentWalkable(grid: DriftGrid, from: GridPoint, to: GridPoint, startBlockY: number): boolean {
  return measureFootYList(grid, resamplePolyline([from, to], PATH_SAMPLE_SPACING), startBlockY) !== null
}

/** 把一串格子拉直成少數幾個轉折點 */
function pullString(grid: DriftGrid, cellPath: DriftCellRef[]): GridPoint[] {
  const waypointList: GridPoint[] = [{ x: itemAt(cellPath, 0).blockX, z: itemAt(cellPath, 0).blockZ }]
  let index = 0

  while (index < cellPath.length - 1) {
    let next = Math.min(cellPath.length - 1, index + PULL_LOOKAHEAD)
    const from = { x: itemAt(cellPath, index).blockX, z: itemAt(cellPath, index).blockZ }
    while (next > index + 1) {
      const to = { x: itemAt(cellPath, next).blockX, z: itemAt(cellPath, next).blockZ }
      if (isSegmentWalkable(grid, from, to, itemAt(cellPath, index).blockY))
        break
      next--
    }
    waypointList.push({ x: itemAt(cellPath, next).blockX, z: itemAt(cellPath, next).blockZ })
    index = next
  }

  return waypointList
}

/** 移動平均低通，兩端用邊界值補，不會把起點與終點的高度拉走 */
export function smoothHeightList(valueList: number[], radius: number, passCount: number): number[] {
  let current = valueList
  for (let pass = 0; pass < passCount; pass++) {
    const next: number[] = []
    for (let index = 0; index < current.length; index++) {
      let sum = 0
      for (let offset = -radius; offset <= radius; offset++) {
        sum += itemAt(current, Math.min(current.length - 1, Math.max(0, index + offset)))
      }
      next.push(sum / (radius * 2 + 1))
    }
    current = next
  }
  return current
}

/**
 * 腳底高度：先把台階磨成緩坡，再不讓它比真正的地面低超過 FOOT_UNDERCUT_MAX
 *
 * 單純低通會在一格高的小階旁把腳底拉到地面以下（視窗平均了高處與低處），
 * 鏡頭離地的距離因此忽高忽低。磨完補一道下限，再輕輕磨一次接回去
 */
function createPolyline(sampleList: GridPoint[], footYList: number[]): DriftPolyline {
  const smoothed = smoothHeightList(footYList, HEIGHT_SMOOTH_RADIUS, HEIGHT_SMOOTH_PASS)
  const floored = smoothed.map((value, index) => Math.max(value, itemAt(footYList, index) - FOOT_UNDERCUT_MAX))
  return {
    xList: sampleList.map((point) => point.x),
    zList: sampleList.map((point) => point.z),
    footYList: smoothHeightList(floored, 2, 1),
  }
}

/**
 * 規劃一段散步路徑
 *
 * 起點用鏡頭實際的位置（不是格子中心），所以接續上一段時沒有位移；
 * 回傳 null 表示這一站走不到，呼叫端換一站
 */
export function planWalkPath(
  grid: DriftGrid,
  start: { x: number; z: number; blockY: number },
  goal: DriftCellRef,
  nodeLimit = NODE_LIMIT,
): DriftPolyline | null {
  const cellPath = findCellPath(
    grid,
    { blockX: Math.round(start.x), blockZ: Math.round(start.z), blockY: start.blockY },
    goal,
    nodeLimit,
  )
  if (!cellPath)
    return null

  /** 路徑第一格就在腳下，用實際位置取代它，不要先繞去格子中心 */
  const startPoint = { x: start.x, z: start.z }
  const rawPointList: GridPoint[] = [
    startPoint,
    ...cellPath.slice(1).map((cell) => ({ x: cell.blockX, z: cell.blockZ })),
  ]
  const pulledPointList = [startPoint, ...pullString(grid, cellPath).slice(1)]

  /** 由粗到細：拉直的曲線、每三格取一點、每兩格取一點、原始格子 */
  const candidateList: GridPoint[][] = [
    smoothWithSpline(subdivideWaypoint(pulledPointList, WAYPOINT_SPACING_MAX)),
    ...[3, 2].map((step) => smoothWithSpline(rawPointList.filter((_, index) => index % step === 0 || index === rawPointList.length - 1))),
    rawPointList,
  ]

  for (const candidate of candidateList) {
    const sampleList = resamplePolyline(candidate, PATH_SAMPLE_SPACING)
    const footYList = measureFootYList(grid, sampleList, start.blockY)
    if (footYList)
      return createPolyline(sampleList, footYList)
  }

  /**
   * 連原始格子連起來都過不了驗證（起點偏在格子邊緣、身體角落貼著牆）：
   * 照格子中心的高度硬走，這條路是 A* 保證走得通的
   */
  const rawSampleList = resamplePolyline(rawPointList, PATH_SAMPLE_SPACING)
  let referenceBlockY = start.blockY
  const fallbackFootYList = rawSampleList.map((sample) => {
    const cell = grid.getCellNear(Math.round(sample.x), Math.round(sample.z), referenceBlockY)
    referenceBlockY = cell?.blockY ?? referenceBlockY
    return cell?.footY ?? 0
  })
  return createPolyline(rawSampleList, fallbackFootYList)
}

/** 弧線至少要有這麼長（格）才值得走 */
const ARC_LENGTH_MIN = 5

/**
 * 繞著一個中心走的弧（運鏡的 orbit 用）
 *
 * 從目前位置出發，保持離中心的距離，往 sweepSign 的方向繞 arcLength 格。
 * 逐點對回格子驗證，遇到站不住的地方就在那裡截斷（縮短而不是穿過去）；
 * 截斷後不到 ARC_LENGTH_MIN 就是 null，呼叫端換個方向或放棄這個鏡位
 */
export function planArcPath(
  grid: DriftGrid,
  start: { x: number; z: number; blockY: number },
  center: GridPoint,
  arcLength: number,
  sweepSign: 1 | -1,
): DriftPolyline | null {
  const radius = Math.hypot(start.x - center.x, start.z - center.z)
  if (radius < 1)
    return null

  const startAngle = Math.atan2(start.x - center.x, start.z - center.z)
  const stepAngle = (PATH_SAMPLE_SPACING / radius) * sweepSign
  const count = Math.floor(arcLength / PATH_SAMPLE_SPACING)

  const sampleList: GridPoint[] = []
  let footYList: number[] = []
  for (let index = 0; index <= count; index++) {
    const angle = startAngle + stepAngle * index
    sampleList.push({ x: center.x + Math.sin(angle) * radius, z: center.z + Math.cos(angle) * radius })

    /** 逐點加長驗證，第一個過不了的點就是截斷處 */
    const measured = measureFootYList(grid, sampleList, start.blockY)
    if (!measured) {
      sampleList.pop()
      break
    }
    footYList = measured
  }

  if (sampleList.length * PATH_SAMPLE_SPACING < ARC_LENGTH_MIN)
    return null

  return createPolyline(sampleList, footYList)
}
