import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 強制設定方塊（邊界內直接覆寫） */
function forceSet(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId) {
  if (x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT) {
    state[coordinateToIndex(x, y, z)] = blockId
  }
}

/**
 * 為建築底盤填充地基
 * 對底面每一格 (x,z)，從 floorY 往下填充到碰到實體方塊為止
 */
function fillFoundation(
  state: Uint8Array,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  floorY: number,
  blockId: BlockId,
) {
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      for (let y = floorY; y >= 1; y--) {
        if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y >= WORLD_HEIGHT)
          continue
        const index = coordinateToIndex(x, y, z)
        if (state[index] !== BlockId.AIR)
          break
        state[index] = blockId
      }
    }
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
export function placeCottage(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 2
  const x2 = x + 2
  const z1 = z - 2
  const z2 = z + 2
  const floorY = sy + 1

  // 地基填充
  fillFoundation(state, x1, z1, x2, z2, floorY - 1, BlockId.COBBLESTONE)
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

  // 室內裝飾：書架靠牆、工作台角落、熔爐
  forceSet(state, x1 + 1, floorY + 1, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x2 - 1, floorY + 1, z1 + 1, BlockId.CRAFTING_TABLE)
  forceSet(state, x2 - 1, floorY + 1, z2 - 1, BlockId.FURNACE)

  // 背面窗戶
  forceSet(state, x, floorY + 2, z1, BlockId.GLASS)

  // 外部裝飾：門旁木桶、屋側乾草堆
  forceSet(state, x + 1, floorY + 1, z2, BlockId.BARREL)
  forceSet(state, x1 - 1, floorY + 1, z1, BlockId.HAY_BLOCK)

  // 煙囪（鵝卵石，屋頂角落延伸 2 格）
  forceSet(state, x2, floorY + 5, z1, BlockId.COBBLESTONE)
  forceSet(state, x2, floorY + 6, z1, BlockId.COBBLESTONE)
}

/**
 * 磚房：5×7 底面、4 格高、磚牆鵝卵石地板
 * 石磚裝飾帶、深色橡木原木框架、室內書架
 */
export function placeBrickHouse(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 2
  const x2 = x + 2
  const z1 = z - 3
  const z2 = z + 3
  const floorY = sy + 1

  // 地基填充
  fillFoundation(state, x1, z1, x2, z2, floorY - 1, BlockId.COBBLESTONE)
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

  // 室內裝飾：沿牆書架、熔爐、木桶
  forceSet(state, x1 + 1, floorY + 1, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x1 + 1, floorY + 2, z1 + 1, BlockId.BOOKSHELF)
  forceSet(state, x2 - 1, floorY + 1, z1 + 1, BlockId.CRAFTING_TABLE)
  forceSet(state, x2 - 1, floorY + 1, z2 - 1, BlockId.FURNACE)
  forceSet(state, x1 + 1, floorY + 1, z2 - 1, BlockId.BARREL)

  // 底部裝飾帶改用鑿石磚點綴四角
  forceSet(state, x1, floorY + 1, z1, BlockId.CHISELED_STONE_BRICKS)
  forceSet(state, x2, floorY + 1, z1, BlockId.CHISELED_STONE_BRICKS)
  forceSet(state, x1, floorY + 1, z2, BlockId.CHISELED_STONE_BRICKS)
  forceSet(state, x2, floorY + 1, z2, BlockId.CHISELED_STONE_BRICKS)

  // 煙囪（磚塊，屋頂角落延伸 2 格）
  forceSet(state, x1, floorY + 6, z1, BlockId.BRICKS)
  forceSet(state, x1, floorY + 7, z1, BlockId.BRICKS)

  // 門前台階（鵝卵石）
  forceSet(state, x, floorY, z2 + 1, BlockId.COBBLESTONE)
}

/**
 * 瞭望塔：3×3 底面、石磚牆、兩層樓高，頂部有觀景台
 * 深色橡木原木邊角、雲杉木板隔層
 */
export function placeWatchtower(state: Uint8Array, x: number, sy: number, z: number) {
  const x1 = x - 1
  const x2 = x + 1
  const z1 = z - 1
  const z2 = z + 1
  const floorY = sy + 1

  // 地基填充（苔石）
  fillFoundation(state, x1, z1, x2, z2, floorY - 1, BlockId.MOSSY_COBBLESTONE)
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
  // 觀景台圍欄（四角鑿石磚柱、其餘石磚）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
        const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2
        forceSet(state, x + dx, floorY + 9, z + dz, isCorner ? BlockId.CHISELED_STONE_BRICKS : BlockId.STONE_BRICKS)
      }
    }
  }
}

/**
 * 水井：3×3 鵝卵石圍牆、中央挖深 3 格水坑（用玻璃模擬水面）
 * 上方有深色橡木原木支架與雲杉木板屋頂
 */
