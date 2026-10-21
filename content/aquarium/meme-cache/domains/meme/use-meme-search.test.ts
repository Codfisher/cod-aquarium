import type { MemeData } from './type'
import { describe, expect, it } from 'vitest'
import { parseSearchInput } from './meme-search-core'
import { calcCharCoverage, searchMeme } from './use-meme-search'

const mockDataList: MemeData[] = [
  { file: '001.webp', describe: '一隻橘色貓咪趴在桌上', ocr: '', keyword: '', emotion: '' },
  { file: '002.webp', describe: '指著前方的動漫角色', ocr: '', keyword: '', emotion: '' },
  { file: '003.webp', describe: '一隻狗在公園裡跑步', ocr: '', keyword: '', emotion: '' },
  { file: '004.webp', describe: '指著遠方貓咪笑的男子', ocr: '', keyword: '', emotion: '' },
  { file: '005.webp', describe: 'A funny cat meme', ocr: 'LOL', keyword: 'cat', emotion: '' },
  { file: '006.webp', describe: '沙拉上有一隻貓咪坐著', ocr: '', keyword: '', emotion: '' },
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

  it('空格分隔的多詞 OR 搜尋，全命中者排最前', () => {
    const result = searchMeme(mockDataList, '指 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList[0]).toBe('004.webp')
    expect(fileList).toContain('002.webp')
    expect(fileList).toContain('001.webp')
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

  it.each(['   ', '　', '\t\n'])('純空白輸入回傳空陣列：%j', (input) => {
    expect(searchMeme(mockDataList, input)).toEqual([])
  })

  it('無匹配結果回傳空陣列', () => {
    const result = searchMeme(mockDataList, '完全不存在的詞彙')
    expect(result).toEqual([])
  })

  it('多詞 OR 搜尋 - 沙拉 貓', () => {
    const result = searchMeme(mockDataList, '沙拉 貓')
    const fileList = result.map((item) => item.file)

    // 兩詞皆命中者排在只命中「貓」的項目之前
    expect(fileList[0]).toBe('006.webp')
    expect(fileList).toContain('001.webp')
    expect(fileList.indexOf('006.webp')).toBeLessThan(fileList.indexOf('001.webp'))
  })

  it('多詞 OR 搜尋 - 只命中其中一詞也會出現', () => {
    const result = searchMeme(mockDataList, '貓 汽車')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('001.webp')
    expect(fileList).toContain('006.webp')
  })

  it('多詞 OR 模糊搜尋 - 指向 貓', () => {
    const result = searchMeme(mockDataList, '指向 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('004.webp')
  })

  it('keyword 欄位結果排序優先', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '描述中有貓咪', ocr: '', keyword: '', emotion: '' },
      { file: 'b.webp', describe: '普通描述', ocr: '', keyword: '貓咪', emotion: '' },
    ]
    const result = searchMeme(dataList, '貓咪')

    // keyword 權重較高，應排在前面
    expect(result[0]?.file).toBe('b.webp')
  })

  it('結果順序 - 精確匹配優先於模糊匹配', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '橘色的小動物在跑步', ocr: '', keyword: '', emotion: '' },
      { file: 'b.webp', describe: '一隻橘色貓咪趴著', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(dataList, '貓咪')

    expect(result[0]?.file).toBe('b.webp')
  })

  it('結果順序 - 模糊匹配順序', () => {
    const dataList: MemeData[] = [
      { file: 'a.webp', describe: '湯姆貓與傑利鼠卡通畫面。灰色的湯姆貓正指著門邊的黑貓。黑貓穿紅衣戴棕色圓頂禮帽，旁邊的橘貓穿藍衣戴黑色圓頂禮帽。湯姆貓情緒激動，黑貓顯得不悅，橘貓則在旁觀。背景是簡約的室內場景。', ocr: '', keyword: '', emotion: '' },
      { file: 'b.webp', describe: '白色背景上，熊貓頭裡姚明哭笑不得，淚水直流，下方文字「笑著笑著就哭了」。此為網路迷因圖。', ocr: '', keyword: '', emotion: '' },
      { file: 'c.webp', describe: '白貓仰視鏡頭，雙頰鼓起，大眼專注。背景為模糊室內景，可見一隻手。文字：「看著我的眼睛再說一遍」。此為網路迷因圖。', ocr: '', keyword: '', emotion: '' },
      { file: 'd.webp', describe: '畫面左側，金髮女子張嘴尖叫並指向右方，身旁深髮女子神情驚訝。畫面右側，一隻白貓端坐餐桌前，面前放著沙拉，露出嫌棄表情。兩圖均為著名網路迷因，左圖出自實境秀《比佛利嬌妻》，右圖為「厭世貓」。', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(dataList, '指著 貓')

    expect(result[0]?.file).toBe('a.webp')
    expect(result[1]?.file).toBe('d.webp')
  })
  it('模糊匹配 - 實際資料「指著貓」', () => {
    const dataList: MemeData[] = [
      { file: 'target.webp', describe: '畫面左側，金髮女子張嘴尖叫並指向右方，身旁深髮女子神情驚訝。畫面右側，一隻白貓端坐餐桌前，面前放著沙拉，露出嫌棄表情。兩圖均為著名網路迷因，左圖出自實境秀《比佛利嬌妻》，右圖為「厭世貓」。', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(dataList, '指著貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('target.webp')
  })

  it('遺漏案例 - 葬禮', () => {
    const dataList: MemeData[] = [
      { file: 'target.webp', describe: '黑色相框，框緣飾以白色花朵，頂部有黑色緞帶與圓形花結。', ocr: '', keyword: '黑色相框, 空白相框, 遺照, 紀念相框, 悼念, 喪禮, 葬禮, 靈堂, 追思, 祭奠, 白花, 菊花, 緞帶, 花結, 莊嚴', emotion: '', blurLevel: 2 },
    ]
    const result = searchMeme(dataList, '葬禮')
    const fileList = result.map((item) => item.file)

    expect(fileList).toContain('target.webp')
  })
})

describe('calcCharCoverage', () => {
  const item: MemeData = { file: 'test.webp', describe: '指著遠方貓咪笑的男子', ocr: '', keyword: '', emotion: '' }

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
    const ocrItem: MemeData = { file: 'test.webp', describe: '', ocr: 'LOL', keyword: '', emotion: '' }
    expect(calcCharCoverage(ocrItem, 'LO')).toBe(1)
  })

  it('搜尋 keyword 欄位的字元', () => {
    const keywordItem: MemeData = { file: 'test.webp', describe: '', ocr: '', keyword: 'cat', emotion: '' }
    // 「cap」：c(有) a(有) p(無) = 2/3
    expect(calcCharCoverage(keywordItem, 'cap')).toBeCloseTo(2 / 3)
  })
})

/** 固定種子的小型亂數，結果可重現。專案沒有現成的種子亂數套件，不為一個測試新增依賴 */
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('searchMeme 排除詞', () => {
  const dataList: MemeData[] = [
    { file: 'plain.webp', describe: '一隻橘色貓咪趴在桌上', ocr: '', keyword: '', emotion: '' },
    { file: 'by-describe.webp', describe: '小八抱著貓咪玩偶', ocr: '', keyword: '', emotion: '' },
    { file: 'by-ocr.webp', describe: '一隻貓咪看著鏡頭', ocr: '我是小八', keyword: '', emotion: '' },
    { file: 'by-keyword.webp', describe: '白貓坐在窗邊', ocr: '', keyword: '貓咪, 小八', emotion: '' },
    { file: 'by-emotion.webp', describe: '黑貓皺著眉頭', ocr: '', keyword: '', emotion: '無奈' },
    { file: 'dog.webp', describe: '一隻狗在公園裡跑步', ocr: '', keyword: '', emotion: '' },
  ]

  it('描述、OCR、關鍵字任一欄含排除詞都剔除', () => {
    const result = searchMeme(dataList, '貓 -小八')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['plain.webp', 'by-emotion.webp'])
  })

  it('情緒欄位也會比對', () => {
    const result = searchMeme(dataList, '貓 -無奈')
    const fileList = result.map((item) => item.file)

    expect(fileList).not.toContain('by-emotion.webp')
    expect(fileList).toContain('plain.webp')
  })

  it('排除詞忽略大小寫', () => {
    const caseDataList: MemeData[] = [
      { file: 'a.webp', describe: 'funny cat', ocr: 'LOL', keyword: '', emotion: '' },
      { file: 'b.webp', describe: 'serious cat', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(caseDataList, 'cat -lol')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['b.webp'])
  })

  it('排除詞只做精確比對，字元零散出現不會被剔除', () => {
    const scatteredDataList: MemeData[] = [
      { file: 'scattered.webp', describe: '小白兔旁邊有八寶飯和一隻貓', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(scatteredDataList, '貓 -小八')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['scattered.webp'])
  })

  it('可同時指定多個排除詞', () => {
    const result = searchMeme(dataList, '貓 -小八 -無奈')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['plain.webp'])
  })

  it('排除詞放在搜尋詞前面也有效', () => {
    const result = searchMeme(dataList, '-小八 貓')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['plain.webp', 'by-emotion.webp'])
  })

  it('只有排除詞時，回傳扣除後的全部資料並維持原序', () => {
    const result = searchMeme(dataList, '-小八')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['plain.webp', 'by-emotion.webp', 'dog.webp'])
  })

  it('全部被排除時回傳空陣列', () => {
    const result = searchMeme(
      [{ file: 'a.webp', describe: '小八貓', ocr: '', keyword: '', emotion: '' }],
      '貓 -小八',
    )

    expect(result).toEqual([])
  })

  it('搜尋詞後面還沒打完的 - 不影響結果', () => {
    expect(searchMeme(dataList, '貓 -')).toEqual(searchMeme(dataList, '貓'))
  })

  it('只打了 - 時沒有可排除的對象，列出全部資料', () => {
    const result = searchMeme(dataList, '-')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(dataList.map((item) => item.file))
    // 回傳新陣列，呼叫端改動結果不會動到原資料
    expect(result).not.toBe(dataList)
  })

  it('詞中間的連字號不是排除詞', () => {
    const result = searchMeme(
      [{ file: 'a.webp', describe: 'Spider-Man 迷因', ocr: '', keyword: '', emotion: '' }],
      'Spider-Man',
    )
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['a.webp'])
  })

  it('排除後其餘項目仍依欄位權重排序', () => {
    const rankedDataList: MemeData[] = [
      { file: 'weak.webp', describe: '描述中有貓咪', ocr: '', keyword: '', emotion: '' },
      { file: 'strong.webp', describe: '普通描述', ocr: '', keyword: '貓咪', emotion: '' },
      { file: 'excluded.webp', describe: '貓咪與小八', ocr: '', keyword: '貓咪', emotion: '' },
    ]
    const result = searchMeme(rankedDataList, '貓咪 -小八')
    const fileList = result.map((item) => item.file)

    // keyword 權重較高，應排在前面
    expect(fileList).toEqual(['strong.webp', 'weak.webp'])
  })

  it('排除詞為大寫、資料為小寫也能剔除', () => {
    const caseDataList: MemeData[] = [
      { file: 'a.webp', describe: 'funny cat', ocr: 'lol', keyword: '', emotion: '' },
      { file: 'b.webp', describe: 'serious cat', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(caseDataList, 'cat -LOL')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['b.webp'])
  })

  it('欄位交界不會湊出假命中', () => {
    // 描述結尾的「小」與 OCR 開頭的「八」相鄰，但分屬兩個欄位
    const result = searchMeme(
      [{ file: 'a.webp', describe: '貓咪小', ocr: '八卦', keyword: '', emotion: '' }],
      '貓 -小八',
    )
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['a.webp'])
  })

  it('全形破折號也能當排除記號', () => {
    expect(searchMeme(dataList, '貓 －小八')).toEqual(searchMeme(dataList, '貓 -小八'))
  })

  it('破折號後不是文字的是一般搜尋詞，顏文字仍搜得到', () => {
    const emoticonDataList: MemeData[] = [
      { file: 'a.webp', describe: '無言的表情', ocr: '-_-', keyword: '', emotion: '' },
      { file: 'b.webp', describe: '開心地跳舞', ocr: '', keyword: '', emotion: '' },
    ]
    const result = searchMeme(emoticonDataList, '-_-')
    const fileList = result.map((item) => item.file)

    expect(fileList).toEqual(['a.webp'])
  })

  it('剔除等同「先搜尋、再過濾」，其餘項目順序與不帶排除詞的搜尋一致', () => {
    // 比較器對分數相近者改比字元覆蓋率，並非嚴格全序，先剔除再排序會讓其餘項目的順序跟著變。
    // 具體例子很難剛好踩到，故用固定種子的隨機語料釘住「排序後才剔除」
    const random = createRandom(7)
    const charList = Array.from('貓狗鼠兔熊魚鳥蛇馬牛羊雞')
    const createText = (min: number, max: number) => Array.from(
      { length: min + Math.floor(random() * (max - min + 1)) },
      () => charList[Math.floor(random() * charList.length)],
    ).join('')

    const randomDataList: MemeData[] = Array.from({ length: 80 }, (_, index) => ({
      file: `item-${index}.webp`,
      describe: createText(6, 24),
      ocr: random() < 0.3 ? createText(2, 8) : '',
      keyword: random() < 0.6 ? createText(2, 8) : '',
      emotion: '',
    }))

    for (let round = 0; round < 40; round++) {
      const termText = `${createText(2, 3)} ${createText(2, 3)}`
      const excludedTerm = createText(1, 2)

      const expected = searchMeme(randomDataList, termText)
        .filter((item) => ![item.describe, item.ocr, item.keyword, item.emotion].join(' ').includes(excludedTerm))
        .map((item) => item.file)
      const actual = searchMeme(randomDataList, `${termText} -${excludedTerm}`).map((item) => item.file)

      expect(actual, `${termText} -${excludedTerm}`).toEqual(expected)
    }
  })
})

