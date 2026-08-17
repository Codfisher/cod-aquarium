import type { TextureKey } from './texture-pack'

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
   * 燒焦的枯木
   *
   * 與枯木同一張貼圖，只是把色調壓成炭黑。
   * 枯木是曬白的，燒焦的是黑的——地獄谷那幾株是被熱氣烤死的，
   * 用曬白那一種會顯得那裡只是乾，而不是燙
   */
  CHARRED_LOG,
  CHARRED_LOG_X,
  CHARRED_LOG_Z,
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
  /**
   * 飛石
   *
   * 日本庭園的定義性元素。整格的石板鋪起來是「鋪面」，
   * 而飛石是散在砂上、只高出來一點點的幾塊石頭——
   * 它不是路，它是「請走這裡」
   */
  STEPPING_STONE,
  /** 薄雪，積在地面與屋頂上的那一層 */
  SNOW_LAYER,
  /** 攤在木地板上的一疊榻榻米，比整格的榻榻米矮 */
  TATAMI_MAT,
  /** 竹稈，細得可以從兩根之間走過去 */
  BAMBOO_STALK,
  /** 木樁，棧橋與矮欄用它 */
  WOOD_POST,
  /**
   * 障子門
   *
   * 立在格子正中央的薄板，兩種朝向各自是一種方塊。
   * 與整格的紙門不同：那是一堵牆，這是一片能透光的紙
   */
  SHOJI_PANEL_X,
  SHOJI_PANEL_Z,
  /** 雨戶，擋在障子外面的木板 */
  STORM_PANEL_X,
  STORM_PANEL_Z,
  /**
   * 風鈴
   *
   * 一座聲音的禪庭本來就該有一個。吊在簷下，短籤跟著風搖
   */
  WIND_CHIME,
  /** 吊在簷下的和紙提燈 */
  HANGING_LAMP,
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
 * - `layer`：貼著地面的薄層，飛石與薄雪都是這一種
 * - `post`：立在中央的細柱，竹子與樁
 * - `panel`：立在中央的薄板，紙門與雨戶
 * - `hanging`：吊在上一格底下的小東西，風鈴與提燈
 *
 * 後面那四種共用 shapeThickness 決定「薄到什麼程度」，
 * 一個屬性換四種外型，不必為每一種各開一個數字
 */
export type BlockShape =
  | 'cube' | 'cross' | 'flat' | 'slab' | 'stairs' | 'fence' | 'pane' | 'pot'
  | 'layer' | 'post' | 'panel' | 'hanging'

/** 階梯靠背所在的那一側 */
export type StairsFacing = 'north' | 'south' | 'east' | 'west'

/**
 * 方塊材質定義：支援 per-face 或單一材質
 *
 * 這裡寫的是貼圖的語意名稱而不是檔案路徑：
 * 方塊只說「我要石頭」，哪一張圖由目前的材質包決定（見 texture-pack.ts）。
 * 同一顆方塊因此能在八格見方的手繪貼圖與一二八格的立體貼圖之間直接對換
 */
export interface BlockTextureDef {
  /** 所有面使用同一材質時 */
  all?: TextureKey;
  /** 個別面材質（覆寫 all） */
  top?: TextureKey;
  side?: TextureKey;
  bottom?: TextureKey;
  /** 疊加在基底材質上的覆蓋層 */
  overlay?: TextureKey;
  /** 個別面的覆蓋層 */
  sideOverlay?: TextureKey;
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
  /**
   * 把 pixelTint 當成「目標色」而不是「倍率」
   *
   * 倍率是逐通道相乘，結果同時取決於底圖原本是什麼顏色。
   * 綠葉的紅只有 0.26，要染成秋天的橘就得乘三倍多——
   * 那組數字換一套材質包就不成立了：底圖偏灰白時紅會直接乘爆到滿檔、
   * 藍又被乘大，出來是粉紅色的葉子。
   *
   * 開了這個旗標之後，改成先取這個像素的亮度、再乘上目標色。
   * 明暗的層次留著，色相則完全由目標色決定，
   * 底圖是綠的、灰的還是黃的都染得出同一種秋色
   */
  pixelRecolor?: boolean;
  /** 頂面色調（灰階貼圖上色用） */
  topTint?: [number, number, number];
  sideTint?: [number, number, number];
  /**
   * 動畫張數
   *
   * 貼圖是直向疊起來的連續畫格，水就是靠這個流動起來的。
   * 材質會把 v 軸縮成 1 / frameCount，再逐格捲動。
   *
   * 這裡寫的是預設值：張數其實是材質包的性質，
   * 同一道瀑布在手繪貼圖裡是六張、在原版是三十二張，
   * 所以材質包可以自己覆寫（見 texture-pack.ts 的 PackTexture）
   */
  frameCount?: number;
}

