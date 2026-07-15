/** 鱈魚彈跳翻滑移動控制器。
 *
 * 純數學邏輯、不依賴 Babylon，方便單元測試。
 * 座標系為水平面 (x, z)，y 為離地高度；
 * heading 依 Babylon +z 朝前慣例定義為 atan2(directionX, directionZ)。
 */

export interface PlanePoint {
  x: number;
  z: number;
}

/** 每幀更新後的姿態，由場景端套用到 3D 節點 */
export interface FlopPose {
  x: number;
  /** 離地高度（未含沙地起伏） */
  y: number;
  z: number;
  /** 朝向（繞世界 y 軸，rad） */
  heading: number;
  /** 繞身體長軸的翻滾增量（rad），跳躍時左右交替擺動 */
  roll: number;
  /** 擠壓伸展比例：騰空 >1、落地緩衝 <1 */
  squash: number;
  isMoving: boolean;
  /** 這幀是否剛落地，供落地演出（沙塵、音效）使用 */
  hasLanded: boolean;
}

export interface FlopControllerOptions {
  /** 每跳水平距離 */
  hopDistance: number;
  /** 每跳最高離地高度 */
  hopHeight: number;
  /** 單跳耗時（秒） */
  hopDuration: number;
  /** 落地到下一跳的停頓（秒） */
  restDuration: number;
  /** 每跳最大轉向角（rad） */
  maxTurnPerHop: number;
  /** 與目標距離小於此值視為抵達 */
  arriveEpsilon: number;
  /** 跳躍中翻滾擺動幅度（rad） */
  rollAmplitude: number;
  /** 落地擠壓量（0.16 代表壓到 0.84 倍） */
  squashAmount: number;
  /** 騰空伸展量 */
  stretchAmount: number;
  /** 滑行模式速度（單位/秒），供 prefers-reduced-motion 使用 */
  slideSpeed: number;
  /** 滑行模式轉向速度（rad/秒） */
  slideTurnSpeed: number;
}

const defaultOptions: FlopControllerOptions = {
  hopDistance: 0.9,
  hopHeight: 0.5,
  hopDuration: 0.34,
  restDuration: 0.16,
  maxTurnPerHop: Math.PI / 2,
  arriveEpsilon: 0.12,
  rollAmplitude: 0.55,
  squashAmount: 0.16,
  stretchAmount: 0.14,
  slideSpeed: 2.4,
  slideTurnSpeed: 4,
}

type FlopPhase = 'idle' | 'hopping' | 'resting'