describe('parseSearchInput', () => {
  it('詞首帶 - 的是排除詞，其餘是搜尋詞', () => {
    expect(parseSearchInput('貓 -小八')).toEqual({
      termList: ['貓'],
      excludedTermList: ['小八'],
    })
  })

  it('搜尋詞與排除詞可交錯出現，各自保留順序', () => {
    expect(parseSearchInput('-小八 貓 -吉伊 狗')).toEqual({
      termList: ['貓', '狗'],
      excludedTermList: ['小八', '吉伊'],
    })
  })

  it('全形空白也能分詞', () => {
    expect(parseSearchInput('貓　-小八')).toEqual({
      termList: ['貓'],
      excludedTermList: ['小八'],
    })
  })

  it('單獨的 - 略過', () => {
    expect(parseSearchInput('貓 -')).toEqual({ termList: ['貓'], excludedTermList: [] })
    expect(parseSearchInput('-')).toEqual({ termList: [], excludedTermList: [] })
  })

  it('詞中間的連字號不是排除詞', () => {
    expect(parseSearchInput('T-shirt')).toEqual({
      termList: ['T-shirt'],
      excludedTermList: [],
    })
  })

  it.each(['－', '−', '–', '—'])('全形與其他破折號「%s」視同 -', (mark) => {
    expect(parseSearchInput(`貓 ${mark}小八`)).toEqual({
      termList: ['貓'],
      excludedTermList: ['小八'],
    })
  })

  it.each(['-', '－', '−', '–', '—'])('單獨的破折號「%s」略過', (mark) => {
    expect(parseSearchInput(`貓 ${mark}`)).toEqual({ termList: ['貓'], excludedTermList: [] })
  })

  it('破折號後接數字也算排除詞', () => {
    expect(parseSearchInput('貓 -1')).toEqual({ termList: ['貓'], excludedTermList: ['1'] })
  })

  it.each(['-_-', '--', '-。-', '——'])('破折號後不是文字或數字的「%s」是一般搜尋詞，保留原文', (term) => {
    expect(parseSearchInput(`貓 ${term}`)).toEqual({ termList: ['貓', term], excludedTermList: [] })
  })

  it('空字串與純空白沒有任何詞', () => {
    expect(parseSearchInput('')).toEqual({ termList: [], excludedTermList: [] })
    expect(parseSearchInput('   ')).toEqual({ termList: [], excludedTermList: [] })
  })
})
