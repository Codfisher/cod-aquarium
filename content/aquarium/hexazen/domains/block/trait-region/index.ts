import type { TraitType } from '../../../types'
import type { Hex } from '../../hex-grid'
import type { Block } from '../type'
import { blockDefinitions } from '../builder/data'

/**
 * 一塊連通的同 trait 區域。
 *
 * 由 {@link calcTraitRegions} 計算，代表地圖上所有
 * 擁有相同 trait 且彼此在六角格上相鄰（共用邊）的格子群。
 */
export interface TraitRegion {
  /** 此區域的特性 */
  trait: `${TraitType}`;
  /** 區域內所有格子（hex key → Hex） */
  hexMap: Map<string, Hex>;
  /** 面積（格子數） */
  size: number;
}

/**
 * 計算地圖上所有 trait 的連通區域。
 *
 * 對每個 trait，以 BFS 尋找彼此相鄰（共用邊）的 block，
 * 並將連通的格子群合併為一個 {@link TraitRegion}。
 *
 * 一個 block 若有多個 trait，會分別被計入各 trait 的連通區域中。
 *
 * @param placedBlockMap - 目前已放置的 block（hex key → Block）
 * @returns 所有連通 trait 區域的列表
 */
export function calcTraitRegions(placedBlockMap: Map<string, Block>): TraitRegion[] {
  const regions: TraitRegion[] = []

  // 對每個 trait 獨立做連通分量分析
  const traitToKeys = new Map<`${TraitType}`, Set<string>>()

  for (const [key, block] of placedBlockMap) {
    for (const trait of blockDefinitions[block.type].traitList) {
      if (!traitToKeys.has(trait)) {
        traitToKeys.set(trait, new Set())
      }
      traitToKeys.get(trait)!.add(key)
    }
  }

  for (const [trait, keySet] of traitToKeys) {
    const unvisited = new Set(keySet)

    while (unvisited.size > 0) {
      // 取出一個起點，開始 BFS
      const startKey = unvisited.values().next().value as string
      const startBlock = placedBlockMap.get(startKey)!
      unvisited.delete(startKey)

      const hexMap = new Map<string, Hex>([[startKey, startBlock.hex]])
      const queue: Hex[] = [startBlock.hex]

      while (queue.length > 0) {
        const current = queue.shift()!

        for (let direction = 0; direction < 6; direction++) {
          const neighbor = current.neighbor(direction)
          const neighborKey = neighbor.key()

          if (!unvisited.has(neighborKey))
            continue

          const neighborBlock = placedBlockMap.get(neighborKey)!
          unvisited.delete(neighborKey)
          hexMap.set(neighborKey, neighborBlock.hex)
          queue.push(neighborBlock.hex)
        }
      }

      regions.push({
        trait,
        hexMap,
        size: hexMap.size,
      })
    }
  }

  return regions
}
