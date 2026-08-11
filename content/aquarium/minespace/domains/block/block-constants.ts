/** 方塊 ID 定義 */
export enum BlockId {
  AIR,
  BEDROCK,
  STONE,
  COBBLESTONE,
  MOSSY_COBBLESTONE,
  STONE_BRICKS,
  GRAVEL,
  CLAY,
  DIRT,
  GRASS,
  SAND,
  SANDSTONE,
  SNOW,
  ICE,
  WATER,
  FLOWING_WATER,
  OAK_LOG,
  OAK_LEAVES,
  PINE_LOG,
  PINE_LEAVES,
  DEAD_LOG,
  PLANKS,
  DARK_PLANKS,
  GLASS,
  HAY,
  BOOKSHELF,
  LANTERN,
  EMBER,
  BRICKS,
  HIVE,
  COAL_ORE,
  IRON_ORE,
  COPPER_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
  // ── 非正立方體的裝飾方塊 ──
  TALL_GRASS,
  FERN,
  DRY_SHRUB,
  FLOWER_ROSE,
  FLOWER_TULIP,
  FLOWER_DANDELION,
  MUSHROOM,
  LILY_PAD,
  FENCE,
  GLASS_PANE,
  STONE_SLAB,
  WOOD_SLAB,
  FLOWER_POT,
  /**
   * 木階梯
   *
   * 世界狀態一格只存得下一個編號，沒有地方放旋轉角度，
   * 所以四個朝向各自是一種方塊。朝向指的是「靠背在哪一側」，
   * 也就是面向的反方向：擺在營火北邊的椅子，靠背在北、人面向南
   */
  WOOD_STAIRS_NORTH,
  WOOD_STAIRS_SOUTH,
  WOOD_STAIRS_EAST,
  WOOD_STAIRS_WEST,
  /** 深色木階梯，村屋的斜屋頂用它砌 */
  DARK_STAIRS_NORTH,
  DARK_STAIRS_SOUTH,
  DARK_STAIRS_EAST,
  DARK_STAIRS_WEST,
}

/**
 * 方塊外型
 *
 * - `cube`：一般正方體
 * - `cross`：兩片交叉的立板，草與花都用這個
 * - `flat`：貼在地面的平板，例如睡蓮
 * - `slab`：半格高的板，用來鋪路
 * - `stairs`：半格高的板加上一側的靠背，當作椅子
 * - `fence`：柱子加橫桿的圍籬
 * - `pane`：薄玻璃片
 * - `pot`：花盆加上面的植物
 */
export type BlockShape = 'cube' | 'cross' | 'flat' | 'slab' | 'stairs' | 'fence' | 'pane' | 'pot'

/** 階梯靠背所在的那一側 */
export type StairsFacing = 'north' | 'south' | 'east' | 'west'

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
  /** 疊加在基底材質上的覆蓋層 */
  overlay?: string;
  /** 個別面的覆蓋層 */
  sideOverlay?: string;
  /** 全部面色調 tint，格式 [r, g, b] 範圍 0~1 */
  tint?: [number, number, number];
  /** 頂面色調（灰階貼圖上色用） */
  topTint?: [number, number, number];
  sideTint?: [number, number, number];
  /**
   * 動畫張數
   *
   * 貼圖是直向疊起來的連續畫格，水就是靠這個流動起來的。
   * 材質會把 v 軸縮成 1 / frameCount，再逐格捲動
   */
  frameCount?: number;
}

/** 腳步聲材質類型 */
export type StepMaterial = 'grass' | 'stone' | 'wood' | 'gravel' | 'sand' | 'snow' | 'cloth' | 'coral' | 'wet_grass'

