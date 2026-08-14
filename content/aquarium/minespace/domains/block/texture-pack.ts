/**
 * 材質包
 *
 * 方塊定義不再直接寫檔案路徑，改成寫一個「這是什麼東西」的 key，
 * 由這裡的材質包決定那個 key 在自己這一套裡是哪一張圖。
 *
 * 換句話說，方塊說的是「我要石頭」，材質包回答「石頭在我這叫 stone.png」。
 * 加一套新材質包只需要再寫一份對照表，方塊那一千五百行完全不必動。
 */

import {
  BARE_BONES_FILE_SET,
  BARE_BONES_NORMAL_SET,
  CRAYON_FILE_SET,
  OCD_FILE_SET,
  PIXEL_PERFECTION_FILE_SET,
  VANILLA_NORMAL_SET,
} from './texture-pack-manifest'

/**
 * 一張貼圖在某一套材質包裡的樣子
 *
 * 只寫檔名時是最單純的情況：換一張圖、其餘照舊。
 * 但同一顆方塊在不同材質包裡常常需要不同的處理——
 * 迷你像素的麥子是拿乾草染成金色的，原版本來就有一張成熟的麥，
 * 那個染色倍率套下去只會過曝，所以得連色調一起換掉
 */
export interface PackTexture {
  /** 檔名，不含副檔名，相對於材質包的根目錄 */
  file: string;
  /**
   * 動畫張數
   *
   * 這是材質包的性質而非方塊的：同樣是水，迷你像素只有六張畫格，
   * 原版是三十二張。寫在方塊上的話換一次包整條瀑布就會錯格
   */
  frameCount?: number;
  /**
   * 覆寫方塊定義的色調
   *
   * 給 null 表示「這張圖本身顏色就對了，不要再染」。
   * 原版的花草是實色的，迷你像素那組把灰階圖染上顏色的倍率
   * 套到已經有顏色的圖上，只會得到一朵髒掉的花
   */
  tint?: [number, number, number] | null;
  /** 同上，逐像素相乘的那一種 */
  pixelTint?: [number, number, number] | null;
}

/**
 * 對照表裡的一格
 *
 * - 字串：就是檔名，其餘沿用方塊定義
 * - 物件：檔名之外還要改動畫張數或色調
 * - null：這套材質包不需要這張圖
 *   （原版的礦石本來就是一整塊，不像迷你像素要拿礦點疊在石頭上）
 */
export type PackTextureEntry = string | PackTexture | null

/**
 * 貼圖的語意名稱
 *
 * 以迷你像素那一套的內容為準：它是這個世界長出來的地方，
 * 每一顆方塊的顏色與色調都是照著它調的，其餘材質包都是對著它翻譯
 */
export type TextureKey = keyof typeof MINI_PIXEL_TEXTURE_MAP

/**
 * 迷你像素：八格見方的手繪貼圖
 *
 * 這一套是基準，也是唯一保證每一個 key 都有圖的材質包。
 * 別套材質包缺圖時一律退回這裡，畫面不會開天窗
 */
