import { filter, isTruthy, map, pipe, takeLast } from 'remeda'

export interface MemeItem {
  file: string;
  describe?: string;
  ocr?: string;
  keyword?: string;
  width?: number;
  height?: number;
}

/** SEO 靜態內容只呈現最新數筆，避免頁面與結構化資料過於肥大 */
export const SEO_MEME_LIMIT = 60

/** 解析 ndjson，略過格式損毀的行，避免單筆錯誤導致整份資料無法使用 */
export function parseMemeNdjson(rawNdjson: string): MemeItem[] {
  return pipe(
    rawNdjson.split('\n'),
    map((line) => line.trim()),
    filter(Boolean),
    map((line) => {
      try {
        return JSON.parse(line) as MemeItem
      }
      catch {
        return null
      }
    }),
    filter(isTruthy),
  )
}

/** 取最新數筆迷因，供 SEO 靜態內容與 JSON-LD 共用，確保兩者描述一致 */
export function getSeoMemeList(rawNdjson: string): MemeItem[] {
  return takeLast(parseMemeNdjson(rawNdjson), SEO_MEME_LIMIT)
}

/** 以描述前 24 字當標題；沒有就用檔名 */
export function getMemeName(item: MemeItem) {
  const describe = (item.describe ?? '').replace(/\s+/g, '')
  if (!describe)
    return item.file

  return describe.length > 24 ? `${describe.slice(0, 24)}…` : describe
}

export function getMemeAlt(item: MemeItem) {
  return (item.describe ?? '').replace(/\s+/g, ' ').trim() || '迷因圖片'
}

/** 關鍵字以逗號分隔字串儲存，轉為陣列供 JSON-LD 的 keywords 使用 */
export function getMemeKeywordList(item: MemeItem): string[] {
  return (item.keyword ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

/** 關鍵字著陸頁的門檻，數量太少的關鍵字不值得單獨成頁 */
export const KEYWORD_PAGE_MIN_COUNT = 5

export interface KeywordGroup {
  keyword: string;
  memeList: MemeItem[];
}

interface KeywordGroupDraft {
  /** 以檔名為鍵，避免同一張圖標記了多種寫法而重複計入 */
  memeMap: Map<string, MemeItem>;
  /** 各種寫法的出現次數，用於挑選顯示名稱 */
  nameCountMap: Map<string, number>;
}

/** 依關鍵字分組，只留下數量足夠的關鍵字，並以數量由多至少排序。
 *
 * 關鍵字存在大小寫不同的寫法（如 JoJo 與 JOJO），以小寫為鍵合併，
 * 避免產生內容幾乎重複的著陸頁，顯示名稱則取最常見的寫法。
 */
export function getKeywordGroupList(memeList: MemeItem[]): KeywordGroup[] {
  const groupMap = new Map<string, KeywordGroupDraft>()

  memeList.forEach((meme) => {
    getMemeKeywordList(meme).forEach((keyword) => {
      const key = keyword.toLowerCase()
      const group = groupMap.get(key) ?? { memeMap: new Map(), nameCountMap: new Map() }

      group.memeMap.set(meme.file, meme)
      group.nameCountMap.set(keyword, (group.nameCountMap.get(keyword) ?? 0) + 1)
      groupMap.set(key, group)
    })
  })

  return [...groupMap.values()]
    .filter((group) => group.memeMap.size >= KEYWORD_PAGE_MIN_COUNT)
    .map((group) => ({
      keyword: [...group.nameCountMap.entries()]
        .sort(([, countA], [, countB]) => countB - countA)[0][0],
      memeList: [...group.memeMap.values()],
    }))
    .sort((a, b) => b.memeList.length - a.memeList.length)
}
