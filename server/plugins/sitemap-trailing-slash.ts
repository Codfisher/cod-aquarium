import type { PageSeo } from '../../site/seo'
import seoData from '#site/seo-data'

/** 帶尾斜線的頁面網址（aquarium 各 app 的目錄頁，例如 /aquarium/hexazen/），首頁除外 */
const directoryUrlList = Object.values(seoData.seoMap as Record<string, PageSeo>)
  .map((pageSeo) => pageSeo.canonicalUrl)
  .filter((url) => url.endsWith('/') && new URL(url).pathname !== '/')

/** @nuxtjs/sitemap 依 site.trailingSlash 統一處理尾斜線，無法逐頁指定。
 *
 * 本站 aquarium 目錄頁的 canonical 帶尾斜線、其餘不帶（沿用 VitePress 時期的網址），
 * sitemap 的 loc 必須與 canonical 一致，否則 Search Console 會把兩者當成不同網址。
 * 模組在輸出前的最後一步才正規化網址，只能在 sitemap:output 改寫 XML
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('sitemap:output', (ctx) => {
    for (const url of directoryUrlList) {
      ctx.sitemap = ctx.sitemap.replaceAll(`<loc>${url.slice(0, -1)}</loc>`, `<loc>${url}</loc>`)
    }
  })
})