const MINI_PIXEL_TEXTURE_MAP = {
  // ── 石與土 ──
  bedrock: 'default_obsidian',
  stone: 'default_stone',
  cobblestone: 'default_cobble',
  mossyCobblestone: 'default_mossycobble',
  stoneBricks: 'default_stone_brick',
  stoneTile: 'xdecor_stone_tile',
  runeStone: 'xdecor_stone_rune',
  gravel: 'default_gravel',
  clay: 'default_clay',
  dirt: 'default_dirt',
  bricks: 'default_brick',
  obsidianBricks: 'default_obsidian_brick',
  moonBricks: 'xdecor_moonbrick',

  // ── 地表 ──
  grassTop: 'default_grass_top',
  grassSideOverlay: 'default_grass_side',
  sand: 'default_sand',
  sandstone: 'default_sandstone',
  whiteSand: 'default_silver_sand',
  /**
   * 耙紋
   *
   * 與白沙同一張圖，但要獨立成一個 key
   *
   * 沙紋是靠比旁邊暗一階看出來的，那個壓暗寫在方塊定義上。
   * 若與白沙共用 key，材質包一旦把色調覆寫掉，
   * 兩者就會變成同一個顏色——整片枯山水的紋路直接消失
   */
  rakedSand: 'default_silver_sand',
  whiteSandstone: 'default_silver_sandstone',
  snowTop: 'default_snow',
  snowSide: 'default_snow_side',
  ice: 'default_ice',
  packedIce: 'xdecor_packed_ice',

  // ── 液體與火 ──
  waterStill: 'default_water_source_animated',
  waterFlowing: 'default_water_flowing_animated',
  lava: 'default_lava_source_animated',
  ember: 'default_lava',

  // ── 木與葉 ──
  oakLogSide: 'default_tree',
  oakLogTop: 'default_tree_top',
  oakLeaves: 'default_leaves',
  aspenLogSide: 'default_aspen_tree',
  aspenLogTop: 'default_aspen_tree_top',
  aspenLeaves: 'default_aspen_leaves',
  aspenPlanks: 'default_aspen_wood',
  pineLogSide: 'default_pine_tree',
  pineLogTop: 'default_pine_tree_top',
  pineLeaves: 'default_pine_needles',
  acaciaLogSide: 'default_acacia_tree',
  acaciaLogTop: 'default_acacia_tree_top',
  acaciaLeaves: 'default_acacia_leaves',
  jungleLeaves: 'default_jungle_leaves',
  planks: 'default_wood',
  darkPlanks: 'default_junglewood',
  woodTile: 'xdecor_wood_tile',
  tatami: 'xdecor_tatami',
  paperDoor: 'xdecor_curtain',

  // ── 器物 ──
  glass: 'default_glass',
  hay: 'farming_straw',
  bookshelfSide: 'default_bookshelf',
  barrelTop: 'xdecor_barrel_top',
  barrelSide: 'xdecor_barrel_sides',
  crate: 'xdecor_crate',
  chestTop: 'default_chest_top',
  chestSide: 'default_chest_side',
  furnaceTop: 'default_furnace_top',
  furnaceBottom: 'default_furnace_bottom',
  furnaceFront: 'default_furnace_front_active',
  workbenchTop: 'xdecor_workbench_top',
  workbenchSide: 'xdecor_workbench_sides',
  cauldronTop: 'xdecor_cauldron_top_idle',
  cauldronSide: 'xdecor_cauldron_sides',
  lantern: 'default_meselamp',
  paperLamp: 'xdecor_wooden_lightbox',
  lanternBox: 'xdecor_lightbox',
  hiveTop: 'xdecor_hive_top',
  hiveSide: 'xdecor_hive_side',
  honeyBlock: 'mobs_honey_block',
  openBook: 'xdecor_book_open',
  cushion: 'xdecor_cushion',
  flowerPot: 'xdecor_plant_pot_sides',
  ladder: 'default_ladder_wood',
  chain: 'xdecor_chainlink',

  // ── 骨與珊瑚 ──
  bonesTop: 'bones_top',
  bonesSide: 'bones_side',
  bonesBottom: 'bones_bottom',
  coralOrange: 'default_coral_orange',
  coralBrown: 'default_coral_brown',
  coralSkeleton: 'default_coral_skeleton',

  // ── 礦 ──
  /**
   * 礦石分成底圖與礦點兩層
   *
   * 迷你像素的礦點是給人疊在石頭上的圖層，背景整片透明；
   * 原版則是一張畫好的完整礦石。兩種做法都容得下，
   * 底圖各自指向自己那張，礦點層在原版那邊填 null 就好
   */
  coalOreBase: 'default_stone',
  coalOreOverlay: 'default_mineral_coal',
  ironOreBase: 'default_stone',
  ironOreOverlay: 'default_mineral_iron',
  copperOreBase: 'default_stone',
  copperOreOverlay: 'default_mineral_copper',
  goldOreBase: 'default_stone',
  goldOreOverlay: 'default_mineral_gold',
  diamondOreBase: 'default_stone',
  diamondOreOverlay: 'default_mineral_diamond',

  // ── 花草 ──
  tallGrass: 'default_grass_3',
  wildGrass: 'default_grass_5',
  fern: 'moreplants_spikefern',
  dryShrub: 'default_dry_shrub',
  flowerRose: 'flowers_rose',
  flowerTulip: 'flowers_tulip',
  flowerDandelion: 'flowers_dandelion_yellow',
  flowerWhiteDandelion: 'flowers_dandelion_white',
  flowerViola: 'flowers_viola',
  mushroomRed: 'flowers_mushroom_red',
  mushroomBrown: 'flowers_mushroom_brown',
  bigFlower: 'moreplants_bigflower',
  moonFlower: 'moreplants_moonflower',
  fireFlower: 'moreplants_fireflower',
  jungleFlower: 'moreplants_jungleflower2',
  curlyPlant: 'moreplants_curly',
  stonePlant: 'moreplants_stoneplant',
  bush: 'moreplants_bush',
  wheat: 'default_dry_grass',
  wheatTall: 'default_dry_grass_5',
  dryGrass: 'default_dry_grass_3',
  jungleGrass: 'default_junglegrass',
  papyrus: 'default_papyrus',
  cactusTop: 'default_cactus_top',
  cactusSide: 'default_cactus_side',
  cobweb: 'xdecor_cobweb',
  ivy: 'xdecor_ivy',
  lilyPad: 'flowers_waterlily',
  fallenLeaves: 'default_aspen_leaves',
  forestLitter: 'default_rainforest_litter',
  pottedPlant: 'flowers_geranium',

  // ── 綿羊身上的毛 ──
  woolWhite: 'wool_white',
  woolGrey: 'wool_grey',
  woolDarkGrey: 'wool_dark_grey',
  woolBrown: 'wool_brown',
  woolBlack: 'wool_black',
  woolPink: 'wool_pink',
} as const satisfies Record<string, string>

/**
 * 原版 Minecraft 的檔名對照
 *
 * 所有沿用原版命名的材質包共用這一份：它們的差別只在解析度與有沒有法線，
 * 檔名是同一套。缺的 key 會自動退回迷你像素那一套
 *
 * 這個世界有不少東西原版沒有——榻榻米、紙門、耙紋的白沙——
 * 那些只能挑一張氣質最接近的頂替，挑選理由寫在各自的註解裡
 */
