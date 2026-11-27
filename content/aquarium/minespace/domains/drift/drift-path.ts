import type { DriftCell, DriftGrid } from './drift-grid'
import type { DriftSteps } from './drift-job'
import { Curve3, Vector3 } from '@babylonjs/core'
import { runStepsSync } from './drift-job'
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

/**
 * 一格往八個方向走得到的鄰格（結果寫進呼叫端給的緩衝，不配置新物件）
 *
 * 斜走要兩側的直鄰格都走得通：不然會從兩根柱子的縫隙擠過去，
 * 而鏡頭有一點寬度，沿著曲線走時會削進方塊的角。
 * 尋路每展開一格就要問一次，緩衝重複使用，避免幾萬次的小物件配置
 */
class NeighborBuffer {
  count = 0
  /** 八方向裡被擋住（沒有站立面）的個數：貼著障礙的路線多扣一點分 */
  blockedCount = 0
  readonly blockXList = new Int32Array(8)
  readonly blockZList = new Int32Array(8)
  readonly diagonalList = new Uint8Array(8)
  readonly cellList: DriftCell[] = Array.from({ length: 8 }) as DriftCell[]
}

function fillNeighbor(grid: DriftGrid, blockX: number, blockZ: number, blockY: number, buffer: NeighborBuffer): void {
  buffer.count = 0
  buffer.blockedCount = 0
  /** 前四個是直鄰格（+x、-x、+z、-z），斜鄰格檢查時一定已經查過 */
  let positiveX: DriftCell | null = null
  let negativeX: DriftCell | null = null
  let positiveZ: DriftCell | null = null
  let negativeZ: DriftCell | null = null

  for (let index = 0; index < NEIGHBOR_LIST.length; index++) {
    const { dx, dz } = itemAt(NEIGHBOR_LIST, index)
    const isDiagonal = dx !== 0 && dz !== 0
    const cell = grid.getCellNear(blockX + dx, blockZ + dz, blockY)
    if (!isDiagonal) {
      if (dx === 1)
        positiveX = cell
      else if (dx === -1)
        negativeX = cell
      else if (dz === 1)
        positiveZ = cell
      else
        negativeZ = cell
    }

    if (!cell) {
      buffer.blockedCount++
      continue
    }
    if (isDiagonal && (!(dx === 1 ? positiveX : negativeX) || !(dz === 1 ? positiveZ : negativeZ)))
      continue

    const slot = buffer.count++
    buffer.blockXList[slot] = blockX + dx
    buffer.blockZList[slot] = blockZ + dz
    buffer.diagonalList[slot] = isDiagonal ? 1 : 0
    buffer.cellList[slot] = cell
  }
}

/**
 * 從起點能走到的格子（以站立面的編號標記）
 *
 * 挑停留點時用它剔除「看得到卻走不到」的地方（隔著深水的對岸、牆後的院子）。
 * 同一格柱的不同高度層是不同的站立面，分開算
 */
export class ReachedSet {
  size = 0
  private flagList: Uint8Array

  constructor(capacity: number) {
    this.flagList = new Uint8Array(Math.max(64, capacity))
  }

  has(cell: DriftCell): boolean {
    return cell.id < this.flagList.length && this.flagList[cell.id] === 1
  }

  /** 加進來；本來就在裡面是 false */
  add(cell: DriftCell): boolean {
    if (cell.id >= this.flagList.length) {
      const grown = new Uint8Array(Math.max(cell.id + 1, this.flagList.length * 2))
      grown.set(this.flagList)
      this.flagList = grown
    }
    if (this.flagList[cell.id] === 1)
      return false

    this.flagList[cell.id] = 1
    this.size++
    return true
  }
}

/**
 * 分幀工作的切點：每展開這麼多格、或這段時間內第一次掃了這麼多沒掃過的柱子（掃一柱要幾微秒），就讓出一次
 *
 * 已經掃過的地方展開一格不到一微秒，在沒掃過的荒地一格要十幾微秒；兩種都計入，每一段才不會忽大忽小
 */
const SEARCH_YIELD_EXPANSION = 32
const SEARCH_YIELD_NEW_COLUMN = 8

/**
 * 從起點出發能走到的所有格子（分段版）
 *
 * sizeLimit 有給就在收集到這麼多格時停手：只想知道「夠不夠大」時不必掃完整片地圖
 */
