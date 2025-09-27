import { Axis, Quaternion, Vector3 } from '@babylonjs/core'
import { clamp01, epsilon, fromSphericalCoords, limitLength } from './utils'

/** 避免跨 ±π 的角度跳動（連續化） */
function unwrap(now: number, prev: number) {
  const TWO_PI = Math.PI * 2
  let a = now
  const d = a - prev
  if (d >= Math.PI)
    a -= TWO_PI
  else if (d <= -Math.PI)
    a += TWO_PI
  return a
}

export interface BoidOptions {
  position?: Vector3;
  velocity?: Vector3;
  maxSpeed?: number;
  maxForce?: number;
  /** 角度平滑係數（每幀 α；0~1，越大跟越緊，越小越穩） */
  angSmooth?: number;
  /** 每秒最大轉向角速度（rad/s），防止瞬間翻轉；預設 180°/s */
  maxTurnRate?: number;
}

export class Boid {
  position: Vector3
  velocity: Vector3
  acceleration: Vector3
  maxSpeed: number
  maxForce: number

  /** 方向（只作為讀值；真實姿態以四元數為準） */
  yaw: number
  pitch: number

  /** 平滑後的朝向單位向量（以 +X 為機首） */
  private heading: Vector3
  /** 四元數姿態（請把 mesh.rotationQuaternion 指向這個） */
  rotationQuaternion: Quaternion

  angSmooth: number
  maxTurnRate: number

  constructor(options: BoidOptions = {}) {
    const {
      position = Vector3.Zero(),
      velocity = fromSphericalCoords(1, Math.random() * Math.PI, Math.random() * Math.PI * 2),
      maxSpeed = 150,
      maxForce = 10,
      angSmooth = 1,
      maxTurnRate = Math.PI, // 180°/s
    } = options

    this.position = position.clone()
    this.velocity = velocity.clone()
    this.acceleration = Vector3.Zero()
    this.maxSpeed = maxSpeed
    this.maxForce = maxForce

    this.angSmooth = clamp01(angSmooth)
    this.maxTurnRate = maxTurnRate

    // 初始 heading
    const dir = this.velocity.lengthSquared() > epsilon
      ? this.velocity.clone().normalize()
      : new Vector3(1, 0, 0)
    this.heading = dir

    const up = Axis.Y
    this.rotationQuaternion = Quaternion.FromLookDirectionLH(dir, up)

    // 從四元數反解 yaw、pitch
    const { y, x } = this.rotationQuaternion.toEulerAngles()
    this.yaw = y
    this.pitch = x
  }

  applyForce(force: Vector3) {
    this.acceleration = this.acceleration.add(force)
  }

  update(dt = 1) {
    this.velocity = this.velocity.add(this.acceleration.scale(dt))
    this.velocity = limitLength(this.velocity, this.maxSpeed)
    this.position = this.position.add(this.velocity.scale(dt))
    this.updateOrientation(dt)
    this.acceleration = Vector3.Zero()
  }

  /** 基於四元數轉換方向 */
  private updateOrientation(dt: number) {
    const { velocity } = this
    const vLen2 = velocity.lengthSquared()
    if (vLen2 <= epsilon)
      return

    // 以 60fps 換算 dt，以免不同裝置動畫速度不同
    const frames = Math.max(dt * 60, 0)
    const a = 1 - (1 - this.angSmooth) ** frames

    // 平滑轉向
    const velocityDirection = velocity.scale(1 / Math.sqrt(vLen2))
    this.heading = this.heading.scale(1 - a).add(velocityDirection.scale(a)).normalize()

    // 根據 heading 產生目標四元數（避免 up 奇異：heading 太靠近 up 時改用 Z 當 up）
    const worldUp = Axis.Y
    const upDot = Math.abs(Vector3.Dot(this.heading, worldUp))
    const safeUp = (upDot > 0.98) ? Axis.Z : worldUp
    const targetQuaternion = Quaternion.FromLookDirectionLH(this.heading, safeUp)

    // 角速度上限（rad/s）：計算指向目標向量的夾角，限制單步旋轉量
    const dot = Math.min(1, Math.max(-1, Quaternion.Dot(this.rotationQuaternion, targetQuaternion)))
    const ang = 2 * Math.acos(Math.abs(dot)) // [0, π]
    const maxStep = Math.max(0, this.maxTurnRate * dt)
    const turnRate = (ang > epsilon) ? maxStep / ang : 1

    // 將平滑係數 a 與角速率限制合併，取較保守者
    const turn = Math.min(a, turnRate)

    this.rotationQuaternion = Quaternion.Slerp(this.rotationQuaternion, targetQuaternion, turn)

    // 從四元數反解 yaw、pitch
    const { x: pitchRaw, y: yawRaw } = this.rotationQuaternion.toEulerAngles()

    /** 不知道為甚麼 yaw 會差 90 度，手動追加 */
    this.yaw = unwrap(yawRaw, this.yaw) + Math.PI / 2
    this.pitch = unwrap(pitchRaw, this.pitch)
  }
}