const MINECRAFT_TEXTURE_MAP: Partial<Record<TextureKey, PackTextureEntry>> = {
  // ── 石與土 ──
  bedrock: 'obsidian',
  stone: 'stone',
  cobblestone: 'cobblestone',
  mossyCobblestone: 'mossy_cobblestone',
  stoneBricks: 'stone_bricks',
  /** 打磨過的安山岩最接近參道上那種細緻的石板 */
  stoneTile: 'polished_andesite',
  /** 刻紋的石磚，正好是石碑上的紋樣 */
  runeStone: 'chiseled_stone_bricks',
  gravel: 'gravel',
  clay: 'clay',
  dirt: 'dirt',
  bricks: 'bricks',
  obsidianBricks: 'polished_blackstone_bricks',
  /** 月語庭的月紋磚，黑石上那一圈刻紋 */
  moonBricks: 'chiseled_polished_blackstone',

  // ── 地表 ──
  /** 原版的草地頂面是灰階的，要靠色調上色，方塊定義那組正好照用 */
  grassTop: 'grass_block_top',
  grassSideOverlay: 'grass_block_side_overlay',
  sand: 'sand',
  sandstone: 'sandstone',
  /**
   * 枯山水的白沙
   *
   * 原版沒有銀沙。白色混凝土粉末是唯一夠白又保有沙粒感的東西，
   * 而且它本來就是「一堆粉」，耙得出紋路
   */
  whiteSand: { file: 'white_concrete_powder', pixelTint: null },
  /** 耙紋沿用方塊定義那一階壓暗，溝才看得出來 */
  rakedSand: 'white_concrete_powder',
  whiteSandstone: 'quartz_block_side',
  snowTop: 'snow',
  snowSide: 'grass_block_snow',
  ice: 'ice',
  packedIce: 'packed_ice',

  // ── 液體與火 ──
  waterStill: { file: 'water_still', frameCount: 32 },
  waterFlowing: { file: 'water_flow', frameCount: 32 },
  lava: { file: 'lava_still', frameCount: 20 },
  /** 營火的餘燼，岩漿塊那三張畫格燒得剛好 */
  ember: { file: 'magma', frameCount: 3 },

  // ── 木與葉 ──
  oakLogSide: 'oak_log',
  oakLogTop: 'oak_log_top',
  oakLeaves: 'oak_leaves',
  /** 白楊在原版是樺木：一樣的淺灰樹皮 */
  aspenLogSide: 'birch_log',
  aspenLogTop: 'birch_log_top',
  aspenLeaves: 'birch_leaves',
  aspenPlanks: 'birch_planks',
  pineLogSide: 'spruce_log',
  pineLogTop: 'spruce_log_top',
  pineLeaves: 'spruce_leaves',
  acaciaLogSide: 'acacia_log',
  acaciaLogTop: 'acacia_log_top',
  acaciaLeaves: 'acacia_leaves',
  jungleLeaves: 'jungle_leaves',
  planks: 'oak_planks',
  darkPlanks: 'dark_oak_planks',
  /** 木座的甲板，竹木板細而淺，看得出是做出來的台子 */
  woodTile: 'bamboo_planks',
  /** 竹編的拼花正是榻榻米那種織面 */
  tatami: 'bamboo_mosaic',
  /**
   * 障子門
   *
   * 石英磚的側面有一道道直紋，遠看就是紙門上的木櫺。
   * 原版沒有紙，這是最接近的白
   */
  paperDoor: { file: 'quartz_block_side', pixelTint: null },

  // ── 器物 ──
  glass: 'glass',
  hay: 'hay_block_side',
  bookshelfSide: 'bookshelf',
  barrelTop: 'barrel_top',
  barrelSide: 'barrel_side',
  /** 堆肥桶是條板拼的，當木箱剛好 */
  crate: 'composter_side',
  /** 原版的箱子是實體模型不是方塊貼圖，織布機的木身最接近 */
  chestTop: 'loom_top',
  chestSide: 'loom_side',
  furnaceTop: 'furnace_top',
  furnaceBottom: 'furnace_top',
  furnaceFront: 'furnace_front_on',
  workbenchTop: 'crafting_table_top',
  workbenchSide: 'crafting_table_side',
  cauldronTop: 'cauldron_top',
  cauldronSide: 'cauldron_side',
  /** 海燈籠自己會亮，而且是動的，五張畫格 */
  lantern: { file: 'sea_lantern', frameCount: 5 },
  /** 和紙燈箱：螢石的暖黃，再由方塊定義的色偏推冷 */
  paperLamp: 'glowstone',
  /** 石燈籠的燈室，蘑菇燈那種柔和的橘 */
  lanternBox: 'shroomlight',
  hiveTop: 'beehive_end',
  hiveSide: 'beehive_side',
  honeyBlock: 'honey_block_side',
  cushion: 'red_wool',
  flowerPot: 'flower_pot',
  ladder: 'ladder',
  chain: 'chain',

  // ── 骨與珊瑚 ──
  bonesTop: 'bone_block_top',
  bonesSide: 'bone_block_side',
  bonesBottom: 'bone_block_top',
  coralOrange: 'fire_coral_block',
  coralBrown: 'horn_coral_block',
  coralSkeleton: 'dead_brain_coral_block',

  // ── 礦 ──
  /** 原版的礦石本來就畫成一整塊，不必再疊礦點 */
  coalOreBase: 'coal_ore',
  coalOreOverlay: null,
  ironOreBase: 'iron_ore',
  ironOreOverlay: null,
  copperOreBase: 'copper_ore',
  copperOreOverlay: null,
  goldOreBase: 'gold_ore',
  goldOreOverlay: null,
  diamondOreBase: 'diamond_ore',
  diamondOreOverlay: null,

  // ── 花草 ──
  /** 草類在原版一樣是灰階的，色調照方塊定義走 */
  tallGrass: 'short_grass',
  wildGrass: 'tall_grass_bottom',
  fern: 'fern',
  /** 以下的花草原版都已經是實色，再染就髒了 */
  dryShrub: { file: 'dead_bush', tint: null },
  flowerRose: { file: 'poppy', tint: null },
  flowerTulip: { file: 'red_tulip', tint: null },
  flowerDandelion: { file: 'dandelion', tint: null },
  flowerWhiteDandelion: { file: 'oxeye_daisy', tint: null },
  flowerViola: { file: 'allium', tint: null },
  mushroomRed: { file: 'red_mushroom', tint: null },
  mushroomBrown: { file: 'brown_mushroom', tint: null },
  bigFlower: { file: 'rose_bush_top', tint: null },
  moonFlower: { file: 'lily_of_the_valley', tint: null },
  fireFlower: { file: 'orange_tulip', tint: null },
  jungleFlower: { file: 'torchflower', tint: null },
  /** 垂下來的根，捲曲的草用它 */
  curlyPlant: 'hanging_roots',
  /** 發光地衣是灰階的，長在岩縫裡的耐旱草照樣染得上色 */
  stonePlant: 'glow_lichen',
  bush: { file: 'azalea_plant', tint: null },
  /**
   * 麥
   *
   * 原版有一張熟透的麥，不必再拿乾草去染。
   * 迷你像素那組推成金色的倍率套下來只會過曝成一片白
   */
  wheat: { file: 'wheat_stage7', pixelTint: null },
  wheatTall: { file: 'wheat_stage7', pixelTint: null },
  dryGrass: { file: 'dead_bush', tint: null },
  jungleGrass: 'large_fern_bottom',
  papyrus: { file: 'sugar_cane', tint: null },
  cactusTop: 'cactus_top',
  cactusSide: 'cactus_side',
  cobweb: { file: 'cobweb', tint: null },
  ivy: 'vine',
  /**
   * 睡蓮
   *
   * 與草類同一件事：原版的 lily_pad.png 是灰階的（量過，整張平均
   * 134,134,134），綠色是遊戲執行時才染上去的。
   * 這裡曾經寫成不染色，於是原版、齊整、細描、白骨四套的荷葉
   * 全都浮著一片灰——蠟筆那套沒事，只因為它自己把圖畫成綠的。
   *
   * 交還給方塊定義的色調，灰階的那幾套就綠回來了
   */
  lilyPad: 'lily_pad',
  /**
   * 落葉
   *
   * 原版沒有轉色的葉子，樺木葉是灰階的，
   * 直接用色調染成秋天的橘褐，比逐像素乘倍率乾淨
   */
  fallenLeaves: { file: 'birch_leaves', pixelTint: null, tint: [0.86, 0.52, 0.22] },
  forestLitter: { file: 'moss_block', tint: [0.68, 0.6, 0.44] },
  pottedPlant: 'red_tulip',

  // ── 綿羊身上的毛 ──
  woolWhite: 'white_wool',
  woolGrey: 'light_gray_wool',
  woolDarkGrey: 'gray_wool',
  woolBrown: 'brown_wool',
  woolBlack: 'black_wool',
  woolPink: 'pink_wool',
}