export function* collectReachableSetSteps(grid: DriftGrid, start: DriftCellRef, sizeLimit = Number.POSITIVE_INFINITY): DriftSteps<ReachedSet> {
  const reachedSet = new ReachedSet(grid.getCellCount() + 256)
  const startCell = grid.getCellNear(start.blockX, start.blockZ, start.blockY)
  if (startCell)
    reachedSet.add(startCell)

  let queueX = new Int32Array(1024)
  let queueZ = new Int32Array(1024)
  let queueY = new Int32Array(1024)
  let tail = 0
  queueX[tail] = start.blockX
  queueZ[tail] = start.blockZ
  queueY[tail] = start.blockY
  tail++
  const buffer = new NeighborBuffer()
  let yieldScanCount = grid.getScanCount()

  for (let head = 0; head < tail && reachedSet.size < sizeLimit; head++) {
    fillNeighbor(grid, queueX[head] as number, queueZ[head] as number, queueY[head] as number, buffer)
    for (let slot = 0; slot < buffer.count; slot++) {
      const cell = buffer.cellList[slot] as DriftCell
      if (!reachedSet.add(cell))
        continue

      if (tail >= queueX.length) {
        const grownX = new Int32Array(queueX.length * 2)
        const grownZ = new Int32Array(queueX.length * 2)
        const grownY = new Int32Array(queueX.length * 2)
        grownX.set(queueX)
        grownZ.set(queueZ)
        grownY.set(queueY)
        queueX = grownX
        queueZ = grownZ
        queueY = grownY
      }
      queueX[tail] = buffer.blockXList[slot] as number
      queueZ[tail] = buffer.blockZList[slot] as number
      queueY[tail] = cell.blockY
      tail++
      if (reachedSet.size >= sizeLimit)
        break
    }
    if ((head + 1) % SEARCH_YIELD_EXPANSION === 0 || grid.getScanCount() - yieldScanCount >= SEARCH_YIELD_NEW_COLUMN) {
      yieldScanCount = grid.getScanCount()
      yield
    }
  }

  return reachedSet
}

/** 從起點出發能走到的所有格子（一口氣跑完） */
export function collectReachableSet(grid: DriftGrid, start: DriftCellRef, sizeLimit = Number.POSITIVE_INFINITY): ReachedSet {
  return runStepsSync(collectReachableSetSteps(grid, start, sizeLimit))
}

export function isCellReachable(reachedSet: ReachedSet, cell: DriftCell): boolean {
  return reachedSet.has(cell)
}

/**
 * A* 的搜尋節點池
 *
 * 一次搜尋會建上萬個節點，用物件的話是上萬個小配置加一張 Map；這裡改成 typed array（以節點編號為下標），
 * 節點池與「站立面編號 → 目前的節點」的對照表都掛在格子上重複使用，一次搜尋完全不配置新物件。
 * 語意與物件版本逐項相同：每次放寬成本就新增一個節點（舊的留在堆積裡，彈出時照樣展開），
 * 關閉旗標是各節點自己的，所以與舊版走出同一條路
 */
class SearchPool {
  nodeCapacity = 0
  nodeCount = 0
  nodeX = new Int32Array(0)
  nodeZ = new Int32Array(0)
  nodeY = new Int32Array(0)
  nodeParent = new Int32Array(0)
  nodeCost = new Float64Array(0)
  nodeScore = new Float64Array(0)
  nodeClosed = new Uint8Array(0)
  heap = new Int32Array(0)
  heapSize = 0
  /** 站立面編號 → 最新的節點編號；stamp 與搜尋序號相同才有效 */
  cellCapacity = 0
  cellNode = new Int32Array(0)
  cellStamp = new Uint32Array(0)
  stamp = 0

  constructor() {
    this.growNode(1024)
    this.growCell(1024)
  }

  growNode(capacity: number) {
    this.nodeX = growInt32(this.nodeX, capacity)
    this.nodeZ = growInt32(this.nodeZ, capacity)
    this.nodeY = growInt32(this.nodeY, capacity)
    this.nodeParent = growInt32(this.nodeParent, capacity)
    this.heap = growInt32(this.heap, capacity)
    const grownCost = new Float64Array(capacity)
    grownCost.set(this.nodeCost)
    this.nodeCost = grownCost
    const grownScore = new Float64Array(capacity)
    grownScore.set(this.nodeScore)
    this.nodeScore = grownScore
    const grownClosed = new Uint8Array(capacity)
    grownClosed.set(this.nodeClosed)
    this.nodeClosed = grownClosed
    this.nodeCapacity = capacity
  }

