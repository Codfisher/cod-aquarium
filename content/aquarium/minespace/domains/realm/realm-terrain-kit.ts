import { BlockId, isPassableBlock, isWaterBlock } from '../block/block-constants'
import { getBlock } from '../world/world-access'

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
