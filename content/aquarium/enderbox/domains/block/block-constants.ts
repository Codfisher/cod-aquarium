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
  STONE_BRICKS,
  DARK_OAK_LOG,
  DARK_OAK_PLANKS,
  SPRUCE_PLANKS,
  BOOKSHELF,
  CRAFTING_TABLE,
  BARREL,
  FURNACE,
  MOSSY_COBBLESTONE,
  CHISELED_STONE_BRICKS,
  HAY_BLOCK,
  COAL_ORE,
  IRON_ORE,
}

/** 材質路徑前綴 */
const TEXTURE_BASE = '/assets/minecraft-mini8x'

/** 方塊材質定義：支援 per-face 或單一材質 */
export interface BlockTextureDef {
  /** 所有面使用同一材質時 */
  all?: string;
  /** 個別面材質（覆寫 all） */
  top?: string;
  side?: string;
  bottom?: string;
  /** 疊加在基底材質上的覆蓋層（例如礦物紋理疊在石頭上） */
  overlay?: string;
  /** 個別面的覆蓋層 */
  sideOverlay?: string;
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
  /** 透明度，0~1，預設為 1（不透明） */
  alpha?: number;
}

/** 所有方塊的詳細定義 */
export const BLOCK_DEFS: Record<BlockId, BlockDef> = {
  [BlockId.AIR]: {
    isHidden: true,
  },
  [BlockId.GRASS]: {
    miningSeconds: 0.2,
    isDroppable: true,
    textures: {
      top: `${TEXTURE_BASE}/default_grass_top.png`,
      side: `${TEXTURE_BASE}/default_dirt.png`,
      sideOverlay: `${TEXTURE_BASE}/default_grass_side.png`,
      bottom: `${TEXTURE_BASE}/default_dirt.png`,
      topTint: [0.57, 0.74, 0.35],
    },
  },
  [BlockId.STONE]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
    },
  },
  [BlockId.WOOD]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.DIRT]: {
    miningSeconds: 0.2,
    textures: {
      all: `${TEXTURE_BASE}/default_dirt.png`,
    },
  },
  [BlockId.BEDROCK]: {
    miningSeconds: Infinity,
    textures: {
      all: `${TEXTURE_BASE}/default_obsidian.png`,
    },
  },
  [BlockId.SAND]: {
    miningSeconds: 0.1,
    textures: {
      all: `${TEXTURE_BASE}/default_sand.png`,
    },
  },
  [BlockId.COBBLESTONE]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_cobble.png`,
    },
  },
  [BlockId.GLASS]: {
    miningSeconds: 0.3,
    alpha: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_glass.png`,
    },
  },
  [BlockId.BRICKS]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_brick.png`,
    },
  },
  [BlockId.OAK_LEAVES]: {
    miningSeconds: 0.1,
    isDroppable: false,
    textures: {
      all: `${TEXTURE_BASE}/default_leaves.png`,
      tint: [0.57, 0.74, 0.35],
    },
  },
  [BlockId.OAK_LOG]: {
    miningSeconds: 0.5,
    textures: {
      top: `${TEXTURE_BASE}/default_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_tree_top.png`,
      side: `${TEXTURE_BASE}/default_tree.png`,
    },
  },
  [BlockId.STONE_BRICKS]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_stone_brick.png`,
    },
  },
  [BlockId.DARK_OAK_LOG]: {
    miningSeconds: 0.5,
    textures: {
      top: `${TEXTURE_BASE}/default_jungletree_top.png`,
      bottom: `${TEXTURE_BASE}/default_jungletree_top.png`,
      side: `${TEXTURE_BASE}/default_jungletree.png`,
    },
  },
  [BlockId.DARK_OAK_PLANKS]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  [BlockId.SPRUCE_PLANKS]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_pine_wood.png`,
    },
  },
  [BlockId.BOOKSHELF]: {
    miningSeconds: 0.3,
    textures: {
      top: `${TEXTURE_BASE}/default_wood.png`,
      bottom: `${TEXTURE_BASE}/default_wood.png`,
      side: `${TEXTURE_BASE}/default_bookshelf.png`,
    },
  },
  [BlockId.CRAFTING_TABLE]: {
    miningSeconds: 0.3,
    textures: {
      top: `${TEXTURE_BASE}/xdecor_workbench_top.png`,
      bottom: `${TEXTURE_BASE}/default_pine_wood.png`,
      side: `${TEXTURE_BASE}/xdecor_workbench_front.png`,
    },
  },
  [BlockId.BARREL]: {
    miningSeconds: 0.3,
    textures: {
      top: `${TEXTURE_BASE}/xdecor_barrel_top.png`,
      bottom: `${TEXTURE_BASE}/xdecor_barrel_top.png`,
      side: `${TEXTURE_BASE}/xdecor_barrel_sides.png`,
    },
  },
  [BlockId.FURNACE]: {
    miningSeconds: 0.5,
    textures: {
      top: `${TEXTURE_BASE}/default_furnace_top.png`,
      side: `${TEXTURE_BASE}/default_furnace_front.png`,
      bottom: `${TEXTURE_BASE}/default_furnace_top.png`,
    },
  },
  [BlockId.MOSSY_COBBLESTONE]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_mossycobble.png`,
    },
  },
  [BlockId.CHISELED_STONE_BRICKS]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_stone_block.png`,
    },
  },
  [BlockId.HAY_BLOCK]: {
    miningSeconds: 0.3,
    textures: {
      all: `${TEXTURE_BASE}/farming_straw.png`,
    },
  },
  [BlockId.COAL_ORE]: {
    miningSeconds: 0.5,
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_coal.png`,
    },
  },
  [BlockId.IRON_ORE]: {
    miningSeconds: 0.6,
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_iron.png`,
    },
  },
}
