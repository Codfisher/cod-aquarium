import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core'
import type { InputState } from './use-input'
import {
  Color4,
  MeshBuilder,
  ParticleSystem,
  PhysicsAggregate,
  PhysicsShapeType,
  Sound,
  Texture,
  Vector3,
} from '@babylonjs/core'
import { ref } from 'vue'

function remap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin)
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// --- 常數（來自 Godot main.tscn 的 RigidBody3D 設定） ---

const SPHERE_RADIUS = 0.5
const SPHERE_Y_OFFSET = 0.5
const BODY_Y_OFFSET = 0.65
/** sphere.mass = 1000 */
const SPHERE_MASS = 1000
/** sphere.angular_velocity += basis.x * (linear_speed * 100) * delta */
const DRIVE_FORCE_SCALE = 100
/** sphere.angular_damp = 4.0 */
const ANGULAR_DAMP = 4.0
/** sphere.linear_damp = 0.1 */
const LINEAR_DAMP = 0.1
/** sphere.physics_material.friction = 5.0 */
const SPHERE_FRICTION = 5.0

const AUDIO_PATH = '/assets/kenny-Starter-Kit-Racing-godot-4.6/audio/'
const VEHICLE_SCALE = 0.375

export interface Vehicle {
  container: TransformNode;
  update: (delta: number, input: InputState) => void;
  getSpeed: () => number;
  getPosition: () => Vector3;
  getRotationY: () => number;
  dispose: () => void;
}

