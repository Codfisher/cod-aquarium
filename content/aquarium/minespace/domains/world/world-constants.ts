/** 世界寬度與深度 */
export const WORLD_SIZE = 192
/** 世界高度
 *
 * 需要容得下雪山峰頂與峰頂上方的天空，太矮山頭會被削平
 */
export const WORLD_HEIGHT = 56

/** 海平面高度，低於此高度的空氣會被水填滿 */
export const SEA_LEVEL = 12

/** 區塊大小
 *
 * Minespace 的世界不可編輯，重建粒度不重要，
 * 因此改用較大的區塊換取較少的 draw call
 */
export const CHUNK_SIZE = 48
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
export function worldToChunkCoordinate(value: number): number {
  return Math.floor(value / CHUNK_SIZE)
}

/**
 * 取得區塊索引
 */
export function getChunkIndex(chunkX: number, chunkZ: number): number {
  return chunkX * CHUNKS_PER_AXIS + chunkZ
}

/**
 * 判斷座標是否落在世界範圍內
 */
export function isInsideWorld(x: number, y: number, z: number): boolean {
  return x >= 0 && x < WORLD_SIZE
    && y >= 0 && y < WORLD_HEIGHT
    && z >= 0 && z < WORLD_SIZE
}
