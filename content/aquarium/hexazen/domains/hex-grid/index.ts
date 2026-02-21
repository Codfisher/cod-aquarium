import { Vector3 } from '@babylonjs/core'

export class Hex {
  public q: number
  public r: number
  public s: number

  key() {
    return `${this.q},${this.r},${this.s}`
  }

  constructor(q: number, r: number, s: number) {
    // 用 epsilon 容忍浮點誤差
    const sum = q + r + s
    if (Math.abs(sum) > 1e-6) {
      throw new Error('Hex invariant violated: q + r + s must be 0')
    }
    this.q = q
    this.r = r
    this.s = s
  }

  static fromAxial(q: number, r: number): Hex {
    return new Hex(q, r, -q - r)
  }

  add(b: Hex): Hex {
    return new Hex(this.q + b.q, this.r + b.r, this.s + b.s)
  }

  subtract(b: Hex): Hex {
    return new Hex(this.q - b.q, this.r - b.r, this.s - b.s)
  }

  scale(k: number): Hex {
    return new Hex(this.q * k, this.r * k, this.s * k)
  }

  rotateLeft(): Hex {
    return new Hex(-this.s, -this.q, -this.r)
  }

  rotateRight(): Hex {
    return new Hex(-this.r, -this.s, -this.q)
  }

  // 六方向（cube）
  static readonly directions: ReadonlyArray<Hex> = Object.freeze([
    new Hex(1, 0, -1),
    new Hex(1, -1, 0),
    new Hex(0, -1, 1),
    new Hex(-1, 0, 1),
    new Hex(-1, 1, 0),
    new Hex(0, 1, -1),
  ])

  static direction(direction: number): Hex {
    const index = ((direction % 6) + 6) % 6
    const result = Hex.directions[index]
    if (!result)
      throw new Error(`Invalid direction index: ${direction}`)
    return result
  }

  /** 取得共用**邊（edge）**的鄰居，距離恰好為 1。
   *
   * 六角格每個格子有 6 條邊，因此有 6 個 edge 鄰居。
   *
   * @param direction 0 ~ 5，順時針方向索引
   */
  neighbor(direction: number): Hex {
    return this.add(Hex.direction(direction))
  }

  static readonly diagonals: ReadonlyArray<Hex> = Object.freeze([
    new Hex(2, -1, -1),
    new Hex(1, -2, 1),
    new Hex(-1, -1, 2),
    new Hex(-2, 1, 1),
    new Hex(-1, 2, -1),
    new Hex(1, 1, -2),
  ])

  /** 取得共用**頂點（vertex）**的斜向鄰居，距離為 2（中間跳過一格）。
   *
   * 與 {@link neighbor} 的差別：`neighbor` 是共用邊的緊鄰格（距離 1），
   * `diagonalNeighbor` 是僅共用角的斜向格（距離 2），彼此之間沒有共用邊。
   *
   * @param direction 0 ~ 5，順時針方向索引
   */
  diagonalNeighbor(direction: number): Hex {
    const index = ((direction % 6) + 6) % 6
    const result = Hex.diagonals[index]
    if (!result)
      throw new Error(`Invalid diagonal direction index: ${direction}`)
    return this.add(result)
  }

  /** 原點到此格子的直線距離 */
  len(): number {
    return (Math.abs(this.q) + Math.abs(this.r) + Math.abs(this.s)) / 2
  }

  distance(b: Hex): number {
    return this.subtract(b).len()
  }

  /** 將浮點 Hex 四捨五入到最近的整數 Hex。
   *
   * 由於浮點誤差，`worldToHexFractional` 可能回傳非整數座標，
   * 此方法將其 round 到最近的整數 Hex，並確保 `q + r + s === 0` 恆等式成立。
   */
  round(): Hex {
    let qi = Math.round(this.q)
    let ri = Math.round(this.r)
    let si = Math.round(this.s)

    const qDiff = Math.abs(qi - this.q)
    const rDiff = Math.abs(ri - this.r)
    const sDiff = Math.abs(si - this.s)

    if (qDiff > rDiff && qDiff > sDiff) {
      qi = -ri - si
    }
    else if (rDiff > sDiff) {
      ri = -qi - si
    }
    else {
      si = -qi - ri
    }
    return new Hex(qi, ri, si)
  }

