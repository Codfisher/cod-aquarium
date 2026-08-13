/** 方塊 ID 定義 */
export enum BlockId {
  AIR,
  BEDROCK,
  STONE,
  COBBLESTONE,
  MOSSY_COBBLESTONE,
  STONE_BRICKS,
  /** 打磨過的石板，鋪成箱庭裡的參道 */
  STONE_TILE,
  /** 刻著紋樣的石碑，遺跡與石庭各立一塊 */
  RUNE_STONE,
  GRAVEL,
  CLAY,
  DIRT,
  GRASS,
  SAND,
  SANDSTONE,
  /**
   * 枯山水的白沙
   *
   * 整座禪庭的底。銀沙那張貼圖本來就幾乎是純白，
   * 一路鋪進霧裡就分不出哪裡是地面、哪裡是天光
   */
  WHITE_SAND,
  /**
   * 箱庭裡鋪的白沙
   *
   * 與地面那種是同一張貼圖、同一個顏色，差別只在「要不要畫成方塊」。
   * 地面那片鋪滿整個世界、佔了全場六成五的繪製量，改用一片地面網格代替；
   * 箱庭裡的沙只有幾百格，照常畫成方塊
   */
  GARDEN_SAND,
  /** 耙出來的沙紋，只比白沙暗一階，遠看是一圈一圈的水波 */
  RAKED_SAND,
  /** 白砂岩，木座的墊腳石與石階都用它 */
  WHITE_SANDSTONE,
  SNOW,
  ICE,
  /** 壓實的冰，雪庭的池面 */
  PACKED_ICE,
  /** 黑曜石與它的磚，月語庭的深色底 */
  OBSIDIAN_BRICKS,
  /** 帶月紋的磚，只用在月語庭 */
  MOON_BRICKS,
  /** 熔岩，湯屋的熱源，埋在岩池底下透出光 */
  LAVA,
  WATER,
  FLOWING_WATER,
  OAK_LOG,
  OAK_LEAVES,
  /** 落葉林的白楊木與兩種轉色的葉子 */
  ASPEN_LOG,
  AMBER_LEAVES,
  GOLD_LEAVES,
  PINE_LOG,
  PINE_LEAVES,
  DEAD_LOG,
  /**
   * 躺著的原木
   *
   * 世界狀態一格只存得下一個編號，沒有地方放旋轉角度，
   * 所以每一種朝向各自是一種方塊——與木階梯同樣的處理。
   * 少了這幾種，倒木的年輪會全部朝上，看起來像一排立著的樹頭被削平
   */
  DEAD_LOG_X,
  DEAD_LOG_Z,
  OAK_LOG_X,
  OAK_LOG_Z,
  /** 相思木與它扁平的樹冠，海岸箱庭的迎風樹 */
  ACACIA_LOG,
  ACACIA_LEAVES,
  /** 濃綠闊葉，雨庭那幾株長得特別茂 */
  JUNGLE_LEAVES,
  PLANKS,
  DARK_PLANKS,
  /** 拼花木地板，木座的甲板面 */
  WOOD_TILE,
  /** 榻榻米，茶屋與村屋的室內地板 */
  TATAMI,
  /** 竹紋方塊，格柵與竹籬用它 */
  BAMBOO_BLOCK,
  /** 障子紙門 */
  PAPER_DOOR,
  GLASS,
  HAY,
  BOOKSHELF,
  /** 木桶、木箱與收納箱，村莊與營地的日常雜物 */
  BARREL,
  CRATE,
  CHEST,
  /** 灶與工作檯 */
  FURNACE,
  WORKBENCH,
  /** 燒著水的鍋，冒著人住過的氣味 */
  CAULDRON,
  LANTERN,
  /** 和紙燈箱，暖黃的柔光 */
  PAPER_LAMP,
  /** 石燈籠中間那一節會發光的燈室 */
  LANTERN_BOX,
  EMBER,
  BRICKS,
  HIVE,
  /** 蜜塊，蜂巢圃的琥珀色 */
  HONEY_BLOCK,
  /** 攤開的書，擺在檯面上 */
  OPEN_BOOK,
  /** 白骨，枯木林裡偶爾遇上一副 */
  BONES,
  /** 珊瑚與白化的珊瑚骨，潮汐箱庭的水底 */
  CORAL_ORANGE,
  CORAL_BROWN,
  CORAL_SKELETON,
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
  /** 更多花草：每一座箱庭都該有自己的一把植物 */
  BROWN_MUSHROOM,
  FLOWER_VIOLA,
  FLOWER_WHITE_DANDELION,
  BIG_FLOWER,
  MOON_FLOWER,
  FIRE_FLOWER,
  CURLY_PLANT,
  STONE_PLANT,
  /** 叢生的野草，比一般高草更蓬 */
  WILD_GRASS,
  /** 麥株，麥田那一整片金色 */
  WHEAT,
  /** 抽穗的麥，比一般的麥再高一階，混在田裡讓高度不整齊 */
  WHEAT_TALL,
  /** 熱帶的花，湯屋那一帶的濕氣養得出來 */
  JUNGLE_FLOWER,
  BUSH,
  DRY_GRASS,
  JUNGLE_GRASS,
  /** 蘆葦，沼澤與水鏡箱庭的岸邊 */
  PAPYRUS,
  /** 仙人掌，乾燥的角落 */
  CACTUS,
  /** 蛛網與藤蔓，讓洞窟與遺跡有時間感 */
  COBWEB,
  IVY,
  LILY_PAD,
  FALLEN_LEAVES,
  /** 林地腐葉，鋪在森林箱庭的地面 */
  FOREST_LITTER,
  FENCE,
  /** 竹籬 */
  BAMBOO_FENCE,
  /** 鐵鏈，吊鐘與吊燈用它 */
  CHAIN,
  GLASS_PANE,
  STONE_SLAB,
  WOOD_SLAB,
  /** 深色木半磚，木座的收邊 */
  DARK_WOOD_SLAB,
  /** 坐墊，茶室與湯屋的地板上散幾片 */
  CUSHION,
  /** 白砂岩半磚，木座外圈的墊腳石 */
  WHITE_STONE_SLAB,
  FLOWER_POT,
  /** 梯子，貼著牆爬上去 */
  LADDER,
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
  /**
   * 直接乘進貼圖像素的倍率，可以大於 1
   *
   * tint 只能把顏色調暗：著色器會先把「光照 × tint」夾在 1 以內再乘上貼圖，
   * 某個通道最亮就是貼圖本身的值。綠葉的紅只有 0.26，
   * 靠 tint 永遠調不出秋天的橘。
   * 這個倍率則是在畫布上逐像素乘進去，才有辦法把綠葉整個換一種顏色
   */
  pixelTint?: [number, number, number];
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
  /**
   * 水平方向的碰撞寬度，預設整格
   *
   * 圍籬看起來只有中央一根細柱，碰撞卻佔滿整格的話，
   * 繞過一根柱子得多走一格，站在旁邊也會莫名其妙被卡住。
   * 這個值只影響「沒有連到隔壁」的那幾側——連成一排時
   * 碰撞會自動補滿到格子邊緣，玩家才擠不過去（見 collision.ts）
   */
  collisionWidth?: number;
  /** 自發光強度 0~1，燈籠與餘燼在暗處要看得出在發亮 */
  emissive?: number;
  /**
   * 照亮周圍的強度 0~1，未指定時跟著 emissive 走
   *
   * 「自己看起來多亮」與「照得多遠」是兩件事。
   * 營火的餘燼若把自發光拉到滿，貼圖會被洗成一片白，
   * 但它照出去的範圍本來就該比一盞燈籠大——分成兩個值才調得動
   */
  lightLevel?: number;
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
  /**
   * 會不會隨風擺動
   *
   * 給樹葉用。交叉立板的花草一律會擺，不必特別指定；
   * 立方體的方塊則要自己說——同樣是鏤空貼圖的玻璃就不該跟著晃
   */
  swaysInWind?: boolean;
  /**
   * 是否投出陰影，預設 true
   *
   * 給那些「本來就該與地面同一個平面」的方塊用。
   * 它們的頂面與周圍的沙齊平，但陰影是照方塊的整個身體算的，
   * 於是太陽一斜就從側面拖出一道影子，看起來像整塊浮起來了
   */
  castShadow?: boolean;
  /** 踩上去的腳步聲材質 */
  stepMaterial?: StepMaterial;
  /** 階梯靠背所在的那一側，只有 shape 為 stairs 時有意義 */
  stairsFacing?: StairsFacing;
  /**
   * 原木躺的方向，決定年輪長在哪兩個面
   *
   * 預設是 y，也就是立著的樹幹：年輪在上下兩面、樹皮在四周。
   * 改成 x 或 z 就是躺著的木頭，年輪跟著轉到兩端去
   */
  logAxis?: 'x' | 'y' | 'z';
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
  [BlockId.STONE_TILE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_stone_tile.png`,
    },
  },
  [BlockId.RUNE_STONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_stone_rune.png`,
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
  /**
   * 枯山水的白沙
   *
   * 銀沙貼圖本身已經是很淡的米白，再往上推一點就幾乎是純白。
   * 這片地要一路白到霧裡，稍微帶一點顏色都會在遠處顯出邊界
   */
  /**
   * 地面的白沙
   *
   * 刻意不畫成方塊。它鋪滿兩百八十格見方的世界，一共五萬八千格，
   * 佔掉全場六成五的繪製量——但那整片是完全平的，
   * 用一片地面網格就能畫完，一個 draw call 取代五萬八千個實例。
   *
   * 方塊資料照樣留著：碰撞、腳步聲、雨滴射線都還讀得到它，
   * 只有渲染器跳過去不畫
   */
  [BlockId.WHITE_SAND]: {
    isHidden: true,
    stepMaterial: 'sand',
  },
  /** 箱庭甲板上鋪的白沙，數量少，照常畫 */
  [BlockId.GARDEN_SAND]: {
    stepMaterial: 'sand',
    textures: {
      all: `${TEXTURE_BASE}/default_silver_sand.png`,
      pixelTint: [1.1, 1.1, 1.1],
    },
  },
  /**
   * 耙紋
   *
   * 只比白沙暗一階。沙紋是靠受光角度看出來的，
   * 在方塊世界裡沒有那個角度，只能用明度差假裝那道溝
   */
  [BlockId.RAKED_SAND]: {
    stepMaterial: 'sand',
    /**
     * 耙紋不投影子
     *
     * 這些方塊的頂面與整片白沙齊平，本來就該是同一個平面上的一道淺溝。
     * 但陰影是照方塊的整個身體算的，太陽一斜就從側面拖出一道長影，
     * 沙紋整條看起來像浮起來的矮牆。
     * 溝的深淺交給貼圖的明度差就夠了
     */
    castShadow: false,
    textures: {
      all: `${TEXTURE_BASE}/default_silver_sand.png`,
      pixelTint: [0.9, 0.9, 0.92],
    },
  },
  [BlockId.WHITE_SANDSTONE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_silver_sandstone.png`,
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
  /** 壓實的冰是不透明的，凍住的池面用它才踩得住、也看不穿 */
  [BlockId.PACKED_ICE]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_packed_ice.png`,
    },
  },
  [BlockId.OBSIDIAN_BRICKS]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_obsidian_brick.png`,
    },
  },
  /** 磚面上有一圈淡淡的月紋，是月語庭唯一的花樣 */
  [BlockId.MOON_BRICKS]: {
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_moonbrick.png`,
    },
  },
  /**
   * 熔岩
   *
   * 只埋在湯屋的岩池底下當熱源。自發光給滿，隔著水看下去
   * 池底會透出一層橘紅，那是「這池水為什麼是燙的」唯一的解釋
   */
  [BlockId.LAVA]: {
    stepMaterial: 'stone',
    emissive: 1,
    flatShaded: true,
    receiveShadow: false,
    textures: {
      all: `${TEXTURE_BASE}/default_lava_source_animated.png`,
      frameCount: 6,
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
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_leaves.png`,
      tint: [0.5, 0.72, 0.32],
    },
  },
  /** 白楊，樹皮是淺灰白色，一整片長在一起遠看就是一林子的白幹 */
  [BlockId.ASPEN_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      side: `${TEXTURE_BASE}/default_aspen_tree.png`,
    },
  },
  /**
   * 轉色的葉子
   *
   * 沒有現成的橘葉貼圖，這裡拿白楊葉那張綠葉重新上色。
   * 貼圖只有兩階綠 (66,192,39) 與 (59,172,35)，
   * 乘上倍率之後分別落在琥珀與金黃上，明暗的階差也跟著保留下來。
   * 不能用 tint，那條路只會調出偏綠的暗色
   */
  [BlockId.AMBER_LEAVES]: {
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_aspen_leaves.png`,
      pixelTint: [3.27, 0.61, 0.82],
    },
  },
  [BlockId.GOLD_LEAVES]: {
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_aspen_leaves.png`,
      pixelTint: [3.64, 0.99, 1.15],
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
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_pine_needles.png`,
      tint: [0.42, 0.6, 0.42],
    },
  },
  /**
   * 枯木
   *
   * 原本用 default_jungletree，那張圖的平均色是 (89, 89, 42)——
   * 一種灰綠的爛泥色，擺在乾淨的白沙庭園裡看起來只像發霉。
   * 改用白楊那張淺灰的木紋再染成風化的灰褐，
   * 才是曬了幾年、被雨水洗白的倒木
   */
  [BlockId.DEAD_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      side: `${TEXTURE_BASE}/default_aspen_tree.png`,
      tint: [0.72, 0.67, 0.58],
    },
  },
  /** 躺著的枯木，年輪轉到兩端 */
  [BlockId.DEAD_LOG_X]: {
    stepMaterial: 'wood',
    logAxis: 'x',
    textures: {
      top: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      side: `${TEXTURE_BASE}/default_aspen_tree.png`,
      tint: [0.72, 0.67, 0.58],
    },
  },
  [BlockId.DEAD_LOG_Z]: {
    stepMaterial: 'wood',
    logAxis: 'z',
    textures: {
      top: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_aspen_tree_top.png`,
      side: `${TEXTURE_BASE}/default_aspen_tree.png`,
      tint: [0.72, 0.67, 0.58],
    },
  },
  /** 躺著的橡木，柴堆與橫枝用它 */
  [BlockId.OAK_LOG_X]: {
    stepMaterial: 'wood',
    logAxis: 'x',
    textures: {
      top: `${TEXTURE_BASE}/default_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_tree_top.png`,
      side: `${TEXTURE_BASE}/default_tree.png`,
    },
  },
  [BlockId.OAK_LOG_Z]: {
    stepMaterial: 'wood',
    logAxis: 'z',
    textures: {
      top: `${TEXTURE_BASE}/default_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_tree_top.png`,
      side: `${TEXTURE_BASE}/default_tree.png`,
    },
  },
  /** 相思木，樹皮偏紅，樹冠扁而寬 */
  [BlockId.ACACIA_LOG]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_acacia_tree_top.png`,
      bottom: `${TEXTURE_BASE}/default_acacia_tree_top.png`,
      side: `${TEXTURE_BASE}/default_acacia_tree.png`,
    },
  },
  [BlockId.ACACIA_LEAVES]: {
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_acacia_leaves.png`,
      tint: [0.6, 0.72, 0.4],
    },
  },
  [BlockId.JUNGLE_LEAVES]: {
    swaysInWind: true,
    stepMaterial: 'grass',
    cutout: true,
    textures: {
      all: `${TEXTURE_BASE}/default_jungle_leaves.png`,
      tint: [0.36, 0.6, 0.3],
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
   * 拼花木地板
   *
   * 木座的甲板面用它，紋路比整片木板細，
   * 站上去看得出這是「做出來的台子」而不是一塊原木
   */
  [BlockId.WOOD_TILE]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_wood_tile.png`,
    },
  },
  [BlockId.TATAMI]: {
    stepMaterial: 'cloth',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_tatami.png`,
    },
  },
  /**
   * 竹
   *
   * xdecor_bamboo_frame 是一片鏤空的格柵，五成以上是透明像素，
   * 當成實心方塊用一樣會透出黑色。
   * 改用實心的淺色木紋再染成竹的黃綠，才是一根竹子該有的樣子
   */
  [BlockId.BAMBOO_BLOCK]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_aspen_wood.png`,
      tint: [0.82, 0.88, 0.55],
    },
  },
  /**
   * 障子門
   *
   * 原本用 xdecor_japanese_door，但那是一張 19x16 的門片圖，
   * 不是正方形的方塊面，貼上去會被拉成歪的。
   * 改用直紋的簾布再染成米白，遠看就是紙門上那幾道木櫺
   */
  [BlockId.PAPER_DOOR]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_curtain.png`,
      pixelTint: [1.55, 1.5, 1.38],
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
  [BlockId.BARREL]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/xdecor_barrel_top.png`,
      bottom: `${TEXTURE_BASE}/xdecor_barrel_top.png`,
      side: `${TEXTURE_BASE}/xdecor_barrel_sides.png`,
    },
  },
  [BlockId.CRATE]: {
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_crate.png`,
    },
  },
  [BlockId.CHEST]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/default_chest_top.png`,
      bottom: `${TEXTURE_BASE}/default_chest_top.png`,
      side: `${TEXTURE_BASE}/default_chest_side.png`,
    },
  },
  /** 灶膛燒著火，正面那張是有火光的畫格 */
  [BlockId.FURNACE]: {
    stepMaterial: 'stone',
    emissive: 0.35,
    textures: {
      top: `${TEXTURE_BASE}/default_furnace_top.png`,
      bottom: `${TEXTURE_BASE}/default_furnace_bottom.png`,
      side: `${TEXTURE_BASE}/default_furnace_front_active.png`,
    },
  },
  [BlockId.WORKBENCH]: {
    stepMaterial: 'wood',
    textures: {
      top: `${TEXTURE_BASE}/xdecor_workbench_top.png`,
      bottom: `${TEXTURE_BASE}/default_wood.png`,
      side: `${TEXTURE_BASE}/xdecor_workbench_sides.png`,
    },
  },
  /**
   * 灶上的鍋
   *
   * 頂面本來想用滾水的動畫圖，但 frameCount 是整顆方塊共用的：
   * 那張圖有八張畫格、側面卻只有一張，一起套下去側面會被壓成八分之一。
   * 動畫留給水與熔岩那種六面同圖的方塊，這裡改用靜態的鍋口
   */
  [BlockId.CAULDRON]: {
    stepMaterial: 'stone',
    textures: {
      top: `${TEXTURE_BASE}/xdecor_cauldron_top_idle.png`,
      bottom: `${TEXTURE_BASE}/xdecor_cauldron_sides.png`,
      side: `${TEXTURE_BASE}/xdecor_cauldron_sides.png`,
    },
  },
  [BlockId.LANTERN]: {
    stepMaterial: 'stone',
    emissive: 0.95,
    textures: {
      all: `${TEXTURE_BASE}/default_meselamp.png`,
    },
  },
  /** 和紙燈箱，光比燈石柔，暖色也重一些 */
  [BlockId.PAPER_LAMP]: {
    stepMaterial: 'wood',
    emissive: 0.8,
    textures: {
      all: `${TEXTURE_BASE}/xdecor_wooden_lightbox.png`,
      /** 和紙偏冷的白，跟石燈籠那盞暖黃的燈室分得開 */
      pixelTint: [0.92, 0.95, 1.02],
    },
  },
  /**
   * 石燈籠的燈室
   *
   * 原本用的是 default_mese_post_light：那張圖是給細柱狀的 nodebox 用的，
   * 只有正中央一條是燈光、其餘四分之三是透明的。
   * 貼到整顆立方體上，透明的部分沒有東西可透，就整片變成黑的——
   * 燈籠因此長成一塊中間卡著兩條黃線的黑方塊。
   * 換成本來就是整顆方塊的燈箱：木框圍著四面透光的紙
   */
  [BlockId.LANTERN_BOX]: {
    stepMaterial: 'wood',
    emissive: 0.7,
    textures: {
      all: `${TEXTURE_BASE}/xdecor_lightbox.png`,
    },
  },
  [BlockId.EMBER]: {
    stepMaterial: 'stone',
    emissive: 0.8,
    /** 一團營火，照出去的範圍是全場最大的 */
    lightLevel: 1,
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
  [BlockId.HONEY_BLOCK]: {
    stepMaterial: 'cloth',
    textures: {
      all: `${TEXTURE_BASE}/mobs_honey_block.png`,
    },
  },
  /**
   * 攤開的書
   *
   * 這張圖有三成是透明的（書頁以外都挖空了），
   * 當成立方體貼上去那些洞會變成黑邊。
   * 改成與睡蓮同一種外型：一片貼在檯面上的薄板，才是一本攤開放著的書
   */
  [BlockId.OPEN_BOOK]: {
    shape: 'flat',
    cutout: true,
    passable: true,
    isThinFloor: true,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_book_open.png`,
    },
  },
  /** 一副臥著的白骨，枯木林裡的時間感 */
  [BlockId.BONES]: {
    stepMaterial: 'stone',
    textures: {
      top: `${TEXTURE_BASE}/bones_top.png`,
      bottom: `${TEXTURE_BASE}/bones_bottom.png`,
      side: `${TEXTURE_BASE}/bones_side.png`,
    },
  },
  /**
   * 珊瑚
   *
   * 潮汐箱庭的水槽底下鋪這幾種，隔著半透明的水看下去是一片斑斕。
   * 白化的珊瑚骨混一點進去，顏色才不會像調色盤
   */
  [BlockId.CORAL_ORANGE]: {
    stepMaterial: 'coral',
    textures: {
      all: `${TEXTURE_BASE}/default_coral_orange.png`,
    },
  },
  [BlockId.CORAL_BROWN]: {
    stepMaterial: 'coral',
    textures: {
      all: `${TEXTURE_BASE}/default_coral_brown.png`,
    },
  },
  [BlockId.CORAL_SKELETON]: {
    stepMaterial: 'coral',
    textures: {
      all: `${TEXTURE_BASE}/default_coral_skeleton.png`,
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
  [BlockId.BROWN_MUSHROOM]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_mushroom_brown.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_VIOLA]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_viola.png`,
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_WHITE_DANDELION]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/flowers_dandelion_white.png`,
      tint: [0.9, 0.9, 0.9],
    },
  },
  /** 大朵的野花，一叢裡放一兩株就有主次 */
  [BlockId.BIG_FLOWER]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_bigflower.png`,
      tint: [0.86, 0.86, 0.86],
    },
  },
  /** 月見草，夜庭與石庭的白色點綴 */
  [BlockId.MOON_FLOWER]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_moonflower.png`,
      tint: [0.9, 0.9, 0.94],
    },
  },
  [BlockId.FIRE_FLOWER]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_fireflower.png`,
      tint: [0.88, 0.82, 0.78],
    },
  },
  [BlockId.CURLY_PLANT]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_curly.png`,
      tint: [0.5, 0.68, 0.36],
    },
  },
  /** 長在岩縫裡的耐旱草，雪稜與石庭用它 */
  [BlockId.STONE_PLANT]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_stoneplant.png`,
      tint: [0.62, 0.68, 0.56],
    },
  },
  [BlockId.WILD_GRASS]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_grass_5.png`,
      tint: [0.5, 0.72, 0.34],
    },
  },
  /**
   * 麥
   *
   * 用乾草的貼圖逐像素推成金色。倍率大於一是必要的：
   * tint 只能把顏色調暗，而乾草本來就偏灰綠，
   * 靠 tint 永遠調不出被曬熟的那種黃。
   *
   * 麥田整片都會隨風擺——交叉立板一律吃搖擺，
   * 這是全場最看得出那陣風的地方
   */
  [BlockId.WHEAT]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_dry_grass.png`,
      pixelTint: [1.32, 1.06, 0.5],
    },
  },
  /** 抽穗的那幾株，顏色再深一點，混在田裡高度才不整齊 */
  [BlockId.WHEAT_TALL]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_dry_grass_5.png`,
      pixelTint: [1.24, 0.94, 0.42],
    },
  },
  [BlockId.JUNGLE_FLOWER]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_jungleflower2.png`,
      tint: [0.86, 0.8, 0.8],
    },
  },
  [BlockId.BUSH]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/moreplants_bush.png`,
      tint: [0.46, 0.64, 0.34],
    },
  },
  [BlockId.DRY_GRASS]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_dry_grass_3.png`,
      tint: [0.82, 0.74, 0.5],
    },
  },
  [BlockId.JUNGLE_GRASS]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_junglegrass.png`,
      tint: [0.4, 0.62, 0.32],
    },
  },
  /** 蘆葦，長得比草高，站在水邊擋住半個視線才有岸的感覺 */
  [BlockId.PAPYRUS]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_papyrus.png`,
      tint: [0.6, 0.74, 0.42],
    },
  },
  [BlockId.CACTUS]: {
    stepMaterial: 'grass',
    textures: {
      top: `${TEXTURE_BASE}/default_cactus_top.png`,
      bottom: `${TEXTURE_BASE}/default_cactus_top.png`,
      side: `${TEXTURE_BASE}/default_cactus_side.png`,
    },
  },
  /** 蛛網，掛在洞窟深處的岩縫之間 */
  [BlockId.COBWEB]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'cloth',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_cobweb.png`,
      tint: [0.9, 0.9, 0.9],
    },
  },
  /** 藤蔓，爬在遺跡的石牆上 */
  [BlockId.IVY]: {
    shape: 'cross',
    passable: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_ivy.png`,
      tint: [0.44, 0.62, 0.34],
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
  /**
   * 鋪在地上的落葉
   *
   * 與睡蓮同一種外型：貼在地面的一片平板，踩得過去。
   * 落葉林的地面若只有草，抬頭是滿樹金黃、低頭卻是夏天
   */
  [BlockId.FALLEN_LEAVES]: {
    shape: 'flat',
    passable: true,
    isThinFloor: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_aspen_leaves.png`,
      /** 落在地上的葉子已經乾了一陣子，顏色比枝頭上的暗一階 */
      pixelTint: [2.88, 0.57, 1.03],
    },
  },
  /**
   * 林地腐葉
   *
   * 與落葉同樣是貼地的一片平板，顏色是踩爛之後的深褐。
   * 針葉林的地面只有草會太乾淨，鋪一層才有落了幾年葉子的樣子
   */
  [BlockId.FOREST_LITTER]: {
    shape: 'flat',
    passable: true,
    isThinFloor: true,
    stepMaterial: 'grass',
    textures: {
      all: `${TEXTURE_BASE}/default_rainforest_litter.png`,
      tint: [0.72, 0.66, 0.5],
    },
  },
  [BlockId.FENCE]: {
    shape: 'fence',
    collisionWidth: 0.4,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_wood.png`,
    },
  },
  /**
   * 鐵鏈
   *
   * 用圍籬的外型：那本來就是一根立在格子中央的細柱，
   * 拿來當垂下來的鏈子剛好。碰撞也跟著細，站在鐘底下不會被卡住
   */
  [BlockId.CHAIN]: {
    shape: 'fence',
    cutout: true,
    collisionWidth: 0.3,
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_chainlink.png`,
    },
  },
  [BlockId.BAMBOO_FENCE]: {
    shape: 'fence',
    collisionWidth: 0.4,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_aspen_wood.png`,
      tint: [0.82, 0.88, 0.55],
    },
  },
  /** 梯子：一片貼在牆上的薄板，穿得過去 */
  [BlockId.LADDER]: {
    shape: 'pane',
    cutout: true,
    passable: true,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_ladder_wood.png`,
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
  [BlockId.DARK_WOOD_SLAB]: {
    shape: 'slab',
    collisionHeight: 0.5,
    stepMaterial: 'wood',
    textures: {
      all: `${TEXTURE_BASE}/default_junglewood.png`,
    },
  },
  /** 坐墊：半格高的一片布，踩上去只差半階 */
  [BlockId.CUSHION]: {
    shape: 'slab',
    collisionHeight: 0.5,
    stepMaterial: 'cloth',
    textures: {
      all: `${TEXTURE_BASE}/xdecor_cushion.png`,
    },
  },
  [BlockId.WHITE_STONE_SLAB]: {
    shape: 'slab',
    collisionHeight: 0.5,
    stepMaterial: 'stone',
    textures: {
      all: `${TEXTURE_BASE}/default_silver_sandstone.png`,
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

/** 方塊的水平碰撞寬度，預設整格 */
export function getCollisionWidth(blockId: BlockId): number {
  return BLOCK_DEFS[blockId]?.collisionWidth ?? 1
}

/** 方塊是否為只擋住墜落的薄地板 */
export function isThinFloorBlock(blockId: BlockId): boolean {
  return BLOCK_DEFS[blockId]?.isThinFloor === true
}
