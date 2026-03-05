import { BlockId, coordinateToIndex, WORLD_SIZE, WORLD_VOLUME } from './world-constants'

/**
 * 建立空白世界狀態（全為 AIR）
 */
export function createWorldState(): Uint8Array {
  return new Uint8Array(WORLD_VOLUME)
}

/**
 * 簡易地形生成：
 * - y=0：石頭層
 * - y=1~3：泥土層
 * - y=4 + 隨機起伏：草地表面
 *
 * 使用簡易 2D noise 模擬高低地形
 */
export function generateTerrain(state: Uint8Array): void {
  const baseHeight = 12
  const maxVariation = 6

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 簡易 pseudo-noise：組合多頻率正弦波模擬地形起伏 */
      const height = baseHeight + Math.floor(
        Math.sin(x * 0.1) * 2
        + Math.cos(z * 0.15) * 2
        + Math.sin((x + z) * 0.08) * 1.5
        + maxVariation / 2,
      )

      const clampedHeight = Math.max(1, Math.min(height, WORLD_SIZE - 1))

      for (let y = 0; y < clampedHeight; y++) {
        const index = coordinateToIndex(x, y, z)

        if (y === 0) {
          state[index] = BlockId.BEDROCK
        }
        else if (y < clampedHeight - 3) {
          state[index] = BlockId.STONE
        }
        else if (y < clampedHeight - 1) {
          state[index] = BlockId.DIRT
        }
        else {
          state[index] = BlockId.GRASS
        }
      }
    }
  }
}

/**
 * 取得指定 X, Z 座標上最高的非空氣方塊的 Y 座標準位
 * 找不到則回傳 0
 */
export function getHighestBlockY(state: Uint8Array, x: number, z: number): number {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE)
    return 0

  for (let y = WORLD_SIZE - 1; y >= 0; y--) {
    const index = coordinateToIndex(x, y, z)
    if (state[index] !== BlockId.AIR) {
      return y
    }
  }
  return 0
}