export function useVehicle() {
  const speed = ref(0)

  function createVehicle(
    scene: Scene,
    vehicleRoot: TransformNode,
  ): Vehicle {
    const container = vehicleRoot

    const body = findChild(container, 'body')
    const wheelFrontLeft = findChild(container, 'wheel-front-left')
    const wheelFrontRight = findChild(container, 'wheel-front-right')
    const wheelBackLeft = findChild(container, 'wheel-back-left')
    const wheelBackRight = findChild(container, 'wheel-back-right')

    // 清除 rotationQuaternion
    const allNodeList = [container, body, wheelFrontLeft, wheelFrontRight, wheelBackLeft, wheelBackRight]
    for (const node of allNodeList) {
      if (node) {
        (node as unknown as AbstractMesh).rotationQuaternion = null
      }
    }

    // --- Havok 物理球體（對應 Godot 的 Sphere RigidBody3D） ---
    const sphereMesh = MeshBuilder.CreateSphere('vehicleSphere', {
      diameter: SPHERE_RADIUS * 2,
    }, scene)
    // 初始位置在車輛上方，讓重力自然落到路面
    sphereMesh.position = new Vector3(
      container.position.x,
      2.0,
      container.position.z,
    )
    sphereMesh.isVisible = false

    const sphereAggregate = new PhysicsAggregate(
      sphereMesh,
      PhysicsShapeType.SPHERE,
      {
        mass: SPHERE_MASS,
        friction: SPHERE_FRICTION,
        restitution: 0.1,
      },
      scene,
    )

    // 設定阻力
    sphereAggregate.body.setLinearDamping(LINEAR_DAMP)
    sphereAggregate.body.setAngularDamping(ANGULAR_DAMP)

    console.log('[Vehicle] Havok 球體建立完成', {
      position: sphereMesh.position.toString(),
      mass: SPHERE_MASS,
      friction: SPHERE_FRICTION,
      linearDamping: LINEAR_DAMP,
      angularDamping: ANGULAR_DAMP,
    })

    // --- 狀態 ---
    let inputX = 0
    let inputZ = 0
    let linearSpeed = 0
    let angularSpeed = 0
    let acceleration = 0
    let colliding = true

    // 煙霧
    const smokeLeft = createSmokeSystem(scene, 'trailLeft')
    const smokeRight = createSmokeSystem(scene, 'trailRight')

    // 音效
    let engineSound: Sound | undefined
    let screechSound: Sound | undefined
    try {
      engineSound = new Sound('engine', `${AUDIO_PATH}engine.ogg`, scene, null, {
        loop: true, autoplay: true, volume: 0,
      })
      screechSound = new Sound('screech', `${AUDIO_PATH}skid.ogg`, scene, null, {
        loop: true, autoplay: true, volume: 0,
      })
    }
    catch { /* 音效載入失敗不影響遊戲 */ }

    // ==========================================================
    //  _physics_process(delta) — 使用 Havok 物理引擎
    // ==========================================================

    let frameCount = 0

    function update(delta: number, input: InputState) {
      frameCount++

      // ---- handle_input(delta) ----
      const spherePos = sphereMesh.position

      // 前 10 幀 + 每 120 幀印一次 log
      if (frameCount <= 10 || frameCount % 120 === 0) {
        const linVel = sphereAggregate.body.getLinearVelocity()
        const angVel = sphereAggregate.body.getAngularVelocity()
        console.log(`[Vehicle] frame=${frameCount}`, {
          sphereY: spherePos.y.toFixed(3),
          sphereXZ: `(${spherePos.x.toFixed(2)}, ${spherePos.z.toFixed(2)})`,
          linVel: `(${linVel.x.toFixed(2)}, ${linVel.y.toFixed(2)}, ${linVel.z.toFixed(2)})`,
          angVel: `len=${angVel.length().toFixed(2)}`,
          linearSpeed: linearSpeed.toFixed(3),
          colliding,
          containerY: container.position.y.toFixed(3),
        })
      }

      // 簡易接地偵測：球體 Y 接近地面
      colliding = spherePos.y <= SPHERE_Y_OFFSET + 0.1

      if (colliding) {
        inputX = input.axisX
        inputZ = input.axisZ
      }

      // sphere.angular_velocity += vehicle_model.basis.x * (linear_speed * 100) * delta
      // basis.x = 車輛的「右方向」，對球體施加角速度使其在車輛前方滾動
      const basisX = new Vector3(
        Math.cos(container.rotation.y),
        0,
        -Math.sin(container.rotation.y),
      )

      const angularVelDelta = basisX.scale(linearSpeed * DRIVE_FORCE_SCALE * delta)
      const currentAngVel = sphereAggregate.body.getAngularVelocity()
      sphereAggregate.body.setAngularVelocity(
        new Vector3(
          currentAngVel.x + angularVelDelta.x,
          currentAngVel.y + angularVelDelta.y,
          currentAngVel.z + angularVelDelta.z,
        ),
      )

      // ---- 方向判斷 ----
      let direction = Math.sign(linearSpeed)
      if (direction === 0) {
        direction = Math.abs(inputZ) > 0.1 ? Math.sign(inputZ) : 1
      }

      // ---- 轉向 ----
      const steeringGrip = Math.abs(linearSpeed) < 0.05
        ? 0
        : clamp(Math.abs(linearSpeed), 0.2, 1.0)
      const targetAngular = -inputX * steeringGrip * 4 * direction
      angularSpeed = lerp(angularSpeed, targetAngular, delta * 4)
      container.rotation.y += angularSpeed * delta

      // ---- Speed control ----
      const targetSpeed = inputZ
      if (targetSpeed < 0 && linearSpeed > 0.01) {
        linearSpeed = lerp(linearSpeed, 0.0, delta * 8)
      }
      else if (targetSpeed < 0) {
        linearSpeed = lerp(linearSpeed, targetSpeed / 2, delta * 2)
      }
      else {
        linearSpeed = lerp(linearSpeed, targetSpeed, delta * 6)
      }

      // acceleration（用於視覺效果）
      const sphereAngVelLength = sphereAggregate.body.getAngularVelocity().length()
      acceleration = lerp(
        acceleration,
        linearSpeed + (Math.abs(sphereAngVelLength * linearSpeed) / 100),
        delta * 1,
      )

      // ---- 車身跟隨球體 ----
      // vehicle_model.position = sphere.position - Vector3(0, 0.65, 0)
      container.position.x = spherePos.x
      container.position.y = spherePos.y - BODY_Y_OFFSET
      container.position.z = spherePos.z

      // ---- 視覺與音效 ----
      effectEngine(delta)
      effectBody(delta)
      effectWheels()
      effectTrails()

      speed.value = Math.abs(linearSpeed)
    }

    // ==========================================================
    //  視覺效果 — 對照 vehicle.gd
    // ==========================================================

    function effectBody(delta: number) {
      if (!body) return
      body.rotation.x = lerp(body.rotation.x, -(linearSpeed - acceleration) / 6, delta * 10)
      body.rotation.z = lerp(body.rotation.z, -inputX / 5 * linearSpeed, delta * 5)
      body.position.x = lerp(body.position.x, 0, delta * 5)
      body.position.y = lerp(body.position.y, 0.2, delta * 5)
      body.position.z = lerp(body.position.z, 0, delta * 5)
    }

    function effectWheels() {
      const wheelList = [wheelFrontLeft, wheelFrontRight, wheelBackLeft, wheelBackRight]
      for (const wheel of wheelList) {
        if (!wheel) continue
        wheel.rotation.x += acceleration
      }
      if (wheelFrontLeft) {
        wheelFrontLeft.rotation.y = lerp(wheelFrontLeft.rotation.y, -inputX / 1.5, 0.15)
      }
      if (wheelFrontRight) {
        wheelFrontRight.rotation.y = lerp(wheelFrontRight.rotation.y, -inputX / 1.5, 0.15)
      }
    }

    function effectEngine(delta: number) {
      if (!engineSound) return
      const speedFactor = clamp(Math.abs(linearSpeed), 0, 1)
      const throttleFactor = clamp(Math.abs(inputZ), 0, 1)
      const targetVolume = remap(speedFactor + throttleFactor * 0.5, 0, 1.5, 0.05, 0.4)
      engineSound.setVolume(lerp(engineSound.getVolume(), targetVolume, delta * 5))
      let targetPitch = remap(speedFactor, 0, 1, 0.5, 3)
      if (throttleFactor > 0.1) targetPitch += 0.2
      engineSound.setPlaybackRate(lerp(engineSound.getPlaybackRate(), targetPitch, delta * 2))
    }

    function effectTrails() {
      const driftIntensity = Math.abs(linearSpeed - acceleration)
        + (Math.abs(body?.rotation.z ?? 0) * 2.0)
      const shouldEmit = driftIntensity > 0.25

      if (shouldEmit) {
        const cosY = Math.cos(container.rotation.y)
        const sinY = Math.sin(container.rotation.y)
        const s = VEHICLE_SCALE
        const lx = 0.25 * s
        const ly = 0.05 * s
        const lz = -0.35 * s

        smokeLeft.emitter = new Vector3(
          container.position.x + lx * cosY + lz * sinY,
          container.position.y + ly,
          container.position.z - lx * sinY + lz * cosY,
        )
        smokeRight.emitter = new Vector3(
          container.position.x - lx * cosY + lz * sinY,
          container.position.y + ly,
          container.position.z + lx * sinY + lz * cosY,
        )

        if (!smokeLeft.isStarted()) smokeLeft.start()
        if (!smokeRight.isStarted()) smokeRight.start()
      }
      else {
        if (smokeLeft.isStarted()) smokeLeft.stop()
        if (smokeRight.isStarted()) smokeRight.stop()
      }

      if (!screechSound) return
      if (shouldEmit) {
        const vol = remap(clamp(driftIntensity, 0.25, 2.0), 0.25, 2.0, 0.05, 0.5)
        screechSound.setVolume(lerp(screechSound.getVolume(), vol, 0.1))
        screechSound.setPlaybackRate(
          lerp(screechSound.getPlaybackRate(), clamp(Math.abs(linearSpeed), 1, 3), 0.1),
        )
      }
      else {
        screechSound.setVolume(lerp(screechSound.getVolume(), 0, 0.1))
      }
    }

    return {
      container,
      update,
      getSpeed: () => Math.abs(linearSpeed),
      getPosition: () => container.position.clone(),
      getRotationY: () => container.rotation.y,
      dispose() {
        smokeLeft.dispose()
        smokeRight.dispose()
        engineSound?.dispose()
        screechSound?.dispose()
        sphereAggregate.dispose()
        sphereMesh.dispose()
      },
    }
  }

  return { speed, createVehicle }
}