export function placeWell(state: Uint8Array, x: number, sy: number, z: number) {
  const floorY = sy + 1

  // 地基填充（苔石，增加古老感）
  fillFoundation(state, x - 1, z - 1, x + 1, z + 1, floorY - 1, BlockId.MOSSY_COBBLESTONE)

  // 圍牆（1 格高鵝卵石）
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0)
        continue
      forceSet(state, x + dx, floorY, z + dz, BlockId.COBBLESTONE)
    }
  }

  // 中央挖深坑（3 格深）
  for (let dy = 0; dy >= -3; dy--)
    forceSet(state, x, floorY + dy, z, BlockId.AIR)

  // 坑底放玻璃模擬水面
  forceSet(state, x, floorY - 3, z, BlockId.GLASS)

  // 四角支架柱（深色橡木原木，3 格高）
  for (let dy = 1; dy <= 3; dy++) {
    forceSet(state, x - 1, floorY + dy, z - 1, BlockId.DARK_OAK_LOG)
    forceSet(state, x + 1, floorY + dy, z - 1, BlockId.DARK_OAK_LOG)
    forceSet(state, x - 1, floorY + dy, z + 1, BlockId.DARK_OAK_LOG)
    forceSet(state, x + 1, floorY + dy, z + 1, BlockId.DARK_OAK_LOG)
  }

  // 屋頂（雲杉木板，5×5）
  fillBox(state, x - 2, floorY + 4, z - 2, x + 2, floorY + 4, z + 2, BlockId.SPRUCE_PLANKS)

  // 井旁裝飾：木桶 + 工作台
  forceSet(state, x + 2, floorY + 1, z, BlockId.BARREL)
  forceSet(state, x - 2, floorY + 1, z, BlockId.CRAFTING_TABLE)

  // 圍牆四角加苔鵝卵石裝飾
  forceSet(state, x - 1, floorY, z - 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x + 1, floorY, z - 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x - 1, floorY, z + 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x + 1, floorY, z + 1, BlockId.MOSSY_COBBLESTONE)
}

/**
 * 路燈：深色橡木原木柱 4 格高，頂部玻璃燈籠
 */
export function placeStreetLamp(state: Uint8Array, x: number, sy: number, z: number) {
  const floorY = sy + 1

  // 底座（鵝卵石）
  forceSet(state, x, floorY, z, BlockId.COBBLESTONE)

  // 柱子（深色橡木原木，3 格高）
  for (let dy = 1; dy <= 3; dy++) {
    forceSet(state, x, floorY + dy, z, BlockId.DARK_OAK_LOG)
  }

  // 燈籠頂部（玻璃 + 四角石磚裝飾）
  forceSet(state, x, floorY + 4, z, BlockId.GLASS)
  forceSet(state, x - 1, floorY + 4, z, BlockId.STONE_BRICKS)
  forceSet(state, x + 1, floorY + 4, z, BlockId.STONE_BRICKS)
  forceSet(state, x, floorY + 4, z - 1, BlockId.STONE_BRICKS)
  forceSet(state, x, floorY + 4, z + 1, BlockId.STONE_BRICKS)

  // 尖頂
  forceSet(state, x, floorY + 5, z, BlockId.STONE_BRICKS)
}

/**
 * 廢墟：3×3~5×5 隨機殘破石磚牆壁，苔石地板
 * 模擬被遺棄的古代建築遺跡
 */
export function placeRuin(state: Uint8Array, x: number, sy: number, z: number) {
  const floorY = sy + 1
  const halfSize = Math.random() < 0.5 ? 1 : 2
  const x1 = x - halfSize
  const x2 = x + halfSize
  const z1 = z - halfSize
  const z2 = z + halfSize

  // 苔石地板
  fillBox(state, x1, floorY, z1, x2, floorY, z2, BlockId.MOSSY_COBBLESTONE)
  fillFoundation(state, x1, z1, x2, z2, floorY - 1, BlockId.COBBLESTONE)

  // 殘破牆壁（隨機高度 1~3 格，隨機缺口）
  for (let bx = x1; bx <= x2; bx++) {
    for (let bz = z1; bz <= z2; bz++) {
      if (bx === x1 || bx === x2 || bz === z1 || bz === z2) {
        if (Math.random() < 0.3)
          continue // 30% 機率缺口
        const wallHeight = 1 + Math.floor(Math.random() * 3)
        for (let dy = 1; dy <= wallHeight; dy++) {
          const wallRoll = Math.random()
          let wallBlock: BlockId
          if (wallRoll < 0.4) {
            wallBlock = BlockId.MOSSY_STONE_BRICKS
          }
          else if (wallRoll < 0.7) {
            wallBlock = BlockId.CRACKED_STONE_BRICKS
          }
          else {
            wallBlock = BlockId.STONE_BRICKS
          }
          forceSet(state, bx, floorY + dy, bz, wallBlock)
        }
      }
    }
  }

  // 角落隨機放置藤蔓般的苔石
  if (Math.random() < 0.5) {
    forceSet(state, x1, floorY + 1, z1, BlockId.MOSSY_COBBLESTONE)
  }
  if (Math.random() < 0.5) {
    forceSet(state, x2, floorY + 1, z2, BlockId.MOSSY_COBBLESTONE)
  }
}