/**
 * 液體最上層比方塊頂面矮多少，與 Minecraft 相同取八分之一格
 *
 * 繪製與碰撞都要用到這個數字：一邊決定水面畫在哪，
 * 另一邊決定眼睛什麼時候算是沉到液面底下了。各寫一份就會對不起來
 */
export const LIQUID_SURFACE_DROP = 0.125

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
  plantTexture?: TextureKey;
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
  /**
   * 自發光強度，燈籠與餘燼在暗處要看得出在發亮
   *
   * 一是「貼圖原本的亮度」，也就是全亮的方塊。多數發光方塊到這裡就夠了。
   *
   * 要讓一顆方塊看起來是光源而不是一塊亮石頭，就得超過一。
   * 這個值會併進光照量再乘上貼圖（見 voxel-renderer），
   * 超過一的部分交給 ACES 色調映射去收——那條曲線在高處壓得很兇，
   * 所以不會爆成死白，而是把顏色往光的方向推。
   *
   * 超過一時記得另外給 lightLevel，否則照出去的範圍會跟著一起漲
   */
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
   * 這種植物最高疊幾格（含自己），不給就是一格
   *
   * 竹稈是一節一節長上去的，一叢裡有高有矮才像一叢竹子；
   * 全部一格高則像地上鋪了一層短短的樁。
   *
   * 疊出來的每一格都是各自獨立的方塊，所以它們不能會擺——
   * 每一節從自己那一格的底部彎的話，節與節之間會錯開
   * （見 PAPYRUS 的 swaysInWind）
   */
  stackHeightMax?: number;
  /**
   * 逆光時會不會透光
   *
   * 給樹葉用。交叉立板的花草一律會透，不必特別指定——
   * 那些東西薄到只有一層，逆光時本來就近乎半透明；
   * 立方體的方塊則要自己說，同樣是鏤空貼圖的玻璃與鐵鏈都不該發亮。
   *
   * 與 swaysInWind 分開是刻意的：蜘蛛網不會擺（洞裡沒有風），
   * 但它逆著洞口的光看確實是透的——兩件事沒有必然關係
   */
  translucent?: boolean;
  /**
   * 是否投出陰影，預設 true
   *
   * 給那些「本來就該與地面同一個平面」的方塊用。
   * 它們的頂面與周圍的沙齊平，但陰影是照方塊的整個身體算的，
   * 於是太陽一斜就從側面拖出一道影子，看起來像整塊浮起來了
   */
  castShadow?: boolean;
  /** 階梯靠背所在的那一側，只有 shape 為 stairs 時有意義 */
  stairsFacing?: StairsFacing;
  /**
   * 薄到什麼程度（格）
   *
   * layer 拿它當高度、post 與 panel 拿它當厚度、hanging 拿它當整團的大小。
   * 四種外型共用一個數字，是因為它們問的是同一件事：
   * 「這東西比一整格瘦多少」
   */
  shapeThickness?: number;
  /**
   * 薄板順著哪一軸站
   *
   * 只有 shape 為 panel 時有意義。x 代表板面沿著 x 軸展開、厚度落在 z 上。
   * 與躺著的原木同樣的處理：世界狀態一格只存得下一個編號，
   * 沒有地方放旋轉角度，所以每一種朝向各自是一種方塊
   */
  panelAxis?: 'x' | 'z';
  /**
   * 吊著的東西底下還垂著一片布或紙
   *
   * 只有 shape 為 hanging 時有意義。風鈴的短籤、提燈底下的穗子都靠它，
   * 而它會跟著風搖——那正是把「吊著」與「立著」分開的東西
   */
  hangingTailTexture?: TextureKey;
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
    textures: {
      all: 'bedrock',
    },
  },
  [BlockId.STONE]: {
    textures: {
      all: 'stone',
    },
  },
  [BlockId.COBBLESTONE]: {
    textures: {
      all: 'cobblestone',
    },
  },
  [BlockId.MOSSY_COBBLESTONE]: {
    textures: {
      all: 'mossyCobblestone',
    },
  },
  [BlockId.STONE_BRICKS]: {
    textures: {
      all: 'stoneBricks',
    },
  },
  [BlockId.STONE_TILE]: {
    textures: {
      all: 'stoneTile',
    },
  },
  [BlockId.RUNE_STONE]: {
    textures: {
      all: 'runeStone',
    },
  },
  [BlockId.GRAVEL]: {
    textures: {
      all: 'gravel',
    },
  },
  [BlockId.CLAY]: {
    textures: {
      all: 'clay',
    },
  },
  [BlockId.DIRT]: {
    textures: {
      all: 'dirt',
    },
  },
  [BlockId.GRASS]: {
    textures: {
      top: 'grassTop',
      side: 'dirt',
      sideOverlay: 'grassSideOverlay',
      bottom: 'dirt',
      topTint: [0.55, 0.75, 0.36],
    },
  },
  [BlockId.SAND]: {
    textures: {
      all: 'sand',
    },
  },
  [BlockId.SANDSTONE]: {
    textures: {
      all: 'sandstone',
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
  },
  /** 箱庭甲板上鋪的白沙，數量少，照常畫 */
  [BlockId.GARDEN_SAND]: {
    textures: {
      all: 'whiteSand',
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
      all: 'rakedSand',
      pixelTint: [0.9, 0.9, 0.92],
    },
  },
  [BlockId.WHITE_SANDSTONE]: {
    textures: {
      all: 'whiteSandstone',
    },
  },
  [BlockId.SNOW]: {
    textures: {
      top: 'snowTop',
      side: 'snowSide',
      bottom: 'dirt',
    },
  },
  [BlockId.ICE]: {
    alpha: 0.8,
    receiveShadow: false,
    textures: {
      all: 'ice',
    },
  },
  /** 壓實的冰是不透明的，凍住的池面用它才踩得住、也看不穿 */
  [BlockId.PACKED_ICE]: {
    textures: {
      all: 'packedIce',
    },
  },
  [BlockId.OBSIDIAN_BRICKS]: {
    textures: {
      all: 'obsidianBricks',
    },
  },
  /** 磚面上有一圈淡淡的月紋，是月語庭唯一的花樣 */
  [BlockId.MOON_BRICKS]: {
    textures: {
      all: 'moonBricks',
    },
  },
  /**
   * 熔岩
   *
   * 只埋在湯屋的岩池底下當熱源。自發光給滿，隔著水看下去
   * 池底會透出一層橘紅，那是「這池水為什麼是燙的」唯一的解釋
   */
  [BlockId.LAVA]: {
    /**
     * 超過一，它才是一池燒著的東西
     *
     * 給一的時候岩漿只是「貼圖全亮」——夜裡看過去是一塊橘色的石頭，
     * 它從來不會比一面被太陽照到的牆更亮，於是怎麼看都不像在發光。
     *
     * 這個場景沒有開 bloom，也刻意不給岩漿光暈
     * （整片液面每兩格一顆圓盤會糊成一塊白，見 lamp-glow），
     * 所以「看起來在發光」這件事只剩自發光本身能做。
     * 推到一點七，ACES 會把超出的部分往橘紅收，亮起來而不是白掉
     */
    emissive: 1.7,
    /**
     * 照出去的範圍維持原樣
     *
     * 沒指定的話它會跟著自發光一起漲，整座地獄谷的岩壁會被烤亮一圈。
     * 要改的是「岩漿自己看起來多亮」，不是「它照得多遠」
     */
    lightLevel: 1,
    /**
     * 與水一樣是可以沉進去的液體
     *
     * 熔岩原本是實心的，走過去就像踩在一塊發光的石頭上——
     * 那讓整座地獄谷變成一個安全的裝置藝術。
     * 會沉下去之後，那道縫才真的是一道不該踏進去的縫
     */
    passable: true,
    isLiquid: true,
    flatShaded: true,
    receiveShadow: false,
    textures: {
      all: 'lava',
      frameCount: 6,
    },
  },
  [BlockId.WATER]: {
    alpha: 0.72,
    passable: true,
    isLiquid: true,
    receiveShadow: false,
    flatShaded: true,
    textures: {
      all: 'waterStill',
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
    alpha: 0.72,
    passable: true,
    isLiquid: true,
    receiveShadow: false,
    flatShaded: true,
    textures: {
      all: 'waterFlowing',
      frameCount: 14,
      tint: [0.6, 0.82, 1],
    },
  },
  [BlockId.OAK_LOG]: {
    textures: {
      top: 'oakLogTop',
      bottom: 'oakLogTop',
      side: 'oakLogSide',
    },
  },
  [BlockId.OAK_LEAVES]: {
    swaysInWind: true,
    translucent: true,
    cutout: true,
    textures: {
      all: 'oakLeaves',
      tint: [0.5, 0.72, 0.32],
    },
  },
  /** 白楊，樹皮是淺灰白色，一整片長在一起遠看就是一林子的白幹 */
  [BlockId.ASPEN_LOG]: {
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
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
    translucent: true,
    cutout: true,
    textures: {
      all: 'aspenLeaves',
      /** 琥珀：偏紅的橘。這是目標色不是倍率，見 pixelRecolor */
      pixelTint: [0.94, 0.45, 0.16],
      pixelRecolor: true,
    },
  },
  [BlockId.GOLD_LEAVES]: {
    swaysInWind: true,
    translucent: true,
    cutout: true,
    textures: {
      all: 'aspenLeaves',
      /** 金黃：這一座叫金葉苑，它得真的是金的 */
      pixelTint: [0.97, 0.72, 0.2],
      pixelRecolor: true,
    },
  },
  [BlockId.PINE_LOG]: {
    textures: {
      top: 'pineLogTop',
      bottom: 'pineLogTop',
      side: 'pineLogSide',
    },
  },
  [BlockId.PINE_LEAVES]: {
    swaysInWind: true,
    translucent: true,
    cutout: true,
    textures: {
      all: 'pineLeaves',
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
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.72, 0.67, 0.58],
    },
  },
  /** 躺著的枯木，年輪轉到兩端 */
  [BlockId.DEAD_LOG_X]: {
    logAxis: 'x',
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.72, 0.67, 0.58],
    },
  },
  [BlockId.DEAD_LOG_Z]: {
    logAxis: 'z',
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.72, 0.67, 0.58],
    },
  },
  /**
   * 燒焦的枯木
   *
   * 貼圖與枯木同一張，差別只在色調：枯木是 0.72 的曬白，
   * 這裡壓到 0.19 的炭黑，再讓紅通道比藍通道高一點——
   * 燒過的木頭不是中性灰，它帶著一點暗紅
   */
  [BlockId.CHARRED_LOG]: {
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.21, 0.17, 0.16],
    },
  },
  [BlockId.CHARRED_LOG_X]: {
    logAxis: 'x',
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.21, 0.17, 0.16],
    },
  },
  [BlockId.CHARRED_LOG_Z]: {
    logAxis: 'z',
    textures: {
      top: 'aspenLogTop',
      bottom: 'aspenLogTop',
      side: 'aspenLogSide',
      tint: [0.21, 0.17, 0.16],
    },
  },
  /** 躺著的橡木，柴堆與橫枝用它 */
  [BlockId.OAK_LOG_X]: {
    logAxis: 'x',
    textures: {
      top: 'oakLogTop',
      bottom: 'oakLogTop',
      side: 'oakLogSide',
    },
  },
  [BlockId.OAK_LOG_Z]: {
    logAxis: 'z',
    textures: {
      top: 'oakLogTop',
      bottom: 'oakLogTop',
      side: 'oakLogSide',
    },
  },
  /** 相思木，樹皮偏紅，樹冠扁而寬 */
  [BlockId.ACACIA_LOG]: {
    textures: {
      top: 'acaciaLogTop',
      bottom: 'acaciaLogTop',
      side: 'acaciaLogSide',
    },
  },
  [BlockId.ACACIA_LEAVES]: {
    swaysInWind: true,
    translucent: true,
    cutout: true,
    textures: {
      all: 'acaciaLeaves',
      tint: [0.6, 0.72, 0.4],
    },
  },
  [BlockId.JUNGLE_LEAVES]: {
    swaysInWind: true,
    translucent: true,
    cutout: true,
    textures: {
      all: 'jungleLeaves',
      tint: [0.36, 0.6, 0.3],
    },
  },
  [BlockId.PLANKS]: {
    textures: {
      all: 'planks',
    },
  },
  [BlockId.DARK_PLANKS]: {
    textures: {
      all: 'darkPlanks',
    },
  },
  /**
   * 拼花木地板
   *
   * 木座的甲板面用它，紋路比整片木板細，
   * 站上去看得出這是「做出來的台子」而不是一塊原木
   */
  [BlockId.WOOD_TILE]: {
    textures: {
      all: 'woodTile',
    },
  },
  [BlockId.TATAMI]: {
    textures: {
      all: 'tatami',
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
    textures: {
      all: 'aspenPlanks',
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
    textures: {
      all: 'paperDoor',
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
    cutout: true,
    textures: {
      all: 'glass',
    },
  },
  [BlockId.HAY]: {
    textures: {
      all: 'hay',
    },
  },
  [BlockId.BOOKSHELF]: {
    textures: {
      top: 'planks',
      bottom: 'planks',
      side: 'bookshelfSide',
    },
  },
  [BlockId.BARREL]: {
    textures: {
      top: 'barrelTop',
      bottom: 'barrelTop',
      side: 'barrelSide',
    },
  },
  [BlockId.CRATE]: {
    textures: {
      all: 'crate',
    },
  },
  [BlockId.CHEST]: {
    textures: {
      top: 'chestTop',
      bottom: 'chestTop',
      side: 'chestSide',
    },
  },
  /** 灶膛燒著火，正面那張是有火光的畫格 */
  [BlockId.FURNACE]: {
    emissive: 0.35,
    textures: {
      top: 'furnaceTop',
      bottom: 'furnaceBottom',
      side: 'furnaceFront',
    },
  },
  [BlockId.WORKBENCH]: {
    textures: {
      top: 'workbenchTop',
      bottom: 'planks',
      side: 'workbenchSide',
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
    textures: {
      top: 'cauldronTop',
      bottom: 'cauldronSide',
      side: 'cauldronSide',
    },
  },
  [BlockId.LANTERN]: {
    emissive: 0.95,
    textures: {
      all: 'lantern',
    },
  },
  /** 和紙燈箱，光比燈石柔，暖色也重一些 */
  [BlockId.PAPER_LAMP]: {
    emissive: 0.8,
    textures: {
      all: 'paperLamp',
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
    emissive: 0.7,
    textures: {
      all: 'lanternBox',
    },
  },
  [BlockId.EMBER]: {
    emissive: 0.8,
    /** 一團營火，照出去的範圍是全場最大的 */
    lightLevel: 1,
    textures: {
      all: 'ember',
    },
  },
  [BlockId.BRICKS]: {
    textures: {
      all: 'bricks',
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
    textures: {
      all: 'coalOreBase',
      overlay: 'coalOreOverlay',
    },
  },
  [BlockId.IRON_ORE]: {
    textures: {
      all: 'ironOreBase',
      overlay: 'ironOreOverlay',
    },
  },
  [BlockId.COPPER_ORE]: {
    textures: {
      all: 'copperOreBase',
      overlay: 'copperOreOverlay',
    },
  },
  [BlockId.GOLD_ORE]: {
    textures: {
      all: 'goldOreBase',
      overlay: 'goldOreOverlay',
    },
  },
  [BlockId.DIAMOND_ORE]: {
    emissive: 0.2,
    textures: {
      all: 'diamondOreBase',
      overlay: 'diamondOreOverlay',
    },
  },
  [BlockId.HIVE]: {
    textures: {
      top: 'hiveTop',
      bottom: 'hiveTop',
      side: 'hiveSide',
    },
  },
  [BlockId.HONEY_BLOCK]: {
    textures: {
      all: 'honeyBlock',
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
    textures: {
      all: 'openBook',
    },
  },
  /** 一副臥著的白骨，枯木林裡的時間感 */
  [BlockId.BONES]: {
    textures: {
      top: 'bonesTop',
      bottom: 'bonesBottom',
      side: 'bonesSide',
    },
  },
  /**
   * 珊瑚
   *
   * 潮汐箱庭的水槽底下鋪這幾種，隔著半透明的水看下去是一片斑斕。
   * 白化的珊瑚骨混一點進去，顏色才不會像調色盤
   */
  [BlockId.CORAL_ORANGE]: {
    textures: {
      all: 'coralOrange',
    },
  },
  [BlockId.CORAL_BROWN]: {
    textures: {
      all: 'coralBrown',
    },
  },
  [BlockId.CORAL_SKELETON]: {
    textures: {
      all: 'coralSkeleton',
    },
  },

  // ── 非正立方體的裝飾方塊 ──
  [BlockId.TALL_GRASS]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'tallGrass',
      tint: [0.55, 0.75, 0.36],
    },
  },
  [BlockId.FERN]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'fern',
      tint: [0.46, 0.66, 0.34],
    },
  },
  [BlockId.DRY_SHRUB]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'dryShrub',
      tint: [0.72, 0.62, 0.44],
    },
  },
  [BlockId.FLOWER_ROSE]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'flowerRose',
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_TULIP]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'flowerTulip',
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_DANDELION]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'flowerDandelion',
      tint: [0.84, 0.84, 0.84],
    },
  },
  /**
   * 蘑菇不搖
   *
   * 交叉立板預設會跟著風彎，那是給草與花用的：它們是軟的、細的，
   * 風一過整片倒下去。蘑菇不是植物那種構造——它是一根短而硬的柄
   * 頂著一頂傘，現實裡風吹過去它動都不動。
   *
   * 讓它跟著草一起搖，整片林地看起來就像每一樣東西都是布做的
   */
  [BlockId.MUSHROOM]: {
    shape: 'cross',
    passable: true,
    swaysInWind: false,
    textures: {
      all: 'mushroomRed',
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.BROWN_MUSHROOM]: {
    shape: 'cross',
    passable: true,
    swaysInWind: false,
    textures: {
      all: 'mushroomBrown',
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_VIOLA]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'flowerViola',
      tint: [0.84, 0.84, 0.84],
    },
  },
  [BlockId.FLOWER_WHITE_DANDELION]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'flowerWhiteDandelion',
      tint: [0.9, 0.9, 0.9],
    },
  },
  /** 大朵的野花，一叢裡放一兩株就有主次 */
  [BlockId.BIG_FLOWER]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'bigFlower',
      tint: [0.86, 0.86, 0.86],
    },
  },
  /** 月見草，夜庭與石庭的白色點綴 */
  [BlockId.MOON_FLOWER]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'moonFlower',
      tint: [0.9, 0.9, 0.94],
    },
  },
  [BlockId.FIRE_FLOWER]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'fireFlower',
      tint: [0.88, 0.82, 0.78],
    },
  },
  [BlockId.CURLY_PLANT]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'curlyPlant',
      tint: [0.5, 0.68, 0.36],
    },
  },
  /** 長在岩縫裡的耐旱草，雪稜與石庭用它 */
  [BlockId.STONE_PLANT]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'stonePlant',
      tint: [0.62, 0.68, 0.56],
    },
  },
  [BlockId.WILD_GRASS]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'wildGrass',
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
    textures: {
      all: 'wheat',
      pixelTint: [1.32, 1.06, 0.5],
    },
  },
  /** 抽穗的那幾株，顏色再深一點，混在田裡高度才不整齊 */
  [BlockId.WHEAT_TALL]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'wheatTall',
      pixelTint: [1.24, 0.94, 0.42],
    },
  },
  [BlockId.JUNGLE_FLOWER]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'jungleFlower',
      tint: [0.86, 0.8, 0.8],
    },
  },
  [BlockId.BUSH]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'bush',
      tint: [0.46, 0.64, 0.34],
    },
  },
  [BlockId.DRY_GRASS]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'dryGrass',
      tint: [0.82, 0.74, 0.5],
    },
  },
  [BlockId.JUNGLE_GRASS]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'jungleGrass',
      tint: [0.4, 0.62, 0.32],
    },
  },
  /** 蘆葦，長得比草高，站在水邊擋住半個視線才有岸的感覺 */
  [BlockId.PAPYRUS]: {
    shape: 'cross',
    passable: true,
    /**
     * 竹稈不搖也不倒
     *
     * 這是一根有節的硬稈，不是一叢草。草被風推是因為它軟，
     * 而稈的動法是整根從根部微微擺，不是頂端被吹歪——
     * 那個差別在畫面上很清楚：一片草跟著風倒過去很好看，
     * 同一個動作套在竹稈上會變成幾根麵條在扭。
     *
     * 它還會疊高。一根三格高的稈是三顆各自獨立的方塊，
     * 每一顆都從自己那一格的底部彎，所以節與節之間會錯開——
     * 上面那截的根跟著上面那截走，下面那截的頂跟著下面那截走，
     * 中間就裂成一段一段。這是「整株一起動」與「逐塊動」的差別，
     * 而立板沒有辦法知道自己是第幾節。
     *
     * 與蜘蛛網同一個開關，理由不同：那裡是洞裡沒有風，這裡是它不該軟
     */
    swaysInWind: false,
    /** 一叢竹子要有高有矮，一到五格 */
    stackHeightMax: 5,
    textures: {
      all: 'papyrus',
      tint: [0.6, 0.74, 0.42],
    },
  },
  [BlockId.CACTUS]: {
    textures: {
      top: 'cactusTop',
      bottom: 'cactusTop',
      side: 'cactusSide',
    },
  },
  /** 蛛網，掛在洞窟深處的岩縫之間 */
  [BlockId.COBWEB]: {
    shape: 'cross',
    passable: true,
    /** 洞裡沒有風。蜘蛛網跟著花草一起搖，整個山洞會看起來像在戶外 */
    swaysInWind: false,
    textures: {
      all: 'cobweb',
      tint: [0.9, 0.9, 0.9],
    },
  },
  /** 藤蔓，爬在遺跡的石牆上 */
  [BlockId.IVY]: {
    shape: 'cross',
    passable: true,
    textures: {
      all: 'ivy',
      tint: [0.44, 0.62, 0.34],
    },
  },
  [BlockId.LILY_PAD]: {
    shape: 'flat',
    passable: true,
    /** 踩得上去，游過去也不會被葉子擋住 */
    isThinFloor: true,
    textures: {
      all: 'lilyPad',
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
    textures: {
      all: 'fallenLeaves',
      /** 落在地上的葉子已經乾了一陣子，顏色比枝頭上的暗一階、也更褐 */
      pixelTint: [0.78, 0.38, 0.18],
      pixelRecolor: true,
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
    textures: {
      all: 'forestLitter',
      tint: [0.72, 0.66, 0.5],
    },
  },
  [BlockId.FENCE]: {
    shape: 'fence',
    collisionWidth: 0.4,
    textures: {
      all: 'planks',
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
    textures: {
      all: 'chain',
    },
  },
  [BlockId.BAMBOO_FENCE]: {
    shape: 'fence',
    collisionWidth: 0.4,
    textures: {
      all: 'aspenPlanks',
      tint: [0.82, 0.88, 0.55],
    },
  },
  /** 梯子：一片貼在牆上的薄板，穿得過去 */
  [BlockId.LADDER]: {
    shape: 'pane',
    cutout: true,
    passable: true,
    textures: {
      all: 'ladder',
    },
  },
  [BlockId.GLASS_PANE]: {
    shape: 'pane',
    cutout: true,
    textures: {
      all: 'glass',
    },
  },
  [BlockId.STONE_SLAB]: {
    shape: 'slab',
    /** 踩得上去，但只擋住下半格 */
    collisionHeight: 0.5,
    textures: {
      all: 'cobblestone',
    },
  },
  [BlockId.WOOD_SLAB]: {
    shape: 'slab',
    /** 踩得上去，但只擋住下半格 */
    collisionHeight: 0.5,
    textures: {
      all: 'planks',
    },
  },
  [BlockId.DARK_WOOD_SLAB]: {
    shape: 'slab',
    collisionHeight: 0.5,
    textures: {
      all: 'darkPlanks',
    },
  },
  /** 坐墊：半格高的一片布，踩上去只差半階 */
  [BlockId.CUSHION]: {
    shape: 'slab',
    collisionHeight: 0.5,
    textures: {
      all: 'cushion',
    },
  },
  [BlockId.WHITE_STONE_SLAB]: {
    shape: 'slab',
    collisionHeight: 0.5,
    textures: {
      all: 'whiteSandstone',
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
    textures: {
      all: 'planks',
    },
  },
  [BlockId.WOOD_STAIRS_SOUTH]: {
    shape: 'stairs',
    stairsFacing: 'south',
    collisionHeight: 0.5,
    textures: {
      all: 'planks',
    },
  },
  [BlockId.WOOD_STAIRS_EAST]: {
    shape: 'stairs',
    stairsFacing: 'east',
    collisionHeight: 0.5,
    textures: {
      all: 'planks',
    },
  },
  [BlockId.WOOD_STAIRS_WEST]: {
    shape: 'stairs',
    stairsFacing: 'west',
    collisionHeight: 0.5,
    textures: {
      all: 'planks',
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
    textures: {
      all: 'darkPlanks',
    },
  },
  [BlockId.DARK_STAIRS_SOUTH]: {
    shape: 'stairs',
    stairsFacing: 'south',
    collisionHeight: 0.5,
    textures: {
      all: 'darkPlanks',
    },
  },
  [BlockId.DARK_STAIRS_EAST]: {
    shape: 'stairs',
    stairsFacing: 'east',
    collisionHeight: 0.5,
    textures: {
      all: 'darkPlanks',
    },
  },
  [BlockId.DARK_STAIRS_WEST]: {
    shape: 'stairs',
    stairsFacing: 'west',
    collisionHeight: 0.5,
    textures: {
      all: 'darkPlanks',
    },
  },
  [BlockId.FLOWER_POT]: {
    shape: 'pot',
    passable: true,
    plantTexture: 'pottedPlant',
    textures: {
      all: 'flowerPot',
    },
  },
  /**
   * 飛石
   *
   * 三格厚（十六分之三）。再薄就看不出它高於地面，
   * 再厚踩上去會像在爬階梯——飛石該是「走過去不必抬腳」的那種高度。
   *
   * 用圓石而不是打磨過的石板：飛石是撿來的石頭，不是切出來的
   */
  [BlockId.STEPPING_STONE]: {
    shape: 'layer',
    shapeThickness: 0.1875,
    collisionHeight: 0.1875,
    textures: {
      all: 'cobblestone',
    },
  },
  /**
   * 薄雪
   *
   * 兩格厚。整格的雪塊是「這裡被雪埋了」，薄雪是「這裡下過雪」——
   * 底下那層地還看得見一點邊，差別全在這裡
   */
  [BlockId.SNOW_LAYER]: {
    shape: 'layer',
    shapeThickness: 0.125,
    collisionHeight: 0.125,
    textures: {
      all: 'snowTop',
    },
  },
  /** 攤在木地板上的榻榻米，四格厚，坐上去看得出它是墊在上面的 */
  [BlockId.TATAMI_MAT]: {
    shape: 'layer',
    shapeThickness: 0.25,
    collisionHeight: 0.25,
    textures: {
      all: 'tatami',
    },
  },
  /**
   * 竹稈
   *
   * 貼圖與竹方塊同一張（淺色木紋染成竹的黃綠），差別只在它是細的。
   * 碰撞寬度給到 0.3，一叢竹子因此走得進去——
   * 那正是竹林與竹牆的差別
   */
  [BlockId.BAMBOO_STALK]: {
    shape: 'post',
    shapeThickness: 0.3,
    collisionWidth: 0.3,
    textures: {
      all: 'aspenPlanks',
      tint: [0.82, 0.88, 0.55],
    },
  },
  /** 木樁，比竹子粗一點，是有人削出來立在那裡的 */
  [BlockId.WOOD_POST]: {
    shape: 'post',
    shapeThickness: 0.42,
    collisionWidth: 0.42,
    textures: {
      all: 'oakLogSide',
    },
  },
  /**
   * 障子門
   *
   * 立在格子正中央的薄板。紙門的意思是「這道牆會透光」，
   * 所以它要薄——整格的紙門看起來是一堵糊了紙的牆，不是一扇門
   */
  [BlockId.SHOJI_PANEL_X]: {
    shape: 'panel',
    panelAxis: 'x',
    shapeThickness: 0.14,
    collisionWidth: 0.14,
    textures: {
      all: 'paperDoor',
      pixelTint: [1.55, 1.5, 1.38],
    },
  },
  [BlockId.SHOJI_PANEL_Z]: {
    shape: 'panel',
    panelAxis: 'z',
    shapeThickness: 0.14,
    collisionWidth: 0.14,
    textures: {
      all: 'paperDoor',
      pixelTint: [1.55, 1.5, 1.38],
    },
  },
  /** 雨戶：擋在障子外面的那片木板，厚一點也暗一點 */
  [BlockId.STORM_PANEL_X]: {
    shape: 'panel',
    panelAxis: 'x',
    shapeThickness: 0.2,
    collisionWidth: 0.2,
    textures: {
      all: 'darkPlanks',
    },
  },
  [BlockId.STORM_PANEL_Z]: {
    shape: 'panel',
    panelAxis: 'z',
    shapeThickness: 0.2,
    collisionWidth: 0.2,
    textures: {
      all: 'darkPlanks',
    },
  },
  /**
   * 風鈴
   *
   * 一顆小鈴加底下一片短籤，吊在上一格底下。短籤跟著風搖，
   * 而鈴身不動——會動的是紙，不是玻璃。
   *
   * 這座禪庭整座都在講聲音，卻一直沒有一個「因為風而發聲」的東西。
   * 風鈴是那個缺口
   */
  [BlockId.WIND_CHIME]: {
    shape: 'hanging',
    shapeThickness: 0.34,
    passable: true,
    hangingTailTexture: 'paperDoor',
    textures: {
      /**
       * 鈴身用冰，不用燈
       *
       * 原本借的是和紙燈那張圖，而它在原版對到的是螢石——
       * 量過整張的亮度標準差是 62，全場最雜的一張。
       * 貼在一顆只有三分之一格的小鈴上，看到的全是顆粒。
       *
       * 冰的標準差是 8，而且它本來就是「淡藍、半透、平滑」——
       * 江戶風鈴本來就是玻璃做的，這比燈更接近它該有的樣子
       */
      all: 'ice',
    },
  },
  /** 吊在簷下的和紙提燈，比風鈴大，而且會亮 */
  [BlockId.HANGING_LAMP]: {
    shape: 'hanging',
    shapeThickness: 0.5,
    passable: true,
    emissive: 0.8,
    textures: {
      all: 'paperLamp',
      pixelTint: [0.92, 0.95, 1.02],
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
  white: 'woolWhite',
  grey: 'woolGrey',
  darkGrey: 'woolDarkGrey',
  brown: 'woolBrown',
  black: 'woolBlack',
  pink: 'woolPink',
} as const satisfies Record<string, TextureKey>

/** 方塊是否可穿越（不阻擋玩家） */
export function isPassableBlock(blockId: BlockId): boolean {
  return BLOCK_DEFS[blockId]?.passable === true
}

/** 是否為水，靜水與流水在物理上完全相同 */
export function isWaterBlock(blockId: BlockId): boolean {
  return blockId === BlockId.WATER || blockId === BlockId.FLOWING_WATER
}

/** 熔岩也是液體，泡進去的物理與水一樣，只有視覺與致命感不同 */
export function isLavaBlock(blockId: BlockId): boolean {
  return blockId === BlockId.LAVA
}

/** 方塊的碰撞高度，預設一整格 */
export function getCollisionHeight(blockId: BlockId): number {
  return BLOCK_DEFS[blockId]?.collisionHeight ?? 1
}

/** 這種植物最高疊幾格，預設一格 */
export function getStackHeightMax(blockId: BlockId): number {
  return BLOCK_DEFS[blockId]?.stackHeightMax ?? 1
}

/** 方塊的水平碰撞寬度，預設整格 */
export function getCollisionWidth(blockId: BlockId): number {
  return BLOCK_DEFS[blockId]?.collisionWidth ?? 1
}

/** 方塊是否為只擋住墜落的薄地板 */
export function isThinFloorBlock(blockId: BlockId): boolean {
  return BLOCK_DEFS[blockId]?.isThinFloor === true
}
