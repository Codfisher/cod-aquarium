/** 方塊 ID 定義 */
export enum BlockId {
  AIR,
  GRASS,
  STONE,
  WOOD,
  DIRT,
  BEDROCK,
  SAND,
  COBBLESTONE,
  GLASS,
  OAK_LEAVES,
  BRICKS,
  OAK_LOG,
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

/** 方塊定義 */
export interface BlockDef {
  /** 材質定義 (如果是空氣方塊則不需要) */
  textures?: BlockTextureDef;
  /** 挖掘所需時間（秒） */
  miningSeconds?: number;
  /** 是否可以在挖掘後掉落/撿起（預設為 true） */
  isDroppable?: boolean;
  /** 是否隱藏（例如：空氣） */
  isHidden?: boolean;
}

/** 所有方塊的詳細定義 */
export const BLOCK_DEFS: Record<BlockId, BlockDef> = {
  [BlockId.AIR]: {
    isHidden: true,
  },
  [BlockId.GRASS]: {
    miningSeconds: 0.75,
    isDroppable: true,
    textures: {
      top: `${TEXTURE_BASE}/grass_block_top.png`,
      side: `${TEXTURE_BASE}/grass_block_side.png`,
      bottom: `${TEXTURE_BASE}/dirt.png`,
      topTint: [0.57, 0.74, 0.35],
    },
  },
  [BlockId.STONE]: {
    miningSeconds: 2.0,
    textures: {
      all: `${TEXTURE_BASE}/stone.png`,
    },
  },
  [BlockId.WOOD]: {
    miningSeconds: 1.5,
    textures: {
      all: `${TEXTURE_BASE}/oak_planks.png`,
    },
  },
  [BlockId.DIRT]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/dirt.png`,
    },
  },
  [BlockId.BEDROCK]: {
    miningSeconds: Infinity,
    textures: {
      all: `${TEXTURE_BASE}/bedrock.png`,
    },
  },
  [BlockId.SAND]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/sand.png`,
    },
  },
  [BlockId.COBBLESTONE]: {
    miningSeconds: 2.0,
    textures: {
      all: `${TEXTURE_BASE}/cobblestone.png`,
    },
  },
  [BlockId.GLASS]: {
    miningSeconds: 0.3,
    textures: {
      all: `${TEXTURE_BASE}/glass.png`,
    },
  },
  [BlockId.BRICKS]: {
    miningSeconds: 2.0,
    textures: {
      all: `${TEXTURE_BASE}/bricks.png`,
    },
  },
  [BlockId.OAK_LEAVES]: {
    miningSeconds: 0.2,
    isDroppable: false,
    textures: {
      all: `${TEXTURE_BASE}/oak_leaves.png`,
      tint: [0.57, 0.74, 0.35],
    },
  },
  [BlockId.OAK_LOG]: {
    miningSeconds: 2.0,
    textures: {
      top: `${TEXTURE_BASE}/oak_log_top.png`,
      bottom: `${TEXTURE_BASE}/oak_log_top.png`,
      side: `${TEXTURE_BASE}/oak_log.png`,
    },
  },
}
