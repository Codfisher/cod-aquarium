import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
} from '@babylonjs/core'
import type { ArcRotateCamera, Scene } from '@babylonjs/core'

function createSparkTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('sparkTexture', 64, scene, true)
  const context = texture.getContext()

  context.clearRect(0, 0, 64, 64)

  // 發光星形
  const centerX = 32
  const centerY = 32

  // 外層暈光
  const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 30)
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.3, 'rgba(255, 240, 150, 0.8)')
  glow.addColorStop(1, 'rgba(255, 200, 50, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 64, 64)

  // 四角星形
  context.fillStyle = '#ffffff'
  context.beginPath()
  const outerRadius = 24
  const innerRadius = 6
  const pointCount = 4
  for (let i = 0; i < pointCount * 2; i++) {
    const angle = (Math.PI * 2 * i) / (pointCount * 2) - Math.PI / 2
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
  context.fill()

  texture.update()
  return texture
}

function createRingTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture('ringTexture', 64, scene, true)
  const context = texture.getContext()

  context.clearRect(0, 0, 64, 64)
  const ring = context.createRadialGradient(32, 32, 20, 32, 32, 30)
  ring.addColorStop(0, 'rgba(255, 200, 80, 0)')
  ring.addColorStop(0.5, 'rgba(255, 200, 80, 0.6)')
  ring.addColorStop(1, 'rgba(255, 100, 30, 0)')
  context.fillStyle = ring
  context.fillRect(0, 0, 64, 64)
  texture.update()
  return texture
}

export function emitCollisionSparks(
  scene: Scene,
  positionX: number,
  positionY: number,
  positionZ: number,
  intensity: number,
): void {
  const emitPosition = new Vector3(positionX, positionY + 0.2, positionZ)

  // --- 主火花 ---
  const sparkCount = Math.floor(25 + intensity * 40)
  const sparkSystem = new ParticleSystem('sparks', sparkCount, scene)
  sparkSystem.particleTexture = createSparkTexture(scene)
  sparkSystem.emitter = emitPosition

  sparkSystem.minLifeTime = 0.15
  sparkSystem.maxLifeTime = 0.6
  sparkSystem.minSize = 0.06
  sparkSystem.maxSize = 0.2 + intensity * 0.15
  sparkSystem.minEmitPower = 3
  sparkSystem.maxEmitPower = 8 + intensity * 5
  sparkSystem.emitRate = 0

  sparkSystem.direction1 = new Vector3(-1.5, 1.5, -1.5)
  sparkSystem.direction2 = new Vector3(1.5, 3, 1.5)

  sparkSystem.color1 = new Color4(1, 0.95, 0.5, 1)
  sparkSystem.color2 = new Color4(1, 0.6, 0.15, 1)
  sparkSystem.colorDead = new Color4(1, 0.15, 0, 0)

  sparkSystem.gravity = new Vector3(0, -8, 0)
  sparkSystem.manualEmitCount = sparkCount
  sparkSystem.start()

  // --- 衝擊波環 ---
  const ringCount = Math.floor(8 + intensity * 12)
  const ringSystem = new ParticleSystem('impactRing', ringCount, scene)
  ringSystem.particleTexture = createRingTexture(scene)
  ringSystem.emitter = emitPosition

  ringSystem.minLifeTime = 0.2
  ringSystem.maxLifeTime = 0.5
  ringSystem.minSize = 0.3
  ringSystem.maxSize = 1.0 + intensity * 0.5
  ringSystem.minEmitPower = 1
  ringSystem.maxEmitPower = 3
  ringSystem.emitRate = 0

  ringSystem.direction1 = new Vector3(-2, 0.2, -2)
  ringSystem.direction2 = new Vector3(2, 0.5, 2)

  ringSystem.color1 = new Color4(1, 0.8, 0.3, 0.6)
  ringSystem.color2 = new Color4(1, 0.4, 0.1, 0.4)
  ringSystem.colorDead = new Color4(1, 0.2, 0, 0)
  ringSystem.gravity = new Vector3(0, -2, 0)
  ringSystem.manualEmitCount = ringCount
  ringSystem.start()

  setTimeout(() => {
    sparkSystem.dispose()
    ringSystem.dispose()
  }, 1000)
}

export function applyCameraShake(
  camera: ArcRotateCamera,
  intensity: number,
): void {
  const originalTarget = camera.target.clone()
  const shakeStrength = 0.08 + intensity * 0.15
  let elapsed = 0
  const duration = 0.25 + intensity * 0.1

  const observer = camera.getScene().onBeforeRenderObservable.add(() => {
    elapsed += camera.getScene().getEngine().getDeltaTime() / 1000

    if (elapsed >= duration) {
      camera.target.copyFrom(originalTarget)
      camera.getScene().onBeforeRenderObservable.remove(observer)
      return
    }

    const decay = 1 - (elapsed / duration)
    // 用正弦震動取代純隨機，更有衝擊感
    const freq = 30
    const shake = Math.sin(elapsed * freq) * shakeStrength * decay
    camera.target.x = originalTarget.x + shake * (Math.random() > 0.5 ? 1 : -1)
    camera.target.y = originalTarget.y + shake * 0.5
    camera.target.z = originalTarget.z + shake * (Math.random() > 0.5 ? 1 : -1)
  })
}

/** 觸發慢動作效果 */
export function triggerSlowMotion(
  scene: Scene,
  duration: number = 0.3,
  timeScale: number = 0.2,
): void {
  const engine = scene.getEngine()
  const originalTimeStep = engine.getDeltaTime

  let elapsed = 0
  const observer = scene.onBeforeRenderObservable.add(() => {
    elapsed += (engine.getDeltaTime() / 1000) * timeScale

    if (elapsed >= duration) {
      scene.onBeforeRenderObservable.remove(observer)
    }
  })
}