/**
 * 蠟筆自己有一張綠的睡蓮
 *
 * 原版那張是灰階的，綠色靠色調染上去，所以共用的對照表把染色交還給
 * 方塊定義。蠟筆這一套卻是一筆一筆手繪的，圖本身就已經是綠的
 * （量過，整張平均 123,185,132）——再染一次會壓成一片暗綠。
 *
 * 只差這一格，所以不另立一份對照表，疊在共用那份上面就好
 */
const CRAYON_TEXTURE_MAP: Partial<Record<TextureKey, PackTextureEntry>> = {
  ...MINECRAFT_TEXTURE_MAP,
  lilyPad: { file: 'lily_pad', tint: null },
}

/**
 * 實景：拿實拍的 PBR 材質貼上方塊
 *
 * 這一套的來源不是 Minecraft 資源包，而是 ambientCG 的實地拍攝材質——
 * 高擬真的資源包幾乎清一色是 All Rights Reserved，沒有一套簽得進 repo，
 * 而這裡的材質包本來就只是「語意名稱 → 檔案」的對照，來源不必是資源包。
 * 那邊的東西全部是 CC0，商用、修改、再散布都不必問。
 *
 * 這一份只管正立方體的方塊，也就是拿一張無縫材質貼滿六面就成立的那些。
 * 花草是兩片鏤空的交叉立板，貼無縫材質上去只會變成一塊方形的石頭，
 * 那些另外走下面那份花草的對照表；再沒有的就退回原版
 */