  growCell(capacity: number) {
    this.cellNode = growInt32(this.cellNode, capacity)
    const grownStamp = new Uint32Array(capacity)
    grownStamp.set(this.cellStamp)
    this.cellStamp = grownStamp
    this.cellCapacity = capacity
  }

  begin() {
    this.nodeCount = 0
    this.heapSize = 0
    this.stamp++
  }

  /** 新增一個節點，回傳編號 */
  addNode(blockX: number, blockZ: number, blockY: number, parent: number, cost: number, score: number): number {
    if (this.nodeCount >= this.nodeCapacity)
      this.growNode(this.nodeCapacity * 2)

    const index = this.nodeCount++
    this.nodeX[index] = blockX
    this.nodeZ[index] = blockZ
    this.nodeY[index] = blockY
    this.nodeParent[index] = parent
    this.nodeCost[index] = cost
    this.nodeScore[index] = score
    this.nodeClosed[index] = 0
    return index
  }

  /** 這個站立面目前的節點，沒有是 -1 */
  getCellNode(cell: DriftCell): number {
    if (cell.id >= this.cellCapacity || this.cellStamp[cell.id] !== this.stamp)
      return -1
    return this.cellNode[cell.id] as number
  }

  setCellNode(cell: DriftCell, node: number) {
    if (cell.id >= this.cellCapacity)
      this.growCell(Math.max(cell.id + 1, this.cellCapacity * 2))
    this.cellNode[cell.id] = node
    this.cellStamp[cell.id] = this.stamp
  }

  /** 最小堆積：比較的是節點的 f 值，推入與彈出的比較方式與舊版的物件堆積相同（同分時的先後順序不變） */
  push(node: number) {
    const { heap, nodeScore } = this
    let index = this.heapSize++
    heap[index] = node
    while (index > 0) {
      const parentIndex = (index - 1) >> 1
      if ((nodeScore[heap[parentIndex] as number] as number) <= (nodeScore[heap[index] as number] as number))
        break
      const held = heap[parentIndex] as number
      heap[parentIndex] = heap[index] as number
      heap[index] = held
      index = parentIndex
    }
  }

  pop(): number {
    const { heap, nodeScore } = this
    const top = heap[0] as number
    this.heapSize--
    if (this.heapSize > 0) {
      heap[0] = heap[this.heapSize] as number
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.heapSize && (nodeScore[heap[left] as number] as number) < (nodeScore[heap[smallest] as number] as number))
          smallest = left
        if (right < this.heapSize && (nodeScore[heap[right] as number] as number) < (nodeScore[heap[smallest] as number] as number))
          smallest = right
        if (smallest === index)
          break
        const held = heap[smallest] as number
        heap[smallest] = heap[index] as number
        heap[index] = held
        index = smallest
      }
    }
    return top
  }
}

function growInt32(source: Int32Array, capacity: number): Int32Array<ArrayBuffer> {
  const grown = new Int32Array(capacity)
  grown.set(source)
  return grown
}

/** 節點池太大（長路線的搜尋留下的）就不留著，免得整場神遊一直占著幾 MB */
const POOL_KEEP_NODE_MAX = 65536
/** 節點池掛在格子上：格子跟著這一次神遊丟掉，池也跟著走 */
const poolMap = new WeakMap<DriftGrid, SearchPool>()

/**
 * A* 找一串格子（分段版）：起點到終點（與終點同一高度層、水平距離一格半內就算到；不同層的話是隔著斷崖的另一邊），
 * 找不到或超過節點上限是 null
 */
