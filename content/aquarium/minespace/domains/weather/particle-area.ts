import type { Scene } from '@babylonjs/core'
import type { RealmParticleArea } from '../realm/realm-definition'

/**
 * 天氣粒子（落葉、沼澤霧片）的生成範圍
 *
 * 大廳的那一份鋪滿整座木座（followRadius 等於 radius）；大場景大得多，
 * 同樣的粒子數攤在整片上就稀到看不見，改成鋪在鏡頭四周 followRadius 格內。
 * 取樣的圓心先夾在範圍裡（離範圍中心不超過 radius − followRadius），
 * 取出來的點一定落在範圍內：走到範圍邊上，粒子停在邊上，不會跟著人飄出去
 */

/**
 * 在範圍裡取一點（水平座標）
 *
 * 先半徑、後角度，各抽一次 Math.random，與原本只鋪在箱庭上的寫法同一個順序；
 * 半徑開根號，取樣在圓面上才是均勻的。radiusExponent 給小於 0.5 的數，就偏向圓心
 */
export function sampleParticleArea(
  scene: Scene,
  area: RealmParticleArea,
  radiusExponent = 0.5,
): { x: number; z: number } {
  let centerX = area.centerX
  let centerZ = area.centerZ
  const followLimit = area.radius - area.followRadius
  const camera = scene.activeCamera
  if (followLimit > 0 && camera) {
    const offsetX = camera.position.x - area.centerX
    const offsetZ = camera.position.z - area.centerZ
    const distance = Math.hypot(offsetX, offsetZ)
    const scale = distance > followLimit ? followLimit / distance : 1
    centerX += offsetX * scale
    centerZ += offsetZ * scale
  }

  const outer = Math.min(area.radius, area.followRadius)
  const inner = Math.min(outer, area.clearRadius ?? 0)
  const radius = inner + Math.random() ** radiusExponent * (outer - inner)
  const angle = Math.random() * Math.PI * 2
  return {
    x: centerX + Math.cos(angle) * radius,
    z: centerZ + Math.sin(angle) * radius,
  }
}
