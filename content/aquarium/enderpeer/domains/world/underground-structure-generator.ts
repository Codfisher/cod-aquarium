import { BlockId } from '../block/block-constants'
import { coordinateToIndex, WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 廢棄礦坑數量 */
const MINESHAFT_COUNT = 20
/** 礦坑走廊長度範圍 */
const MINESHAFT_MIN_LENGTH = 8
const MINESHAFT_MAX_LENGTH = 15
/** 支撐柱間距 */
const PILLAR_SPACING = 4

/** 地牢房間數量 */
const DUNGEON_COUNT = 20
/** 放置嘗試上限（避免無限迴圈） */
const MAX_PLACEMENT_ATTEMPTS = 200

/** 判斷方塊是否為可挖掘的實心地層 */
function isSolidGround(blockId: number): boolean {
  return blockId === BlockId.STONE
    || blockId === BlockId.COBBLESTONE
    || blockId === BlockId.DIRT
    || blockId === BlockId.BEDROCK
    || blockId === BlockId.COAL_ORE
    || blockId === BlockId.IRON_ORE
}

/** 邊界內強制設定方塊 */
function forceSet(state: Uint8Array, x: number, y: number, z: number, blockId: BlockId) {
  if (x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT) {
    state[coordinateToIndex(x, y, z)] = blockId
  }
}

/**
 * 檢查長方體區域是否全部為實心地層
 */
function isRegionSolid(
  state: Uint8Array,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): boolean {
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE || y < 1 || y >= WORLD_HEIGHT)
          return false
        if (!isSolidGround(state[coordinateToIndex(x, y, z)]!))
          return false
      }
    }
  }
  return true
}

/**
 * 廢棄礦坑：沿水平方向延伸的走廊，帶木頭支撐柱與橫樑
 */
function placeMineshaft(state: Uint8Array, heightMap: Uint8Array): boolean {
  // 隨機起點
  const centerX = 6 + Math.floor(Math.random() * (WORLD_SIZE - 12))
  const centerZ = 6 + Math.floor(Math.random() * (WORLD_SIZE - 12))
  const surfaceY = heightMap[centerX * WORLD_SIZE + centerZ]!
  const maxFloorY = Math.max(6, surfaceY - 6)
  const centerY = 3 + Math.floor(Math.random() * (maxFloorY - 3))

  // 隨機走廊方向（沿 X 或 Z 軸）
  const alongX = Math.random() > 0.5
  const length = MINESHAFT_MIN_LENGTH + Math.floor(Math.random() * (MINESHAFT_MAX_LENGTH - MINESHAFT_MIN_LENGTH + 1))

  // 定義走廊範圍（寬 3 格、高 4 格）
  const corridorHeight = 4
  const halfWidth = 1

  // 計算走廊邊界
  const startMain = alongX ? centerX : centerZ
  const endMain = Math.min(startMain + length, WORLD_SIZE - 3)
  const crossCenter = alongX ? centerZ : centerX

  // 邊界檢查
  if (crossCenter - halfWidth < 1 || crossCenter + halfWidth >= WORLD_SIZE - 1)
    return false
  if (centerY + corridorHeight >= WORLD_HEIGHT - 2)
    return false

  // 確認走廊區域為實心
  const checkX1 = alongX ? startMain : crossCenter - halfWidth
  const checkX2 = alongX ? endMain : crossCenter + halfWidth
  const checkZ1 = alongX ? crossCenter - halfWidth : startMain
  const checkZ2 = alongX ? crossCenter + halfWidth : endMain
  if (!isRegionSolid(state, checkX1, centerY, checkZ1, checkX2, centerY + corridorHeight, checkZ2))
    return false

  // 挖掘走廊
  for (let main = startMain; main <= endMain; main++) {
    for (let cross = -halfWidth; cross <= halfWidth; cross++) {
      const bx = alongX ? main : crossCenter + cross
      const bz = alongX ? crossCenter + cross : main
      for (let dy = 0; dy < corridorHeight; dy++) {
        forceSet(state, bx, centerY + dy, bz, BlockId.AIR)
      }
    }
  }

  // 鋪設地板（雲杉木板，模擬軌道）
  for (let main = startMain; main <= endMain; main++) {
    const bx = alongX ? main : crossCenter
    const bz = alongX ? crossCenter : main
    forceSet(state, bx, centerY, bz, BlockId.SPRUCE_PLANKS)
  }

  // 支撐柱與橫樑
  for (let main = startMain; main <= endMain; main += PILLAR_SPACING) {
    // 隨機決定這組柱子是否「倒塌」
    const collapsed = Math.random() < 0.25
    const pillarHeight = collapsed ? (1 + Math.floor(Math.random() * 2)) : 3

    for (const side of [-halfWidth, halfWidth]) {
      const pillarX = alongX ? main : crossCenter + side
      const pillarZ = alongX ? crossCenter + side : main
      for (let dy = 0; dy < pillarHeight; dy++) {
        forceSet(state, pillarX, centerY + dy, pillarZ, BlockId.OAK_LOG)
      }
    }

    // 頂部橫樑（未倒塌時才放）
    if (!collapsed) {
      for (let cross = -halfWidth; cross <= halfWidth; cross++) {
        const beamX = alongX ? main : crossCenter + cross
        const beamZ = alongX ? crossCenter + cross : main
        forceSet(state, beamX, centerY + 3, beamZ, BlockId.WOOD)
      }
    }
  }

  // 牆壁隨機嵌入礦脈
  for (let main = startMain; main <= endMain; main++) {
    for (const side of [-halfWidth - 1, halfWidth + 1]) {
      const wallX = alongX ? main : crossCenter + side
      const wallZ = alongX ? crossCenter + side : main
      if (wallX < 0 || wallX >= WORLD_SIZE || wallZ < 0 || wallZ >= WORLD_SIZE)
        continue
      for (let dy = 0; dy < corridorHeight; dy++) {
        const index = coordinateToIndex(wallX, centerY + dy, wallZ)
        if (state[index] === BlockId.STONE) {
          const oreRoll = Math.random()
          if (oreRoll < 0.08) {
            state[index] = BlockId.IRON_ORE
          }
          else if (oreRoll < 0.2) {
            state[index] = BlockId.COAL_ORE
          }
        }
      }
    }
  }

  return true
}

