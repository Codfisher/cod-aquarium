/** 世界大小（每軸格數） */
export const WORLD_SIZE = 64

/** 世界總方塊數 */
export const WORLD_VOLUME = WORLD_SIZE * WORLD_SIZE * WORLD_SIZE

/** 方塊 ID 定義 */
export enum BlockId {
  AIR,
  GRASS,
  STONE,
  WOOD,
  DIRT,
}

/** 材質路徑前綴 */
const TEXTURE_BASE = '/assets/minecraft/textures/block'

/** 方塊材質定義：支援 per-face 或單一材質 */
export interface BlockTextureDef {
  /** 所有面使用同一材質時 */
  all?: string;
  /** 個別面材質（覆寫 all） */
  top?: string;
  side?: string;
  bottom?: string;
  /** 色調 tint（乘以灰階貼圖產生顏色），格式 [r, g, b] 範圍 0~1
   *
   * minecraft 的草皮會基於生態系換顏色，所以原始貼圖是灰階圖
   */
  topTint?: [number, number, number];
  sideTint?: [number, number, number];
}

/** 方塊材質對照表 */
export const BLOCK_TEXTURES: Record<Exclude<BlockId, BlockId.AIR>, BlockTextureDef> = {
  [BlockId.GRASS]: {
    top: `${TEXTURE_BASE}/grass_block_top.png`,
    side: `${TEXTURE_BASE}/grass_block_side.png`,
    bottom: `${TEXTURE_BASE}/dirt.png`,
    /** Plains 生態域草地色調（取自 colormap/grass.png） */
    topTint: [0.57, 0.74, 0.35],
  },
  [BlockId.STONE]: {
    all: `${TEXTURE_BASE}/stone.png`,
  },
  [BlockId.WOOD]: {
    all: `${TEXTURE_BASE}/oak_planks.png`,
  },
  [BlockId.DIRT]: {
    all: `${TEXTURE_BASE}/dirt.png`,
  },
}

/** 方塊挖掘所需時間（秒） */
export const BLOCK_MINING_TIMES: Record<Exclude<BlockId, BlockId.AIR>, number> = {
  [BlockId.GRASS]: 0.75,
  [BlockId.DIRT]: 0.5,
  [BlockId.WOOD]: 1.5,
  [BlockId.STONE]: 2.0,
}

/** 需要渲染的方塊 ID（排除 AIR） */
export const RENDERABLE_BLOCK_IDS = [
  BlockId.GRASS,
  BlockId.STONE,
  BlockId.WOOD,
  BlockId.DIRT,
] as const

/**
 * 將 3D 座標轉換為一維陣列索引
 *
 * 公式：index = (x × 64 × 64) + (y × 64) + z
 */
export function coordinateToIndex(x: number, y: number, z: number): number {
  return (x * WORLD_SIZE * WORLD_SIZE) + (y * WORLD_SIZE) + z
}

/**
 * 將一維陣列索引轉換為 3D 座標
 */
export function indexToCoordinate(index: number): { x: number; y: number; z: number } {
  const x = Math.floor(index / (WORLD_SIZE * WORLD_SIZE))
  const remainder = index % (WORLD_SIZE * WORLD_SIZE)
  const y = Math.floor(remainder / WORLD_SIZE)
  const z = remainder % WORLD_SIZE

  return { x, y, z }
}