const REALISTIC_SURFACE_MAP: Partial<Record<TextureKey, PackTextureEntry>> = {
  /**
   * 草地的頂面
   *
   * 原版那張是灰階的、要靠色調染綠，這張本來就是拍來的草，
   * 再染一次會變成一片死綠，所以把色調關掉
   */
  grassTop: { file: 'grass_block_top', tint: null },
  grassSideOverlay: 'grass_block_side_overlay',
  dirt: 'dirt',
  sand: 'sand',
  whiteSand: { file: 'white_concrete_powder', pixelTint: null },
  rakedSand: 'white_concrete_powder',
  gravel: 'gravel',
  clay: 'clay',
  snowTop: 'snow',
  snowSide: 'grass_block_snow',
  ice: 'ice',
  packedIce: 'packed_ice',

  /**
   * 只換純石頭，礦石整顆留給原版
   *
   * 礦石是「底圖加礦點」兩層疊出來的，而礦點那層只有原版有。
   * 底圖換成實拍的石頭之後，上面會浮著一塊十六格見方的馬賽克——
   * 整顆退回原版反而一致
   */
  stone: 'stone',
  cobblestone: 'cobblestone',
  mossyCobblestone: 'mossy_cobblestone',
  stoneBricks: 'stone_bricks',
  stoneTile: 'polished_andesite',
  bricks: 'bricks',
  bedrock: 'obsidian',
  obsidianBricks: 'polished_blackstone_bricks',
  sandstone: 'sandstone',
  whiteSandstone: 'quartz_block_side',

  planks: 'oak_planks',
  darkPlanks: 'dark_oak_planks',
  woodTile: 'bamboo_planks',
  oakLogSide: 'oak_log',
  oakLogTop: 'oak_log_top',
  pineLogSide: 'spruce_log',
  pineLogTop: 'spruce_log_top',
  aspenLogSide: 'birch_log',
  aspenLogTop: 'birch_log_top',

  hay: 'hay_block_side',
  tatami: 'bamboo_mosaic',
}

/**
 * 實景的花草
 *
 * 來源是 ambientCG 另一類叫 Atlas 的素材：一整張圖上散著十幾片
 * 各自去過背的葉子或草葉，一樣是 CC0。切成一片一片之後重新排成
 * 一株草、一叢樹葉或一朵花，做法在 scripts/plant-atlas.mjs。
 *
 * 這一份幾乎每一格都要把色調關掉。原版的草與葉是灰階的，
 * 綠色是方塊定義乘上去的；實拍的草本來就是綠的，再乘一次會變成一片死綠。
 * 花與麥則是反過來——那些倍率是為了把灰階推成顏色而調的，
 * 套在已經有顏色的照片上只會過曝
 */
const REALISTIC_PLANT_MAP: Partial<Record<TextureKey, PackTextureEntry>> = {
  // ── 草 ──
  tallGrass: { file: 'short_grass', tint: null },
  wildGrass: { file: 'tall_grass_bottom', tint: null },
  jungleGrass: { file: 'large_fern_bottom', tint: null },
  /**
   * 乾草與枯枝各有一張
   *
   * 原版把兩者都指向同一張枯灌木。實拍這邊分得開：
   * 乾草是一叢細而軟的枯草，枯枝是幾根挺著的乾莖
   */
  dryGrass: { file: 'dry_grass', tint: null },
  dryShrub: { file: 'dead_bush', tint: null },
  wheat: { file: 'wheat_stage7', pixelTint: null },
  wheatTall: { file: 'wheat_stage7', pixelTint: null },
  papyrus: { file: 'sugar_cane', tint: null },
  curlyPlant: { file: 'hanging_roots', tint: null },

  // ── 葉子做的植物 ──
  fern: { file: 'fern', tint: null },
  bush: { file: 'azalea_plant', tint: null },
  stonePlant: { file: 'glow_lichen', tint: null },
  ivy: { file: 'vine', tint: null },
  lilyPad: { file: 'lily_pad', tint: null },

  // ── 樹葉方塊 ──
  oakLeaves: { file: 'oak_leaves', tint: null },
  /**
   * 白楊葉直接換成一堆秋葉
   *
   * 這個 key 只有琥珀與金黃兩種轉色的葉子在用，而它們是拿一張兩階綠的
   * 貼圖乘上倍率推出來的。實拍的葉子整片都有層次，那組倍率乘下去會爆成死紅，
   * 所以圖本身就換成真的秋葉、倍率關掉。
   * 代價是琥珀與金黃在這一套裡長得一樣——換來的是兩者都真的像秋天
   */
  aspenLeaves: { file: 'birch_leaves', pixelTint: null },
  pineLeaves: { file: 'spruce_leaves', tint: null },
  acaciaLeaves: { file: 'acacia_leaves', tint: null },
  jungleLeaves: { file: 'jungle_leaves', tint: null },

  // ── 鋪在地上的 ──
  fallenLeaves: { file: 'fallen_leaves', tint: null, pixelTint: null },
  forestLitter: { file: 'forest_litter', tint: null },

  // ── 花 ──
  flowerRose: { file: 'poppy', tint: null },
  flowerTulip: { file: 'red_tulip', tint: null },
  flowerDandelion: { file: 'dandelion', tint: null },
  flowerWhiteDandelion: { file: 'oxeye_daisy', tint: null },
  flowerViola: { file: 'allium', tint: null },
  bigFlower: { file: 'rose_bush_top', tint: null },
  moonFlower: { file: 'lily_of_the_valley', tint: null },
  fireFlower: { file: 'orange_tulip', tint: null },
  jungleFlower: { file: 'torchflower', tint: null },
  pottedPlant: { file: 'red_tulip', tint: null },
}

