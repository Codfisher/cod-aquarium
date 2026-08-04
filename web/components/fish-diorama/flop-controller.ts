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

/** 場景障礙（俯視圓）：魚會繞開、不會踩進去 */
export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

/** 魚可移動的邊界（俯視矩形）：驚嚇跳的隨機落點不會被推出邊界外 */
export interface MoveBoundsRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
  /** 身體擺動相位（rad），與跳躍同步：每跳推進 π，左右逐跳交替。
   * 供魚模型驅動擺尾，讓擺動配合跳躍節奏而非自跑
   */
  wavePhase: number;
  /** 俯仰角（rad，正 = 抬頭）：順著跳躍拋物線起跳抬頭、下落低頭，落地歸零 */
  pitch: number;
  /** 本跳強度（0.35~1，= 跳高縮放）。短跳時擺動幅度應等比縮小 */
  hopStrength: number;
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
  /** 跳躍中俯仰幅度（rad）：起跳抬頭、下落低頭的最大角度 */
  pitchAmplitude: number;
  /** 落地撞擊給彈簧的速度衝擊量；阻尼會吃掉一些，實際壓下去約為此值的 0.65 倍 */
  squashAmount: number;
  /** 無蓄力起跳（驚嚇跳）的伸展衝擊量。一般跳躍的伸展由蓄力釋放自然產生 */
  stretchAmount: number;
  /** 起跳前的蓄力時長（秒）：先壓扁再彈出去的前置動作。
   * 需大於彈簧的四分之一週期（約 0.045 秒）壓縮才來得及做滿
   */
  crouchDuration: number;
  /** 蓄力的擠壓目標（0.2 = 壓向 0.8 倍）；彈簧會再過衝約 25%，實際壓到約 0.74 */
  crouchSquashAmount: number;
  /** 擠壓彈簧剛度：ω = √stiffness，決定晃動快慢（1200 ≈ 0.18 秒晃一次） */
  squashStiffness: number;
  /** 擠壓彈簧阻尼：低於 2√stiffness（≈ 69）才會過衝。20 ≈ 阻尼比 0.29，
   * 落地後晃兩三下收斂，是「果凍感」的來源
   */
  squashDamping: number;
  /** 滑行模式速度（單位/秒），供 prefers-reduced-motion 使用 */
  slideSpeed: number;
  /** 滑行模式轉向速度（rad/秒） */
  slideTurnSpeed: number;
  /** 滿力跳的身體擺動圈數，可為小數：1 = 起跳下甩一次，2 = 下甩 + 空中再擺一次。
   * 實際圈數 = 此值 × 跳高縮放（不取整）；相位跨跳累積保持連續，
   * 小數圈會讓「下甩」時點逐跳自然漂移，帶點有機變化
   */
  waveCyclesPerHop: number;
  /** 落地休息期末端的擺動相位速度（rad/s）。
   * 休息期從「跳躍結束時的相位速度」線性減速到此值：速度連續、
   * 尾巴像慣性漸緩而非急停凍結，並無縫接進下一跳
   */
  restWaveSpeed: number;
  /** 點擊目標與當前位置距離小於此值就忽略，避免誤觸造成原地微跳 */
  minMoveDistance: number;
  /** 障礙避讓前視距離：這麼近的障礙才納入偏轉計算 */
  obstacleLookAhead: number;
  /** 驚嚇跳隨機方向所用的隨機數來源，預設 Math.random；測試可注入固定值排除隨機性 */
  random: () => number;
}

const defaultOptions: FlopControllerOptions = {
  hopDistance: 0.9,
  hopHeight: 1,
  hopDuration: 0.34,
  restDuration: 0.16,
  maxTurnPerHop: Math.PI / 2,
  arriveEpsilon: 0.12,
  rollAmplitude: 0.55,
  pitchAmplitude: 0.4,
  squashAmount: 0.16,
  stretchAmount: 0.14,
  crouchDuration: 0.12,
  crouchSquashAmount: 0.2,
  squashStiffness: 1200,
  squashDamping: 20,
  slideSpeed: 2.4,
  slideTurnSpeed: 4,
  waveCyclesPerHop: 1.5,
  restWaveSpeed: 4.5,
  minMoveDistance: 0.5,
  obstacleLookAhead: 2.6,
  random: Math.random,
}

