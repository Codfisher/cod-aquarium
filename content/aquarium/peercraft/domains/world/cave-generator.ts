import { fbm2D, fbm3D } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 洞穴生成參數 */
const CAVE_FREQ_XZ = 0.04 // 主洞穴形狀頻率
const CAVE_FREQ_Y = 0.012 // Y 軸大幅壓扁，減少垂直落差
const HALL_FREQ = 0.015 // 大廳分佈頻率（低頻 = 大區域）
const HALL_NOISE_OFFSET = 300 // 大廳 noise 偏移
const BASE_THRESHOLD = 0.2 // 基礎挖空閾值（形成通道）
const HALL_BONUS = 0.25 // 大廳區域額外放寬（最高 0.40）
const HALL_ACTIVATION = 0.3 // 大廳 noise 高於此值時開始擴張
const MIN_CAVE_HEIGHT = 6 // 洞穴最低淨空高度
const SLOPE_PASSES = 3 // 階梯平滑化迭代次數

/**
 * 計算每個 (x,z) 的地殼保護上限
 */
function getCaveMaxHeight(heightMap: Uint8Array, x: number, z: number): number {
  const surfaceHeight = heightMap[x * WORLD_SIZE + z]!
  return Math.min(surfaceHeight - 5, WORLD_HEIGHT - 6)
}

/**
 * 可變閾值 Noise Field 洞穴挖掘
 *
 * 用 3D noise 決定挖空，另一組低頻 2D noise 控制閾值（大廳 vs 通道）
 */
function carveCaves(state: Uint8Array, heightMap: Uint8Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const caveMaxHeight = getCaveMaxHeight(heightMap, x, z)

      // 計算此 (x,z) 的大廳強度
      const hallNoise = fbm2D(
        (x + HALL_NOISE_OFFSET) * HALL_FREQ,
        (z + HALL_NOISE_OFFSET) * HALL_FREQ,
        2,
        0.5,
      )
      // hallNoise 範圍 [-1, 1]，映射到 [0, HALL_BONUS]
      const hallFactor = Math.max(0, (hallNoise - HALL_ACTIVATION) / (1 - HALL_ACTIVATION))
      const threshold = BASE_THRESHOLD + hallFactor * HALL_BONUS

      for (let y = 1; y < caveMaxHeight; y++) {
        const index = coordinateToIndex(x, y, z)
        if (state[index] === BlockId.STONE || state[index] === BlockId.COBBLESTONE || state[index] === BlockId.DIRT) {
          const caveNoise = fbm3D(x * CAVE_FREQ_XZ, y * CAVE_FREQ_Y, z * CAVE_FREQ_XZ, 3, 0.5)
          if (Math.abs(caveNoise) < threshold) {
            state[index] = BlockId.AIR
          }
        }
      }
    }
  }
}

/**
 * 天花板挖高 — 確保洞穴空間至少有 MIN_CAVE_HEIGHT 格淨空
 */
function enforceCeilingHeight(state: Uint8Array, heightMap: Uint8Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const caveMaxHeight = getCaveMaxHeight(heightMap, x, z)

      for (let y = 2; y < caveMaxHeight; y++) {
        // 找到洞穴地板（空氣格，下方為實體）
        if (state[coordinateToIndex(x, y, z)] !== BlockId.AIR)
          continue
        if (state[coordinateToIndex(x, y - 1, z)] === BlockId.AIR)
          continue

        // 從地板往上計算淨空高度
        let clearance = 0
        for (let cy = y; cy < caveMaxHeight && state[coordinateToIndex(x, cy, z)] === BlockId.AIR; cy++)
          clearance++

        // 淨空不足時，向上挖到最低高度
        if (clearance > 0 && clearance < MIN_CAVE_HEIGHT) {
          for (let cy = y + clearance; cy < y + MIN_CAVE_HEIGHT && cy < caveMaxHeight; cy++) {
            const ceilIndex = coordinateToIndex(x, cy, z)
            if (state[ceilIndex] !== BlockId.AIR && state[ceilIndex] !== BlockId.BEDROCK)
              state[ceilIndex] = BlockId.AIR
          }
        }
      }
    }
  }
}

/**
 * 走道加寬 — 單格寬通道向兩側擴展
 */
