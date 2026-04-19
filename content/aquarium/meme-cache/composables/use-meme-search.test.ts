import type { MemeData } from '../type'
import { describe, expect, it } from 'vitest'
import { calcCharCoverage, searchMeme } from './use-meme-search'

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
    // 「橘色貓」匹配「橘色貓咪」
    const result = searchMeme(mockDataList, '橘色貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('001.webp')
  })

  it('模糊匹配 - 字元間允許插入 2', () => {
    // 「指向貓」匹配「指著遠方貓咪笑的男子」
    const result = searchMeme(mockDataList, '指向貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('004.webp')
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

  it('結果順序 - 模糊匹配順序', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '湯姆貓與傑利鼠卡通畫面。灰色的湯姆貓正指著門邊的黑貓。黑貓穿紅衣戴棕色圓頂禮帽，旁邊的橘貓穿藍衣戴黑色圓頂禮帽。湯姆貓情緒激動，黑貓顯得不悅，橘貓則在旁觀。背景是簡約的室內場景。', ocr: '', keyword: '' },
      { file: 'b.webp', describe: '白色背景上，熊貓頭裡姚明哭笑不得，淚水直流，下方文字「笑著笑著就哭了」。此為網路迷因圖。', ocr: '', keyword: '' },
      { file: 'c.webp', describe: '白貓仰視鏡頭，雙頰鼓起，大眼專注。背景為模糊室內景，可見一隻手。文字：「看著我的眼睛再說一遍」。此為網路迷因圖。', ocr: '', keyword: '' },
      { file: 'd.webp', describe: '畫面左側，金髮女子張嘴尖叫並指向右方，身旁深髮女子神情驚訝。畫面右側，一隻白貓端坐餐桌前，面前放著沙拉，露出嫌棄表情。兩圖均為著名網路迷因，左圖出自實境秀《比佛利嬌妻》，右圖為「厭世貓」。', ocr: '', keyword: '' },
    ]
    const result = searchMeme(dataList, '指著 貓')

    expect(result[0]?.file).toBe('a.webp')
    expect(result[1]?.file).toBe('d.webp')
  })
  it('模糊匹配 - 實際資料「指著貓」', () => {
    const dataList: MemeData[] = [
      { file: 'target.webp', describe: '畫面左側，金髮女子張嘴尖叫並指向右方，身旁深髮女子神情驚訝。畫面右側，一隻白貓端坐餐桌前，面前放著沙拉，露出嫌棄表情。兩圖均為著名網路迷因，左圖出自實境秀《比佛利嬌妻》，右圖為「厭世貓」。', ocr: '', keyword: '' },
    ]
    const result = searchMeme(dataList, '指著貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('target.webp')
  })

  it('遺漏案例 - 葬禮', () => {
    const dataList: MemeData[] = [
      { file: 'target.webp', describe: '黑色相框，框緣飾以白色花朵，頂部有黑色緞帶與圓形花結。', ocr: '', keyword: '黑色相框, 空白相框, 遺照, 紀念相框, 悼念, 喪禮, 葬禮, 靈堂, 追思, 祭奠, 白花, 菊花, 緞帶, 花結, 莊嚴', blurLevel: 2 },
    ]
    const result = searchMeme(dataList, '葬禮')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('target.webp')
  })
})

describe('calcCharCoverage', () => {
  const item: MemeData = { file: 'test.webp', describe: '指著遠方貓咪笑的男子', ocr: '', keyword: '' }

  it('完全匹配回傳 1', () => {
    expect(calcCharCoverage(item, '指著')).toBe(1)
  })

  it('部分匹配回傳正確比例', () => {
    // 「指向貓」：指(有) 向(無) 貓(有) = 2/3
    expect(calcCharCoverage(item, '指向貓')).toBeCloseTo(2 / 3)
  })

  it('完全不匹配回傳 0', () => {
    expect(calcCharCoverage(item, '汽車飛機')).toBe(0)
  })

  it('搜尋 ocr 欄位的字元', () => {
    const ocrItem: MemeData = { file: 'test.webp', describe: '', ocr: 'LOL', keyword: '' }
    expect(calcCharCoverage(ocrItem, 'LO')).toBe(1)
  })

  it('搜尋 keyword 欄位的字元', () => {
    const keywordItem: MemeData = { file: 'test.webp', describe: '', ocr: '', keyword: 'cat' }
    // 「cap」：c(有) a(有) p(無) = 2/3
    expect(calcCharCoverage(keywordItem, 'cap')).toBeCloseTo(2 / 3)
  })
})
