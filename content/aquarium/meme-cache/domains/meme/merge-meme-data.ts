import type { MemeData } from './type'
import { mergeEmotion } from '../../../../../.vitepress/utils/meme-emotion'

/** 合併以逗號分隔的關鍵字字串，保留順序並去除重複 */
export function mergeKeyword(...sourceList: Array<string | undefined>): string {
  const keywordList = sourceList
    .filter((source): source is string => Boolean(source))
    .flatMap((source) => source.split(',').map((item) => item.trim()))
    .filter(Boolean)
  return [...new Set(keywordList)].join(', ')
}

/**
 * 合併自動分析與手動標註的單筆資料。
 * 手動標註是補充，不是覆蓋，故描述以自動分析為主，缺漏時才用手動值。
 */
export function mergeMemeData(base: MemeData | undefined, extend: MemeData | undefined): MemeData {
  const source = base ?? extend
  if (!source)
    throw new Error('mergeMemeData 至少需要一筆資料')

  return {
    file: source.file,
    describe: base?.describe || extend?.describe || '',
    ocr: [base?.ocr ?? '', extend?.ocr ?? ''].join(''),
    keyword: mergeKeyword(base?.keyword, extend?.keyword),
    emotion: mergeEmotion(base?.emotion, extend?.emotion),
    blurLevel: base?.blurLevel ?? extend?.blurLevel,
  }
}

/**
 * 依自動分析檔的順序合併兩份資料，手動標註獨有的項目補在最後，最終反轉成新圖在前。
 *
 * 順序必須可重現，預建的搜尋索引才對得上執行期的清單。
 * 兩份 ndjson 是併行串流讀取的，抵達順序不固定，故不能靠寫入順序決定。
 */
export function mergeMemeDataList(baseMap: Map<string, MemeData>, extendMap: Map<string, MemeData>): MemeData[] {
  const result = [...baseMap.values()].map(
    (base) => mergeMemeData(base, extendMap.get(base.file)),
  )

  for (const [file, extend] of extendMap) {
    if (!baseMap.has(file)) {
      result.push(mergeMemeData(undefined, extend))
    }
  }

  return result.reverse()
}