/** 地牢房間尺寸 */
interface DungeonSize {
  width: number;
  depth: number;
  height: number;
}

/** 隨機選擇地牢大小 */
function randomDungeonSize(): DungeonSize {
  if (Math.random() < 0.5) {
    return { width: 5, depth: 5, height: 4 }
  }
  return { width: 7, depth: 7, height: 5 }
}

/**
 * 地牢房間：封閉石磚房間，內有裝飾與家具
 */
function placeDungeon(state: Uint8Array, heightMap: Uint8Array): boolean {
  const size = randomDungeonSize()
  const halfWidth = Math.floor(size.width / 2)
  const halfDepth = Math.floor(size.depth / 2)

  // 隨機位置
  const centerX = halfWidth + 2 + Math.floor(Math.random() * (WORLD_SIZE - size.width - 4))
  const centerZ = halfDepth + 2 + Math.floor(Math.random() * (WORLD_SIZE - size.depth - 4))
  const surfaceY = heightMap[centerX * WORLD_SIZE + centerZ]!
  const maxFloorY = Math.max(6, surfaceY - 6)
  const floorY = 3 + Math.floor(Math.random() * (maxFloorY - 3))

  // 邊界檢查
  const x1 = centerX - halfWidth
  const x2 = centerX + halfWidth
  const z1 = centerZ - halfDepth
  const z2 = centerZ + halfDepth
  if (x1 < 1 || x2 >= WORLD_SIZE - 1 || z1 < 1 || z2 >= WORLD_SIZE - 1)
    return false
  if (floorY + size.height + 1 >= WORLD_HEIGHT - 2)
    return false

  // 確認區域為實心（包含牆壁厚度）
  if (!isRegionSolid(state, x1 - 1, floorY - 1, z1 - 1, x2 + 1, floorY + size.height, z2 + 1))
    return false

  // 地板：苔石
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      forceSet(state, x, floorY, z, BlockId.MOSSY_COBBLESTONE)
    }
  }

  // 牆壁：混合石磚、苔石磚、裂石磚
  for (let dy = 1; dy <= size.height; dy++) {
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        if (x === x1 || x === x2 || z === z1 || z === z2) {
          const wallRoll = Math.random()
          let wallBlock: BlockId
          if (wallRoll < 0.55) {
            wallBlock = BlockId.STONE_BRICKS
          }
          else if (wallRoll < 0.8) {
            wallBlock = BlockId.MOSSY_STONE_BRICKS
          }
          else {
            wallBlock = BlockId.CRACKED_STONE_BRICKS
          }
          forceSet(state, x, floorY + dy, z, wallBlock)
        }
        else {
          // 清空內部
          forceSet(state, x, floorY + dy, z, BlockId.AIR)
        }
      }
    }
  }

  // 天花板：石磚
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      forceSet(state, x, floorY + size.height + 1, z, BlockId.STONE_BRICKS)
    }
  }

  // 四角裝飾柱：鑿石磚
  for (let dy = 1; dy <= size.height; dy++) {
    forceSet(state, x1, floorY + dy, z1, BlockId.CHISELED_STONE_BRICKS)
    forceSet(state, x2, floorY + dy, z1, BlockId.CHISELED_STONE_BRICKS)
    forceSet(state, x1, floorY + dy, z2, BlockId.CHISELED_STONE_BRICKS)
    forceSet(state, x2, floorY + dy, z2, BlockId.CHISELED_STONE_BRICKS)
  }

  // 門洞：隨機一面牆中央挖出 2 格高入口
  const doorWall = Math.floor(Math.random() * 4)
  let doorX = centerX
  let doorZ = centerZ
  if (doorWall === 0)
    doorZ = z1 // -Z 面
  else if (doorWall === 1)
    doorZ = z2 // +Z 面
  else if (doorWall === 2)
    doorX = x1 // -X 面
  else
    doorX = x2 // +X 面
  forceSet(state, doorX, floorY + 1, doorZ, BlockId.AIR)
  forceSet(state, doorX, floorY + 2, doorZ, BlockId.AIR)

  // 牆上觀察窗（玻璃）：門對面的牆
  let windowX = centerX
  let windowZ = centerZ
  if (doorWall === 0)
    windowZ = z2
  else if (doorWall === 1)
    windowZ = z1
  else if (doorWall === 2)
    windowX = x2
  else
    windowX = x1
  forceSet(state, windowX, floorY + 2, windowZ, BlockId.GLASS)

  // 室內家具：靠牆角落放置
  const innerX1 = x1 + 1
  const innerX2 = x2 - 1
  const innerZ1 = z1 + 1
  const innerZ2 = z2 - 1
  const furnitureOptions: BlockId[] = [
    BlockId.BARREL,
    BlockId.BOOKSHELF,
    BlockId.CRAFTING_TABLE,
    BlockId.FURNACE,
  ]
  const corners: [number, number][] = [
    [innerX1, innerZ1],
    [innerX2, innerZ1],
    [innerX1, innerZ2],
    [innerX2, innerZ2],
  ]
  for (const [cornerX, cornerZ] of corners) {
    if (Math.random() < 0.7) {
      const furniture = furnitureOptions[Math.floor(Math.random() * furnitureOptions.length)]!
      forceSet(state, cornerX, floorY + 1, cornerZ, furniture)
    }
  }

  return true
}

/**
 * 生成地下結構（廢棄礦坑 + 地牢房間）
 */
export function generateUndergroundStructures(state: Uint8Array, heightMap: Uint8Array): void {
  // 廢棄礦坑
  let mineshaftPlaced = 0
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && mineshaftPlaced < MINESHAFT_COUNT; attempt++) {
    if (placeMineshaft(state, heightMap))
      mineshaftPlaced++
  }

  // 地牢房間
  let dungeonPlaced = 0
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && dungeonPlaced < DUNGEON_COUNT; attempt++) {
    if (placeDungeon(state, heightMap))
      dungeonPlaced++
  }
}