/**
 * 農田棚：3×2 小木棚，旁邊堆放乾草堆
 */
export function placeFarmShed(state: Uint8Array, x: number, sy: number, z: number) {
  const floorY = sy + 1

  // 地板（雲杉木板）
  fillBox(state, x - 1, floorY, z, x + 1, floorY, z + 1, BlockId.SPRUCE_PLANKS)

  // 後牆（橡木板，2 格高）
  for (let dx = -1; dx <= 1; dx++) {
    forceSet(state, x + dx, floorY + 1, z, BlockId.WOOD)
    forceSet(state, x + dx, floorY + 2, z, BlockId.WOOD)
  }

  // 兩側柱子（橡木原木）
  forceSet(state, x - 1, floorY + 1, z + 1, BlockId.OAK_LOG)
  forceSet(state, x + 1, floorY + 1, z + 1, BlockId.OAK_LOG)

  // 屋頂（雲杉木板，向前延伸）
  fillBox(state, x - 1, floorY + 3, z - 1, x + 1, floorY + 3, z + 1, BlockId.SPRUCE_PLANKS)

  // 棚內裝飾：木桶 + 工作台
  forceSet(state, x - 1, floorY + 1, z, BlockId.BARREL)
  forceSet(state, x + 1, floorY + 1, z, BlockId.CRAFTING_TABLE)

  // 旁邊乾草堆（1~2 格高）
  forceSet(state, x - 2, floorY + 1, z, BlockId.HAY_BLOCK)
  forceSet(state, x - 2, floorY + 1, z + 1, BlockId.HAY_BLOCK)
  if (Math.random() < 0.5) {
    forceSet(state, x - 2, floorY + 2, z, BlockId.HAY_BLOCK)
  }
}

/**
 * 石碑：鑿石磚紀念碑，底座石磚，帶裝飾
 */
export function placeMonument(state: Uint8Array, x: number, sy: number, z: number) {
  const floorY = sy + 1

  // 底座（石磚 3×3）
  fillBox(state, x - 1, floorY, z - 1, x + 1, floorY, z + 1, BlockId.STONE_BRICKS)

  // 中央柱（鑿石磚，3 格高）
  for (let dy = 1; dy <= 3; dy++) {
    forceSet(state, x, floorY + dy, z, BlockId.CHISELED_STONE_BRICKS)
  }

  // 頂冠（石磚十字）
  forceSet(state, x, floorY + 4, z, BlockId.STONE_BRICKS)
  forceSet(state, x - 1, floorY + 3, z, BlockId.STONE_BRICKS)
  forceSet(state, x + 1, floorY + 3, z, BlockId.STONE_BRICKS)
  forceSet(state, x, floorY + 3, z - 1, BlockId.STONE_BRICKS)
  forceSet(state, x, floorY + 3, z + 1, BlockId.STONE_BRICKS)

  // 底座四角裝飾（苔鵝卵石）
  forceSet(state, x - 1, floorY + 1, z - 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x + 1, floorY + 1, z - 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x - 1, floorY + 1, z + 1, BlockId.MOSSY_COBBLESTONE)
  forceSet(state, x + 1, floorY + 1, z + 1, BlockId.MOSSY_COBBLESTONE)
}

/** 建築所需的最大半徑（用於邊界檢查） */
const BUILDING_MARGIN = 5
/** 建築所需的最大高度 */
const BUILDING_MAX_HEIGHT = 10

/**
 * 在指定位置放置隨機樣式的建築物
 * 回傳所放置的建築類型名稱，若未放置則傳回 null
 */
export function placeBuilding(state: Uint8Array, x: number, surfaceY: number, z: number): string | null {
  // 邊界檢查
  if (x < BUILDING_MARGIN || x >= WORLD_SIZE - BUILDING_MARGIN
    || z < BUILDING_MARGIN || z >= WORLD_SIZE - BUILDING_MARGIN
    || surfaceY + BUILDING_MAX_HEIGHT >= WORLD_HEIGHT) {
    return null
  }

  const variant = Math.random()
  if (variant < 0.15) {
    placeCottage(state, x, surfaceY, z)
    return 'cottage'
  }
  else if (variant < 0.28) {
    placeBrickHouse(state, x, surfaceY, z)
    return 'brick_house'
  }
  else if (variant < 0.38) {
    placeWatchtower(state, x, surfaceY, z)
    return 'watchtower'
  }
  else if (variant < 0.48) {
    placeWell(state, x, surfaceY, z)
    return 'well'
  }
  else if (variant < 0.63) {
    placeStreetLamp(state, x, surfaceY, z)
    return 'street_lamp'
  }
  else if (variant < 0.76) {
    placeRuin(state, x, surfaceY, z)
    return 'ruin'
  }
  else if (variant < 0.88) {
    placeFarmShed(state, x, surfaceY, z)
    return 'farm_shed'
  }
  else {
    placeMonument(state, x, surfaceY, z)
    return 'monument'
  }
}
