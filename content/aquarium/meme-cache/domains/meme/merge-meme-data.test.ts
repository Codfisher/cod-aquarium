import type { MemeData } from './type'
import { describe, expect, it } from 'vitest'
import { mergeMemeData, mergeMemeDataList } from './merge-meme-data'

function createMeme(partial: Partial<MemeData> & { file: string }): MemeData {
  return {
    describe: '',
    ocr: '',
    keyword: '',
    emotion: '',
    ...partial,
  }
}

describe('mergeMemeData', () => {
  it('描述以自動分析為主', () => {
    const result = mergeMemeData(
      createMeme({ file: 'a.webp', describe: '自動' }),
      createMeme({ file: 'a.webp', describe: '手動' }),
    )

    expect(result.describe).toBe('自動')
  })

  it('自動分析沒有描述時改用手動標註', () => {
    const result = mergeMemeData(
      createMeme({ file: 'a.webp' }),
      createMeme({ file: 'a.webp', describe: '手動' }),
    )

    expect(result.describe).toBe('手動')
  })

  it('關鍵字合併並去除重複', () => {
    const result = mergeMemeData(
      createMeme({ file: 'a.webp', keyword: '貓,迷因' }),
      createMeme({ file: 'a.webp', keyword: '迷因,橘貓' }),
    )

    expect(result.keyword).toBe('貓, 迷因, 橘貓')
  })

  it('情緒標籤合併去重，且濾掉清單外的值', () => {
    const result = mergeMemeData(
      createMeme({ file: 'a.webp', emotion: '無奈' }),
      createMeme({ file: 'a.webp', emotion: '無奈,亂寫的情緒,生氣' }),
    )

    expect(result.emotion).toBe('無奈,生氣')
  })

  it('只有手動標註也能合併', () => {
    const result = mergeMemeData(
      undefined,
      createMeme({ file: 'a.webp', emotion: '可愛' }),
    )

    expect(result.file).toBe('a.webp')
    expect(result.emotion).toBe('可愛')
  })
})

describe('mergeMemeDataList', () => {
  it('依自動分析檔的順序反轉輸出，新圖排在前面', () => {
    const baseMap = new Map([
      ['a.webp', createMeme({ file: 'a.webp' })],
      ['b.webp', createMeme({ file: 'b.webp' })],
      ['c.webp', createMeme({ file: 'c.webp' })],
    ])

    const result = mergeMemeDataList(baseMap, new Map())

    expect(result.map((item) => item.file)).toEqual(['c.webp', 'b.webp', 'a.webp'])
  })

  it('手動標註獨有的項目也會納入', () => {
    const baseMap = new Map([
      ['a.webp', createMeme({ file: 'a.webp' })],
    ])
    const extendMap = new Map([
      ['z.webp', createMeme({ file: 'z.webp', keyword: '獨有' })],
    ])

    const result = mergeMemeDataList(baseMap, extendMap)

    expect(result.map((item) => item.file)).toEqual(['z.webp', 'a.webp'])
  })

  it('相同輸入必定得到相同順序，預建索引才對得上', () => {
    const baseMap = new Map([
      ['a.webp', createMeme({ file: 'a.webp' })],
      ['b.webp', createMeme({ file: 'b.webp' })],
    ])
    const extendMap = new Map([
      ['b.webp', createMeme({ file: 'b.webp', emotion: '生氣' })],
    ])

    const first = mergeMemeDataList(baseMap, extendMap)
    const second = mergeMemeDataList(baseMap, extendMap)

    expect(first.map((item) => item.file)).toEqual(second.map((item) => item.file))
    // 反轉後 b.webp 排在最前面
    expect(first[0]?.file).toBe('b.webp')
    expect(first[0]?.emotion).toBe('生氣')
  })
})