/** 將角度正規化至 (-π, π] */
function normalizeAngle(angle: number): number {
  let value = angle % (Math.PI * 2)
  if (value <= -Math.PI) {
    value += Math.PI * 2
  }
  else if (value > Math.PI) {
    value -= Math.PI * 2
  }
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export class FlopController {
  private options: FlopControllerOptions

  private positionX = 0
  private positionZ = 0
  private heading = 0

  private phase: FlopPhase = 'idle'
  private phaseElapsed = 0

  private targetPoint: PlanePoint | undefined

  private hopStart: PlanePoint = { x: 0, z: 0 }
  private hopEnd: PlanePoint = { x: 0, z: 0 }
  /** 短跳時等比例降低跳高 */
  private hopHeightScale = 1
  /** 翻滾方向逐跳交替 */
  private hopRollSign = 1
  /** 起跳當下的朝向，跳躍過程由此插值到目標朝向，避免瞬間轉向 */
  private hopStartHeading = 0
  /** 本次跳躍的總轉角（rad），已受 maxTurnPerHop 限制 */
  private hopTurn = 0

  private isSlideMode = false

  constructor(options?: Partial<FlopControllerOptions>) {
    this.options = { ...defaultOptions, ...options }
  }

  get isMoving(): boolean {
    return this.phase !== 'idle' || this.targetPoint !== undefined
  }

  /** 直接放置到指定位置（初始化用），會清除目標 */
  teleport(point: PlanePoint, heading?: number) {
    this.positionX = point.x
    this.positionZ = point.z
    if (heading !== undefined) {
      this.heading = heading
    }
    this.targetPoint = undefined
    this.phase = 'idle'
    this.phaseElapsed = 0
  }

  /** 設定移動目標；移動中呼叫會在下一跳改道 */
  setTarget(point: PlanePoint) {
    const distance = Math.hypot(point.x - this.positionX, point.z - this.positionZ)
    if (this.phase === 'idle' && distance <= this.options.arriveEpsilon) {
      return
    }
    this.targetPoint = { x: point.x, z: point.z }
  }

  /** 切換滑行模式（prefers-reduced-motion）。跳躍中切換會先落地 */
  setSlideMode(value: boolean) {
    if (this.isSlideMode === value) {
      return
    }
    if (value && this.phase === 'hopping') {
      this.positionX = this.hopEnd.x
      this.positionZ = this.hopEnd.z
    }
    this.isSlideMode = value
    this.phase = 'idle'
    this.phaseElapsed = 0
  }

  update(deltaSeconds: number): FlopPose {
    if (this.isSlideMode) {
      return this.updateSlide(deltaSeconds)
    }
    return this.updateFlop(deltaSeconds)
  }

  getPose(): FlopPose {
    return this.composePose(false)
  }

  private updateFlop(deltaSeconds: number): FlopPose {
    let remaining = deltaSeconds
    let hasLanded = false

    // 以 while 逐段消化時間，避免大 delta 跨越多個階段時姿態出錯
    let guard = 0
    while (remaining > 0 && guard < 100) {
      guard += 1

      if (this.phase === 'idle') {
        if (!this.tryStartHop()) {
          break
        }
        continue
      }

      if (this.phase === 'hopping') {
        const timeLeft = this.options.hopDuration - this.phaseElapsed
        if (remaining < timeLeft) {
          this.phaseElapsed += remaining
          remaining = 0
          break
        }

        remaining -= timeLeft
        this.landHop()
        hasLanded = true
        continue
      }

      // resting
      const restLeft = this.options.restDuration - this.phaseElapsed
      if (remaining < restLeft) {
        this.phaseElapsed += remaining
        remaining = 0
        break
      }
      remaining -= restLeft
      this.phase = 'idle'
      this.phaseElapsed = 0
    }

    return this.composePose(hasLanded)
  }

  /** 有目標時起跳；無目標回傳 false */
  private tryStartHop(): boolean {
    const target = this.targetPoint
    if (!target) {
      return false
    }

    const deltaX = target.x - this.positionX
    const deltaZ = target.z - this.positionZ
    const distanceToTarget = Math.hypot(deltaX, deltaZ)

    if (distanceToTarget <= this.options.arriveEpsilon) {
      this.targetPoint = undefined
      return false
    }

    // 逐跳轉向：每跳最多轉 maxTurnPerHop，轉不完下一跳繼續。
    // 記下起跳朝向與轉角，跳躍過程中插值，落地時才轉到位
    const desiredHeading = Math.atan2(deltaX, deltaZ)
    const headingDifference = normalizeAngle(desiredHeading - this.heading)
    const turn = clamp(
      headingDifference,
      -this.options.maxTurnPerHop,
      this.options.maxTurnPerHop,
    )
    this.hopStartHeading = this.heading
    this.hopTurn = turn
    this.heading = normalizeAngle(this.heading + turn)

    // 落點朝轉向後的方向；跳躍中身體朝向會平滑轉到這個方向
    const hopLength = Math.min(this.options.hopDistance, distanceToTarget)
    this.hopStart = { x: this.positionX, z: this.positionZ }
    this.hopEnd = {
      x: this.positionX + Math.sin(this.heading) * hopLength,
      z: this.positionZ + Math.cos(this.heading) * hopLength,
    }
    this.hopHeightScale = clamp(hopLength / this.options.hopDistance, 0.35, 1)
    this.phase = 'hopping'
    this.phaseElapsed = 0
    return true
  }

  private landHop() {
    this.positionX = this.hopEnd.x
    this.positionZ = this.hopEnd.z
    this.hopRollSign *= -1
    this.phaseElapsed = 0

    const target = this.targetPoint
    if (!target) {
      this.phase = 'resting'
      return
    }

    const distanceToTarget = Math.hypot(
      target.x - this.positionX,
      target.z - this.positionZ,
    )
    if (distanceToTarget <= this.options.arriveEpsilon) {
      // 抵達：清除目標，仍進 resting 讓擠壓緩衝播完
      this.targetPoint = undefined
    }
    this.phase = 'resting'
  }

  private updateSlide(deltaSeconds: number): FlopPose {
    const target = this.targetPoint
    if (!target) {
      return this.composePose(false)
    }

    const deltaX = target.x - this.positionX
    const deltaZ = target.z - this.positionZ
    const distanceToTarget = Math.hypot(deltaX, deltaZ)

    if (distanceToTarget <= this.options.arriveEpsilon) {
      this.positionX = target.x
      this.positionZ = target.z
      this.targetPoint = undefined
      return this.composePose(false)
    }

    const desiredHeading = Math.atan2(deltaX, deltaZ)
    const headingDifference = normalizeAngle(desiredHeading - this.heading)
    const maxTurn = this.options.slideTurnSpeed * deltaSeconds
    this.heading = normalizeAngle(
      this.heading + clamp(headingDifference, -maxTurn, maxTurn),
    )

    const stepLength = Math.min(
      this.options.slideSpeed * deltaSeconds,
      distanceToTarget,
    )
    this.positionX += Math.sin(this.heading) * stepLength
    this.positionZ += Math.cos(this.heading) * stepLength

    return this.composePose(false)
  }

  private composePose(hasLanded: boolean): FlopPose {
    if (this.phase === 'hopping') {
      const progress = clamp(this.phaseElapsed / this.options.hopDuration, 0, 1)
      const wave = Math.sin(progress * Math.PI)
      // smoothstep 讓轉向兩端和緩、中段順暢，比線性更自然
      const turnEase = progress * progress * (3 - 2 * progress)

      return {
        x: this.hopStart.x + (this.hopEnd.x - this.hopStart.x) * progress,
        y: this.options.hopHeight * this.hopHeightScale * 4 * progress * (1 - progress),
        z: this.hopStart.z + (this.hopEnd.z - this.hopStart.z) * progress,
        heading: normalizeAngle(this.hopStartHeading + this.hopTurn * turnEase),
        roll: this.hopRollSign * this.options.rollAmplitude * wave,
        squash: 1 + this.options.stretchAmount * wave,
        isMoving: true,
        hasLanded,
      }
    }

    if (this.phase === 'resting') {
      const restProgress = clamp(this.phaseElapsed / this.options.restDuration, 0, 1)
      // easeOutQuad 回彈
      const recovery = 1 - (1 - restProgress) ** 2

      return {
        x: this.positionX,
        y: 0,
        z: this.positionZ,
        heading: this.heading,
        roll: 0,
        squash: 1 - this.options.squashAmount * (1 - recovery),
        isMoving: this.targetPoint !== undefined,
        hasLanded,
      }
    }

    return {
      x: this.positionX,
      y: 0,
      z: this.positionZ,
      heading: this.heading,
      roll: 0,
      squash: 1,
      isMoving: this.isSlideMode && this.targetPoint !== undefined,
      hasLanded,
    }
  }
}
