import { createNoise2D, createNoise3D } from 'simplex-noise'

const noise2D = createNoise2D()
const noise3D = createNoise3D()

/**
 * 分形 Noise (FBM - Fractional Brownian Motion)
 * 透過疊加多個不同頻率與振幅的噪音，產生自然的破碎感與細節
 */
export function fbm2D(x: number, z: number, octaves = 4, persistence = 0.5): number {
  let total = 0
  let frequency = 1
  let amplitude = 1
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    total += noise2D(x * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= 2
  }
  return total / maxValue
}

export function fbm3D(x: number, y: number, z: number, octaves = 4, persistence = 0.5): number {
  let total = 0
  let frequency = 1
  let amplitude = 1
  let maxValue = 0
  for (let i = 0; i < octaves; i++) {
    total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= 2
  }
  return total / maxValue
}