function findChild(parent: TransformNode, name: string): TransformNode | undefined {
  return parent.getChildTransformNodes(false)
    .find((child) => child.name.toLowerCase().includes(name.toLowerCase()))
}

function createSmokeSystem(scene: Scene, name: string): ParticleSystem {
  const system = new ParticleSystem(name, 32, scene)

  const smokeTexture = new Texture(
    '/assets/kenny-Starter-Kit-Racing-godot-4.6/sprites/smoke.png',
    scene, false, true,
  )
  system.particleTexture = smokeTexture

  system.minLifeTime = 1.0
  system.maxLifeTime = 1.5
  system.emitRate = 80

  system.minEmitPower = 0.02
  system.maxEmitPower = 0.08
  system.direction1 = new Vector3(-0.3, 0, -0.3)
  system.direction2 = new Vector3(0.3, 0.05, 0.3)

  system.gravity = new Vector3(0, 0, 0)

  const vs = VEHICLE_SCALE
  system.minSize = 0.15 * vs
  system.maxSize = 0.4 * vs

  system.addSizeGradient(0, 0.3 * vs, 0.4 * vs)
  system.addSizeGradient(0.3, 0.8 * vs, 1.0 * vs)
  system.addSizeGradient(0.7, 1.0 * vs, 1.2 * vs)
  system.addSizeGradient(1, 0.6 * vs, 0.8 * vs)

  const r = 0.55
  const g = 0.55
  const b = 0.58
  system.addColorGradient(0, new Color4(r, g, b, 0))
  system.addColorGradient(0.1, new Color4(r, g, b, 0.6))
  system.addColorGradient(0.3, new Color4(r, g, b, 0.5))
  system.addColorGradient(0.7, new Color4(r, g, b, 0.2))
  system.addColorGradient(1, new Color4(r, g, b, 0))

  system.minAngularSpeed = -Math.PI / 4
  system.maxAngularSpeed = Math.PI / 4

  system.billboardMode = ParticleSystem.BILLBOARDMODE_ALL
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD

  system.emitter = Vector3.Zero()
  system.stop()

  return system
}
