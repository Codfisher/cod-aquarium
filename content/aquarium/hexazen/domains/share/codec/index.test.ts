import { describe, expect, it } from 'vitest'
import { Hex } from '../../hex-grid'
import { decodeBlocks, encodeBlocks } from './index'

// --- 測試用工廠 ---

function makeSharedBlock(
  type: string,
  q: number,
  r: number,
  rotation = 0,
) {
  return {
    type: type as ReturnType<typeof decodeBlocks>[number]['type'],
    hex: Hex.fromAxial(q, r),
    rotation,
  }
}

// --- encodeBlocks ---

describe('encodeBlocks', () => {
  it('單一 block 編碼後可解碼還原', () => {
    const blocks = [makeSharedBlock('g1', 0, 0)]
    const encoded = encodeBlocks(blocks)

    expect(typeof encoded).toBe('string')
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = decodeBlocks(encoded)
    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[0]!.hex.q).toBe(0)
    expect(decoded[0]!.hex.r).toBe(0)
  })

  it('多個 block 保留順序與資料', () => {
    const blocks = [
      makeSharedBlock('g1', 0, 0, 0),
      makeSharedBlock('t1', 1, 0, 3),
      makeSharedBlock('b2', -1, 1, 5),
    ]
    const decoded = decodeBlocks(encodeBlocks(blocks))

    expect(decoded).toHaveLength(3)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[1]!.type).toBe('t1')
    expect(decoded[1]!.hex.q).toBe(1)
    expect(decoded[1]!.rotation).toBe(3)
    expect(decoded[2]!.type).toBe('b2')
    expect(decoded[2]!.hex.q).toBe(-1)
    expect(decoded[2]!.hex.r).toBe(1)
    expect(decoded[2]!.rotation).toBe(5)
  })

  it('空陣列編碼後解碼回空陣列', () => {
    const encoded = encodeBlocks([])
    const decoded = decodeBlocks(encoded)
    expect(decoded).toEqual([])
  })

  it('編碼結果為 URL 安全字串（不含 +, /, =）', () => {
    const blocks = [
      makeSharedBlock('g1', 0, 0, 0),
      makeSharedBlock('w1', -3, 3, 5),
      makeSharedBlock('r5', 3, -3, 0),
    ]
    const encoded = encodeBlocks(blocks)

    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('座標超出範圍時拋出 RangeError', () => {
    expect(() => encodeBlocks([makeSharedBlock('g1', -4, 0)])).toThrow(RangeError)
    expect(() => encodeBlocks([makeSharedBlock('g1', 0, 5)])).toThrow(RangeError)
  })
})

// --- decodeBlocks ---

describe('decodeBlocks', () => {
  it('正確解析包含旋轉的編碼', () => {
    const original = [makeSharedBlock('g1', 0, 0, 2)]
    const decoded = decodeBlocks(encodeBlocks(original))

    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[0]!.hex.q).toBe(0)
    expect(decoded[0]!.hex.r).toBe(0)
    expect(decoded[0]!.rotation).toBe(2)
  })

  it('負數座標正確解析', () => {
    const original = [makeSharedBlock('b3', -2, 1, 4)]
    const decoded = decodeBlocks(encodeBlocks(original))

    expect(decoded[0]!.hex.q).toBe(-2)
    expect(decoded[0]!.hex.r).toBe(1)
    expect(decoded[0]!.hex.s).toBe(1) // s = -q - r = 2 - 1 = 1
    expect(decoded[0]!.rotation).toBe(4)
  })

  it('邊界座標正確解析（-3 和 3）', () => {
    const original = [
      makeSharedBlock('w1', -3, 3, 0),
      makeSharedBlock('a1', 3, -3, 5),
    ]
    const decoded = decodeBlocks(encodeBlocks(original))

    expect(decoded[0]!.hex.q).toBe(-3)
    expect(decoded[0]!.hex.r).toBe(3)
    expect(decoded[1]!.hex.q).toBe(3)
    expect(decoded[1]!.hex.r).toBe(-3)
  })

  it('所有 block 類型都能正確編解碼', () => {
    const allTypes = [
      'g1', 'g2', 't1', 't2',
      'b1', 'b2', 'b3', 'b4', 'b5', 'b6',
      'a1', 'a2', 'w1',
      'r1', 'r2', 'r3', 'r4', 'r5',
      's1', 's2', 's3',
    ] as const

    const blocks = allTypes.map((type, index) =>
      makeSharedBlock(type, 0, 0, index % 6),
    )
    const decoded = decodeBlocks(encodeBlocks(blocks))

    expect(decoded).toHaveLength(allTypes.length)
    for (let i = 0; i < allTypes.length; i++) {
      expect(decoded[i]!.type).toBe(allTypes[i])
      expect(decoded[i]!.rotation).toBe(i % 6)
    }
  })

  it('空字串回傳空陣列', () => {
    expect(decodeBlocks('')).toEqual([])
  })
})

