import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 安全設定方塊（僅在邊界內且目標為空氣時才寫入） */
function safeSet(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId) {
  if (x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT) {
    const idx = coordinateToIndex(x, y, z)
    if (state[idx] === BlockId.AIR) {
      state[idx] = blockId
    }
  }
}

/** 小樹：樹幹 2 格 + 頂端十字樹葉 */
function placeSmallTree(state: Uint8Array, x: number, sy: number, z: number) {
  state[coordinateToIndex(x, sy + 1, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 2, z)] = BlockId.OAK_LOG
  safeSet(state, x, sy + 3, z, BlockId.OAK_LEAVES)
  safeSet(state, x + 1, sy + 2, z, BlockId.OAK_LEAVES)
  safeSet(state, x - 1, sy + 2, z, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 2, z + 1, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 2, z - 1, BlockId.OAK_LEAVES)
}

/** 標準橡樹：樹幹 3 格 + 原始十字樹葉 */
function placeStandardTree(state: Uint8Array, x: number, sy: number, z: number) {
  state[coordinateToIndex(x, sy + 1, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 2, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 3, z)] = BlockId.OAK_LOG
  safeSet(state, x, sy + 4, z, BlockId.OAK_LEAVES)
  safeSet(state, x + 1, sy + 3, z, BlockId.OAK_LEAVES)
  safeSet(state, x - 1, sy + 3, z, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 3, z + 1, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 3, z - 1, BlockId.OAK_LEAVES)
}

/** 高大樹：樹幹 5 格 + 兩層樹冠 */
function placeTallTree(state: Uint8Array, x: number, sy: number, z: number) {
  for (let i = 1; i <= 5; i++) {
    state[coordinateToIndex(x, sy + i, z)] = BlockId.OAK_LOG
  }
  // 下層樹冠（十字 + 對角）
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0)
        continue
      safeSet(state, x + dx, sy + 4, z + dz, BlockId.OAK_LEAVES)
    }
  }
  // 上層樹冠
  safeSet(state, x, sy + 6, z, BlockId.OAK_LEAVES)
  safeSet(state, x + 1, sy + 5, z, BlockId.OAK_LEAVES)
  safeSet(state, x - 1, sy + 5, z, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 5, z + 1, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 5, z - 1, BlockId.OAK_LEAVES)
}

/** 茂密大樹：樹幹 4 格 + 寬闊兩層樹冠 */
function placeBushyTree(state: Uint8Array, x: number, sy: number, z: number) {
  for (let i = 1; i <= 4; i++) {
    state[coordinateToIndex(x, sy + i, z)] = BlockId.OAK_LOG
  }
  // 下層：3×3 樹葉（排除中心樹幹）
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0)
        continue
      safeSet(state, x + dx, sy + 3, z + dz, BlockId.OAK_LEAVES)
    }
  }
  // 上層：5×5 去角樹葉
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2)
        continue
      if (dx === 0 && dz === 0)
        continue
      safeSet(state, x + dx, sy + 4, z + dz, BlockId.OAK_LEAVES)
    }
  }
  // 頂端
  safeSet(state, x, sy + 5, z, BlockId.OAK_LEAVES)
  safeSet(state, x + 1, sy + 5, z, BlockId.OAK_LEAVES)
  safeSet(state, x - 1, sy + 5, z, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 5, z + 1, BlockId.OAK_LEAVES)
  safeSet(state, x, sy + 5, z - 1, BlockId.OAK_LEAVES)
}

/**
 * 在指定位置放置隨機樣式的樹木
 *
 * @param state - 世界方塊資料
 * @param x - 樹木基底 X 座標
 * @param surfaceY - 地表 Y 座標
 * @param z - 樹木基底 Z 座標
 */
export function placeTree(state: Uint8Array, x: number, surfaceY: number, z: number) {
  const variant = Math.random()
  if (variant < 0.3) {
    placeSmallTree(state, x, surfaceY, z)
  }
  else if (variant < 0.6) {
    placeStandardTree(state, x, surfaceY, z)
  }
  else if (variant < 0.85) {
    placeTallTree(state, x, surfaceY, z)
  }
  else {
    placeBushyTree(state, x, surfaceY, z)
  }
}
