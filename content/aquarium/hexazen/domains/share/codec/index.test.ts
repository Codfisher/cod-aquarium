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
})

// --- decodeBlocks ---

describe('decodeBlocks', () => {
  it('正確解析包含旋轉的編碼', () => {
    // 手動建構：g1:0,0,2
    const raw = 'g1:0,0,2'
    const encoded = btoa(raw)
    const decoded = decodeBlocks(encoded)

    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[0]!.hex.q).toBe(0)
    expect(decoded[0]!.hex.r).toBe(0)
    expect(decoded[0]!.rotation).toBe(2)
  })

  it('缺少 rotation 時預設為 0（向下相容）', () => {
    const raw = 't1:1,-1'
    const encoded = btoa(raw)
    const decoded = decodeBlocks(encoded)

    expect(decoded[0]!.rotation).toBe(0)
  })

  it('負數座標正確解析', () => {
    const raw = 'b3:-2,1,4'
    const encoded = btoa(raw)
    const decoded = decodeBlocks(encoded)

    expect(decoded[0]!.hex.q).toBe(-2)
    expect(decoded[0]!.hex.r).toBe(1)
    expect(decoded[0]!.hex.s).toBe(1) // s = -q - r = 2 - 1 = 1
    expect(decoded[0]!.rotation).toBe(4)
  })

  it('多組 block 以分號分隔正確解析', () => {
    const raw = 'g1:0,0,0;w1:2,-1,1'
    const encoded = btoa(raw)
    const decoded = decodeBlocks(encoded)

    expect(decoded).toHaveLength(2)
    expect(decoded[0]!.type).toBe('g1')
    expect(decoded[1]!.type).toBe('w1')
    expect(decoded[1]!.hex.q).toBe(2)
    expect(decoded[1]!.rotation).toBe(1)
  })

  it('格式錯誤時拋出 TypeError', () => {
    const encoded = btoa('invalid-format')
    expect(() => decodeBlocks(encoded)).toThrow(TypeError)
  })

  it('座標非數字時拋出 TypeError', () => {
    const encoded = btoa('g1:abc,def')
    expect(() => decodeBlocks(encoded)).toThrow(TypeError)
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
})
