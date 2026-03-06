import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 強制設定方塊（邊界內直接覆寫） */
function forceSet(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId) {
  if (x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT) {
    state[coordinateToIndex(x, y, z)] = blockId
  }
}

/** 填充長方體區域 */
function fillBox(
  state: Uint8Array,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  blockId: BlockId,
) {
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        forceSet(state, x, y, z, blockId)
      }
    }
  }
}

/** 填充空心牆壁（只填外殼，內部不動） */
function fillWalls(
  state: Uint8Array,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  blockId: BlockId,
) {
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        if (x === x1 || x === x2 || z === z1 || z === z2) {
          forceSet(state, x, y, z, blockId)
        }
      }
    }
  }
}

/**
 * 小木屋：5×5 底面、3 格高牆壁、木板地板與屋頂
 * 正面（+Z 方向）有門，兩側有窗
 * 深色橡木原木作為框架柱子，雲杉木板地板，書架與工作台裝飾
 */
function placeCottage(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 2
  const x2 = x + 2
  const z1 = z - 2
  const z2 = z + 2
  const floorY = sy + 1

  // 地板（雲杉木板）
  fillBox(state, x1, floorY, z1, x2, floorY, z2, BlockId.SPRUCE_PLANKS)
  // 牆壁（橡木板）
  fillWalls(state, x1, floorY + 1, z1, x2, floorY + 3, z2, BlockId.WOOD)
  // 清空內部
  fillBox(state, x1 + 1, floorY + 1, z1 + 1, x2 - 1, floorY + 3, z2 - 1, BlockId.AIR)

  // 四角柱子（深色橡木原木）
  for (let dy = 1; dy <= 3; dy++) {
    forceSet(state, x1, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x1, floorY + dy, z2, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z2, BlockId.DARK_OAK_LOG)
  }

  // 屋頂（深色橡木板）
  fillBox(state, x1, floorY + 4, z1, x2, floorY + 4, z2, BlockId.DARK_OAK_PLANKS)

  // 門（+Z 面中央，2 格高）
  forceSet(state, x, floorY + 1, z2, BlockId.AIR)
  forceSet(state, x, floorY + 2, z2, BlockId.AIR)

  // 窗戶（左右兩側各一個）
  forceSet(state, x1, floorY + 2, z, BlockId.GLASS)
  forceSet(state, x2, floorY + 2, z, BlockId.GLASS)

  // 室內裝飾：書架靠牆、工作台角落
  forceSet(state, x1 + 1, floorY + 1, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x2 - 1, floorY + 1, z1 + 1, BlockId.CRAFTING_TABLE)
}

/**
 * 磚房：5×7 底面、4 格高、磚牆鵝卵石地板
 * 石磚裝飾帶、深色橡木原木框架、室內書架
 */
function placeBrickHouse(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 2
  const x2 = x + 2
  const z1 = z - 3
  const z2 = z + 3
  const floorY = sy + 1

  // 地板
  fillBox(state, x1, floorY, z1, x2, floorY, z2, BlockId.COBBLESTONE)
  // 牆壁（磚牆）
  fillWalls(state, x1, floorY + 1, z1, x2, floorY + 4, z2, BlockId.BRICKS)
  // 清空內部
  fillBox(state, x1 + 1, floorY + 1, z1 + 1, x2 - 1, floorY + 4, z2 - 1, BlockId.AIR)

  // 底部一圈石磚裝飾帶（地基）
  fillWalls(state, x1, floorY + 1, z1, x2, floorY + 1, z2, BlockId.STONE_BRICKS)
  // 頂部一圈石磚裝飾帶（簷口）
  fillWalls(state, x1, floorY + 4, z1, x2, floorY + 4, z2, BlockId.STONE_BRICKS)

  // 四角柱子（深色橡木原木）
  for (let dy = 1; dy <= 4; dy++) {
    forceSet(state, x1, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x1, floorY + dy, z2, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z2, BlockId.DARK_OAK_LOG)
  }

  // 屋頂（石磚）
  fillBox(state, x1, floorY + 5, z1, x2, floorY + 5, z2, BlockId.STONE_BRICKS)

  // 門（+Z 面）
  forceSet(state, x, floorY + 1, z2, BlockId.AIR)
  forceSet(state, x, floorY + 2, z2, BlockId.AIR)

  // 正面窗戶
  forceSet(state, x - 1, floorY + 2, z2, BlockId.GLASS)
  forceSet(state, x + 1, floorY + 2, z2, BlockId.GLASS)
  forceSet(state, x - 1, floorY + 3, z2, BlockId.GLASS)
  forceSet(state, x + 1, floorY + 3, z2, BlockId.GLASS)

  // 側面窗戶
  forceSet(state, x1, floorY + 2, z - 1, BlockId.GLASS)
  forceSet(state, x1, floorY + 2, z + 1, BlockId.GLASS)
  forceSet(state, x2, floorY + 2, z - 1, BlockId.GLASS)
  forceSet(state, x2, floorY + 2, z + 1, BlockId.GLASS)

  // 背面窗戶
  forceSet(state, x, floorY + 2, z1, BlockId.GLASS)
  forceSet(state, x, floorY + 3, z1, BlockId.GLASS)

  // 室內裝飾：沿牆書架
  forceSet(state, x1 + 1, floorY + 1, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x1 + 1, floorY + 2, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x2 - 1, floorY + 1, z1 + 1, BlockId.CRAFTING_TABLE)
}

