import type { SitePage } from './pages'
import { HOSTNAME } from './constants'

/** head 標籤：[標籤名, 屬性, 內容]，與原 VitePress 的 HeadConfig 同格式 */
export type HeadConfig =
  | [string, Record<string, string>]
  | [string, Record<string, string>, string]

/** 每頁專屬、與 SEO 無關的 head 標籤（LCP preload、llms 連結），原本是 VitePress 的 transformHead。
 *
 * 只在 SSR（預先渲染）輸出，client 端換頁不更新，與原本行為相同。
 * canonical、Open Graph、JSON-LD 等 SEO 標籤改由 Nuxt SEO 模組輸出，資料見 site/seo.ts
 */
export function getPageHeadList(page: SitePage): HeadConfig[] {
  const frontmatter = page.frontmatter
  const frontmatterImage = typeof frontmatter.image === 'string' ? frontmatter.image : undefined
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

  /** 首頁 LCP 圖片 preload，讓瀏覽器盡早開始下載封面圖 */
  if (page.relativePath === 'index.md') {
    headList.push([
      'link',
      {
        rel: 'preload',
        as: 'image',
        href: '/cover.webp',
        imagesrcset: '/cover-300.webp 300w, /cover-700.webp 700w',
        imagesizes: '(max-width: 700px) 100vw, 700px',
        fetchpriority: 'high',
      },
    ])
  }
  /** layout: false 的頁面（各 aquarium app）與梗圖情緒分類頁不顯示封面，frontmatter.image 只供社群分享用，
   * preload 只會以高優先權白載、跟真正的首屏資源搶頻寬
   */
  else if (frontmatter.layout !== false && !page.params) {
    /** 文章頁 LCP 圖片 preload：封面圖與 frontmatter.image 同源，
     * 依 base-img 的響應式 srcset 產生對應 imagesrcset，讓瀏覽器盡早下載封面。
     */
    const coverPath = new URL(frontmatterImage ?? '', HOSTNAME).pathname
    if (coverPath.endsWith('.webp')) {
      const coverBaseName = coverPath.replace(/\.webp$/, '')
      headList.push([
        'link',
        {
          rel: 'preload',
          as: 'image',
          href: coverPath,
          imagesrcset: `${coverBaseName}-300.webp 300w, ${coverBaseName}-700.webp 700w`,
          imagesizes: '(max-width: 700px) 100vw, 700px',
          fetchpriority: 'high',
        },
      ])
    }
  }

  /** meme-cache 的 LCP 是清單第一張圖，得等 ndjson 讀完才知道要載哪張。
   * 原本要等 JS 執行完才發出請求，preload 讓它與 JS 同時下載。
   * 網址需與 use-meme-data.ts 的 fetch 一致；fetch 預設為 cors＋same-origin 憑證，
   * 對應 crossorigin="anonymous"，兩者不符瀏覽器會重抓一次
   */
  if (page.relativePath === 'aquarium/meme-cache/index.md') {
    for (const href of ['/memes/a-memes-data.ndjson', '/memes/a-memes-data-extend.ndjson']) {
      headList.push(['link', { rel: 'preload', as: 'fetch', href, crossorigin: 'anonymous' }])
    }
  }

  return headList
}