/**
 * 實景這一套的完整對照
 *
 * 表面與花草兩份併起來。分成兩份不只是為了好讀——
 * 只有表面那些有法線與位移，花草沒有，
 * 而「哪些有法線」正是靠這條界線分出來的
 */
const REALISTIC_TEXTURE_MAP: Partial<Record<TextureKey, PackTextureEntry>> = {
  ...REALISTIC_SURFACE_MAP,
  ...REALISTIC_PLANT_MAP,
}

/** 材質包的識別名 */
export type TexturePackId =
  | 'miniPixel'
  | 'vanilla'
  | 'ocd'
  | 'pixelPerfection'
  | 'crayon'
  | 'bareBones'
  | 'realistic'

export interface TexturePack {
  id: TexturePackId;
  title: { 'zh-hant': string; 'en': string };
  /** 一句話說明這一套長什麼樣 */
  description: { 'zh-hant': string; 'en': string };
  /** 一格貼圖幾像素見方 */
  resolution: number;
  /** 貼圖放在哪個資料夾 */
  baseUrl: string;
  /**
   * 這一套自己有哪些檔案
   *
   * 沒有的就往 fallback 退。材質包很少是完整的：
   * 原版的立體貼圖只補了法線，圖本身還是躺在原版資料夾裡
   */
  fileSet: ReadonlySet<string>;
  /** 缺檔時往哪一層退，通常是原版的完整貼圖 */
  fallbackBaseUrl?: string;
  /** 有法線貼圖的檔案，其餘的就是純平面 */
  normalFileSet: ReadonlySet<string>;
  /** 法線貼圖放在哪，沒填就與 baseUrl 同一層 */
  normalBaseUrl?: string;
  /**
   * 法線的 alpha 有沒有高度資訊
   *
   * 有的話才開得起視差，凹凸會隨視角錯動而不只是明暗變化
   */
  hasHeightMap: boolean;
  /** 檔名對照表 */
  textureMap: Partial<Record<TextureKey, PackTextureEntry>>;
  /** 出處與授權，設定頁要標出來 */
  credit: { title: string; author: string; license: string; url: string };
}

/** 迷你像素的貼圖資料夾 */
const MINI_PIXEL_BASE = '/assets/minecraft-mini8x'
/** 原版貼圖，同時也是所有原版命名材質包缺檔時的退路 */
const VANILLA_BASE = '/assets/minecraft/textures/block'

/** 原版命名的材質包共用的空集合，代表「這一層沒有自己的檔案」 */
const EMPTY_FILE_SET: ReadonlySet<string> = new Set()

/**
 * 實景這一套有哪些檔案
 *
 * 別的材質包要靠掃描壓縮檔才知道自己有什麼，這一套不必：
 * 它的每一張圖都是照著上面那份對照表生出來的，
 * 對照表本身就是最準的清單。列在裡面就一定有，沒列的就是沒有
 */
const REALISTIC_FILE_SET: ReadonlySet<string> = new Set(
  Object.values(REALISTIC_TEXTURE_MAP)
    .map((entry) => normalizeEntry(entry ?? null)?.file)
    .filter((file): file is string => file !== undefined),
)

/**
 * 實景這一套哪些檔案有法線
 *
 * 只有表面材質有。花草是從去背的圖集裁出來重排的，
 * 那是一片一片各自朝著各自方向的葉子，法線根本無從對應；
 * 何況交叉立板的法線早就被統一改成朝上了，掛了也用不到。
 *
 * 草地側面那一圈草也不在裡面：它不是拍回來的，
 * 是拿草的彩色圖裁出來的一張鏤空疊圖
 */
const REALISTIC_NORMAL_SET: ReadonlySet<string> = new Set(
  Object.values(REALISTIC_SURFACE_MAP)
    .map((entry) => normalizeEntry(entry ?? null)?.file)
    .filter((file): file is string => file !== undefined && file !== 'grass_block_side_overlay'),
)

/**
 * 所有材質包
 *
 * 順序就是設定選單上的排列順序，第一套是預設值
 */
