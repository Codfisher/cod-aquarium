import { sample } from 'remeda'
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

/** 隨機取得四方向偏移之一 */
function randomDirection(): [number, number] {
  const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  return directions[Math.floor(Math.random() * 4)]!
}

/** 彎曲樹：S 型樹幹，兩次偏移形成明顯彎曲，頂端寬樹冠 */
function placeCurvedTree(state: Uint8Array, x: number, sy: number, z: number) {
  const [directionX, directionZ] = randomDirection()
  // 下段直立 2 格
  state[coordinateToIndex(x, sy + 1, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 2, z)] = BlockId.OAK_LOG
  // 第一次偏移：水平橋接 + 往上
  const midX = x + directionX
  const midZ = z + directionZ
  safeSet(state, midX, sy + 2, midZ, BlockId.OAK_LOG)
  safeSet(state, midX, sy + 3, midZ, BlockId.OAK_LOG)
  safeSet(state, midX, sy + 4, midZ, BlockId.OAK_LOG)
  // 第二次偏移：水平橋接 + 往上
  const topX = midX + directionX
  const topZ = midZ + directionZ
  safeSet(state, topX, sy + 4, topZ, BlockId.OAK_LOG)
  safeSet(state, topX, sy + 5, topZ, BlockId.OAK_LOG)
  safeSet(state, topX, sy + 6, topZ, BlockId.OAK_LOG)
  // 寬樹冠：5×5 去角，圍繞最終頂端
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2)
        continue
      safeSet(state, topX + dx, sy + 6, topZ + dz, BlockId.OAK_LEAVES)
    }
  }
  // 頂層 3×3
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      safeSet(state, topX + dx, sy + 7, topZ + dz, BlockId.OAK_LEAVES)
    }
  }
  safeSet(state, topX, sy + 8, topZ, BlockId.OAK_LEAVES)
}

/** 分叉樹：高主幹 + Y 型大分叉，每個分支帶 3×3 樹冠 */
function placeForkedTree(state: Uint8Array, x: number, sy: number, z: number) {
  // 高主幹 3 格
  state[coordinateToIndex(x, sy + 1, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 2, z)] = BlockId.OAK_LOG
  state[coordinateToIndex(x, sy + 3, z)] = BlockId.OAK_LOG
  // 隨機選兩個不同方向作為分叉
  const allDirections: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const firstIndex = Math.floor(Math.random() * 4)
  let secondIndex = Math.floor(Math.random() * 3)
  if (secondIndex >= firstIndex)
    secondIndex++
  const branches: [number, number][] = [allDirections[firstIndex]!, allDirections[secondIndex]!]

  for (const [branchDirectionX, branchDirectionZ] of branches) {
    const branchX1 = x + branchDirectionX
    const branchZ1 = z + branchDirectionZ
    const branchX2 = x + branchDirectionX * 2
    const branchZ2 = z + branchDirectionZ * 2
    // 從主幹頂端水平延伸 1 格（橋接），再斜上
    safeSet(state, branchX1, sy + 3, branchZ1, BlockId.OAK_LOG)
    safeSet(state, branchX1, sy + 4, branchZ1, BlockId.OAK_LOG)
    // 水平橋接到第 2 格遠處，再往上
    safeSet(state, branchX2, sy + 4, branchZ2, BlockId.OAK_LOG)
    safeSet(state, branchX2, sy + 5, branchZ2, BlockId.OAK_LOG)
    safeSet(state, branchX2, sy + 6, branchZ2, BlockId.OAK_LOG)
    // 每個分支頂端 3×3 樹冠 + 頂端十字
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        safeSet(state, branchX2 + dx, sy + 6, branchZ2 + dz, BlockId.OAK_LEAVES)
      }
    }
    safeSet(state, branchX2, sy + 7, branchZ2, BlockId.OAK_LEAVES)
    safeSet(state, branchX2 + 1, sy + 7, branchZ2, BlockId.OAK_LEAVES)
    safeSet(state, branchX2 - 1, sy + 7, branchZ2, BlockId.OAK_LEAVES)
    safeSet(state, branchX2, sy + 7, branchZ2 + 1, BlockId.OAK_LEAVES)
    safeSet(state, branchX2, sy + 7, branchZ2 - 1, BlockId.OAK_LEAVES)
  }
}