/** crouching：起跳前的蓄力，原地壓扁、姿態維持上一跳的朝向 */
type FlopPhase = 'idle' | 'crouching' | 'hopping' | 'resting'

/** 蓄力進行到此比例就放開（目標拉回 1）：身體在還沒離地時就開始伸展，
 * 離地那刻已經在往上長，而不是先浮起來才想到要伸展
 */
const CROUCH_RELEASE_RATIO = 0.6
/** 擠壓彈簧的積分步長上限（秒）：大 delta 時分段積分，彈簧不會發散 */
const SQUASH_SPRING_MAX_STEP = 1 / 240

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

/** 把點夾回邊界矩形內 */
function clampPointToBounds(x: number, z: number, bounds: MoveBoundsRect): PlanePoint {
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    z: clamp(z, bounds.minZ, bounds.maxZ),
  }
}

/** 把點推到所有障礙圓之外（落在圓內就投影到最近邊界）。供落點與點擊目標修正 */
export function resolvePointOutsideObstacles(
  x: number,
  z: number,
  obstacleList: ObstacleCircle[],
): PlanePoint {
  let resolvedX = x
  let resolvedZ = z
  for (const obstacle of obstacleList) {
    const deltaX = resolvedX - obstacle.x
    const deltaZ = resolvedZ - obstacle.z
    const distance = Math.hypot(deltaX, deltaZ)
    if (distance < obstacle.radius) {
      if (distance > 1e-4) {
        const scale = obstacle.radius / distance
        resolvedX = obstacle.x + deltaX * scale
        resolvedZ = obstacle.z + deltaZ * scale
      }
      else {
        resolvedX = obstacle.x + obstacle.radius
      }
    }
  }
  return { x: resolvedX, z: resolvedZ }
}

/** 沿 desiredHeading 前進時，若障礙真的擋在「這裡到目標」的路段上，偏轉到切線繞開。
 * 用線段-圓相交判定：障礙的進入點若落在目標之後（或在身後）就不偏轉，
 * 這樣目標貼近障礙邊界時魚仍能筆直走到，不會在邊界外打轉。
 * 由遠到近逐一修正，最近（最緊急）的障礙擁有最終決定權。
 */