/** 方塊定義 */
export interface BlockDef {
  /** 材質定義（空氣方塊不需要） */
  textures?: BlockTextureDef;
  /** 外型，預設為正方體 */
  shape?: BlockShape;
  /**
   * 貼圖帶鏤空
   *
   * 樹葉這類方塊的貼圖本身就有透明的洞，
   * 要用 alpha test 把那些像素丟掉，而且不能被面剔除吃掉，否則會看穿樹冠
   */
  cutout?: boolean;
  /** 花盆上種的植物材質 */
  plantTexture?: string;
  /** 是否隱藏（例如空氣） */
  isHidden?: boolean;
  /** 透明度，0~1，預設 1（不透明） */
  alpha?: number;
  /** 是否可穿越（水、空氣、花草） */
  passable?: boolean;
  /**
   * 液體
   *
   * 頭頂沒有其他液體時（也就是水面那一層）會矮掉八分之一格，
   * 岸邊的方塊因此會露出一小截側面，水看起來才是灌進地形裡的，
   * 而不是一顆一顆疊起來的正立方體
   */
  isLiquid?: boolean;
  /**
   * 薄地板：只擋住往下掉，水平方向照樣穿得過去
   *
   * 睡蓮貼在水面上，整格當成實心的話會變成一道浮在水上的牆，
   * 但踩上去又必須站得住，所以獨立成一種碰撞行為
   */
  isThinFloor?: boolean;
  /**
   * 碰撞高度，預設一整格
   *
   * 半磚只佔下半格，踩上去站在格子中線的高度，
   * 頭頂那半格照樣走得過去
   */
  collisionHeight?: number;
  /** 自發光強度 0~1，燈籠與餘燼在暗處要看得出在發亮 */
  emissive?: number;
  /**
   * 平塗：六個面都用朝上的法線計算光照
   *
   * 水面在方塊世界裡是平的，側面若因為受光角度而變暗，
   * 看起來會像一塊塊有稜有角的果凍。
   * 直接關掉光照會讓 Babylon 只剩自發光（等於全黑），所以改動法線
   */
  flatShaded?: boolean;
  /** 是否承接陰影，預設 true。半透明的水面接陰影會像破洞 */
  receiveShadow?: boolean;
  /** 踩上去的腳步聲材質 */
  stepMaterial?: StepMaterial;
  /** 階梯靠背所在的那一側，只有 shape 為 stairs 時有意義 */
  stairsFacing?: StairsFacing;
}

