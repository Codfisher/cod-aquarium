/** 世界寬度與深度 */
export const WORLD_SIZE = 64
/** 世界高度 */
export const WORLD_HEIGHT = 64

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