/**
 * 瞭望塔：3×3 底面、石磚牆、兩層樓高，頂部有觀景台
 * 深色橡木原木邊角、雲杉木板隔層
 */
function placeWatchtower(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 1
  const x2 = x + 1
  const z1 = z - 1
  const z2 = z + 1
  const floorY = sy + 1

  // 地板（石磚）
  fillBox(state, x1, floorY, z1, x2, floorY, z2, BlockId.STONE_BRICKS)
  // 第一層牆壁（石磚）
  fillWalls(state, x1, floorY + 1, z1, x2, floorY + 3, z2, BlockId.STONE_BRICKS)
  // 清空第一層內部
  forceSet(state, x, floorY + 1, z, BlockId.AIR)
  forceSet(state, x, floorY + 2, z, BlockId.AIR)
  forceSet(state, x, floorY + 3, z, BlockId.AIR)

  // 四角深色橡木原木（第一層）
  for (let dy = 1; dy <= 3; dy++) {
    forceSet(state, x1, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x1, floorY + dy, z2, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z2, BlockId.DARK_OAK_LOG)
  }

  // 隔層地板（雲杉木板）
  fillBox(state, x1, floorY + 4, z1, x2, floorY + 4, z2, BlockId.SPRUCE_PLANKS)
  // 第二層牆壁（石磚）
  fillWalls(state, x1, floorY + 5, z1, x2, floorY + 7, z2, BlockId.STONE_BRICKS)
  // 清空第二層內部
  forceSet(state, x, floorY + 5, z, BlockId.AIR)
  forceSet(state, x, floorY + 6, z, BlockId.AIR)
  forceSet(state, x, floorY + 7, z, BlockId.AIR)

  // 四角深色橡木原木（第二層）
  for (let dy = 5; dy <= 7; dy++) {
    forceSet(state, x1, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z1, BlockId.DARK_OAK_LOG)
    forceSet(state, x1, floorY + dy, z2, BlockId.DARK_OAK_LOG)
    forceSet(state, x2, floorY + dy, z2, BlockId.DARK_OAK_LOG)
  }

  // 門（+Z 面，一樓）
  forceSet(state, x, floorY + 1, z2, BlockId.AIR)
  forceSet(state, x, floorY + 2, z2, BlockId.AIR)

  // 第二層窗戶（四面各一個）
  forceSet(state, x, floorY + 6, z2, BlockId.GLASS)
  forceSet(state, x, floorY + 6, z1, BlockId.GLASS)
  forceSet(state, x1, floorY + 6, z, BlockId.GLASS)
  forceSet(state, x2, floorY + 6, z, BlockId.GLASS)

  // 頂部觀景台（5×5 平台，深色橡木板）
  fillBox(state, x - 2, floorY + 8, z - 2, x + 2, floorY + 8, z + 2, BlockId.DARK_OAK_PLANKS)
  // 觀景台圍欄（深色橡木原木柱）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
        forceSet(state, x + dx, floorY + 9, z + dz, BlockId.DARK_OAK_LOG)
      }
    }
  }
}

/** 房屋所需的最大半徑（用於邊界檢查） */
const HOUSE_MARGIN = 5
/** 房屋所需的最大高度 */
const HOUSE_MAX_HEIGHT = 10

/**
 * 在指定位置放置隨機樣式的小房子
 */
export function placeHouse(state: Uint8Array, x: number, surfaceY: number, z: number) {
  // 邊界檢查
  if (x < HOUSE_MARGIN || x >= WORLD_SIZE - HOUSE_MARGIN
    || z < HOUSE_MARGIN || z >= WORLD_SIZE - HOUSE_MARGIN
    || surfaceY + HOUSE_MAX_HEIGHT >= WORLD_HEIGHT) {
    return
  }

  const variant = Math.random()
  if (variant < 0.4) {
    placeCottage(state, x, surfaceY, z)
  }
  else if (variant < 0.75) {
    placeBrickHouse(state, x, surfaceY, z)
  }
  else {
    placeWatchtower(state, x, surfaceY, z)
  }
}
