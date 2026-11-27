import { BlockId, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { getBlock } from '../world/world-access'
import { WORLD_SIZE } from '../world/world-constants'

/**
 * 大場景地形共用的小工具
 *
 * 只有地形 worker 用。湖中島、海中沙島與林海都要問「這一格柱的地面在哪」
 * 「這一格是不是水面」，各寫一份遲早會有一份對不起來
 */

/**
 * 這一格柱最上面那一格實心方塊的高度，水、空氣與花草不算
 *
 * 從 fromY 往下找。給一個比地面高一點的起點，樹冠與門框才不會被當成地面
 */
export function findTopSolidY(state: Uint8Array, x: number, z: number, fromY: number): number {
  for (let y = fromY; y > 0; y--) {
    const blockId = getBlock(state, x, y, z)
    if (blockId !== BlockId.AIR && !isPassableBlock(blockId) && !isWaterBlock(blockId))
      return y
  }
  return 0
}

/** 這一格是不是水面：自己是水、頭上是空氣 */
export function isWaterSurface(state: Uint8Array, x: number, y: number, z: number): boolean {
  return isWaterBlock(getBlock(state, x, y, z)) && getBlock(state, x, y + 1, z) === BlockId.AIR
}

/** 四方相鄰的格柱裡，這一層有沒有水 */
export function isNextToWater(state: Uint8Array, x: number, y: number, z: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([offsetX, offsetZ]) =>
    isWaterBlock(getBlock(state, x + offsetX!, y, z + offsetZ!)))
}

/**
 * 把高度圖填成四方相鄰兩格最多差一格（只往上填，不往下削）
 *
 * 人一步只跨得上一格。噪音堆出來的丘，坡腳常常一步兩三格（開根號的圓丘在坡腳是直的），
 * 人走到那裡就卡在坎前，像撞到看不見的牆。把每一格墊到「鄰居減一」以上，
 * 坎變成一階一階的緩坡，丘的形狀不變、只是坡腳寬一點。
 *
 * 高度圖的索引是 x * WORLD_SIZE + z。順掃一次（看左、上）再倒掃一次（看右、下）就是精確解，
 * 與兩趟掃描的距離轉換同一個道理
 */
export function fillHeightStep(heightMap: Uint8Array): void {
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const index = x * WORLD_SIZE + z
      let height = heightMap[index]!
      if (x > 0)
        height = Math.max(height, heightMap[index - WORLD_SIZE]! - 1)
      if (z > 0)
        height = Math.max(height, heightMap[index - 1]! - 1)
      heightMap[index] = height
    }
  }
  for (let x = WORLD_SIZE - 1; x >= 0; x--) {
    for (let z = WORLD_SIZE - 1; z >= 0; z--) {
      const index = x * WORLD_SIZE + z
      let height = heightMap[index]!
      if (x < WORLD_SIZE - 1)
        height = Math.max(height, heightMap[index + WORLD_SIZE]! - 1)
      if (z < WORLD_SIZE - 1)
        height = Math.max(height, heightMap[index + 1]! - 1)
      heightMap[index] = height
    }
  }
}
