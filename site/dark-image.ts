import { readdirSync } from 'node:fs'
import path from 'node:path'
import { CONTENT_PUBLIC_DIR } from './constants'

/** 有暗色版的圖片（原圖路徑），theme-image 只對這些圖加上暗色來源。
 * 暗色版只有少數幾張，若一律嘗試載入，暗色模式下幾乎每篇文章封面都會多一次 404 再換回亮色，
 * 實測 LCP 慢約 0.4 秒且封面會閃一下
 */
export function getDarkImageList(): string[] {
  return readdirSync(CONTENT_PUBLIC_DIR, { recursive: true, encoding: 'utf-8' })
    .filter((file) => file.endsWith('-dark.webp'))
    // Windows 的路徑分隔是反斜線，統一成網址用的斜線
    .map((file) => file.split(path.sep).join('/'))
    .map((file) => `/${file.slice(0, -'-dark.webp'.length)}.webp`)
}
