import type { MemeItem } from './meme-seo'
import { describe, expect, it } from 'vitest'
import { EMOTION_LIST } from '../../../site/utils/meme-emotion'
import {
  EMOTION_SLUG_MAP,
  getEmotionMemeList,
  getEmotionPagePath,
  getEmotionSummaryList,
  isEmotionPageParams,
  mergeExtendEmotion,
} from './meme-seo'

describe('情緒分類頁網址代稱', () => {
  it('每個情緒都有代稱且不重複，否則兩個分類頁會搶同一個網址', () => {
    const slugList = EMOTION_LIST.map((emotion) => EMOTION_SLUG_MAP[emotion])
    expect(new Set(slugList).size).toBe(EMOTION_LIST.length)
    slugList.forEach((slug) => expect(slug).toMatch(/^[a-z-]+$/))
  })
})

describe('mergeExtendEmotion', () => {
  it('合併手動標註的情緒，保留主檔順序與其他欄位', () => {
    const result = mergeExtendEmotion(
      [
        { file: 'a.webp', describe: '甲', emotion: '無奈' },
        { file: 'b.webp', emotion: '' },
      ],
      [{ file: 'a.webp', emotion: '嘲諷' }],
    )

    expect(result.map((item) => item.file)).toEqual(['a.webp', 'b.webp'])
    expect(result[0]).toMatchObject({ describe: '甲' })
    expect(result[0]?.emotion?.split(',').sort()).toEqual(['嘲諷', '無奈'].sort())
    expect(result[1]?.emotion).toBe('')
  })

  it('只存在於手動標註檔的項目不納入，清單以主檔為準', () => {
    const result = mergeExtendEmotion([], [{ file: 'z.webp', emotion: '可愛' }])
    expect(result).toEqual([])
  })
})

describe('getEmotionMemeList', () => {
  const memeList: MemeItem[] = [
    { file: 'old.webp', emotion: '嘲諷' },
    { file: 'other.webp', emotion: '可愛' },
    { file: 'new.webp', emotion: '可愛,嘲諷' },
  ]

  it('篩出指定情緒，新圖在前', () => {
    expect(getEmotionMemeList(memeList, '嘲諷').map((item) => item.file)).toEqual(['new.webp', 'old.webp'])
  })

  it('不修改原陣列', () => {
    getEmotionMemeList(memeList, '嘲諷')
    expect(memeList[0]?.file).toBe('old.webp')
  })
})

describe('getEmotionSummaryList', () => {
  it('依 EMOTION_LIST 順序列出，略過沒有迷因的情緒', () => {
    const result = getEmotionSummaryList([
      { file: 'a.webp', emotion: '可愛' },
      { file: 'b.webp', emotion: '無奈,可愛' },
    ])

    expect(result).toEqual([
      { emotion: '無奈', path: getEmotionPagePath('無奈'), total: 1 },
      { emotion: '可愛', path: getEmotionPagePath('可愛'), total: 2 },
    ])
  })
})

describe('isEmotionPageParams', () => {
  it('辨識情緒分類頁的路由參數', () => {
    expect(isEmotionPageParams({ emotion: 'cute', label: '可愛', total: 1, memeList: [] })).toBe(true)
  })

  it('其他頁面的參數不成立', () => {
    expect(isEmotionPageParams(undefined)).toBe(false)
    expect(isEmotionPageParams(null)).toBe(false)
    expect(isEmotionPageParams({})).toBe(false)
    expect(isEmotionPageParams({ label: '亂寫', memeList: [] })).toBe(false)
    expect(isEmotionPageParams({ label: '可愛' })).toBe(false)
  })
})
