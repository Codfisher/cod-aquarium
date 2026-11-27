import { BLOCK_DEFS } from '../block/block-constants'
import { SAND_LEVEL } from '../garden/garden-constants'
import { WORLD_HEIGHT, WORLD_SIZE } from '../world/world-constants'

/**
 * 神遊用的快速「擋不擋」查詢
 *
 * 神遊的射線（構圖量測、視線檢查）與格子掃描一次要問幾千到幾萬格，
 * 碰撞模組的 isBlockSolid 每次都去 BLOCK_DEFS 物件查 passable（約八十奈秒），
 * 幀內一次規劃就是幾毫秒。這裡把「方塊 id → 擋不擋」做成一張表（Uint8Array），一次查詢只剩幾奈秒。
 *
 * 語意與 collision.ts 的 isBlockSolid 完全一樣：垂直方向出界不擋，水平出界是白沙地（只擋 SAND_LEVEL 以下），
 * 界內看方塊是不是 passable（沒登記的 id 當作擋住）
 */

/** 方塊 id（一個位元組）是否擋住：一就是擋住 */
const SOLID_TABLE = new Uint8Array(256)
for (let blockId = 0; blockId < SOLID_TABLE.length; blockId++)
  SOLID_TABLE[blockId] = (BLOCK_DEFS as Record<number, { passable?: boolean } | undefined>)[blockId]?.passable === true ? 0 : 1

const COLUMN_STRIDE = WORLD_HEIGHT * WORLD_SIZE

/** 這一格擋不擋（座標要是整數） */
export function isSolidAt(worldState: Uint8Array, blockX: number, blockY: number, blockZ: number): boolean {
  if (blockY < 0 || blockY >= WORLD_HEIGHT)
    return false
  if (blockX < 0 || blockX >= WORLD_SIZE || blockZ < 0 || blockZ >= WORLD_SIZE)
    return blockY <= SAND_LEVEL

  return SOLID_TABLE[worldState[blockX * COLUMN_STRIDE + blockY * WORLD_SIZE + blockZ] as number] === 1
}

/** 方塊 id 是否擋住（查表） */
export function isSolidBlockId(blockId: number): boolean {
  return SOLID_TABLE[blockId] === 1
}
