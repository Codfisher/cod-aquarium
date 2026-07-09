import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { clamp01, epsilon, fromSphericalCoords, limitLengthInPlace } from './utils'

export interface BoidOptions {
  position?: Vector3;
  velocity?: Vector3;
  maxSpeed?: number;
  maxForce?: number;
  /** 角度平滑係數（每幀 α；0~1，越大跟越緊，越小越穩） */
  angSmooth?: number;
}

export class Boid {
  position: Vector3
  velocity: Vector3
  acceleration: Vector3
  maxSpeed: number
  maxForce: number

  /** 平滑後的朝向單位向量（以 +X 為機首）。
   *
   * 渲染直接使用此向量建立姿態基底；
   * 不提供 yaw/pitch——尤拉角在垂直方向有萬向鎖，垂直游動時會病態亂擺
   */
  readonly heading: Vector3

  angSmooth: number

  constructor(options: BoidOptions = {}) {
    const {
      position = Vector3.Zero(),
      velocity = fromSphericalCoords(1, Math.random() * Math.PI, Math.random() * Math.PI * 2),
      maxSpeed = 150,
      maxForce = 10,
      angSmooth = 1,
    } = options

    this.position = position.clone()
    this.velocity = velocity.clone()
    this.acceleration = Vector3.Zero()
    this.maxSpeed = maxSpeed
    this.maxForce = maxForce

    this.angSmooth = clamp01(angSmooth)

    // 初始 heading
    const dir = this.velocity.lengthSquared() > epsilon
      ? this.velocity.clone().normalize()
      : new Vector3(1, 0, 0)
    this.heading = dir
  }

  applyForce(force: Vector3) {
    this.acceleration.addInPlace(force)
  }

  update(dt = 1) {
    this.acceleration.scaleAndAddToRef(dt, this.velocity)
    limitLengthInPlace(this.velocity, this.maxSpeed)
    this.velocity.scaleAndAddToRef(dt, this.position)
    this.updateHeading(dt)
    this.acceleration.setAll(0)
  }

  /** 朝向平滑追隨速度方向 */
  private updateHeading(dt: number) {
    const { velocity } = this
    const vLen2 = velocity.lengthSquared()
    if (vLen2 <= epsilon)
      return

    // 以 60fps 換算 dt，以免不同裝置動畫速度不同
    const frames = Math.max(dt * 60, 0)
    const a = 1 - (1 - this.angSmooth) ** frames

    this.heading.scaleInPlace(1 - a)
    velocity.scaleAndAddToRef(a / Math.sqrt(vLen2), this.heading)
    this.heading.normalize()
  }
}
