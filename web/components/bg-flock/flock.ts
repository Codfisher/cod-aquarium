import type { BoidOptions } from './boid'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { pipe } from 'remeda'
import { Boid } from './boid'
import { fromSphericalCoordsToRef, limitLengthInPlace, normalizeSafeInPlace, setLengthInPlace } from './utils'

/** 行為權重，與名稱對應 */
export interface BehaviorWeights {
  /** 分離 */
  separation?: number;
  /** 對齊 */
  alignment?: number;
  /** 凝聚 */
  cohesion?: number;
  target?: number;
}

/** 行為半徑，決定特定行為的考量範圍 */
export interface BehaviorRadii {
  separation?: number;
  alignment?: number;
  cohesion?: number;
}

export interface TargetShellOptions {
  /** 殼半徑 */
  radius: number;
  /** 殼的厚度，讓 boid 的位置有交錯變化 */
  band?: number;
  /** boid 目標繞 target 旋轉的角速度（rad/s；0 則不旋轉） */
  swirlSpeed?: number;
}

export interface FlockOptions {
  weights?: BehaviorWeights;
  radii?: BehaviorRadii;
  /** 空間雜湊網格之立方體邊長 */
  cellSize?: number;
  /** Shell 模式，用於模擬魚環繞特定目標成球的樣子
   *
   * 無則維持原本單點 target 的行為
   */
  targetShell?: TargetShellOptions;
}

type NeighborProvider = (boidList: Boid[], index: number, radius: number) => number[]

/** 三維空間雜湊網格 */
class SpatialHashGrid3D {
  cellSize: number
  buckets: Map<number, number[]> = new Map()

  constructor(cellSize: number) {
    this.cellSize = Math.max(1, Math.floor(cellSize))
  }

  /** 以整數雜湊當 key，避免每幀 rebuild 產生大量字串。
   * 少數雜湊碰撞只會多幾個候選，後續距離檢查會濾掉，不影響正確性
   */
  private computeKey(gridX: number, gridY: number, gridZ: number): number {
    return (gridX * 73856093) ^ (gridY * 19349663) ^ (gridZ * 83492791)
  }

  rebuild(boidList: Boid[]) {
    this.buckets.clear()
    for (let index = 0; index < boidList.length; index++) {
      const boid = boidList[index]
      if (!boid)
        continue

      const gridX = Math.floor(boid.position.x / this.cellSize)
      const gridY = Math.floor(boid.position.y / this.cellSize)
      const gridZ = Math.floor(boid.position.z / this.cellSize)
      const key = this.computeKey(gridX, gridY, gridZ)

      const bucket = this.buckets.get(key)
      if (bucket) {
        bucket.push(index)
      }
      else {
        this.buckets.set(key, [index])
      }
    }
  }

  /** 查詢範圍內的候選 boid，結果寫入 result，重複利用同一個陣列 */
  queryToRef(center: Vector3, radius: number, result: number[]): number[] {
    result.length = 0

    const r = Math.max(radius, 0)
    const minGridX = Math.floor((center.x - r) / this.cellSize)
    const maxGridX = Math.floor((center.x + r) / this.cellSize)
    const minGridY = Math.floor((center.y - r) / this.cellSize)
    const maxGridY = Math.floor((center.y + r) / this.cellSize)
    const minGridZ = Math.floor((center.z - r) / this.cellSize)
    const maxGridZ = Math.floor((center.z + r) / this.cellSize)

    for (let gridX = minGridX; gridX <= maxGridX; gridX++) {
      for (let gridY = minGridY; gridY <= maxGridY; gridY++) {
        for (let gridZ = minGridZ; gridZ <= maxGridZ; gridZ++) {
          const bucket = this.buckets.get(this.computeKey(gridX, gridY, gridZ))
          if (!bucket)
            continue

          for (const boidIndex of bucket) {
            result.push(boidIndex)
          }
        }
      }
    }
    return result
  }
}

const defaultWeights: Required<BehaviorWeights> = {
  separation: 8,
  alignment: 10,
  cohesion: 2,
  target: 12,
}
const defaultRadii: Required<BehaviorRadii> = {
  separation: 10,
  alignment: 10,
  cohesion: 20,
}

export class Flock {
  boidList: Boid[] = []
  weights: Required<BehaviorWeights>
  radii: Required<BehaviorRadii>

  private grid?: SpatialHashGrid3D
  private neighborProvider: NeighborProvider

  private elapsedTime = 0
  private target?: Vector3
  targetShell?: Required<TargetShellOptions>

