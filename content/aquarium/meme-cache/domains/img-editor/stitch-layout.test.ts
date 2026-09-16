import type { StitchCell } from './stitch-layout'
import { describe, expect, it } from 'vitest'
import {
  canStitchCellShowBackground,
  chunkStitchRowList,
  getStitchCellBoxAspectRatio,
  getStitchFillOption,
  getStitchLayoutOption,
  getStitchRowCellWidthPercentList,
  resizeStitchCellList,
  STITCH_FILL_OPTION_LIST,
  STITCH_LAYOUT_LIST,
} from './stitch-layout'

function createCell(partial: Partial<StitchCell> = {}): StitchCell {
  return { key: 'k', url: 'data:image/png;base64,', aspectRatio: 2, ...partial }
}

describe('getStitchLayoutOption', () => {
  it('找不到或未指定時退回單張', () => {
    expect(getStitchLayoutOption(undefined).value).toBe('single')
    expect(getStitchLayoutOption('9x9').value).toBe('single')
  })

  it('每個版面的 value 都是列數x欄數', () => {
    for (const layout of STITCH_LAYOUT_LIST.filter((item) => item.value !== 'single')) {
      expect(layout.value).toBe(`${layout.rowCount}x${layout.columnCount}`)
    }
  })
})

describe('resizeStitchCellList', () => {
  it('底圖不算格子，單張版面沒有任何格子', () => {
    expect(resizeStitchCellList(['a'], getStitchLayoutOption('single'))).toEqual([])
  })

  it('換到大版面時補空格，原有格子保留', () => {
    const result = resizeStitchCellList(['a'], getStitchLayoutOption('2x2'))

    expect(result).toEqual(['a', undefined, undefined])
  })

  it('換到小版面時多出的格子捨棄', () => {
    const result = resizeStitchCellList(['a', 'b', 'c'], getStitchLayoutOption('1x2'))

    expect(result).toEqual(['a'])
  })
})

describe('chunkStitchRowList', () => {
  it('左右並排為一列兩格', () => {
    expect(chunkStitchRowList(1, getStitchLayoutOption('1x2'))).toEqual([[0, 1]])
  })

  it('上下堆疊為兩列各一格', () => {
    expect(chunkStitchRowList(1, getStitchLayoutOption('2x1'))).toEqual([[0], [1]])
  })

  it('四宮格依欄數切成兩列', () => {
    expect(chunkStitchRowList(3, getStitchLayoutOption('2x2'))).toEqual([[0, 1], [2, 3]])
  })
})

describe('getStitchFillOption', () => {
  it('找不到或未指定時退回原始比例', () => {
    expect(getStitchFillOption(undefined).value).toBe('original')
    expect(getStitchFillOption('not-exist').value).toBe('original')
  })

  it('原始比例的 ratio 為 null，其餘選項都是正數', () => {
    const [original, ...rest] = STITCH_FILL_OPTION_LIST
    expect(original!.ratio).toBeNull()
    for (const item of rest) {
      expect(item.ratio).toBeGreaterThan(0)
    }
  })
})

describe('getStitchCellBoxAspectRatio', () => {
  it('原始比例沿用圖片本身的長寬比', () => {
    const cell = createCell({ aspectRatio: 1.5, fillValue: 'original' })
    expect(getStitchCellBoxAspectRatio(cell)).toBe(1.5)
  })

  it('未設定填滿比例時等同原始比例', () => {
    const cell = createCell({ aspectRatio: 1.5, fillValue: undefined })
    expect(getStitchCellBoxAspectRatio(cell)).toBe(1.5)
  })

  it('選了裁切比例後改用該比例，不理會圖片本身的長寬比', () => {
    const cell = createCell({ aspectRatio: 1.5, fillValue: 'square' })
    expect(getStitchCellBoxAspectRatio(cell)).toBe(1)
  })
})

describe('getStitchRowCellWidthPercentList', () => {
  it('單一格子獨佔整列寬度，無論長寬比為何', () => {
    expect(getStitchRowCellWidthPercentList([1.5])).toEqual([100])
    expect(getStitchRowCellWidthPercentList([0.3])).toEqual([100])
  })

  it('長寬比相同時平分寬度', () => {
    expect(getStitchRowCellWidthPercentList([1, 1])).toEqual([50, 50])
  })

  it('依長寬比佔比分配寬度，總和為 100', () => {
    const result = getStitchRowCellWidthPercentList([1, 3])
    expect(result[0]).toBeCloseTo(25)
    expect(result[1]).toBeCloseTo(75)
    expect(result[0]! + result[1]!).toBeCloseTo(100)
  })

  it('長寬比總和為 0（理論上不會發生）時退回平分，避免除以 0', () => {
    expect(getStitchRowCellWidthPercentList([0, 0])).toEqual([50, 50])
  })
})

describe('canStitchCellShowBackground', () => {
  it('原始比例必定吻合，不會露出背景', () => {
    const cell = createCell({ fillValue: 'original', fitMode: 'contain' })
    expect(canStitchCellShowBackground(cell)).toBe(false)
  })

  it('裁切填滿不會露出背景', () => {
    const cell = createCell({ fillValue: 'square', fitMode: 'cover' })
    expect(canStitchCellShowBackground(cell)).toBe(false)
  })

  it('未設定填滿方式時預設為裁切填滿，不會露出背景', () => {
    const cell = createCell({ fillValue: 'square', fitMode: undefined })
    expect(canStitchCellShowBackground(cell)).toBe(false)
  })

  it('非原始比例又完整顯示時才會露出背景', () => {
    const cell = createCell({ fillValue: 'square', fitMode: 'contain' })
    expect(canStitchCellShowBackground(cell)).toBe(true)
  })
})
