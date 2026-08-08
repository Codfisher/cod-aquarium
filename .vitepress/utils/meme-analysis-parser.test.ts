import { describe, expect, it } from 'vitest'
import { parseMemeAnalysis } from './meme-analysis-parser'

describe('parseMemeAnalysis', () => {
  it('解析乾淨的 JSON', () => {
    const text = '{"describe":"白鴨站在狗背上","ocr":"背感鴨力","keyword":"鴨,狗,諧音"}'
    expect(parseMemeAnalysis(text)).toEqual({
      describe: '白鴨站在狗背上',
      ocr: '背感鴨力',
      keyword: '鴨,狗,諧音',
    })
  })

  it('多吐第二個 JSON 物件時，只取第一個', () => {
    // 重現實際錯誤：Unexpected non-whitespace character after JSON at position 133 (line 6 column 1)
    const text = [
      '{',
      '  "describe": "紅色星際戰士頭盔與機械手，黃光眼。出自《戰鎚40,000》",',
      '  "ocr": "",',
      '  "keyword": "戰鎚,星際戰士,頭盔"',
      '}',
      '{"describe":"多餘的第二個物件","ocr":"","keyword":""}',
    ].join('\n')

    expect(parseMemeAnalysis(text)).toEqual({
      describe: '紅色星際戰士頭盔與機械手，黃光眼。出自《戰鎚40,000》',
      ocr: '',
      keyword: '戰鎚,星際戰士,頭盔',
    })
  })

  it('尾端接思考摘要時，只取 JSON', () => {
    const text = '{"describe":"貓","ocr":"","keyword":"貓"}\n\n這張圖沒有明顯出處。'
    expect(parseMemeAnalysis(text).describe).toBe('貓')
  })

  it('被 markdown 程式碼區塊包起來', () => {
    const text = '```json\n{"describe":"狗","ocr":"汪","keyword":"狗"}\n```'
    expect(parseMemeAnalysis(text)).toEqual({
      describe: '狗',
      ocr: '汪',
      keyword: '狗',
    })
  })

  it('字串內含大括號不會提早結束', () => {
    const text = '{"describe":"看板寫著 {重要}","ocr":"{重要}","keyword":"看板"}\n多餘內容'
    expect(parseMemeAnalysis(text)).toEqual({
      describe: '看板寫著 {重要}',
      ocr: '{重要}',
      keyword: '看板',
    })
  })

  it('字串內含跳脫引號不會誤判字串結束', () => {
    const text = `${String.raw`{"describe":"招牌寫「\"魚\"」","ocr":"\"魚\"","keyword":"魚"}`}\n多餘內容`
    expect(parseMemeAnalysis(text)).toEqual({
      describe: '招牌寫「"魚"」',
      ocr: '"魚"',
      keyword: '魚',
    })
  })

  it('巢狀物件不會提早結束', () => {
    const text = '{"describe":"貓","meta":{"a":{"b":1}},"ocr":"","keyword":"貓"}\n多餘內容'
    expect(parseMemeAnalysis(text).describe).toBe('貓')
  })

  it('空回應回傳空物件', () => {
    expect(parseMemeAnalysis('')).toEqual({})
    expect(parseMemeAnalysis('   \n ')).toEqual({})
  })

  it('完全不含 JSON 時拋出錯誤', () => {
    expect(() => parseMemeAnalysis('抱歉，我無法分析這張圖片。')).toThrow('回應不含 JSON')
  })

  it('殘缺（截斷）的 JSON 拋出錯誤，不會回傳半套資料', () => {
    expect(() => parseMemeAnalysis('{"describe":"貓","ocr":"')).toThrow()
  })
})