function widenCorridors(state: Uint8Array, heightMap: Uint8Array): void {
  const expandList: number[] = []

  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const caveMaxHeight = getCaveMaxHeight(heightMap, x, z)

      for (let y = 2; y < caveMaxHeight; y++) {
        if (state[coordinateToIndex(x, y, z)] !== BlockId.AIR)
          continue

        // 檢查 X 方向是否太窄（左右都是實體）
        const leftSolid = state[coordinateToIndex(x - 1, y, z)] !== BlockId.AIR
        const rightSolid = state[coordinateToIndex(x + 1, y, z)] !== BlockId.AIR
        if (leftSolid && rightSolid) {
          expandList.push(coordinateToIndex(x - 1, y, z), coordinateToIndex(x + 1, y, z))
        }

        // 檢查 Z 方向是否太窄
        const frontSolid = state[coordinateToIndex(x, y, z - 1)] !== BlockId.AIR
        const backSolid = state[coordinateToIndex(x, y, z + 1)] !== BlockId.AIR
        if (frontSolid && backSolid) {
          expandList.push(coordinateToIndex(x, y, z - 1), coordinateToIndex(x, y, z + 1))
        }
      }
    }
  }

  for (const idx of expandList) {
    if (state[idx] !== BlockId.BEDROCK)
      state[idx] = BlockId.AIR
  }
}

/**
 * 階梯平滑化 — 消除超過 1 格的地板落差
 *
 * 多次迭代：如果洞穴地板格旁邊有 2+ 格的落差，在落差處填入方塊形成斜坡
 */
function smoothSlopes(state: Uint8Array, heightMap: Uint8Array): void {
  const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

  for (let pass = 0; pass < SLOPE_PASSES; pass++) {
    for (let x = 1; x < WORLD_SIZE - 1; x++) {
      for (let z = 1; z < WORLD_SIZE - 1; z++) {
        const caveMaxHeight = getCaveMaxHeight(heightMap, x, z)

        for (let y = 2; y < caveMaxHeight; y++) {
          // 找洞穴地板：此格空氣、下方實體
          if (state[coordinateToIndex(x, y, z)] !== BlockId.AIR)
            continue
          if (state[coordinateToIndex(x, y - 1, z)] === BlockId.AIR)
            continue

          // 檢查四個水平鄰居是否有 2+ 格的向下落差
          for (const [dx, dz] of neighbors) {
            const nx = x + dx
            const nz = z + dz
            if (nx < 0 || nx >= WORLD_SIZE || nz < 0 || nz >= WORLD_SIZE)
              continue

            // 鄰居在同一高度是空氣，且下方也是空氣（落差 ≥ 2）
            if (
              state[coordinateToIndex(nx, y, nz)] === BlockId.AIR
              && state[coordinateToIndex(nx, y - 1, nz)] === BlockId.AIR
            ) {
              // 在鄰居的 y-1 填入石頭，形成斜坡台階
              state[coordinateToIndex(nx, y - 1, nz)] = BlockId.STONE
            }
          }
        }
      }
    }
  }
}

/**
 * 地板平坦化 — 填平孤立凹坑
 */
function flattenFloors(state: Uint8Array, heightMap: Uint8Array): void {
  for (let x = 1; x < WORLD_SIZE - 1; x++) {
    for (let z = 1; z < WORLD_SIZE - 1; z++) {
      const caveMaxHeight = getCaveMaxHeight(heightMap, x, z)

      for (let y = 2; y < caveMaxHeight; y++) {
        const index = coordinateToIndex(x, y, z)
        if (state[index] !== BlockId.AIR)
          continue

        const above = state[coordinateToIndex(x, y + 1, z)]
        const below = state[coordinateToIndex(x, y - 1, z)]

        // 條件：此格空氣、上方空氣、下方實體 → 這是洞穴底部的凹坑候選
        if (above !== BlockId.AIR || below === BlockId.AIR)
          continue

        // 檢查水平鄰居：至少 3 個是實體 → 填平
        let solidNeighbors = 0
        if (state[coordinateToIndex(x - 1, y, z)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x + 1, y, z)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x, y, z - 1)] !== BlockId.AIR)
          solidNeighbors++
        if (state[coordinateToIndex(x, y, z + 1)] !== BlockId.AIR)
          solidNeighbors++

        if (solidNeighbors >= 3)
          state[index] = BlockId.STONE
      }
    }
  }
}

/**
 * 完整洞穴生成管線
 *
 * 依序執行：
 * 1. 可變閾值 Noise Field 挖掘（大廳 + 通道）
 * 2. 天花板挖高（最低 4 格淨空）
 * 3. 走道加寬（消除單格寬通道）
 * 4. 階梯平滑化（消除 2+ 格落差）
 * 5. 地板平坦化（填平孤立凹坑）
 */
export function generateCaves(state: Uint8Array, heightMap: Uint8Array): void {
  carveCaves(state, heightMap)
  enforceCeilingHeight(state, heightMap)
  widenCorridors(state, heightMap)
  smoothSlopes(state, heightMap)
  flattenFloors(state, heightMap)
}
