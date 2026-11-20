import { describe, expect, it } from 'vitest'
import { EMOTION_MAX_COUNT, mergeEmotion, parseEmotionList } from './meme-emotion'

describe('parseEmotionList', () => {
  it('解析逗號分隔字串', () => {
    expect(parseEmotionList('無奈,生氣')).toEqual(['無奈', '生氣'])
  })

  it('濾掉清單外的值', () => {
    expect(parseEmotionList('無奈,開開心心,生氣')).toEqual(['無奈', '生氣'])
  })

  it('去除重複與前後空白', () => {
    expect(parseEmotionList(' 無奈 , 無奈 ')).toEqual(['無奈'])
  })

  it('超過上限只取前幾個', () => {
    const result = parseEmotionList('無奈,生氣,疑惑,開心')
    expect(result).toHaveLength(EMOTION_MAX_COUNT)
  })

  it('空值回傳空陣列', () => {
    expect(parseEmotionList(undefined)).toEqual([])
    expect(parseEmotionList('')).toEqual([])
  })
})

describe('mergeEmotion', () => {
  it('合併多來源並依清單順序輸出', () => {
    // 生氣在清單中排在疑惑之前
    expect(mergeEmotion('疑惑', '生氣')).toBe('生氣,疑惑')
  })

  it('重複的標籤只留一個', () => {
    expect(mergeEmotion('無奈', '無奈')).toBe('無奈')
  })

  it('全部無效時回傳空字串', () => {
    expect(mergeEmotion(undefined, '亂寫')).toBe('')
  })
})
