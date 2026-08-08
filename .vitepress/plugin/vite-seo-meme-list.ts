import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSeoMemeList } from '../../content/aquarium/meme-cache/meme-seo'

const VIRTUAL_MODULE_ID = 'virtual:seo-meme-list'
const RESOLVED_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`

const NDJSON_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../content/public/memes/a-memes-data.ndjson',
)

/** 提供 SEO 靜態內容所需的迷因清單。
 *
 * 迷因資料共 900 餘筆、約 220 KB，直接以 `?raw` 匯入會讓整份 ndjson
 * 打包進 client bundle，但頁面只用最新數筆，且 app 本體另以 fetch
 * 串流讀取 public 的同一份檔案，等同傳輸兩次。
 * 改以虛擬模組於 build 時取出所需筆數，頁面 chunk 可省下約 220 KB。
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
      this.addWatchFile(NDJSON_PATH)

      const memeList = getSeoMemeList(readFileSync(NDJSON_PATH, 'utf-8'))
      return `export const seoMemeList = ${JSON.stringify(memeList)}`
    },
  }
}