/** 露根老樹：四方向粗根 + 深色粗壯主幹 6 格 + 三層巨大樹冠 */
function placeRootedTree(state: Uint8Array, x: number, sy: number, z: number) {
  // 地面樹根：全部四個方向都有根，隨機延伸 1~2 格，部分根還會突出地面 1 格
  const rootDirections: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (const [rootDirectionX, rootDirectionZ] of rootDirections) {
    safeSet(state, x + rootDirectionX, sy, z + rootDirectionZ, BlockId.DARK_OAK_LOG)
    safeSet(state, x + rootDirectionX * 2, sy, z + rootDirectionZ * 2, BlockId.DARK_OAK_LOG)
    // 部分根突出地面
    if (Math.random() > 0.5) {
      safeSet(state, x + rootDirectionX, sy + 1, z + rootDirectionZ, BlockId.DARK_OAK_LOG)
    }
  }
  // 粗壯深色主幹 6 格
  for (let i = 1; i <= 6; i++) {
    state[coordinateToIndex(x, sy + i, z)] = BlockId.DARK_OAK_LOG
  }
  // 下層樹冠：7×7 去角（高度 sy+5）
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) === 3 && Math.abs(dz) === 3)
        continue
      if (Math.abs(dx) >= 2 && Math.abs(dz) >= 3)
        continue
      if (Math.abs(dx) >= 3 && Math.abs(dz) >= 2)
        continue
      safeSet(state, x + dx, sy + 5, z + dz, BlockId.OAK_LEAVES)
    }
  }
  // 中層樹冠：5×5 去角（高度 sy+6）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2)
        continue
      safeSet(state, x + dx, sy + 6, z + dz, BlockId.OAK_LEAVES)
    }
  }
  // 頂層：3×3（高度 sy+7）
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      safeSet(state, x + dx, sy + 7, z + dz, BlockId.OAK_LEAVES)
    }
  }
  safeSet(state, x, sy + 8, z, BlockId.OAK_LEAVES)
}

/** 傾斜樹：樹幹大幅傾斜 3 格，像被暴風吹歪，不對稱大樹冠 */
function placeLeaningTree(state: Uint8Array, x: number, sy: number, z: number) {
  const [leanDirectionX, leanDirectionZ] = randomDirection()
  // 樹幹 6 格高，每 2 格偏移 1 格（總共偏移 3 格），偏移處加水平橋接
  let currentX = x
  let currentZ = z
  for (let i = 1; i <= 6; i++) {
    safeSet(state, currentX, sy + i, currentZ, BlockId.OAK_LOG)
    if (i % 2 === 0) {
      currentX += leanDirectionX
      currentZ += leanDirectionZ
      // 水平橋接：在偏移後的位置同高度放一格，確保連續
      safeSet(state, currentX, sy + i, currentZ, BlockId.OAK_LOG)
    }
  }
  // 大型不對稱樹冠：傾斜方向延伸 3 格，反方向只有 1 格
  for (let dx = -1; dx <= 3; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const worldX = currentX + leanDirectionX * dx + (leanDirectionZ !== 0 ? dz : 0)
      const worldZ = currentZ + leanDirectionZ * dx + (leanDirectionX !== 0 ? dz : 0)
      safeSet(state, worldX, sy + 6, worldZ, BlockId.OAK_LEAVES)
    }
  }
  // 上層較窄
  for (let dx = 0; dx <= 2; dx++) {
    const worldX = currentX + leanDirectionX * dx
    const worldZ = currentZ + leanDirectionZ * dx
    safeSet(state, worldX, sy + 7, worldZ, BlockId.OAK_LEAVES)
    if (leanDirectionX !== 0) {
      safeSet(state, worldX, sy + 7, worldZ + 1, BlockId.OAK_LEAVES)
      safeSet(state, worldX, sy + 7, worldZ - 1, BlockId.OAK_LEAVES)
    }
    else {
      safeSet(state, worldX + 1, sy + 7, worldZ, BlockId.OAK_LEAVES)
      safeSet(state, worldX - 1, sy + 7, worldZ, BlockId.OAK_LEAVES)
    }
  }
}

/** 叢生矮樹：多根深色短幹 + 寬大不規則樹葉團，像巨型灌木叢 */
function placeShrubTree(state: Uint8Array, x: number, sy: number, z: number) {
  // 中心主幹 2 格
  state[coordinateToIndex(x, sy + 1, z)] = BlockId.DARK_OAK_LOG
  state[coordinateToIndex(x, sy + 2, z)] = BlockId.DARK_OAK_LOG
  // 隨機方向額外長出 1~2 根短側幹
  const sideCount = 1 + Math.floor(Math.random() * 2)
  const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let i = 0; i < sideCount; i++) {
    const [sideDirectionX, sideDirectionZ] = directions[Math.floor(Math.random() * 4)]!
    safeSet(state, x + sideDirectionX, sy + 1, z + sideDirectionZ, BlockId.DARK_OAK_LOG)
  }
  // 寬大不規則球狀樹葉：半徑 3 的球形範圍
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = 0; dy <= 3; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        const distanceSquared = dx * dx + dy * dy + dz * dz
        if (distanceSquared > 10)
          continue
        // 隨機跳過少量樹葉，製造不規則感
        if (Math.random() < 0.15)
          continue
        safeSet(state, x + dx, sy + 2 + dy, z + dz, BlockId.OAK_LEAVES)
      }
    }
  }
}

/** 所有樹形放置函式 */
const treePlacers = [
  placeSmallTree,
  placeStandardTree,
  placeTallTree,
  placeBushyTree,
  placeCurvedTree,
  placeForkedTree,
  placeRootedTree,
  placeLeaningTree,
  placeShrubTree,
]

/**
 * 在指定位置放置隨機樣式的樹木
 *
 * @param state - 世界方塊資料
 * @param x - 樹木基底 X 座標
 * @param surfaceY - 地表 Y 座標
 * @param z - 樹木基底 Z 座標
 */
export function placeTree(state: Uint8Array, x: number, surfaceY: number, z: number) {
  const [placer] = sample(treePlacers, 1)
  placer?.(state, x, surfaceY, z)
}
