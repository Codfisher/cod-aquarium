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
  /** 每隻 boid 考量的鄰居數量上限。
   *
   * 少量鄰居即可產生自然的群體行為，
   * 封頂可避免魚群聚集成團時鄰居數量暴增，讓計算量維持線性
   */
  maxNeighborCount?: number;
  /** Shell 模式，用於模擬魚環繞特定目標成球的樣子
   *
   * 無則維持原本單點 target 的行為
   */
  targetShell?: TargetShellOptions;
}

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

  /** 查詢範圍內的候選 boid，結果寫入 result，重複利用同一個陣列。
   *
   * limit 用來在魚群擠成一團（大量 boid 落在同幾格）時封頂查詢成本，
   * 避免每隻魚都撈出整團候選，讓計算量退化回 O(n²)
   */
  queryToRef(
    center: Vector3,
    radius: number,
    result: number[],
    limit = Number.POSITIVE_INFINITY,
  ): number[] {
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

            if (result.length >= limit)
              return result
          }
        }
      }
    }
    return result
  }
}

/** 殼半徑的數量縮放：魚少時縮小殼，避免少數魚繞著過大的空殼。
 *
 * 殼上可站的位置與表面積（半徑平方）成正比，
 * 因此縮放取數量比例的平方根，並設下限避免縮成一個點
 */
