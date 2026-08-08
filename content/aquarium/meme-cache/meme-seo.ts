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
const SEO_MEME_LIMIT = 20

/** 取最新數筆迷因，供 SEO 靜態內容與 JSON-LD 共用，確保兩者描述一致 */
export function getSeoMemeList(rawNdjson: string): MemeItem[] {
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
    takeLast(SEO_MEME_LIMIT),
  )
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