  /** 在兩點之間做線性插值（linear interpolation）。
   *
   * @param b 目標 Hex
   * @param t 插值比例（0 ~ 1）
   */
  lerp(b: Hex, t: number): Hex {
    return new Hex(
      this.q * (1 - t) + b.q * t,
      this.r * (1 - t) + b.r * t,
      this.s * (1 - t) + b.s * t,
    )
  }

  /** 取得從此 Hex 到目標 Hex 的整數 Hex 序列（包含起點與終點）。
   *
   * 使用 Bresenham 演算法的變體，確保在離散的六角格上畫出平滑的直線。
   *
   * @param b 目標 Hex
   */
  lineDraw(b: Hex): Hex[] {
    const N = this.distance(b)
    // nudge 避免剛好落在邊界造成 round 跳格
    const aNudge = new Hex(this.q + 1e-6, this.r + 1e-6, this.s - 2e-6)
    const bNudge = new Hex(b.q + 1e-6, b.r + 1e-6, b.s - 2e-6)

    const results: Hex[] = []
    const step = 1 / Math.max(N, 1)

    for (let i = 0; i <= N; i++) {
      results.push(aNudge.lerp(bNudge, step * i).round())
    }
    return results
  }
}

export class Orientation {
  constructor(
    public f0: number,
    public f1: number,
    public f2: number,
    public f3: number,
    public b0: number,
    public b1: number,
    public b2: number,
    public b3: number,
    public startAngle: number,
  ) { }
}

export class HexLayout {
  constructor(
    public orientation: Orientation,
    public size: number,
    public origin: Vector3 = Vector3.Zero(),
  ) { }

  /** pointy: 上下頂點朝上 */
  static readonly pointy = new Orientation(
    Math.sqrt(3),
    Math.sqrt(3) / 2,
    0,
    3 / 2,
    Math.sqrt(3) / 3,
    -1 / 3,
    0,
    2 / 3,
    0.5,
  )

  static readonly flat = new Orientation(
    3 / 2,
    0,
    Math.sqrt(3) / 2,
    Math.sqrt(3),
    2 / 3,
    0,
    -1 / 3,
    Math.sqrt(3) / 3,
    0.0,
  )

  /**
   * Hex -> 世界座標（X,Z）
   * @param hex Hex 座標
   * @param yOverride 把 tile 抬高一點避免 z-fighting
   */
  hexToWorld(hex: Hex, yOverride?: number): Vector3 {
    const M = this.orientation
    const x = (M.f0 * hex.q + M.f1 * hex.r) * this.size + this.origin.x
    const z = (M.f2 * hex.q + M.f3 * hex.r) * this.size + this.origin.z
    const y = (yOverride ?? this.origin.y)
    return new Vector3(x, y, z)
  }

  /** 世界座標 -> 浮點 Hex（未 round） */
  worldToHexFractional(world: Vector3): Hex {
    const M = this.orientation
    const px = (world.x - this.origin.x) / this.size
    const py = (world.z - this.origin.z) / this.size
    const q = M.b0 * px + M.b1 * py
    const r = M.b2 * px + M.b3 * py
    return new Hex(q, r, -q - r)
  }

  /** 世界座標 -> 最近格 Hex（已 round） */
  worldToHexRounded(world: Vector3): Hex {
    return this.worldToHexFractional(world).round()
  }

  /** 算六角形某個角落的 offset（世界座標 XZ 平面） */
  hexCornerOffset(corner: number): Vector3 {
    const angle = 2 * Math.PI * (this.orientation.startAngle - corner) / 6
    const ox = this.size * Math.cos(angle)
    const oz = this.size * Math.sin(angle)
    return new Vector3(ox, 0, oz)
  }

  /** 取得六角形六個角落點（世界座標） */
  polygonCornersWorld(hex: Hex, yOverride?: number): Vector3[] {
    const center = this.hexToWorld(hex, yOverride)
    const corners: Vector3[] = []
    for (let i = 0; i < 6; i++) {
      corners.push(center.add(this.hexCornerOffset(i)))
    }
    return corners
  }
}
