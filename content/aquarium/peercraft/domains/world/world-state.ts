import { fbm2D, fbm3D } from '../../utils/noise'
import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE, WORLD_VOLUME } from './world-constants'

/**
 * 建立空白世界狀態（全為 AIR）
 */
export function createWorldState(): Uint8Array {
  return new Uint8Array(WORLD_VOLUME)
}

/**
 * 高級地形生成：
 * - 平原 (Plains)：主體地形，起伏平緩，偶爾有沙坑。
 * - 峽谷 (Canyons)：利用 Noise 產生的深溝地形。
 * - 使用 3D FBM Noise 生成地下洞穴。
 */
export function generateTerrain(state: Uint8Array): void {
  const baseHeight = 24 // 較高的基準面，方便挖掘峽谷
  const plainsVariation = 4 // 平原起伏
  const canyonDepth = 20 // 峽谷深度

  const heightMap = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  // 第一階段：基礎地形與生態系
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      /** 平原噪音 */
      const plainsNoise = fbm2D(x * 0.02, z * 0.02, 3, 0.5)

      /**
       * 峽谷噪音：利用 abs(noise) 產生「脊線」感，反轉後即為「峽谷」
       * 透過 ridged noise 效果來模擬河床或裂縫
       */
      const canyonNoiseRaw = fbm2D(x * 0.01, z * 0.01, 2, 0.5)
      const canyonStrength = 1.0 - Math.abs(canyonNoiseRaw) // 靠近 1 表示在峽谷中

      // 平原基礎高度
      let height = baseHeight + Math.floor(plainsNoise * plainsVariation)

      // 如果峽谷強度夠高，則向下挖掘 (門檻越低，峽谷越寬)
      if (canyonStrength > 0.93) {
        const factor = (canyonStrength - 0.93) / 0.07 // 0 ~ 1
        height -= Math.floor(factor * canyonDepth)
      }

      const clampedHeight = Math.max(2, Math.min(height, WORLD_HEIGHT - 2))
      heightMap[x * WORLD_SIZE + z] = clampedHeight

      // 判斷是否為「沙坑」 (僅限平原表面，且與峽谷保持距離)
      const isSandPit = canyonStrength <= 0.93 && fbm2D(x * 0.1, z * 0.1, 2, 0.5) > 0.5

      const isCanyon = canyonStrength > 0.93

      // 判斷比例與渲染屬性
      for (let y = 0; y < clampedHeight; y++) {
        const index = coordinateToIndex(x, y, z)

        if (y === 0) {
          state[index] = BlockId.BEDROCK
        }
        else if (y < clampedHeight - 5) {
          state[index] = Math.random() > 0.95 ? BlockId.COBBLESTONE : BlockId.STONE
        }
        else if (y < clampedHeight - 1) {
          state[index] = isSandPit ? BlockId.SAND : BlockId.DIRT
        }
        else {
          // 表面：沙坑或峽谷底部顯示沙子/石頭，平原顯示草地
          if (isSandPit) {
            state[index] = BlockId.SAND
          }
          else if (isCanyon) {
            // 峽谷底部：隨機使用石頭或鵝卵石 (不再有沙子)
            const rand = Math.random()
            state[index] = rand > 0.95 ? BlockId.COBBLESTONE : BlockId.STONE
          }
          else {
            state[index] = BlockId.GRASS
          }
        }
      }

      // 樹木生成 (避開沙坑、峽谷與太深的地方)
      const surfaceY = clampedHeight - 1
      if (!isSandPit && !isCanyon && state[coordinateToIndex(x, surfaceY, z)] === BlockId.GRASS && Math.random() < 0.008) {
        if (x > 2 && x < WORLD_SIZE - 2 && z > 2 && z < WORLD_SIZE - 2 && surfaceY + 5 < WORLD_HEIGHT) {
          state[coordinateToIndex(x, surfaceY + 1, z)] = BlockId.OAK_LOG
          state[coordinateToIndex(x, surfaceY + 2, z)] = BlockId.OAK_LOG
          state[coordinateToIndex(x, surfaceY + 3, z)] = BlockId.OAK_LOG
          state[coordinateToIndex(x, surfaceY + 4, z)] = BlockId.OAK_LEAVES
          state[coordinateToIndex(x + 1, surfaceY + 3, z)] = BlockId.OAK_LEAVES
          state[coordinateToIndex(x - 1, surfaceY + 3, z)] = BlockId.OAK_LEAVES
          state[coordinateToIndex(x, surfaceY + 3, z + 1)] = BlockId.OAK_LEAVES
          state[coordinateToIndex(x, surfaceY + 3, z - 1)] = BlockId.OAK_LEAVES
        }
      }
    }
  }

  // 第二階段：挖掘地下洞穴 (3D Noise)
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const surfaceHeight = heightMap[x * WORLD_SIZE + z]!
      // 限制洞穴最高只能挖到地表下方 5 層，確保地殼厚度
      const caveMaxHeight = Math.min(surfaceHeight - 5, WORLD_HEIGHT - 6)

      for (let y = 1; y < caveMaxHeight; y++) {
        const index = coordinateToIndex(x, y, z)
        if (state[index] === BlockId.STONE || state[index] === BlockId.COBBLESTONE || state[index] === BlockId.DIRT) {
          const caveNoise = fbm3D(x * 0.05, y * 0.08, z * 0.05, 2, 0.5)
          if (caveNoise > 0.35) {
            state[index] = BlockId.AIR
          }
        }
      }
    }
  }
}

/**
 * 取得指定 X, Z 座標上最高的非空氣方塊的 Y 座標準位
 * 找不到則回傳 WORLD_HEIGHT
 */
export function getHighestBlockY(state: Uint8Array, x: number, z: number): number {
  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE)
    return WORLD_HEIGHT

  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    const index = coordinateToIndex(x, y, z)
    if (state[index] !== BlockId.AIR) {
      return y
    }
  }
  return WORLD_HEIGHT
}
