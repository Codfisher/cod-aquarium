import { filter, isTruthy, map, pipe, takeLast } from 'remeda'

export interface MemeItem {
  file: string;
  describe?: string;
  ocr?: string;
  keyword?: string;
  width?: number;
  height?: number;
}

/** SEO 靜態內容、結構化資料與 sitemap 都只取最新數筆。
 * 迷因近千張，全數列出會淹沒 sitemap 中的文章，也讓頁面與 head 過於肥大
 */
export const SEO_MEME_LIMIT = 20

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
