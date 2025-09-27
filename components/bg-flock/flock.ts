import type { BoidOptions } from './boid'
import { Vector3 } from '@babylonjs/core'
import { pipe } from 'remeda'
import { Boid } from './boid'
import { fromSphericalCoords, limitLength, normalizeSafe, setLength } from './utils'

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

type NeighborProvider = (boids: Boid[], i: number, radius: number) => number[]

/** 三維空間雜湊網格 */
class SpatialHashGrid3D {
  cellSize: number
  buckets: Map<string, number[]> = new Map()

  constructor(cellSize: number) {
    this.cellSize = Math.max(1, Math.floor(cellSize))
  }

  private key(v: Vector3): string {
    const gx = Math.floor(v.x / this.cellSize)
    const gy = Math.floor(v.y / this.cellSize)
    const gz = Math.floor(v.z / this.cellSize)
    return `${gx},${gy},${gz}`
  }

  rebuild(boids: Boid[]) {
    this.buckets.clear()
    boids.forEach((b, idx) => {
      const k = this.key(b.position)
      if (!this.buckets.has(k))
        this.buckets.set(k, [])
      this.buckets.get(k)!.push(idx)
    })
  }

  query(center: Vector3, radius: number): number[] {
    const r = Math.max(radius, 0)
    const minGX = Math.floor((center.x - r) / this.cellSize)
    const maxGX = Math.floor((center.x + r) / this.cellSize)
    const minGY = Math.floor((center.y - r) / this.cellSize)
    const maxGY = Math.floor((center.y + r) / this.cellSize)
    const minGZ = Math.floor((center.z - r) / this.cellSize)
    const maxGZ = Math.floor((center.z + r) / this.cellSize)

    const out: number[] = []
    for (let gx = minGX; gx <= maxGX; gx++) {
      for (let gy = minGY; gy <= maxGY; gy++) {
        for (let gz = minGZ; gz <= maxGZ; gz++) {
          const k = `${gx},${gy},${gz}`
          const bucket = this.buckets.get(k)
          if (bucket)
            out.push(...bucket)
        }
      }
    }
    return out
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
    this.neighborProvider = (boids, i, radius) => {
      const out: number[] = []

      const boid = boids[i]
      if (!boid)
        return out

      const candidates = this.grid!.query(boid.position, radius)
      const r2 = radius * radius
      const pi = boid?.position
      for (const j of candidates) {
        if (j === i)
          continue
        if (!pi || !boids[j])
          continue

        if (Vector3.DistanceSquared(pi, boids[j].position) <= r2)
          out.push(j)
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
      const velocity = fromSphericalCoords(speed, theta, phi)
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

    for (let i = 0; i < this.boidList.length; i++) {
      const boid = this.boidList[i]
      const maxR = Math.max(this.radii.separation, this.radii.alignment, this.radii.cohesion)
      const neighbors = this.neighborProvider(this.boidList, i, maxR)

      const sep = this.separation(i, neighbors)
      const ali = this.alignment(i, neighbors)
      const coh = this.cohesion(i, neighbors)
      const tgt = this.seekTo(i, this.target)

      const steer = sep.scale(this.weights.separation)
        .add(ali.scale(this.weights.alignment))
        .add(coh.scale(this.weights.cohesion))
        .add(tgt.scale(this.weights.target))

      boid?.applyForce(steer)
    }

    for (const b of this.boidList) b.update(dt)
  }

  /** 追向 target */
  private seekTo(i: number, target?: Vector3): Vector3 {
    const boid = this.boidList[i]
    if (!boid || !target)
      return Vector3.Zero()

    // 殼模式：改追殼上的「插槽點」
    if (this.targetShell) {
      const aim = this.shellAimPoint(i, target)
      const desired = setLength(aim.subtract(boid.position), boid.maxSpeed)
      let steer = desired.subtract(boid.velocity)
      steer = limitLength(steer, boid.maxForce)
      return steer
    }

    // 直接追向 target
    const desired = setLength(target.subtract(boid.position), boid.maxSpeed)
    let steer = desired.subtract(boid.velocity)
    steer = limitLength(steer, boid.maxForce)
    return steer
  }

  /** 分離：遠離過近的鄰居 */
  private separation(i: number, neighborIdx: number[]): Vector3 {
    const boid = this.boidList[i]
    if (!boid) {
      return Vector3.Zero()
    }

    let sum = Vector3.Zero()
    let count = 0

    for (const j of neighborIdx) {
      const other = this.boidList[j]
      if (!other)
        continue

      const d = Vector3.Distance(boid.position, other.position)
      if (d > 0 && d < this.radii.separation) {
        // 距離越近權重越大（1/d）
        const diff = boid.position.subtract(other.position).scale(1 / d)
        sum = sum.add(diff)
        count++
      }
    }

    if (count > 0) {
      sum = sum.scale(1 / count)
      const desired = setLength(sum, boid.maxSpeed)
      let steer = desired.subtract(boid.velocity)
      steer = limitLength(steer, boid.maxForce)
      return steer
    }
    return Vector3.Zero()
  }

  /** 對齊：匹配鄰居平均速度方向 */
  private alignment(i: number, neighborIdx: number[]): Vector3 {
    const boid = this.boidList[i]
    if (!boid) {
      return Vector3.Zero()
    }

    let avgVel = Vector3.Zero()
    let count = 0

    for (const j of neighborIdx) {
      const other = this.boidList[j]
      if (!other)
        continue

      const d = Vector3.Distance(boid.position, other.position)
      if (d < this.radii.alignment) {
        avgVel = avgVel.add(other.velocity)
        count++
      }
    }

    if (count > 0) {
      avgVel = avgVel.scale(1 / count)
      const desired = setLength(avgVel, boid.maxSpeed)
      let steer = desired.subtract(boid.velocity)
      steer = limitLength(steer, boid.maxForce)
      return steer
    }
    return Vector3.Zero()
  }

  /** 凝聚：朝向鄰居的質心 */
  private cohesion(i: number, neighborIdx: number[]): Vector3 {
    const boid = this.boidList[i]
    if (!boid) {
      return Vector3.Zero()
    }

    let center = Vector3.Zero()
    let count = 0

    for (const j of neighborIdx) {
      const other = this.boidList[j]
      if (!other)
        continue

      const d = Vector3.Distance(boid.position, other.position)
      if (d < this.radii.cohesion) {
        center = center.add(other.position)
        count++
      }
    }

    if (count > 0) {
      center = center.scale(1 / count) // 質心
      const desired = setLength(center.subtract(boid.position), boid.maxSpeed)
      let steer = desired.subtract(boid.velocity)
      steer = limitLength(steer, boid.maxForce)
      return steer
    }
    return Vector3.Zero()
  }

  /** 在球面上近似均勻分配方向（Fibonacci sphere），並可隨時間繞行 */
  private shellDirection(i: number): Vector3 {
    const n = Math.max(1, this.boidList.length)
    const k = i + 0.5
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
    return normalizeSafe(fromSphericalCoords(1, theta, phi))
  }

  /** 穩定可重現的偽亂數，避免每幀亂跳 */
  private random(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }

  /** 取得第 i 隻 boid 的殼目標點 */
  private shellAimPoint(i: number, target: Vector3) {
    const dir = this.shellDirection(i)
    const baseRadius = this.targetShell!.radius
    const band = this.targetShell!.band
    // 在半徑上加一點個體差，避免全部站在同一圈
    const radius = baseRadius + band * (this.random(i * 97 + 13) - 0.5)
    return target.add(dir.scale(radius))
  }
}
