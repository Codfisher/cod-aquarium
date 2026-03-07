/** 世界寬度與深度 */
export const WORLD_SIZE = 64
/** 世界高度 */
export const WORLD_HEIGHT = 128

/** 區塊大小 */
export const CHUNK_SIZE = WORLD_SIZE / 4
/** 每維度區塊數 */
export const CHUNKS_PER_AXIS = WORLD_SIZE / CHUNK_SIZE
/** 總區塊數 */
export const TOTAL_CHUNKS = CHUNKS_PER_AXIS * CHUNKS_PER_AXIS

/** 世界總方塊數 */
export const WORLD_VOLUME = WORLD_SIZE * WORLD_SIZE * WORLD_HEIGHT

/**
 * 將 3D 座標轉換為一維陣列索引
 *
 * 公式：index = (x × WORLD_SIZE × WORLD_HEIGHT) + (y × WORLD_SIZE) + z
 */
export function coordinateToIndex(x: number, y: number, z: number): number {
  return (x * WORLD_HEIGHT * WORLD_SIZE) + (y * WORLD_SIZE) + z
}

/**
 * 將一維陣列索引轉換為 3D 座標
 */
export function indexToCoordinate(index: number): { x: number; y: number; z: number } {
  const x = Math.floor(index / (WORLD_HEIGHT * WORLD_SIZE))
  const remainder = index % (WORLD_HEIGHT * WORLD_SIZE)
  const y = Math.floor(remainder / WORLD_SIZE)
  const z = remainder % WORLD_SIZE

  return { x, y, z }
}

/**
 * 將世界座標轉換為區塊座標
 */
export function worldToChunkCoordinate(val: number): number {
  return Math.floor(val / CHUNK_SIZE)
}

/**
 * 取得區塊索引
 */
export function getChunkIndex(cx: number, cz: number): number {
  return cx * CHUNKS_PER_AXIS + cz
}