function* findCellPathSteps(grid: DriftGrid, start: DriftCellRef, goal: DriftCellRef, nodeLimit: number): DriftSteps<DriftCellRef[] | null> {
  const startCell = grid.getCellNear(start.blockX, start.blockZ, start.blockY)
  if (!startCell)
    return null

  /** 把節點池借走（還回去之前別的搜尋借不到，會另外配一份）：分幀的搜尋可能被丟掉，不能讓兩個搜尋共用同一份 */
  const pool = poolMap.get(grid) ?? new SearchPool()
  poolMap.delete(grid)
  pool.begin()
  const buffer = new NeighborBuffer()

  const startNode = pool.addNode(start.blockX, start.blockZ, startCell.blockY, -1, 0, 0)
  pool.setCellNode(startCell, startNode)
  pool.push(startNode)

  let result: DriftCellRef[] | null = null
  let expandedCount = 0
  let yieldScanCount = grid.getScanCount()
  try {
    while (pool.heapSize > 0 && expandedCount < nodeLimit) {
      const current = pool.pop()
      if (pool.nodeClosed[current] === 1)
        continue

      pool.nodeClosed[current] = 1
      expandedCount++

      const currentX = pool.nodeX[current] as number
      const currentZ = pool.nodeZ[current] as number
      const currentY = pool.nodeY[current] as number
      if (currentY === goal.blockY && Math.hypot(currentX - goal.blockX, currentZ - goal.blockZ) <= 1.5) {
        const path: DriftCellRef[] = []
        for (let node = current; node >= 0; node = pool.nodeParent[node] as number)
          path.push({ blockX: pool.nodeX[node] as number, blockZ: pool.nodeZ[node] as number, blockY: pool.nodeY[node] as number })
        result = path.reverse()
        break
      }

      fillNeighbor(grid, currentX, currentZ, currentY, buffer)
      const crowdPenalty = buffer.blockedCount * OBSTACLE_PENALTY
      const currentCost = pool.nodeCost[current] as number
      for (let slot = 0; slot < buffer.count; slot++) {
        const cell = buffer.cellList[slot] as DriftCell
        const known = pool.getCellNode(cell)
        if (known >= 0 && pool.nodeClosed[known] === 1)
          continue

        const stepCost = (buffer.diagonalList[slot] === 1 ? Math.SQRT2 : 1)
          + crowdPenalty
          + Math.abs(cell.blockY - currentY) * HEIGHT_PENALTY
          + (cell.waterDepth > 0 ? WADE_PENALTY : 0)
        const cost = currentCost + stepCost
        if (known >= 0 && (pool.nodeCost[known] as number) <= cost)
          continue

        const neighborX = buffer.blockXList[slot] as number
        const neighborZ = buffer.blockZList[slot] as number
        const dx = Math.abs(neighborX - goal.blockX)
        const dz = Math.abs(neighborZ - goal.blockZ)
        const heuristic = (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * HEURISTIC_WEIGHT
        const node = pool.addNode(neighborX, neighborZ, cell.blockY, current, cost, cost + heuristic)
        pool.setCellNode(cell, node)
        pool.push(node)
      }

      if (expandedCount % SEARCH_YIELD_EXPANSION === 0 || grid.getScanCount() - yieldScanCount >= SEARCH_YIELD_NEW_COLUMN) {
        yieldScanCount = grid.getScanCount()
        yield
      }
    }
  }
  finally {
    /** 長路線的搜尋留下的大池子不留著，免得整場神遊一直占著幾 MB */
    if (pool.nodeCapacity <= POOL_KEEP_NODE_MAX)
      poolMap.set(grid, pool)
  }
  return result
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
 * 站在 (x, z) 這一點，腳下的站立面：中心與身體四個角（左右各零點三格）都要站得住，任何一個不行就是 null
 *
 * referenceBlockY 是前一點的高度層（一步最多跨一格）；身體四個角以中心那一層為基準
 */
function probeStand(grid: DriftGrid, x: number, z: number, referenceBlockY: number): DriftCell | null {
  const center = grid.getCellNear(Math.round(x), Math.round(z), referenceBlockY)
  if (!center)
    return null

  const { blockY } = center
  if (!grid.getCellNear(Math.round(x - BODY_HALF_WIDTH), Math.round(z - BODY_HALF_WIDTH), blockY)
    || !grid.getCellNear(Math.round(x - BODY_HALF_WIDTH), Math.round(z + BODY_HALF_WIDTH), blockY)
    || !grid.getCellNear(Math.round(x + BODY_HALF_WIDTH), Math.round(z - BODY_HALF_WIDTH), blockY)
    || !grid.getCellNear(Math.round(x + BODY_HALF_WIDTH), Math.round(z + BODY_HALF_WIDTH), blockY)) {
    return null
  }
  return center
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
    const center = probeStand(grid, sample.x, sample.z, referenceBlockY)
    if (!center)
      return null

    footYList.push(center.footY)
    referenceBlockY = center.blockY
  }

  return footYList
}

/**
 * 兩點之間的直線走不走得通（拉直路徑用）
 *
 * 取樣點與 resamplePolyline([from, to]) 完全相同（頭、每隔一個間距一點、尾巴併進終點），
 * 只是不配置陣列，邊走邊驗，第一個不過就停
 */
function isSegmentWalkable(grid: DriftGrid, from: GridPoint, to: GridPoint, startBlockY: number): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  let referenceBlockY = startBlockY
  /** 最近一個取樣點先不驗：它可能被終點取代（尾巴太短的話） */
  let pendingX = from.x
  let pendingZ = from.z

  if (length !== 0) {
    for (let distance = PATH_SAMPLE_SPACING; distance <= length; distance += PATH_SAMPLE_SPACING) {
      const stand = probeStand(grid, pendingX, pendingZ, referenceBlockY)
      if (!stand)
        return false

      referenceBlockY = stand.blockY
      const ratio = distance / length
      pendingX = from.x + (to.x - from.x) * ratio
      pendingZ = from.z + (to.z - from.z) * ratio
    }
  }

  if (Math.hypot(to.x - pendingX, to.z - pendingZ) > PATH_SAMPLE_SPACING * 0.25) {
    const stand = probeStand(grid, pendingX, pendingZ, referenceBlockY)
    if (!stand)
      return false

    referenceBlockY = stand.blockY
  }
  return probeStand(grid, to.x, to.z, referenceBlockY) !== null
}

