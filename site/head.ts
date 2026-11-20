import type { SitePage } from './pages'

/** head 標籤：[標籤名, 屬性, 內容]，與原 VitePress 的 HeadConfig 同格式 */
export type HeadConfig =
  | [string, Record<string, string>]
  | [string, Record<string, string>, string]

/** 每頁專屬、與 SEO 無關的 head 標籤（meme-cache 資料預載、llms 連結），原本是 VitePress 的 transformHead。
 *
 * 只在 SSR（預先渲染）輸出，client 端換頁不更新，與原本行為相同。
 * canonical、Open Graph、JSON-LD 等 SEO 標籤改由 Nuxt SEO 模組輸出，資料見 site/seo.ts
 */
export function getPageHeadList(page: SitePage): HeadConfig[] {
  const headList: HeadConfig[] = []

  /** 讓 AI 工具找到純文字版（llms.txt 與每頁 .md 副本，由 site/scripts/postbuild/llms.ts 產生），
   * 規則同原本的 vitepress-plugin-llms：每頁都指向 llms.txt；情緒分類頁沒有 .md 副本，
   * 首頁也沒有 .md 副本連結，子目錄的 index.md 副本為「目錄.md」
   */
  if (!page.params && page.relativePath !== 'index.md') {
    const markdownPath = page.relativePath.endsWith('/index.md')
      ? `${page.relativePath.slice(0, -'/index.md'.length)}.md`
      : page.relativePath
    headList.push(['link', { href: `/${markdownPath}`, rel: 'alternate', type: 'text/markdown' }])
  }
  headList.push(['link', { href: '/llms.txt', rel: 'describedby' }])

  /** 首頁與文章頁的封面（LCP）預載改由 Nuxt Image 輸出：首屏圖片以 eager 渲染時，<NuxtImg> 會在 head 加上與 <img> 相同 srcset、sizes 的 preload（見 web/components/theme-image.vue） */

  /** meme-cache 不預載 ndjson：首屏梗圖已直接輸出在 HTML（見 meme-cache.vue 的 #fallback），
   * ndjson 不在 LCP 的路徑上。預載反而讓 146 KB 的資料與擋渲染的 CSS、首屏圖片搶頻寬，
   * 本機 preview 實測拿掉後 LCP 2.68 → 2.26 秒、TBT 1331 → 963 ms
   */

  return headList
}
