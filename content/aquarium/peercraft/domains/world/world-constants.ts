/** 世界大小（每軸格數） */
export const WORLD_SIZE = 64

/** 世界總方塊數 */
export const WORLD_VOLUME = WORLD_SIZE * WORLD_SIZE * WORLD_SIZE

/**
 * 將 3D 座標轉換為一維陣列索引
 *
 * 公式：index = (x × 64 × 64) + (y × 64) + z
 */
export function coordinateToIndex(x: number, y: number, z: number): number {
  return (x * WORLD_SIZE * WORLD_SIZE) + (y * WORLD_SIZE) + z
}

/**
 * 將一維陣列索引轉換為 3D 座標
 */
export function indexToCoordinate(index: number): { x: number; y: number; z: number } {
  const x = Math.floor(index / (WORLD_SIZE * WORLD_SIZE))
  const remainder = index % (WORLD_SIZE * WORLD_SIZE)
  const y = Math.floor(remainder / WORLD_SIZE)
  const z = remainder % WORLD_SIZE

  return { x, y, z }
}