  /** 暫存物件，避免 step 高頻迴圈中重複配置 */
  private readonly steerScratch = new Vector3()
  private readonly behaviorScratch = new Vector3()
  private readonly vectorScratch = new Vector3()
  private readonly aimScratch = new Vector3()
  private readonly neighborScratch: number[] = []
  private readonly candidateScratch: number[] = []

  constructor(options: FlockOptions = {}) {
    this.weights = {
      ...defaultWeights,
      ...options.weights,
    }
    this.radii = {
      ...defaultRadii,
      ...options.radii,
    }

    if (options.targetShell) {
      this.targetShell = {
        radius: options.targetShell.radius,
        band: options.targetShell.band ?? 0,
        swirlSpeed: options.targetShell.swirlSpeed ?? 0,
      }
    }

    const avgR = (this.radii.separation + this.radii.alignment + this.radii.cohesion) / 3
    const cellSize = options.cellSize ?? Math.max(4, Math.floor(avgR))
    this.grid = new SpatialHashGrid3D(cellSize)
    this.neighborProvider = (boidList, index, radius) => {
      const out = this.neighborScratch
      out.length = 0

      const boid = boidList[index]
      if (!boid)
        return out

      const candidateList = this.grid!.queryToRef(boid.position, radius, this.candidateScratch)
      const radiusSquared = radius * radius
      for (const candidateIndex of candidateList) {
        if (candidateIndex === index)
          continue

        const other = boidList[candidateIndex]
        if (!other)
          continue

        if (Vector3.DistanceSquared(boid.position, other.position) <= radiusSquared)
          out.push(candidateIndex)
      }
      return out
    }
  }

  setTarget(x: number, y: number, z = 0) {
    if (!this.target) {
      this.target = new Vector3(x, y, z)
    }
    else {
      this.target.set(x, y, z)
    }
  }

  addBoid(boid: Boid) {
    this.boidList.push(boid)
  }

  /** 在 AABB 內隨機加入 n 個 Boid */
  addRandomBoids(
    n: number,
    aabb: { min: Vector3; max: Vector3 },
    options?: Partial<
      Pick<BoidOptions, 'maxForce' | 'maxSpeed' | 'angSmooth'>
    >,
  ) {
    const { maxSpeed = 1 } = options ?? {}

    const size = aabb.max.subtract(aabb.min)
    for (let k = 0; k < n; k++) {
      const position = new Vector3(
        aabb.min.x + Math.random() * size.x,
        aabb.min.y + Math.random() * size.y,
        aabb.min.z + Math.random() * size.z,
      )

      // 隨機方向與速度
      const theta = Math.random() * Math.PI // polar
      const phi = Math.random() * Math.PI * 2 // azimuth
      const speed = Math.random() * maxSpeed
      const velocity = fromSphericalCoordsToRef(speed, theta, phi, new Vector3())
      this.addBoid(new Boid({
        position,
        velocity,
        ...options,
      }))
    }
  }

  step(dt = 1) {
    this.elapsedTime += dt

    if (this.grid)
      this.grid.rebuild(this.boidList)

    const maxRadius = Math.max(this.radii.separation, this.radii.alignment, this.radii.cohesion)
    const steer = this.steerScratch
    const behavior = this.behaviorScratch

    for (let i = 0; i < this.boidList.length; i++) {
      const boid = this.boidList[i]
      if (!boid)
        continue

      const neighborIndexList = this.neighborProvider(this.boidList, i, maxRadius)

      steer.setAll(0)

      this.separationToRef(i, neighborIndexList, behavior)
      behavior.scaleAndAddToRef(this.weights.separation, steer)

      this.alignmentToRef(i, neighborIndexList, behavior)
      behavior.scaleAndAddToRef(this.weights.alignment, steer)

      this.cohesionToRef(i, neighborIndexList, behavior)
      behavior.scaleAndAddToRef(this.weights.cohesion, steer)

      this.seekToRef(i, this.target, behavior)
      behavior.scaleAndAddToRef(this.weights.target, steer)

      boid.applyForce(steer)
    }

    for (const boid of this.boidList) boid.update(dt)
  }

