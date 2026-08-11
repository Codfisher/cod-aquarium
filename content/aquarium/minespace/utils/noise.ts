import { createNoise2D, createNoise3D } from 'simplex-noise'

/**
 * 以字串產生固定亂數序列（mulberry32）
 *
 * Minespace 的地圖佈局必須每次載入都一樣，
 * 所以噪音種子不能交給 Math.random。
 */
export function createSeededRandom(seed: string): () => number {
  let hash = 0x811C9DC5
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  let state = hash >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

/** 世界共用的固定種子 */
export const WORLD_SEED = 'minespace-2026'

const noise2D = createNoise2D(createSeededRandom(`${WORLD_SEED}-2d`))
const noise3D = createNoise3D(createSeededRandom(`${WORLD_SEED}-3d`))

/**
 * 分形噪音（FBM）
 *
 * 疊加多個不同頻率與振幅的噪音，產生自然的破碎感與細節
 */
export function fbm2D(x: number, z: number, octaves = 4, persistence = 0.5): number {
  let total = 0
  let frequency = 1
  let amplitude = 1
  let maxValue = 0

  for (let index = 0; index < octaves; index++) {
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

  for (let index = 0; index < octaves; index++) {
    total += noise3D(x * frequency, y * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= 2
  }

  return total / maxValue
}

/** 平滑階梯函式，把 0~1 的線性變化變得柔和 */
export function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}
