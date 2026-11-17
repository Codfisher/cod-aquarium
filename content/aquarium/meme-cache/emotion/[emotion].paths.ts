import { EMOTION_PAGE_MEME_LIMIT, EMOTION_SLUG_MAP, getEmotionMemeList, getEmotionSummaryList } from '../meme-seo'
import { readSeoMemeList } from '../meme-seo-source'

/** 每個情緒標籤產生一頁靜態分類頁（例如「嘲諷梗圖」），對應 Search Console 出現的分類型查詢。
 *
 * 快取梗圖本體是單頁 app，上千張圖共用一個網址；分類頁讓每種情緒各有可被搜尋的網址與內容。
 * 頁面標題、描述與結構化資料由 .vitepress/config.mts 依 params 補上
 */
/** VitePress 1.6 的動態路由不支援 watch，dev 時改了 ndjson 要重啟 dev server 分類頁才會更新 */
export default {
  paths() {
    const memeList = readSeoMemeList()

    return getEmotionSummaryList(memeList).map((summary) => ({
      params: {
        emotion: EMOTION_SLUG_MAP[summary.emotion],
        label: summary.emotion,
        total: summary.total,
        memeList: getEmotionMemeList(memeList, summary.emotion).slice(0, EMOTION_PAGE_MEME_LIMIT),
      },
    }))
  },
}
