import type { Emotion } from '../../../.vitepress/utils/meme-emotion'
import { filter, isTruthy, map, pipe, reverse, takeLast } from 'remeda'
import { EMOTION_LIST, isEmotion, mergeEmotion, parseEmotionList } from '../../../.vitepress/utils/meme-emotion'

export interface MemeItem {
  file: string;
  describe?: string;
  ocr?: string;
  keyword?: string;
  emotion?: string;
  width?: number;
  height?: number;
}

/** 快取梗圖頁網址 */
export const MEME_CACHE_PATH = '/aquarium/meme-cache/'

/** 情緒分類頁的網址代稱。用英文是為了網址可讀、分享時不會變成一長串百分比編碼 */
export const EMOTION_SLUG_MAP: Record<Emotion, string> = {
  無奈: 'helpless',
  生氣: 'angry',
  疑惑: 'confused',
  開心: 'happy',
  悲傷: 'sad',
  驚訝: 'surprised',
  嘲諷: 'sarcastic',
  得意: 'smug',
  尷尬: 'awkward',
  疲憊: 'tired',
  可愛: 'cute',
  恐怖: 'scary',
  讚許: 'approving',
  拒絕: 'refuse',
  敷衍: 'perfunctory',
}

/** 情緒分類頁列出的最新張數。全數列出時單頁可達 400 餘張，HTML 與頁面資料都太肥 */
export const EMOTION_PAGE_MEME_LIMIT = 60

export interface EmotionSummary {
  emotion: Emotion;
  path: string;
  total: number;
}

/** 情緒分類頁的路由參數，由 emotion/[emotion].paths.ts 產生 */
export interface EmotionPageParams {
  /** 網址代稱，對應路由的 [emotion] */
  emotion: string;
  label: Emotion;
  total: number;
  /** 最新的數張迷因，新圖在前 */
  memeList: MemeItem[];
}

export function isEmotionPageParams(params: unknown): params is EmotionPageParams {
  return typeof params === 'object'
    && params !== null
    && 'label' in params
    && typeof params.label === 'string'
    && isEmotion(params.label)
    && 'memeList' in params
    && Array.isArray(params.memeList)
}

export function getEmotionPagePath(emotion: Emotion): string {
  return `${MEME_CACHE_PATH}emotion/${EMOTION_SLUG_MAP[emotion]}`
}

/** 主檔的情緒標籤可能不完整，與 app 一樣合併手動標註檔（extend）的標籤。
 * 與 app 的差別：只存在於 extend 檔的圖不納入（app 會補進清單）。目前 extend 檔沒有這種圖，張數一致
 */
export function mergeExtendEmotion(baseList: MemeItem[], extendList: MemeItem[]): MemeItem[] {
  const extendMap = new Map(extendList.map((item) => [item.file, item]))

  return baseList.map((item) => {
    const extendItem = extendMap.get(item.file)
    if (!extendItem)
      return item

    return { ...item, emotion: mergeEmotion(item.emotion, extendItem.emotion) }
  })
}

/** 指定情緒的迷因，新圖在前（ndjson 依加入順序排列，新圖在檔尾） */
export function getEmotionMemeList(memeList: MemeItem[], emotion: Emotion): MemeItem[] {
  return pipe(
    memeList,
    filter((item) => parseEmotionList(item.emotion).includes(emotion)),
    reverse(),
  )
}

/** 各情緒的張數與分類頁網址，沒有任何迷因的情緒不列出，避免產生空頁 */
export function getEmotionSummaryList(memeList: MemeItem[]): EmotionSummary[] {
  return EMOTION_LIST
    .map((emotion) => ({
      emotion,
      path: getEmotionPagePath(emotion),
      total: getEmotionMemeList(memeList, emotion).length,
    }))
    .filter((summary) => summary.total > 0)
}

/** SEO 靜態內容、結構化資料與 sitemap 都只取最新數筆。
 * 迷因上千張，全數列出會淹沒 sitemap 中的文章，也讓頁面與 head 過於肥大
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
export function getSeoMemeList(memeList: MemeItem[]): MemeItem[] {
  return takeLast(memeList, SEO_MEME_LIMIT)
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
