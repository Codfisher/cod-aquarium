import { BLOCK_DEFS, BlockId } from '../block/block-constants'
import { WORLD_HEIGHT, WORLD_SIZE } from './world-constants'

/** 世界裡的一個光源方塊 */
export interface BlockLightSource {
  x: number;
  y: number;
  z: number;
  /** 亮度等級 0 ～ 1 */
  level: number;
  /** 光色，火與燈籠的暖度不一樣 */
  color: [number, number, number];
  /** 是不是燒著的東西，火光要更亮、還要會晃 */
  isFire: boolean;
  /**
   * 這是不是一片躺平的面光源
   *
   * 只有岩漿。它與一盞燈籠差在兩件事：它不是一個點，而是一整片；
   * 而且圓盤有一半會埋在自己的液面底下。
   *
   * 兩件事現在都有解：埋在液面下的那半交給柔性淡出化開
   * （見 halo-soft-fade），一整片則靠更疏的格距與更大更淡的圓盤，
   * 讓幾顆疊起來是一層熱氣而不是一塊白。
   * 光暈那一側怎麼分別處理寫在 lamp-glow.ts
   */
  isAreaLight: boolean;
}

/**
 * 弱到不值得為它點一盞真光的等級
 *
 * 鑽石礦那種微光交給烘進去的方塊光就好，
 * 把它算進來只會佔掉燈池的名額
 */
const MIN_LIGHT_LEVEL = 0.5

/** 這幾種是燒著的，光色比燈籠更橘 */
const FIRE_BLOCK_SET = new Set<BlockId>([BlockId.EMBER, BlockId.LAVA, BlockId.FURNACE])

/**
 * 這幾種是躺平的面光源
 *
 * 只有岩漿。它一樣點真光、一樣有暈，只是兩者的擺法都要放疏
 */
const AREA_LIGHT_SET = new Set<BlockId>([BlockId.LAVA])

/**
 * 每幾格留一顆的格距指數
 *
 * 一般的燈是一個點，兩格一顆（指數一）剛好——燈籠本來就擺得比這疏，
 * 只有連成一串的餘燼會被收掉幾顆，而它們照出來的範圍幾乎完全重疊。
 *
 * 岩漿是一整池，兩格一顆會在液面上排出幾十顆光暈，
 * 相加混合疊起來就是一塊死白，而地獄谷正好是全場網格最多的地方。
 * 放到四格一顆（指數二），數量剩四分之一，
 * 再配上更大更淡的圓盤，疊出來的才是一層浮在液面上的熱氣
 */
const DEFAULT_CELL_SHIFT = 1
const AREA_LIGHT_CELL_SHIFT = 2

/** 燈籠、紙燈這類的光色：暖，但不到火的程度 */
const LAMP_COLOR: [number, number, number] = [1, 0.86, 0.62]
const FIRE_COLOR: [number, number, number] = [1, 0.66, 0.34]

/**
 * 這種方塊發的是什麼顏色的光
 *
 * 真光與光暈用的是同一份色表——燈籠在地上灑的那圈暖色，
 * 與它自己外圍那圈暈本來就該是同一種暖。兩邊各寫一份，
 * 調過其中一邊就會對不起來
 */
export function getBlockLightTint(blockId: BlockId): [number, number, number] {
  return FIRE_BLOCK_SET.has(blockId) ? FIRE_COLOR : LAMP_COLOR
}

/**
 * 掃出世界裡所有夠亮的光源方塊
 *
 * 地形生成完只跑這一次。三百萬格的線性掃描在主執行緒上是幾毫秒的事，
 * 換來的是一份「哪裡有燈」的清單，之後每一幀都靠它決定真光要擺在哪
 */
export function collectLightSourceList(worldState: Uint8Array): BlockLightSource[] {
  /**
   * 每個小方格只留最亮的一顆
   *
   * 岩漿是一整池、餘燼也常常連著好幾格，逐格點燈的話光是一個湯屋
   * 就吃掉幾十盞。它們彼此只差一兩格，照出來的範圍幾乎完全重疊，
   * 留一顆與留十顆看起來沒有差別，成本卻差十倍。
   *
   * 燈籠本來就擺得比這個間距疏，不受影響
   */
  const cellMap = new Map<string, BlockLightSource>()

  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const blockId = worldState[(x * WORLD_HEIGHT + y) * WORLD_SIZE + z]!
        if (blockId === 0)
          continue

        const blockDef = BLOCK_DEFS[blockId as BlockId]
        const level = blockDef.lightLevel ?? blockDef.emissive ?? 0
        if (level < MIN_LIGHT_LEVEL)
          continue

        const isAreaLight = AREA_LIGHT_SET.has(blockId as BlockId)
        const shift = isAreaLight ? AREA_LIGHT_CELL_SHIFT : DEFAULT_CELL_SHIFT

        /**
         * 格距也寫進鍵裡
         *
         * 兩種格距共用一張表，不分開的話，一顆四格見方的岩漿格
         * 會與兩格見方的燈籠格撞在同一個鍵上，其中一盞就這樣沒了。
         * 湯屋的岩池底下正好埋著岩漿、岸邊又點著燈，那裡每次都會撞
         */
        const cellKey = `${shift}_${x >> shift}_${y >> shift}_${z >> shift}`
        const existing = cellMap.get(cellKey)
        if (existing && existing.level >= level)
          continue

        const isFire = FIRE_BLOCK_SET.has(blockId as BlockId)
        cellMap.set(cellKey, {
          x,
          y,
          z,
          level,
          color: getBlockLightTint(blockId as BlockId),
          isFire,
          isAreaLight,
        })
      }
    }
  }

  return [...cellMap.values()]
}