export const TEXTURE_PACK_LIST: TexturePack[] = [
  {
    id: 'miniPixel',
    title: { 'zh-hant': '迷你像素', 'en': 'Mini Pixel' },
    description: {
      'zh-hant': '八格見方的手繪貼圖，這個世界原本的樣子',
      'en': 'Hand-drawn 8×8 tiles — the world as it was built',
    },
    resolution: 8,
    baseUrl: MINI_PIXEL_BASE,
    /** 這一套每一個 key 都有圖，不需要退路 */
    fileSet: new Set(Object.values(MINI_PIXEL_TEXTURE_MAP)),
    normalFileSet: EMPTY_FILE_SET,
    hasHeightMap: false,
    textureMap: MINI_PIXEL_TEXTURE_MAP,
    credit: {
      title: 'Minetest 預設材質（8x 縮圖版）',
      author: 'D00Med',
      license: 'CC-BY-SA 3.0',
      url: 'https://github.com/minetest/minetest_game',
    },
  },
  {
    /**
     * 原版立體
     *
     * 彩色貼圖是原版那一套十六格見方的圖，法線與高光來自 Excalibur - justPBR。
     * 兩者疊起來就是「看起來還是 Minecraft，但石頭真的凹凸不平」——
     * 而且它的法線 alpha 帶著高度資訊，視差開得起來
     */
    id: 'vanilla',
    title: { 'zh-hant': '原版立體', 'en': 'Vanilla PBR' },
    description: {
      'zh-hant': '原版十六格貼圖，加上完整的法線與視差',
      'en': 'Vanilla 16× textures with full normal and parallax maps',
    },
    resolution: 16,
    baseUrl: VANILLA_BASE,
    /** 彩色圖全部在原版那一層，這一套自己只有法線 */
    fileSet: EMPTY_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: VANILLA_NORMAL_SET,
    normalBaseUrl: '/assets/minecraft-pbr',
    hasHeightMap: true,
    textureMap: MINECRAFT_TEXTURE_MAP,
    credit: {
      title: 'Excalibur - justPBR',
      author: 'Excalibur',
      license: 'CC-BY 4.0',
      url: 'https://modrinth.com/resourcepack/excalibur-justpbr',
    },
  },
  {
    /**
     * 齊整
     *
     * FVDisco 那套 oCd 的續作。它不改變原版的樣子，只把每一格
     * 對齊、去掉雜點、讓磚縫與木紋首尾接得起來——原版看久了
     * 那些歪掉半格的紋路，在這裡全部歸位。
     *
     * 刻意保持平面。這一套的賣點就是「每一格都在該在的位置」，
     * 那是一種乾淨到有點潔癖的平整；推一層凹凸上去，
     * 剛對齊好的磚縫又會浮出深淺，等於把它最想給的東西蓋掉
     */
    id: 'ocd',
    title: { 'zh-hant': '齊整', 'en': 'oCd' },
    description: {
      'zh-hant': '原版的樣子，但每一格都對齊了',
      'en': 'Vanilla, with every pixel finally aligned',
    },
    resolution: 16,
    baseUrl: '/assets/minecraft-ocd',
    fileSet: OCD_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: EMPTY_FILE_SET,
    hasHeightMap: false,
    textureMap: MINECRAFT_TEXTURE_MAP,
    credit: {
      title: 'rE-oCd',
      author: 'FVDisco / rE-oCd',
      license: 'Apache-2.0',
      url: 'https://modrinth.com/resourcepack/re-ocd',
    },
  },
  {
    /**
     * 細描
     *
     * XSSheep 那套 Pixel Perfection 的續作。它與原版同樣是十六格見方，
     * 卻在每一格裡多塞進了一層手繪的細節：石頭有裂紋、木板有節疤、
     * 草葉一片一片分得開。是「同一個尺寸能畫到什麼程度」的示範
     */
    id: 'pixelPerfection',
    title: { 'zh-hant': '細描', 'en': 'Pixel Perfection' },
    description: {
      'zh-hant': '同樣十六格，每一格都畫滿了手繪的細節',
      'en': 'Still 16×, but every pixel is hand-painted detail',
    },
    resolution: 16,
    baseUrl: '/assets/minecraft-pixel-perfection',
    fileSet: PIXEL_PERFECTION_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: PIXEL_PERFECTION_FILE_SET,
    hasHeightMap: false,
    textureMap: MINECRAFT_TEXTURE_MAP,
    credit: {
      title: 'Pixel Perfection Legacy',
      author: 'XSSheep / Nova_Wostra',
      license: 'CC-BY 4.0',
      url: 'https://modrinth.com/resourcepack/pixel-perfection-legacy',
    },
  },
  {
    /**
     * 蠟筆
     *
     * 整套是手繪的——真的用蠟筆畫在紙上那種，筆觸歪歪扭扭、
     * 邊緣有蠟的顆粒，同一種石頭每一塊的紋路都不一樣。
     *
     * 它是全場唯一「看得出是人畫的」材質包。方塊世界本來就不寫實，
     * 這一套乾脆承認這件事，整個世界變成一本攤開的畫冊
     */
    id: 'crayon',
    title: { 'zh-hant': '蠟筆', 'en': 'Crayon' },
    description: {
      'zh-hant': '一筆一筆手繪的，整個世界像一本畫冊',
      'en': 'Drawn by hand — the world as a sketchbook',
    },
    resolution: 128,
    baseUrl: '/assets/minecraft-crayon',
    fileSet: CRAYON_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: EMPTY_FILE_SET,
    hasHeightMap: false,
    textureMap: CRAYON_TEXTURE_MAP,
    credit: {
      title: 'CrayonCraft',
      author: 'CrayonCraft',
      license: 'CC-BY 4.0',
      url: 'https://modrinth.com/resourcepack/crayoncraft',
    },
  },
  {
    /**
     * 實景
     *
     * 唯一一套來源不是 Minecraft 資源包的。實拍的石頭與草皮貼上方塊之後，
     * 遠看仍然是那個方方正正的世界，走近才發現每一面都有真實的顆粒與凹凸。
     *
     * 花草也是實拍的，只是來得曲折些：那些來自另一類叫 Atlas 的素材，
     * 一整張圖上散著十幾片各自去過背的葉子，切開再重排成一株草、
     * 一叢樹葉或一朵花。九種花全部出自同一組白色雛菊，各自染上顏色——
     * 一朵白花可以是任何顏色的花，而花瓣上的明暗會跟著一起留下來。
     *
     * 換不動的剩下器物與蘑菇，那些照舊是原版那十六格
     */
    id: 'realistic',
    title: { 'zh-hant': '實景', 'en': 'Photoreal' },
    description: {
      'zh-hant': '實地拍攝的材質，連草葉與花瓣都是照片',
      'en': 'Photographed materials — right down to the leaves and petals',
    },
    resolution: 256,
    baseUrl: '/assets/minecraft-realistic',
    fileSet: REALISTIC_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: REALISTIC_NORMAL_SET,
    hasHeightMap: true,
    textureMap: { ...MINECRAFT_TEXTURE_MAP, ...REALISTIC_TEXTURE_MAP },
    credit: {
      title: 'ambientCG',
      author: 'ambientCG',
      license: 'CC0 1.0',
      url: 'https://ambientcg.com/',
    },
  },
  {
    /**
     * 白骨
     *
     * 一百二十八格見方、刻意壓掉所有雜訊的平塗風格，
     * 配上法線之後光影全由立體結構決定，而不是畫在圖上的假陰影。
     * 這一套沒有高度圖，只有法線
     */
    id: 'bareBones',
    title: { 'zh-hant': '白骨', 'en': 'Bare Bones' },
    description: {
      'zh-hant': '一二八格的乾淨平塗，明暗全交給光線',
      'en': 'Clean 128× flat shading — all shape, no painted shadow',
    },
    resolution: 128,
    baseUrl: '/assets/minecraft-bare-bones',
    fileSet: BARE_BONES_FILE_SET,
    fallbackBaseUrl: VANILLA_BASE,
    normalFileSet: BARE_BONES_NORMAL_SET,
    hasHeightMap: false,
    textureMap: MINECRAFT_TEXTURE_MAP,
    credit: {
      title: 'Bare Bones PBR x128',
      author: 'Bare Bones PBR',
      license: 'MIT',
      url: 'https://modrinth.com/resourcepack/bare-bones-pbr-x128',
    },
  },
]

