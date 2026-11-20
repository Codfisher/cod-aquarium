import type { Plugin } from 'vite'
import { getEmotionSummaryList, getSeoMemeList } from '../../content/aquarium/meme-cache/meme-seo'
import { MEME_EXTEND_NDJSON_PATH, MEME_NDJSON_PATH, readSeoMemeList } from '../../content/aquarium/meme-cache/meme-seo-source'

const VIRTUAL_MODULE_ID = 'virtual:seo-meme-list'
const RESOLVED_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`

/** 提供 SEO 靜態內容所需的迷因清單。
 *
 * 迷因資料共上千筆、數百 KB，直接以 `?raw` 匯入會讓整份 ndjson
 * 打包進 client bundle，但頁面只用最新數筆，且 app 本體另以 fetch
 * 串流讀取 public 的同一份檔案，等同傳輸兩次。
 * 改以虛擬模組於 build 時只取出所需資料。
 */
export function viteSeoMemeList(): Plugin {
  return {
    name: 'seo-meme-list',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID)
        return RESOLVED_MODULE_ID
    },
    load(id) {
      if (id !== RESOLVED_MODULE_ID)
        return

      // dev 時新增迷因可即時反映
      this.addWatchFile(MEME_NDJSON_PATH)
      this.addWatchFile(MEME_EXTEND_NDJSON_PATH)

      const memeList = readSeoMemeList()

      return [
        `export const seoMemeList = ${JSON.stringify(getSeoMemeList(memeList))}`,
        `export const seoMemeTotal = ${memeList.length}`,
        `export const seoEmotionSummaryList = ${JSON.stringify(getEmotionSummaryList(memeList))}`,
      ].join('\n')
    },
  }
}
