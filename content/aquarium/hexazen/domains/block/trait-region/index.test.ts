import type { Block } from '../type'
import { describe, expect, it } from 'vitest'
import { Hex } from '../../hex-grid'
import { calcTraitRegionList } from './index'

type BlockSnapshot = Omit<Block, 'rootNode'>

// --- 測試用 Block 工廠 ---

function makeBlock(q: number, r: number, type: Block['type']): BlockSnapshot {
  return {
    type,
    hex: new Hex(q, r, -q - r),
  }
}

// --- 測試 ---

describe('calcTraitRegionList', () => {
  it('空陣列回傳空結果', () => {
    expect(calcTraitRegionList([])).toEqual([])
  })

  it('單一 block 產生 size=1 的 region', () => {
    const blocks = [makeBlock(0, 0, 'g1')]
    const result = calcTraitRegionList(blocks)

    expect(result).toHaveLength(1)
    expect(result[0]!.trait).toBe('grass')
    expect(result[0]!.size).toBe(1)
  })

  it('兩個相鄰的同 trait block 合併為一個 region', () => {
    // g1 與 g1 相鄰，且 g1 的 trait 為 'grass'
    const blocks = [
      makeBlock(0, 0, 'g1'), // (0,0,0)
      makeBlock(1, 0, 'g1'), // (1,0,-1)，是 (0,0,0) 的 direction=0 鄰居
    ]
    const result = calcTraitRegionList(blocks)

    const grassRegions = result.filter((r) => r.trait === 'grass')
    expect(grassRegions).toHaveLength(1)
    expect(grassRegions[0]!.size).toBe(2)
  })

  it('兩個不相鄰的同 trait block 分別為兩個 region', () => {
    // (0,0,0) 與 (3,0,-3) 距離 3，不相鄰
    const blocks = [
      makeBlock(0, 0, 'g1'),
      makeBlock(3, 0, 'g1'),
    ]
    const result = calcTraitRegionList(blocks)

    const grassRegions = result.filter((r) => r.trait === 'grass')
    expect(grassRegions).toHaveLength(2)
    expect(grassRegions.every((r) => r.size === 1)).toBe(true)
  })

  it('多 trait block 同時計入各 trait 的 region', () => {
    // r5 的 traitList 為 ['river', 'building']
    const blocks = [makeBlock(0, 0, 'r5')]
    const result = calcTraitRegionList(blocks)

    const traits = result.map((r) => r.trait)
    expect(traits).toContain('river')
    expect(traits).toContain('building')
    expect(result).toHaveLength(2)
  })

  it('不同 trait 的相鄰 block 不合併', () => {
    // g1 (grass) 與 t1 (tree) 相鄰，各自獨立
    const blocks = [
      makeBlock(0, 0, 'g1'),
      makeBlock(1, 0, 't1'),
    ]
    const result = calcTraitRegionList(blocks)

    expect(result.find((r) => r.trait === 'grass')!.size).toBe(1)
    expect(result.find((r) => r.trait === 'tree')!.size).toBe(1)
  })

  it('接受 Map 型別，結果與 Array 相同', () => {
    const blocks = [
      makeBlock(0, 0, 'g1'),
      makeBlock(1, 0, 'g1'),
    ]
    const blockMap = new Map(blocks.map((b) => [b.hex.key(), b]))

    const fromArray = calcTraitRegionList(blocks)
    const fromMap = calcTraitRegionList(blockMap)

    expect(fromArray.length).toBe(fromMap.length)
    expect(fromArray[0]!.size).toBe(fromMap[0]!.size)
    expect(fromArray[0]!.trait).toBe(fromMap[0]!.trait)
  })
})