export function computeShellCountScale(boidCount: number) {
  const referenceCount = 300
  const scale = Math.sqrt(boidCount / referenceCount)
  // 下限不宜太小：殼太小時整團縮成一坨，繞圓感會消失
  return Math.min(1, Math.max(0.45, scale))
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
const defaultMaxNeighborCount = 12

export class Flock {
  boidList: Boid[] = []
  weights: Required<BehaviorWeights>
  radii: Required<BehaviorRadii>
  maxNeighborCount: number

  private grid?: SpatialHashGrid3D

  /** 殼旋轉的累積角度。
   * 逐幀積分而非「時間 × 角速度」，角速度隨魚數變動時相位才不會跳
   */
  private swirlAngle = 0
  private target?: Vector3
  targetShell?: Required<TargetShellOptions>

  /** 暫存物件，避免 step 高頻迴圈中重複配置 */
  private readonly steerScratch = new Vector3()
  private readonly behaviorScratch = new Vector3()
  private readonly vectorScratch = new Vector3()
  private readonly aimScratch = new Vector3()
  private readonly separationScratch = new Vector3()
  private readonly alignmentScratch = new Vector3()
  private readonly cohesionScratch = new Vector3()
  private readonly neighborScratch: number[] = []
  private readonly neighborDistanceSquaredScratch: number[] = []
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
    this.maxNeighborCount = options.maxNeighborCount ?? defaultMaxNeighborCount

    if (options.targetShell) {
      this.targetShell = {
        radius: options.targetShell.radius,
        band: options.targetShell.band ?? 0,
        swirlSpeed: options.targetShell.swirlSpeed ?? 0,
      }
    }

    /** cell 尺寸對齊最大查詢半徑：查詢範圍固定只跨 3×3×3 格，
     * 比對齊平均半徑（需跨 4×4×4 格以上）少近六成的格子查找
     */
    const maxRadius = Math.max(this.radii.separation, this.radii.alignment, this.radii.cohesion)
    const cellSize = options.cellSize ?? Math.max(4, Math.ceil(maxRadius))
    this.grid = new SpatialHashGrid3D(cellSize)
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
    // 殼縮小（魚少）時角速度等比放大，維持切線速度、保留繞圓感
    const shellSwirlSpeed = (this.targetShell?.swirlSpeed ?? 0)
      / computeShellCountScale(this.boidList.length)
    this.swirlAngle = (this.swirlAngle + shellSwirlSpeed * dt) % (2 * Math.PI)

    if (this.grid)
      this.grid.rebuild(this.boidList)

    const maxRadius = Math.max(this.radii.separation, this.radii.alignment, this.radii.cohesion)
    const separationRadiusSquared = this.radii.separation * this.radii.separation
    const alignmentRadiusSquared = this.radii.alignment * this.radii.alignment
    const cohesionRadiusSquared = this.radii.cohesion * this.radii.cohesion

    const steer = this.steerScratch
    const difference = this.vectorScratch
    const separationSum = this.separationScratch
    const alignmentSum = this.alignmentScratch
    const cohesionSum = this.cohesionScratch

    for (let i = 0; i < this.boidList.length; i++) {
      const boid = this.boidList[i]
      if (!boid)
        continue

      this.collectNeighbors(i, maxRadius)
      const neighborIndexList = this.neighborScratch
      const neighborDistanceSquaredList = this.neighborDistanceSquaredScratch

      /** 三個行為共用同一批鄰居與距離，單次掃描一起累加，
       * 距離只算一次，且只有 separation 需要開根號
       */
      separationSum.setAll(0)
      alignmentSum.setAll(0)
      cohesionSum.setAll(0)
      let separationCount = 0
      let alignmentCount = 0
      let cohesionCount = 0

      for (let n = 0; n < neighborIndexList.length; n++) {
        const other = this.boidList[neighborIndexList[n]!]
        if (!other)
          continue

        const distanceSquared = neighborDistanceSquaredList[n]!

        // 分離：遠離過近的鄰居
        if (distanceSquared > 0 && distanceSquared < separationRadiusSquared) {
          boid.position.subtractToRef(other.position, difference)
          difference.scaleInPlace(1 / Math.sqrt(distanceSquared))
          separationSum.addInPlace(difference)
          separationCount++
        }
        // 對齊：匹配鄰居平均速度方向
        if (distanceSquared < alignmentRadiusSquared) {
          alignmentSum.addInPlace(other.velocity)
          alignmentCount++
        }
        // 凝聚：朝向鄰居的質心
        if (distanceSquared < cohesionRadiusSquared) {
          cohesionSum.addInPlace(other.position)
          cohesionCount++
        }
      }

      steer.setAll(0)

      if (separationCount > 0) {
        separationSum.scaleInPlace(1 / separationCount)
        this.finalizeSteerInPlace(separationSum, boid)
        separationSum.scaleAndAddToRef(this.weights.separation, steer)
      }

      if (alignmentCount > 0) {
        alignmentSum.scaleInPlace(1 / alignmentCount)
        this.finalizeSteerInPlace(alignmentSum, boid)
        alignmentSum.scaleAndAddToRef(this.weights.alignment, steer)
      }

      if (cohesionCount > 0) {
        cohesionSum.scaleInPlace(1 / cohesionCount) // 質心
        cohesionSum.subtractInPlace(boid.position)
        this.finalizeSteerInPlace(cohesionSum, boid)
        cohesionSum.scaleAndAddToRef(this.weights.cohesion, steer)
      }

      this.seekToRef(i, this.target, this.behaviorScratch)
      this.behaviorScratch.scaleAndAddToRef(this.weights.target, steer)

      boid.applyForce(steer)
    }

    for (const boid of this.boidList) boid.update(dt)
  }

  /** 收集第 index 隻 boid 的鄰居與其平方距離，
   * 結果寫入 neighborScratch 與 neighborDistanceSquaredScratch，
   * 數量以 maxNeighborCount 封頂
   */
  private collectNeighbors(index: number, radius: number) {
    const neighborIndexList = this.neighborScratch
    const neighborDistanceSquaredList = this.neighborDistanceSquaredScratch
    neighborIndexList.length = 0
    neighborDistanceSquaredList.length = 0

    const boid = this.boidList[index]
    if (!boid)
      return

    /** 候選上限預留 4 倍空間，容納自身與距離檢查刷掉的格內候選 */
    const candidateLimit = this.maxNeighborCount * 4
    const candidateList = this.grid!.queryToRef(
      boid.position,
      radius,
      this.candidateScratch,
      candidateLimit,
    )
    const radiusSquared = radius * radius

    for (const candidateIndex of candidateList) {
      if (candidateIndex === index)
        continue

      const other = this.boidList[candidateIndex]
      if (!other)
        continue

      const distanceSquared = Vector3.DistanceSquared(boid.position, other.position)
      if (distanceSquared > radiusSquared)
        continue

      neighborIndexList.push(candidateIndex)
      neighborDistanceSquaredList.push(distanceSquared)

      if (neighborIndexList.length >= this.maxNeighborCount)
        break
    }
  }

  /** 將 desired 向量就地轉為受限的轉向力：
   * 設為 maxSpeed 長度 → 減去目前速度 → 以 maxForce 封頂
   */
  private finalizeSteerInPlace(desired: Vector3, boid: Boid) {
    setLengthInPlace(desired, boid.maxSpeed)
    desired.subtractInPlace(boid.velocity)
    limitLengthInPlace(desired, boid.maxForce)
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

    this.finalizeSteerInPlace(out, boid)
  }

  /** 在球面上近似均勻分配方向（Fibonacci sphere），並可隨時間繞行，結果寫入 out */
  private shellDirectionToRef(index: number, out: Vector3) {
    const n = Math.max(1, this.boidList.length)
    const k = index + 0.5
    /** 黃金角 */
    const golden = Math.PI * (3 - Math.sqrt(5))
    /** 極角，去除球頂部與底部，以免 boid 看起來很像迷路。
     * 用 acos(2u - 1) 讓索引小的排在殼頂部（畫面 y 軸負向），
     * 金色領頭魚（索引 0）因此固定在魚群頂端
     */
    const theta = pipe(
      0.05,
      (cap) => cap + (1 - 2 * cap) * (k / n),
      (u) => Math.acos(2 * u - 1),
    )
    const phiBase = k * golden
    const phi = (phiBase + this.swirlAngle) % (2 * Math.PI)

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

    const shellScale = computeShellCountScale(this.boidList.length)
    const baseRadius = this.targetShell!.radius
    const band = this.targetShell!.band
    // 在半徑上加一點個體差，避免全部站在同一圈
    const radius = (baseRadius + band * (this.random(index * 97 + 13) - 0.5)) * shellScale
    out.scaleInPlace(radius)
    out.addInPlace(target)
  }
}