/** 把一串格子拉直成少數幾個轉折點（分段版：每試一個候選終點就讓出一次） */
function* pullStringSteps(grid: DriftGrid, cellPath: DriftCellRef[]): DriftSteps<GridPoint[]> {
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
      yield
    }
    waypointList.push({ x: itemAt(cellPath, next).blockX, z: itemAt(cellPath, next).blockZ })
    index = next
    yield
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
 * 規劃一段散步路徑（分段版：A*、拉直、每個候選曲線的驗證之間都可以讓出一幀）
 *
 * 起點用鏡頭實際的位置（不是格子中心），所以接續上一段時沒有位移；
 * 回傳 null 表示這一站走不到，呼叫端換一站
 */
export function* planWalkPathSteps(
  grid: DriftGrid,
  start: { x: number; z: number; blockY: number },
  goal: DriftCellRef,
  nodeLimit = NODE_LIMIT,
): DriftSteps<DriftPolyline | null> {
  const cellPath = yield * findCellPathSteps(
    grid,
    { blockX: Math.round(start.x), blockZ: Math.round(start.z), blockY: start.blockY },
    goal,
    nodeLimit,
  )
  if (!cellPath)
    return null
  yield

  /** 路徑第一格就在腳下，用實際位置取代它，不要先繞去格子中心 */
  const startPoint = { x: start.x, z: start.z }
  const rawPointList: GridPoint[] = [
    startPoint,
    ...cellPath.slice(1).map((cell) => ({ x: cell.blockX, z: cell.blockZ })),
  ]
  const pulledPointList = [startPoint, ...(yield * pullStringSteps(grid, cellPath)).slice(1)]

  /** 由粗到細：拉直的曲線、每三格取一點、每兩格取一點、原始格子；後面的候選用到才算 */
  const candidateMakerList: (() => GridPoint[])[] = [
    () => smoothWithSpline(subdivideWaypoint(pulledPointList, WAYPOINT_SPACING_MAX)),
    ...[3, 2].map((step) => () => smoothWithSpline(rawPointList.filter((_, index) => index % step === 0 || index === rawPointList.length - 1))),
    () => rawPointList,
  ]

  for (const makeCandidate of candidateMakerList) {
    yield
    const sampleList = resamplePolyline(makeCandidate(), PATH_SAMPLE_SPACING)
    const footYList = measureFootYList(grid, sampleList, start.blockY)
    if (footYList) {
      yield
      return createPolyline(sampleList, footYList)
    }
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

/** 規劃一段散步路徑（一口氣跑完，見 planWalkPathSteps） */
export function planWalkPath(
  grid: DriftGrid,
  start: { x: number; z: number; blockY: number },
  goal: DriftCellRef,
  nodeLimit = NODE_LIMIT,
): DriftPolyline | null {
  return runStepsSync(planWalkPathSteps(grid, start, goal, nodeLimit))
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
  const footYList: number[] = []
  let referenceBlockY = start.blockY
  for (let index = 0; index <= count; index++) {
    const angle = startAngle + stepAngle * index
    const x = center.x + Math.sin(angle) * radius
    const z = center.z + Math.cos(angle) * radius

    /** 逐點驗證（每點只對前一點的高度層，不必每次從頭量），第一個過不了的點就是截斷處 */
    const stand = probeStand(grid, x, z, referenceBlockY)
    if (!stand)
      break

    sampleList.push({ x, z })
    footYList.push(stand.footY)
    referenceBlockY = stand.blockY
  }

  if (sampleList.length * PATH_SAMPLE_SPACING < ARC_LENGTH_MIN)
    return null

  return createPolyline(sampleList, footYList)
}
