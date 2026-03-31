import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import type { Mesh, Scene } from '@babylonjs/core'
import type { IntensityPhase } from '../battle/cinematic-manager'

/**
 * 碰撞衝擊波環
 *
 * 激烈期：1 層白色環
 * 決戰期：3 層環（白 → 黃 → 橘）+ 放射線條
 */
export function emitShockwave(
  scene: Scene,
  positionX: number,
  positionY: number,
  positionZ: number,
  phase: IntensityPhase,
): void {
  const ringCount = phase === 'climax' ? 3 : phase === 'intense' ? 1 : 0
  if (ringCount === 0) return

  const colorList = [
    new Color3(1, 1, 1),
    new Color3(1, 0.85, 0.3),
    new Color3(1, 0.5, 0.15),
  ]

  for (let i = 0; i < ringCount; i++) {
    const ring = MeshBuilder.CreateTorus(`shockwave-${Date.now()}-${i}`, {
      diameter: 0.3,
      thickness: 0.04,
      tessellation: 32,
    }, scene)

    ring.position.set(positionX, positionY + 0.1, positionZ)
    ring.rotation.x = Math.PI / 2

    const material = new StandardMaterial(`shockwaveMat-${Date.now()}-${i}`, scene)
    material.diffuseColor = colorList[i]
    material.emissiveColor = colorList[i].scale(0.8)
    material.alpha = 0.7
    ring.material = material

    // 展開動畫
    const startDelay = i * 0.05
    const duration = 0.35
    let elapsed = -startDelay

    const observer = scene.onBeforeRenderObservable.add(() => {
      elapsed += scene.getEngine().getDeltaTime() / 1000

      if (elapsed < 0) return

      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress) // easeOutQuad

      const scale = 0.3 + eased * (2.5 + i * 0.8)
      ring.scaling.set(scale, scale, scale)
      material.alpha = 0.7 * (1 - progress)

      if (progress >= 1) {
        scene.onBeforeRenderObservable.remove(observer)
        ring.dispose()
        material.dispose()
      }
    })
  }

  // 決戰期：放射線條
  if (phase === 'climax') {
    emitRadialLines(scene, positionX, positionY, positionZ)
  }
}

/** 漫畫式放射線條 */
function emitRadialLines(
  scene: Scene,
  positionX: number,
  positionY: number,
  positionZ: number,
): void {
  const lineCount = 8
  const duration = 0.3

  for (let i = 0; i < lineCount; i++) {
    const angle = (Math.PI * 2 * i) / lineCount + Math.random() * 0.3

    const line = MeshBuilder.CreateBox(`radialLine-${Date.now()}-${i}`, {
      width: 0.03,
      height: 0.01,
      depth: 0.4 + Math.random() * 0.3,
    }, scene)

    line.position.set(positionX, positionY + 0.15, positionZ)
    line.rotation.y = angle

    const material = new StandardMaterial(`radialLineMat-${Date.now()}-${i}`, scene)
    material.emissiveColor = new Color3(1, 0.9, 0.7)
    material.alpha = 0.8
    line.material = material

    let elapsed = 0
    const observer = scene.onBeforeRenderObservable.add(() => {
      elapsed += scene.getEngine().getDeltaTime() / 1000
      const progress = Math.min(elapsed / duration, 1)

      // 從碰撞點向外射出
      const distance = progress * 2.5
      line.position.x = positionX + Math.cos(angle) * distance
      line.position.z = positionZ + Math.sin(angle) * distance
      material.alpha = 0.8 * (1 - progress)

      const stretch = 1 + progress * 2
      line.scaling.z = stretch

      if (progress >= 1) {
        scene.onBeforeRenderObservable.remove(observer)
        line.dispose()
        material.dispose()
      }
    })
  }
}
