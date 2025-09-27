import { Vector3 } from '@babylonjs/core'

/** 小於此值視為 0 */
export const epsilon = 1e-8

/** 向量正規化成長度 1，若長度太小則回傳 0 向量 */
export function normalizeSafe(
  vector: Vector3,
) {
  const m = vector.length()
  return m < epsilon ? Vector3.Zero() : vector.scale(1 / m)
}
/** 設定向量大小 */
export function setLength(
  vector: Vector3,
  m: number,
) {
  const n = normalizeSafe(vector)
  return n.scale(m)
}
/** 限制向量大小 */
export function limitLength(
  vector: Vector3,
  max: number,
) {
  const m = vector.length()
  return m > max ? vector.scale(max / (m || epsilon)) : vector
}

/** 將球座標轉成笛卡兒座標 */
export function fromSphericalCoords(
  radius: number,
  theta: number,
  phi: number,
) {
  const x = radius * Math.sin(theta) * Math.cos(phi)
  const y = radius * Math.cos(theta)
  const z = radius * Math.sin(theta) * Math.sin(phi)
  return new Vector3(x, y, z)
}

/** 限制至 0~1 之間 */
export function clamp01(
  value: number,
) {
  return Math.min(1, Math.max(0, value))
}