/** 依識別名取材質包，找不到就退回第一套 */
export function getTexturePack(id: TexturePackId): TexturePack {
  return TEXTURE_PACK_LIST.find((pack) => pack.id === id) ?? TEXTURE_PACK_LIST[0]!
}

/**
 * 解析後的一張貼圖
 *
 * 把「方塊要什麼」與「材質包有什麼」兩邊併起來之後的結果，
 * 渲染器只認這個
 */
export interface ResolvedTexture {
  /** 圖片網址，找不到任何一層時是 null */
  url: string | null;
  /** 法線貼圖的網址，這一套沒有就是 null */
  normalUrl: string | null;
  /** 高光與粗糙度，沒有就是 null */
  specularUrl: string | null;
  frameCount?: number;
  /**
   * 色調
   *
   * 三種值意義都不同：
   * 沒有這個欄位是「沿用方塊定義那一組」，
   * null 是「這張圖顏色本來就對了，不要染」，
   * 有值則是「改用這一組」
   */
  tint?: [number, number, number] | null;
  /** 同上，逐像素相乘的那一種 */
  pixelTint?: [number, number, number] | null;
}

/** 把對照表裡那一格拆成檔名與覆寫值 */
function normalizeEntry(entry: PackTextureEntry): PackTexture | null {
  if (entry === null)
    return null

  return typeof entry === 'string' ? { file: entry } : entry
}

/**
 * 查出一個 key 在這套材質包裡該用哪張圖
 *
 * 三層退路：材質包自己的檔案、材質包的退路資料夾、最後是迷你像素。
 * 缺一張圖不該讓整個世界開天窗
 */
export function resolveTexture(pack: TexturePack, key: TextureKey): ResolvedTexture {
  const empty: ResolvedTexture = { url: null, normalUrl: null, specularUrl: null }

  const mapped = pack.textureMap[key]
  /** 這套包沒提到這個 key，退回迷你像素那一張 */
  if (mapped === undefined) {
    return pack.id === 'miniPixel'
      ? empty
      : { ...empty, url: `${MINI_PIXEL_BASE}/${MINI_PIXEL_TEXTURE_MAP[key]}.png` }
  }

  const texture = normalizeEntry(mapped)
  /** 明講不要這張圖，例如原版的礦石不需要礦點圖層 */
  if (!texture)
    return empty

  const { file } = texture
  const hasOwnFile = pack.fileSet.has(file)
  const baseUrl = hasOwnFile
    ? pack.baseUrl
    : pack.fallbackBaseUrl ?? pack.baseUrl

  const hasNormal = pack.normalFileSet.has(file)
  const normalBaseUrl = pack.normalBaseUrl ?? pack.baseUrl

  return {
    url: `${baseUrl}/${file}.png`,
    normalUrl: hasNormal ? `${normalBaseUrl}/${file}_n.png` : null,
    specularUrl: hasNormal ? `${normalBaseUrl}/${file}_s.png` : null,
    frameCount: texture.frameCount,
    tint: texture.tint,
    pixelTint: texture.pixelTint,
  }
}

/**
 * 材質包說了算，沒說就照方塊定義
 *
 * 這裡唯一的重點是 null 與 undefined 不同：
 * 前者是材質包明講「不要染」，後者才是「我沒意見」
 */
export function pickOverride<T>(packValue: T | null | undefined, blockValue: T | undefined): T | undefined {
  if (packValue === null)
    return undefined

  return packValue ?? blockValue
}

export { MINECRAFT_TEXTURE_MAP, MINI_PIXEL_BASE, MINI_PIXEL_TEXTURE_MAP, VANILLA_BASE }
