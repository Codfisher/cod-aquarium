import type { BlockId } from '../block/block-constants'
import { BLOCK_DEFS, isLavaBlock, isWaterBlock } from '../block/block-constants'

/**
 * 大多數方塊落在的中性灰階
 *
 * 石、沙、雪、原木這類佔了世界絕大部分體積的方塊，沒有一個算得準的顏色，
 * 但它們反光本來就偏中性灰——這裡不追求逐方塊校準，只求「不會染錯色」
 */
const NEUTRAL_ALBEDO: [number, number, number] = [0.62, 0.6, 0.56]

/** 水面反彈的光偏藍綠、偏暗——水會把大半的光吸收掉 */
const WATER_ALBEDO: [number, number, number] = [0.22, 0.4, 0.5]

/** 岩漿本身在發光，反彈出去的自然是橘紅 */
const LAVA_ALBEDO: [number, number, number] = [0.95, 0.38, 0.12]

/**
 * 方塊的概略反照色，供體素全局光取樣用
 *
 * 這個世界沒有一張「方塊 → 顏色」的表——顏色只活在貼圖的 PNG 裡。
 * 真要準的話得逐張貼圖取平均色，但全局光只是要一點「附近有沒有綠色的草、
 * 紅色的花」這種粗略提示，不必貼圖等級的精準。
 *
 * 優先讀方塊定義本來就有的 tint（給灰階貼圖上色用的那組，草地、花朵、
 * 樹葉都有），沒有的方塊——多半是石頭、木頭、沙——退回中性灰階，
 * 液體另外給水色與岩漿色
 */
export function getBlockAlbedo(blockId: BlockId): [number, number, number] {
  if (isWaterBlock(blockId))
    return WATER_ALBEDO
  if (isLavaBlock(blockId))
    return LAVA_ALBEDO

  const tint = BLOCK_DEFS[blockId]?.textures?.tint
  return tint ?? NEUTRAL_ALBEDO
}
