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

/** 燈籠、紙燈這類的光色：暖，但不到火的程度 */
const LAMP_COLOR: [number, number, number] = [1, 0.86, 0.62]
const FIRE_COLOR: [number, number, number] = [1, 0.66, 0.34]

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

        const cellKey = `${x >> 1}_${y >> 1}_${z >> 1}`
        const existing = cellMap.get(cellKey)
        if (existing && existing.level >= level)
          continue

        const isFire = FIRE_BLOCK_SET.has(blockId as BlockId)
        cellMap.set(cellKey, {
          x,
          y,
          z,
          level,
          color: isFire ? FIRE_COLOR : LAMP_COLOR,
          isFire,
        })
      }
    }
  }

  return [...cellMap.values()]
}