// --- 向下相容舊格式 ---

describe('向下相容舊文字格式', () => {
  it('可解碼舊版文字格式（含 rotation）', () => {
    const legacyEncoded = btoa('g1:0,0,2')
    const decoded = decodeBlocks(legacyEncoded)

    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[0]!.hex.q).toBe(0)
    expect(decoded[0]!.hex.r).toBe(0)
    expect(decoded[0]!.rotation).toBe(2)
  })

  it('可解碼舊版文字格式（不含 rotation，預設 0）', () => {
    const legacyEncoded = btoa('t1:1,-1')
    const decoded = decodeBlocks(legacyEncoded)

    expect(decoded[0]!.type).toBe('t1')
    expect(decoded[0]!.rotation).toBe(0)
  })

  it('可解碼舊版多 block 格式', () => {
    const legacyEncoded = btoa('g1:0,0,0;w1:2,-1,1')
    const decoded = decodeBlocks(legacyEncoded)

    expect(decoded).toHaveLength(2)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[1]!.type).toBe('w1')
    expect(decoded[1]!.hex.q).toBe(2)
    expect(decoded[1]!.rotation).toBe(1)
  })
})

// --- 往返一致性 ---

describe('encode → decode 往返', () => {
  it('完整場景資料往返一致', () => {
    const original = [
      makeSharedBlock('g1', 0, 0, 0),
      makeSharedBlock('g2', 1, 0, 1),
      makeSharedBlock('t1', 0, 1, 2),
      makeSharedBlock('t2', -1, 1, 3),
      makeSharedBlock('w1', -1, 0, 4),
      makeSharedBlock('a1', 0, -1, 5),
      makeSharedBlock('r5', 1, -1, 0),
    ]

    const decoded = decodeBlocks(encodeBlocks(original))

    expect(decoded).toHaveLength(original.length)
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]!.type).toBe(original[i]!.type)
      expect(decoded[i]!.hex.q).toBe(original[i]!.hex.q)
      expect(decoded[i]!.hex.r).toBe(original[i]!.hex.r)
      expect(decoded[i]!.hex.s).toBe(original[i]!.hex.s)
      expect(decoded[i]!.rotation).toBe(original[i]!.rotation)
    }
  })

  it('新格式比舊文字格式短', () => {
    const blocks = [
      makeSharedBlock('g1', 0, 0, 0),
      makeSharedBlock('t1', 1, 0, 3),
      makeSharedBlock('b2', -1, 1, 5),
      makeSharedBlock('w1', 2, -1, 1),
      makeSharedBlock('a1', 0, -1, 5),
      makeSharedBlock('r5', 1, -1, 0),
      makeSharedBlock('s1', -2, 1, 4),
    ]

    const newEncoded = encodeBlocks(blocks)

    // 手動構建舊格式做比較
    const legacyParts = blocks.map(
      b => `${b.type}:${b.hex.q},${b.hex.r},${b.rotation}`,
    )
    const legacyEncoded = btoa(legacyParts.join(';'))

    expect(newEncoded.length).toBeLessThan(legacyEncoded.length)
  })
})
