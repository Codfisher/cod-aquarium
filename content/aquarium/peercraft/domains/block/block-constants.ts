/** 方塊 ID 定義 */
export enum BlockId {
  AIR,
  GRASS,
  STONE,
  WOOD, // oak planks
  DIRT,
  BEDROCK,
  SAND,
  COBBLESTONE,
  GLASS,
  OAK_LEAVES,
  BRICKS,
  OAK_LOG, // 原木 / 樹幹
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
  /** 全部面色調 tint */
  tint?: [number, number, number];
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
  [BlockId.BEDROCK]: {
    all: `${TEXTURE_BASE}/bedrock.png`,
  },
  [BlockId.SAND]: {
    all: `${TEXTURE_BASE}/sand.png`,
  },
  [BlockId.COBBLESTONE]: {
    all: `${TEXTURE_BASE}/cobblestone.png`,
  },
  [BlockId.GLASS]: {
    all: `${TEXTURE_BASE}/glass.png`,
  },
  [BlockId.OAK_LEAVES]: {
    all: `${TEXTURE_BASE}/oak_leaves.png`,
    tint: [0.57, 0.74, 0.35],
  },
  [BlockId.BRICKS]: {
    all: `${TEXTURE_BASE}/bricks.png`,
  },
  [BlockId.OAK_LOG]: {
    top: `${TEXTURE_BASE}/oak_log_top.png`,
    bottom: `${TEXTURE_BASE}/oak_log_top.png`,
    side: `${TEXTURE_BASE}/oak_log.png`,
  },
}

/** 方塊挖掘所需時間（秒） */
export const BLOCK_MINING_TIMES: Record<Exclude<BlockId, BlockId.AIR>, number> = {
  [BlockId.GRASS]: 0.75,
  [BlockId.DIRT]: 0.5,
  [BlockId.SAND]: 0.5,
  [BlockId.WOOD]: 1.5,
  [BlockId.STONE]: 2.0,
  [BlockId.COBBLESTONE]: 2.0,
  [BlockId.GLASS]: 0.3,
  [BlockId.OAK_LEAVES]: 0.2,
  [BlockId.BRICKS]: 2.0,
  [BlockId.OAK_LOG]: 2.0,
  [BlockId.BEDROCK]: Infinity,
}

/** 需要渲染的方塊 ID（排除 AIR） */
export const RENDERABLE_BLOCK_IDS = [
  BlockId.GRASS,
  BlockId.STONE,
  BlockId.WOOD,
  BlockId.DIRT,
  BlockId.BEDROCK,
  BlockId.SAND,
  BlockId.COBBLESTONE,
  BlockId.GLASS,
  BlockId.OAK_LEAVES,
  BlockId.BRICKS,
  BlockId.OAK_LOG,
] as const