function steerAroundObstacles(
  x: number,
  z: number,
  desiredHeading: number,
  distanceToTarget: number,
  obstacleList: ObstacleCircle[],
  lookAhead: number,
): number {
  let heading = desiredHeading

  const relevantList = obstacleList
    .map((obstacle) => ({
      obstacle,
      distance: Math.hypot(obstacle.x - x, obstacle.z - z),
    }))
    .filter((item) => item.distance < lookAhead + item.obstacle.radius)
    .sort((a, b) => b.distance - a.distance)

  for (const { obstacle, distance } of relevantList) {
    const directionX = Math.sin(heading)
    const directionZ = Math.cos(heading)
    const toObstacleX = obstacle.x - x
    const toObstacleZ = obstacle.z - z

    // 障礙圓心在行進方向上的投影；在身後（且人不在圓內）就不理會
    const forwardProjection = toObstacleX * directionX + toObstacleZ * directionZ
    const isInside = distance < obstacle.radius
    if (forwardProjection <= 0 && !isInside) {
      continue
    }

    // 行進線與圓心的橫向距離；夠遠就不相交
    const lateralSquared = distance * distance - forwardProjection * forwardProjection
    const radiusSquared = obstacle.radius * obstacle.radius
    if (!isInside && lateralSquared >= radiusSquared) {
      continue
    }

    // 進入圓的距離；落在目標之後代表會先抵達目標，不需要繞
    const entryDistance = forwardProjection - Math.sqrt(Math.max(0, radiusSquared - lateralSquared))
    if (!isInside && entryDistance >= distanceToTarget - 1e-3) {
      continue
    }

    const headingToObstacle = Math.atan2(toObstacleX, toObstacleZ)
    // 障礙從魚看過去的角半徑；已在圓內就用 90° 直接往外閃
    const angularHalfWidth = isInside
      ? Math.PI / 2
      : Math.asin(clamp(obstacle.radius / distance, 0, 1))
    const difference = normalizeAngle(heading - headingToObstacle)
    // 偏轉到魚原本較偏的那一側切線
    const side = difference >= 0 ? 1 : -1
    heading = normalizeAngle(headingToObstacle + side * angularHalfWidth)
  }

  return heading
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
  /** 本跳的擺動圈數：依跳高縮減（跳得高空中多擺、短碎跳只甩一下） */
  private hopWaveCycles = 1
  /** 翻滾方向逐跳交替 */
  private hopRollSign = 1
  /** 本跳空中翻滾整圈數（startle 彩蛋用），一般跳躍為 0 走左右擺動 */
  private hopSpinTurnCount = 0
  /** 起跳當下的朝向，跳躍過程由此插值到目標朝向，避免瞬間轉向 */
  private hopStartHeading = 0
  /** 本次跳躍的總轉角（rad），已受 maxTurnPerHop 限制 */
  private hopTurn = 0

  private isSlideMode = false

  private obstacleList: ObstacleCircle[] = []
  private moveBounds: MoveBoundsRect | undefined

  /** 目標追蹤中曾達到的最近距離；連續數跳無進展就放棄，停在最近位置 */
  private bestTargetDistance = Number.POSITIVE_INFINITY
  private stuckHopCount = 0
  private slideStuckSeconds = 0

  /** 滑行模式的擺動相位（隨移動時間推進） */
  private slideWavePhase = 0
  /** 跨跳累積的擺動基準相位：每跳從上一跳結束處接續，小數圈數也不會跳變 */
  private waveBasePhase = 0
  /** 剛結束的那一跳的相位速度（rad/s），休息期由此平滑減速 */
  private restStartWaveSpeed = 0

  /** 身體擠壓比例與其變化率。整套彈跳的縮放都由這條彈簧產生：
   * 蓄力期把目標壓到 crouchSquashAmount、釋放時拉回 1（身體自己往上彈），
   * 落地撞擊給一次負向速度衝擊，之後過衝、回彈、收斂都是彈簧自然的結果
   */
  private squashValue = 1
  private squashVelocity = 0

  constructor(options?: Partial<FlopControllerOptions>) {
    this.options = { ...defaultOptions, ...options }
  }

  /** 設定場景障礙圓，魚會繞開、落點與滑行不會踩進去 */
  setObstacleList(obstacleList: ObstacleCircle[]) {
    this.obstacleList = obstacleList
  }

  /** 設定魚可移動的邊界，驚嚇跳的隨機落點不會被推出邊界外 */
  setMoveBounds(bounds: MoveBoundsRect) {
    this.moveBounds = bounds
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
    this.waveBasePhase = 0
    this.squashValue = 1
    this.squashVelocity = 0
  }

  /** 設定移動目標；移動中呼叫會在下一跳改道。
   * 目標離當前位置太近（含誤觸點擊）就忽略，避免閒置時被雜訊點擊觸發原地微跳。
   */
  setTarget(point: PlanePoint) {
    const distance = Math.hypot(point.x - this.positionX, point.z - this.positionZ)
    if (distance <= this.options.minMoveDistance) {
      return
    }
    this.targetPoint = { x: point.x, z: point.z }
    this.bestTargetDistance = Number.POSITIVE_INFINITY
    this.stuckHopCount = 0
    this.slideStuckSeconds = 0
  }

  /** 驚嚇彈跳（魚被點到時的回饋）：立即起跳、往隨機方向躍開、跳高小幅加成。
   * spinTurnCount > 0 時空中沿身體長軸翻滾整圈（連點彩蛋用）。
   * 跳躍中呼叫忽略（已在空中）；滑行模式沒有跳躍，也忽略。
   * 回傳是否真的起跳，供呼叫端判斷這次點擊有沒有生效。
   */
  startle(heightScale = 1.25, spinTurnCount = 0): boolean {
    if (this.isSlideMode || this.phase === 'hopping') {
      return false
    }
    this.hopStart = { x: this.positionX, z: this.positionZ }

    const randomHeading = this.options.random() * Math.PI * 2
    const rawEndX = this.positionX + Math.sin(randomHeading) * this.options.hopDistance
    const rawEndZ = this.positionZ + Math.cos(randomHeading) * this.options.hopDistance
    let hopEnd = this.obstacleList.length > 0
      ? resolvePointOutsideObstacles(rawEndX, rawEndZ, this.obstacleList)
      : { x: rawEndX, z: rawEndZ }
    if (this.moveBounds) {
      hopEnd = clampPointToBounds(hopEnd.x, hopEnd.z, this.moveBounds)
    }
    this.hopEnd = hopEnd

    this.hopStartHeading = this.heading
    // 身體朝向轉去實際位移的方向：落點可能被障礙或邊界修正過，
    // 直接沿用隨機角度會讓轉向跟移動方向對不上
    const travelDeltaX = this.hopEnd.x - this.hopStart.x
    const travelDeltaZ = this.hopEnd.z - this.hopStart.z
    const travelHeading = Math.hypot(travelDeltaX, travelDeltaZ) > 1e-4
      ? Math.atan2(travelDeltaX, travelDeltaZ)
      : this.heading
    // 驚嚇跳不受 maxTurnPerHop 限制：受驚時猛然轉身正是這個動作要傳達的感覺
    this.hopTurn = normalizeAngle(travelHeading - this.heading)
    this.heading = travelHeading

    this.hopHeightScale = heightScale
    this.hopSpinTurnCount = spinTurnCount
    this.hopWaveCycles = Math.max(0.5, this.options.waveCyclesPerHop * heightScale)
    this.phase = 'hopping'
    this.phaseElapsed = 0
    // 驚嚇跳沒有蓄力（要即時反應），改用一次伸展衝擊補上彈出去的力道
    this.applySquashImpulse(this.options.stretchAmount * heightScale)
    return true
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
    // 先積分彈簧再推進階段：這幀新加的衝擊下一幀才顯現，差一幀看不出來，
    // 但可以讓 composePose 直接取用已積分的值，不必分散在各個 return 前
    this.updateSquashSpring(deltaSeconds)
    if (this.isSlideMode) {
      return this.updateSlide(deltaSeconds)
    }
    return this.updateFlop(deltaSeconds)
  }

  /** 給彈簧一次速度衝擊。v = 峰值 × ω，衝擊後大約就彈到指定幅度 */
  private applySquashImpulse(peak: number) {
    this.squashVelocity += peak * Math.sqrt(this.options.squashStiffness)
  }

  /** 擠壓彈簧：目標值由當前階段決定，以固定小步長積分 */
  private updateSquashSpring(deltaSeconds: number) {
    const target = this.getSquashTarget()
    const stepCount = Math.max(1, Math.ceil(deltaSeconds / SQUASH_SPRING_MAX_STEP))
    const step = deltaSeconds / stepCount
    for (let index = 0; index < stepCount; index++) {
      const acceleration = (target - this.squashValue) * this.options.squashStiffness
        - this.squashVelocity * this.options.squashDamping
      this.squashVelocity += acceleration * step
      this.squashValue += this.squashVelocity * step
    }
  }

  /** 彈簧目標：只有蓄力前段壓扁，其餘階段都回到 1（伸展交給過衝與衝擊） */
  private getSquashTarget(): number {
    if (this.phase !== 'crouching') {
      return 1
    }
    const crouchProgress = clamp(this.phaseElapsed / this.options.crouchDuration, 0, 1)
    if (crouchProgress >= CROUCH_RELEASE_RATIO) {
      return 1
    }
    return 1 - this.options.crouchSquashAmount * Math.min(1, this.hopHeightScale)
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

      // crouching：蓄力壓扁，人還在地上；尾巴以休息期的速度續擺，不會凍住
      if (this.phase === 'crouching') {
        const crouchLeft = this.options.crouchDuration - this.phaseElapsed
        if (remaining < crouchLeft) {
          this.phaseElapsed += remaining
          this.waveBasePhase += remaining * this.options.restWaveSpeed
          remaining = 0
          break
        }
        remaining -= crouchLeft
        this.waveBasePhase += crouchLeft * this.options.restWaveSpeed
        this.phase = 'hopping'
        this.phaseElapsed = 0
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

      // resting：相位速度從跳躍結束值線性減速到 restWaveSpeed，
      // 尾巴像慣性漸緩而非急停凍結，並無縫接進下一跳
      const restLeft = this.options.restDuration - this.phaseElapsed
      const restRatio = clamp(this.phaseElapsed / this.options.restDuration, 0, 1)
      const currentWaveSpeed = this.restStartWaveSpeed
        + (this.options.restWaveSpeed - this.restStartWaveSpeed) * restRatio
      if (remaining < restLeft) {
        this.phaseElapsed += remaining
        this.waveBasePhase += remaining * currentWaveSpeed
        remaining = 0
        break
      }
      remaining -= restLeft
      this.waveBasePhase += restLeft * currentWaveSpeed
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
    // 記下起跳朝向與轉角，跳躍過程中插值，落地時才轉到位。
    // 有障礙時先把朝目標的方向偏轉到繞開障礙的切線
    const directHeading = Math.atan2(deltaX, deltaZ)
    const desiredHeading = this.obstacleList.length > 0
      ? steerAroundObstacles(this.positionX, this.positionZ, directHeading, distanceToTarget, this.obstacleList, this.options.obstacleLookAhead)
      : directHeading
    const headingDifference = normalizeAngle(desiredHeading - this.heading)
    const turn = clamp(
      headingDifference,
      -this.options.maxTurnPerHop,
      this.options.maxTurnPerHop,
    )
    this.hopStartHeading = this.heading
    this.hopTurn = turn
    this.heading = normalizeAngle(this.heading + turn)

    // 落點朝轉向後的方向；跳躍中身體朝向會平滑轉到這個方向。
    // 落點若落進障礙圓就推回邊界外，避免魚站進石頭裡
    const hopLength = Math.min(this.options.hopDistance, distanceToTarget)
    this.hopStart = { x: this.positionX, z: this.positionZ }
    const rawEndX = this.positionX + Math.sin(this.heading) * hopLength
    const rawEndZ = this.positionZ + Math.cos(this.heading) * hopLength
    this.hopEnd = this.obstacleList.length > 0
      ? resolvePointOutsideObstacles(rawEndX, rawEndZ, this.obstacleList)
      : { x: rawEndX, z: rawEndZ }
    this.hopHeightScale = clamp(hopLength / this.options.hopDistance, 0.35, 1)
    this.hopSpinTurnCount = 0
    // 跳得高空中多擺、短碎跳少擺；不取整，相位由 waveBasePhase 跨跳累積保持連續
    this.hopWaveCycles = Math.max(
      0.5,
      this.options.waveCyclesPerHop * this.hopHeightScale,
    )
    // 先進蓄力：壓扁一下再起跳，蓄力結束才換到 hopping
    this.phase = 'crouching'
    this.phaseElapsed = 0
    return true
  }

  private landHop() {
    this.positionX = this.hopEnd.x
    this.positionZ = this.hopEnd.z
    this.hopRollSign *= -1
    // 觸地撞擊：往下的速度衝擊，壓下去之後由彈簧自己回彈、過衝、收斂。
    // 跳得高（落得快）壓得深
    this.applySquashImpulse(-this.options.squashAmount * this.hopHeightScale)
    // 把本跳實際擺過的相位累積進基準，下一跳從這裡接續（小數圈也連續）；
    // 並記下本跳的相位速度，休息期由此平滑減速、避免急停凍結感
    this.waveBasePhase += Math.PI * 2 * this.hopWaveCycles
    this.restStartWaveSpeed = (Math.PI * 2 * this.hopWaveCycles) / this.options.hopDuration
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
    else if (distanceToTarget < this.bestTargetDistance - 0.05) {
      this.bestTargetDistance = distanceToTarget
      this.stuckHopCount = 0
    }
    else {
      // 這跳沒有更接近目標（被障礙擋住繞不進去）：連續數跳無進展就放棄，
      // 停在已達到的最近位置，避免在障礙邊界永遠打轉
      this.stuckHopCount += 1
      if (this.stuckHopCount >= 3) {
        this.targetPoint = undefined
      }
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

    // 滑行無進展偵測：一段時間都沒更接近目標就放棄，停在最近位置
    if (distanceToTarget < this.bestTargetDistance - 0.05) {
      this.bestTargetDistance = distanceToTarget
      this.slideStuckSeconds = 0
    }
    else {
      this.slideStuckSeconds += deltaSeconds
      if (this.slideStuckSeconds >= 1.5) {
        this.targetPoint = undefined
        return this.composePose(false)
      }
    }

    const directHeading = Math.atan2(deltaX, deltaZ)
    const desiredHeading = this.obstacleList.length > 0
      ? steerAroundObstacles(this.positionX, this.positionZ, directHeading, distanceToTarget, this.obstacleList, this.options.obstacleLookAhead)
      : directHeading
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
    // 滑行時擺動相位隨時間推進（沒有跳躍節奏可同步）
    this.slideWavePhase += deltaSeconds * 9

    // 滑行也不穿進障礙
    if (this.obstacleList.length > 0) {
      const safePoint = resolvePointOutsideObstacles(this.positionX, this.positionZ, this.obstacleList)
      this.positionX = safePoint.x
      this.positionZ = safePoint.z
    }

    return this.composePose(false)
  }

  private composePose(hasLanded: boolean): FlopPose {
    if (this.phase === 'crouching') {
      return {
        x: this.positionX,
        y: 0,
        z: this.positionZ,
        // 轉向留到跳躍中插值，蓄力期維持起跳前的朝向
        heading: this.hopStartHeading,
        roll: 0,
        squash: this.squashValue,
        wavePhase: this.slideWavePhase + this.waveBasePhase,
        pitch: 0,
        hopStrength: this.hopHeightScale,
        isMoving: true,
        hasLanded,
      }
    }

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
        // 彩蛋翻滾：整圈連續轉（smoothstep 起收和緩），起點與終點都是 0 不跳變；
        // 一般跳躍維持左右交替的小幅擺滾
        roll: this.hopSpinTurnCount > 0
          ? this.hopRollSign * Math.PI * 2 * this.hopSpinTurnCount * turnEase
          : this.hopRollSign * this.options.rollAmplitude * wave,
        squash: this.squashValue,
        // 從上一跳結束的相位接續走 hopWaveCycles 圈：
        // 第一圈是起跳下甩（拍地彈跳感），之後是空中的加擺；小數圈讓時點逐跳漂移
        wavePhase: this.slideWavePhase + this.waveBasePhase + progress * Math.PI * 2 * this.hopWaveCycles,
        // 俯仰順著拋物線：上升段抬頭（峰值在前半）、下落段低頭，起跳與落地都是 0 不跳變
        pitch: this.options.pitchAmplitude * this.hopHeightScale * Math.sin(progress * Math.PI * 2),
        hopStrength: this.hopHeightScale,
        isMoving: true,
        hasLanded,
      }
    }

    if (this.phase === 'resting') {
      return {
        x: this.positionX,
        y: 0,
        z: this.positionZ,
        heading: this.heading,
        roll: 0,
        // 落地衝擊後的壓扁、回彈與收斂全由彈簧產生
        squash: this.squashValue,
        wavePhase: this.slideWavePhase + this.waveBasePhase,
        pitch: 0,
        hopStrength: this.hopHeightScale,
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
      squash: this.squashValue,
      wavePhase: this.slideWavePhase + this.waveBasePhase,
      pitch: 0,
      hopStrength: this.hopHeightScale,
      isMoving: this.isSlideMode && this.targetPoint !== undefined,
      hasLanded,
    }
  }
}