  /** 追向 target，結果寫入 out */
  private seekToRef(index: number, target: Vector3 | undefined, out: Vector3) {
    out.setAll(0)

    const boid = this.boidList[index]
    if (!boid || !target)
      return

    // 殼模式：改追殼上的「插槽點」
    if (this.targetShell) {
      this.shellAimPointToRef(index, target, this.aimScratch)
      this.aimScratch.subtractToRef(boid.position, out)
    }
    else {
      // 直接追向 target
      target.subtractToRef(boid.position, out)
    }

    setLengthInPlace(out, boid.maxSpeed)
    out.subtractInPlace(boid.velocity)
    limitLengthInPlace(out, boid.maxForce)
  }

  /** 分離：遠離過近的鄰居，結果寫入 out */
  private separationToRef(index: number, neighborIndexList: number[], out: Vector3) {
    out.setAll(0)

    const boid = this.boidList[index]
    if (!boid)
      return

    const difference = this.vectorScratch
    let count = 0

    for (const neighborIndex of neighborIndexList) {
      const other = this.boidList[neighborIndex]
      if (!other)
        continue

      const distance = Vector3.Distance(boid.position, other.position)
      if (distance > 0 && distance < this.radii.separation) {
        // 距離越近權重越大（1/d）
        boid.position.subtractToRef(other.position, difference)
        difference.scaleInPlace(1 / distance)
        out.addInPlace(difference)
        count++
      }
    }

    if (count === 0)
      return

    out.scaleInPlace(1 / count)
    setLengthInPlace(out, boid.maxSpeed)
    out.subtractInPlace(boid.velocity)
    limitLengthInPlace(out, boid.maxForce)
  }

  /** 對齊：匹配鄰居平均速度方向，結果寫入 out */
  private alignmentToRef(index: number, neighborIndexList: number[], out: Vector3) {
    out.setAll(0)

    const boid = this.boidList[index]
    if (!boid)
      return

    let count = 0

    for (const neighborIndex of neighborIndexList) {
      const other = this.boidList[neighborIndex]
      if (!other)
        continue

      const distance = Vector3.Distance(boid.position, other.position)
      if (distance < this.radii.alignment) {
        out.addInPlace(other.velocity)
        count++
      }
    }

    if (count === 0)
      return

    out.scaleInPlace(1 / count)
    setLengthInPlace(out, boid.maxSpeed)
    out.subtractInPlace(boid.velocity)
    limitLengthInPlace(out, boid.maxForce)
  }

  /** 凝聚：朝向鄰居的質心，結果寫入 out */
  private cohesionToRef(index: number, neighborIndexList: number[], out: Vector3) {
    out.setAll(0)

    const boid = this.boidList[index]
    if (!boid)
      return

    let count = 0

    for (const neighborIndex of neighborIndexList) {
      const other = this.boidList[neighborIndex]
      if (!other)
        continue

      const distance = Vector3.Distance(boid.position, other.position)
      if (distance < this.radii.cohesion) {
        out.addInPlace(other.position)
        count++
      }
    }

    if (count === 0)
      return

    out.scaleInPlace(1 / count) // 質心
    out.subtractInPlace(boid.position)
    setLengthInPlace(out, boid.maxSpeed)
    out.subtractInPlace(boid.velocity)
    limitLengthInPlace(out, boid.maxForce)
  }

  /** 在球面上近似均勻分配方向（Fibonacci sphere），並可隨時間繞行，結果寫入 out */
  private shellDirectionToRef(index: number, out: Vector3) {
    const n = Math.max(1, this.boidList.length)
    const k = index + 0.5
    /** 黃金角 */
    const golden = Math.PI * (3 - Math.sqrt(5))
    /** 極角，去除球頂部與底部，以免 boid 看起來很像迷路 */
    const theta = pipe(
      0.05,
      (cap) => cap + (1 - 2 * cap) * (k / n),
      (u) => Math.acos(1 - 2 * u),
    )
    const phiBase = k * golden
    const phi = (phiBase + this.elapsedTime * (this.targetShell?.swirlSpeed ?? 0)) % (2 * Math.PI)

    fromSphericalCoordsToRef(1, theta, phi, out)
    normalizeSafeInPlace(out)
  }

  /** 穩定可重現的偽亂數，避免每幀亂跳 */
  private random(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }

  /** 取得第 index 隻 boid 的殼目標點，結果寫入 out */
  private shellAimPointToRef(index: number, target: Vector3, out: Vector3) {
    this.shellDirectionToRef(index, out)

    const baseRadius = this.targetShell!.radius
    const band = this.targetShell!.band
    // 在半徑上加一點個體差，避免全部站在同一圈
    const radius = baseRadius + band * (this.random(index * 97 + 13) - 0.5)
    out.scaleInPlace(radius)
    out.addInPlace(target)
  }
}
