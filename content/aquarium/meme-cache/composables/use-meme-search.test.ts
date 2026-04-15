import type { MemeData } from '../type'
import { describe, expect, it } from 'vitest'
import { searchMeme } from './use-meme-search'

const mockDataList: MemeData[] = [
  { file: '001.webp', describe: '一隻橘色貓咪趴在桌上', ocr: '', keyword: '' },
  { file: '002.webp', describe: '指著前方的動漫角色', ocr: '', keyword: '' },
  { file: '003.webp', describe: '一隻狗在公園裡跑步', ocr: '', keyword: '' },
  { file: '004.webp', describe: '指著遠方貓咪笑的男子', ocr: '', keyword: '' },
  { file: '005.webp', describe: 'A funny cat meme', ocr: 'LOL', keyword: 'cat' },
  { file: '006.webp', describe: '沙拉上有一隻貓咪坐著', ocr: '', keyword: '' },
]

describe('searchMeme', () => {
  it('單一中文字搜尋', () => {
    const result = searchMeme(mockDataList, '指')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('002.webp')
    expect(fileList).toContain('004.webp')
  })

  it('中文詞組搜尋', () => {
    const result = searchMeme(mockDataList, '貓咪')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('001.webp')
    expect(fileList).toContain('004.webp')
    expect(fileList).toContain('006.webp')
  })

  it('空格分隔的多詞 AND 搜尋', () => {
    const result = searchMeme(mockDataList, '指 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('004.webp')
    expect(fileList).not.toContain('003.webp')
  })

  it('英文搜尋', () => {
    const result = searchMeme(mockDataList, 'cat')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('005.webp')
  })

  it('模糊匹配 - 字元間允許插入', () => {
    // 「橘色貓」匹配「橘色貓咪」，中間可插入字元
    const result = searchMeme(mockDataList, '橘色貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('001.webp')
  })

  it('搜尋 ocr 欄位', () => {
    const result = searchMeme(mockDataList, 'LOL')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('005.webp')
  })

  it('搜尋 keyword 欄位', () => {
    const result = searchMeme(mockDataList, 'cat')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('005.webp')
  })

  it('空字串回傳空陣列', () => {
    const result = searchMeme(mockDataList, '')
    expect(result).toEqual([])
  })

  it('無匹配結果回傳空陣列', () => {
    const result = searchMeme(mockDataList, '完全不存在的詞彙')
    expect(result).toEqual([])
  })

  it('多詞 AND 搜尋 - 沙拉 貓', () => {
    const result = searchMeme(mockDataList, '沙拉 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('006.webp')
    expect(fileList).not.toContain('001.webp')
  })

  it('多詞 AND 模糊搜尋 - 指向 貓', () => {
    const result = searchMeme(mockDataList, '指向 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('004.webp')
  })

  it('keyword 欄位結果排序優先', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '描述中有貓咪', ocr: '', keyword: '' },
      { file: 'b.webp', describe: '普通描述', ocr: '', keyword: '貓咪' },
    ]
    const result = searchMeme(dataList, '貓咪')

    // keyword 權重較高，應排在前面
    expect(result[0]?.file).toBe('b.webp')
  })

  it('結果順序 - 精確匹配優先於模糊匹配', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '橘色的小動物在跑步', ocr: '', keyword: '' },
      { file: 'b.webp', describe: '一隻橘色貓咪趴著', ocr: '', keyword: '' },
    ]
    const result = searchMeme(dataList, '貓咪')

    expect(result[0]?.file).toBe('b.webp')
  })
})