/** 所有方塊的詳細定義 */
export const BLOCK_DEFS: Record<BlockId, BlockDef> = {
  [BlockId.AIR]: {
    isHidden: true,
    passable: true,
  },
  [BlockId.BEDROCK]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_obsidian.png`,
    },
  },
  [BlockId.STONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
    },
  },
  [BlockId.COBBLESTONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_cobble.png`,
    },
  },
  [BlockId.MOSSY_COBBLESTONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_mossycobble.png`,
    },
  },
  [BlockId.STONE_BRICKS]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone_brick.png`,
    },
  },
  [BlockId.GRAVEL]: {
    stepMaterial: 'gravel',
    textures: {
      all: `${TEXTURE_BASE}/default_gravel.png`,
    },
  },
  [BlockId.CLAY]: {
    stepMaterial: 'gravel',
    textures: {
      all: `${TEXTURE_BASE}/default_clay.png`,
    },
  },
  [BlockId.DIRT]: {
    stepMaterial: 'gravel',
    textures: {
      all: `${TEXTURE_BASE}/default_dirt.png`,
    },
  },
  [BlockId.GRASS]: {
    stepMaterial: 'grass',
    textures: {
      top: `${TEXTURE_BASE}/default_grass_top.png`,
      side: `${TEXTURE_BASE}/default_dirt.png`,
      sideOverlay: `${TEXTURE_BASE}/default_grass_side.png`,
      bottom: `${TEXTURE_BASE}/default_dirt.png`,
      topTint: [0.55, 0.75, 0.36],
    },
  },
  [BlockId.SAND]: {
    stepMaterial: 'sand',
    textures: {
      all: `${TEXTURE_BASE}/default_sand.png`,
    },
  },
  [BlockId.SANDSTONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_sandstone.png`,
    },
  },
  [BlockId.SNOW]: {
    stepMaterial: 'snow',
    textures: {
      top: `${TEXTURE_BASE}/default_snow.png`,
      side: `${TEXTURE_BASE}/default_snow_side.png`,
      bottom: `${TEXTURE_BASE}/default_dirt.png`,
    },
  },
  [BlockId.ICE]: {
    stepMaterial: 'stone',
    alpha: 0.8,
    receiveShadow: false,
    textures: {
      all: `${TEXTURE_BASE}/default_ice.png`,
    },
  },
  [BlockId.WATER]: {
    stepMaterial: 'wet_grass',
    alpha: 0.72,
    passable: true,
    isLiquid: true,
    receiveShadow: false,
    flatShaded: true,
    textures: {
      all: `${TEXTURE_BASE}/default_water_source_animated.png`,
      frameCount: 6,
      tint: [0.55, 0.78, 1],
    },
  },
  /**
   * 流動的水
   *
   * 與靜水共用所有物理性質，差別只在貼圖：
   * 這張是往下捲動的十四張連續畫格，
   * 用在瀑布與河道的落差處，水才看得出來在往哪裡走
   */
  [BlockId.FLOWING_WATER]: {
    stepMaterial: 'wet_grass',
    alpha: 0.72,
    passable: true,
    isLiquid: true,
    receiveShadow: false,
    flatShaded: true,
    textures: {
      all: `${TEXTURE_BASE}/default_water_flowing_animated.png`,
      frameCount: 14,
      tint: [0.6, 0.82, 1],
    },
  },
  [BlockId.OAK_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_tree_top.png`,
      side: `${TEXTURE_BASE}/default_tree.png`,
    },
  },
  [BlockId.OAK_LEAVES]: {
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_leaves.png`,
      tint: [0.5, 0.72, 0.32],
    },
  },
  [BlockId.PINE_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_pine_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_pine_tree_top.png`,
      side: `${TEXTURE_BASE}/default_pine_tree.png`,
    },
  },
  [BlockId.PINE_LEAVES]: {
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_pine_needles.png`,
      tint: [0.42, 0.6, 0.42],
    },
  },
  [BlockId.DEAD_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_jungletree_top.png`,
      bottom: `${TEXTURE_BASE}/default_jungletree_top.png`,
      side: `${TEXTURE_BASE}/default_jungletree.png`,
    },
  },
  [BlockId.PLANKS]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.DARK_PLANKS]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  /**
   * 玻璃
   *
   * 這張貼圖本身就是一圈邊框，中間整片透明（alpha 只有 0 與 255 兩種值）。
   * 用半透明混色會把整塊方塊連同空白的中央一起畫成一層霧，
   * 疊起來還會有排序問題；改用 alpha test 只留下邊框才是玻璃該有的樣子
   */
  [BlockId.GLASS]: {
    stepMaterial: 'stone',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_glass.png`,
    },
  },
  [BlockId.HAY]: {
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/farming_straw.png`,
    },
  },
  [BlockId.BOOKSHELF]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_wood.png`,
      bottom: `${TEXTURE_BASE}/default_wood.png`,
      side: `${TEXTURE_BASE}/default_bookshelf.png`,
    },
  },
  [BlockId.LANTERN]: {
    stepMaterial: 'stone',
    emissive: 0.95,
    textures: {
      all: `${TEXTURE_BASE}/default_meselamp.png`,
    },
  },
  [BlockId.EMBER]: {
    stepMaterial: 'stone',
    emissive: 0.8,
    textures: {
      all: `${TEXTURE_BASE}/default_lava.png`,
    },
  },
  [BlockId.BRICKS]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_brick.png`,
    },
  },
  /**
   * 礦脈
   *
   * 只鋪在洞壁的表層，走進去才看得到一塊一塊嵌在岩壁上的礦。
   * 礦物貼圖只有礦點本身、背景是透明的（煤那張 64 個像素有 54 個全透明），
   * 那是給人疊在石頭上用的圖層，單獨拿來貼會變成一塊黑底的方塊，
   * 所以底圖一律是石頭，礦點以 overlay 合成上去。
   * 鑽石帶一點自發光，在暗處會透出微光，走到深處才會遇上
   */
  [BlockId.COAL_ORE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_coal.png`,
    },
  },
  [BlockId.IRON_ORE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_iron.png`,
    },
  },
  [BlockId.COPPER_ORE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_copper.png`,
    },
  },
  [BlockId.GOLD_ORE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_gold.png`,
    },
  },
  [BlockId.DIAMOND_ORE]: {
    stepMaterial: 'stone',
    emissive: 0.2,
    textures: {
      all: `${TEXTURE_BASE}/default_stone.png`,
      overlay: `${TEXTURE_BASE}/default_mineral_diamond.png`,
    },
  },
  [BlockId.HIVE]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/xdecor_hive_top.png`,
      bottom: `${TEXTURE_BASE}/xdecor_hive_top.png`,
      side: `${TEXTURE_BASE}/xdecor_hive_side.png`,
    },
  },

  // ── 非正立方體的裝飾方塊 ──
  [BlockId.TALL_GRASS]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_grass_3.png`,
      tint: [0.55, 0.75, 0.36],
    },
  },
  [BlockId.FERN]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_spikefern.png`,
      tint: [0.46, 0.66, 0.34],
    },
  },
  [BlockId.DRY_SHRUB]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_dry_shrub.png`,
      tint: [0.72, 0.62, 0.44],
    },
  },
  [BlockId.FLOWER_ROSE]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_rose.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_TULIP]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_tulip.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_DANDELION]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_dandelion_yellow.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.MUSHROOM]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_mushroom_red.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.LILY_PAD]: {
    shape: 'flat',
    passable: true,
    /** 踩得上去，游過去也不會被葉子擋住 */
    isThinFloor: true,
    stepMaterial: 'wet_grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_waterlily.png`,
      tint: [0.62, 0.78, 0.5],
    },
  },
  [BlockId.FENCE]: {
    shape: 'fence',
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.GLASS_PANE]: {
    shape: 'pane',
    cutout: true,
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_glass.png`,
    },
  },
  [BlockId.STONE_SLAB]: {
    shape: 'slab',
    /** 踩得上去，但只擋住下半格 */
    collisionHeight: 0.5,
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_cobble.png`,
    },
  },
  [BlockId.WOOD_SLAB]: {
    shape: 'slab',
    /** 踩得上去，但只擋住下半格 */
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  /**
   * 木階梯
   *
   * 座面只有半格高，靠背貼在其中一側。
   * 碰撞比照半磚，人踩得上去也跨得過，坐在營火邊剛好是矮凳的高度
   */
  [BlockId.WOOD_STAIRS_NORTH]: {
    shape: 'stairs',
    stairsFacing: 'north',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.WOOD_STAIRS_SOUTH]: {
    shape: 'stairs',
    stairsFacing: 'south',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.WOOD_STAIRS_EAST]: {
    shape: 'stairs',
    stairsFacing: 'east',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  [BlockId.WOOD_STAIRS_WEST]: {
    shape: 'stairs',
    stairsFacing: 'west',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  /**
   * 深色木階梯
   *
   * 與木階梯同一種外型，只換成深色木材質。
   * 屋頂用它砌成斜面，屋身才不會與屋頂糊成同一片木色
   */
  [BlockId.DARK_STAIRS_NORTH]: {
    shape: 'stairs',
    stairsFacing: 'north',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  [BlockId.DARK_STAIRS_SOUTH]: {
    shape: 'stairs',
    stairsFacing: 'south',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  [BlockId.DARK_STAIRS_EAST]: {
    shape: 'stairs',
    stairsFacing: 'east',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  [BlockId.DARK_STAIRS_WEST]: {
    shape: 'stairs',
    stairsFacing: 'west',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  [BlockId.FLOWER_POT]: {
    shape: 'pot',
    passable: true,
    stepMaterial: 'stone',
    plantTexture: `${TEXTURE_BASE}/flowers_geranium.png`,
    textures: {
      all: `${TEXTURE_BASE}/xdecor_plant_pot_sides.png`,
    },
  },
}

/** 非正立方體的方塊，面剔除與碰撞都要另外處理 */
export function isDecorationBlock(blockId: BlockId): boolean {
  const shape = BLOCK_DEFS[blockId]?.shape
  return shape !== undefined && shape !== 'cube'
}

/** 綿羊身上的材質，交給 3D 模型使用 */
export const WOOL_TEXTURE = {
  white: `${TEXTURE_BASE}/wool_white.png`,
  grey: `${TEXTURE_BASE}/wool_grey.png`,
  darkGrey: `${TEXTURE_BASE}/wool_dark_grey.png`,
  brown: `${TEXTURE_BASE}/wool_brown.png`,
  black: `${TEXTURE_BASE}/wool_black.png`,
  pink: `${TEXTURE_BASE}/wool_pink.png`,
} as const

/** 取得方塊的腳步聲材質 */
export function getStepMaterial(blockId: BlockId): StepMaterial {
  return BLOCK_DEFS[blockId]?.stepMaterial ?? 'stone'
}

/** 方塊是否可穿越（不阻擋玩家） */
export function isPassableBlock(blockId: BlockId): boolean {
  return BLOCK_DEFS[blockId]?.passable === true
}

/** 是否為水，靜水與流水在物理上完全相同 */
export function isWaterBlock(blockId: BlockId): boolean {
  return blockId === BlockId.WATER || blockId === BlockId.FLOWING_WATER
}

/** 方塊的碰撞高度，預設一整格 */
export function getCollisionHeight(blockId: BlockId): number {
  return BLOCK_DEFS[blockId]?.collisionHeight ?? 1
}

/** 方塊是否為只擋住墜落的薄地板 */
export function isThinFloorBlock(blockId: BlockId): boolean {
  return BLOCK_DEFS[blockId]?.isThinFloor === true
}
