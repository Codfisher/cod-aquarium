import type { SitePage } from '../site/pages'
import type { PlateSeries } from '../site/plate-series'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { addTemplate, addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import { CONTENT_PATH, CONTENT_PUBLIC_DIR, SITE_DESCRIPTION, SITE_LANG, SITE_TITLE } from '../site/constants'
import { getPageHeadList } from '../site/head'
import { getLatestArticleList } from '../site/latest-articles'
import { viteMarkdown } from '../site/markdown/vite-plugin'
import { getFeaturedMemeList } from '../site/meme-featured'
import { getSitePageList } from '../site/pages'
import { getPlateSeriesMap } from '../site/plate-series'
import { getSearchThumbnailPath } from '../site/search-thumbnail'
import { getPageSeo } from '../site/seo'
import { getThemeConfig } from '../site/theme-config'

/** 送到 client 的頁面資料：不含情緒分類頁的迷因清單（太大），那部分由 SSR payload 提供 */
function toClientPage(page: SitePage, plateSeriesMap: Map<string, PlateSeries>) {
  const { params, ...rest } = page
  return {
    ...rest,
    /** 站內搜尋結果的封面縮圖，見 getSearchThumbnail */
    searchThumbnail: getSearchThumbnail(page),
    headers: [],
    params: params ? { emotion: params.emotion, label: params.label, total: params.total } : undefined,
    plateSeries: plateSeriesMap.get(page.routePath),
  }
}

/** 站內搜尋結果的封面縮圖網址。草稿不進搜尋索引；封面檔不存在（例如還沒做的草稿封面）就不給，
 * 否則預先渲染這張縮圖會 404 讓 build 失敗
 */
function getSearchThumbnail(page: SitePage): string | undefined {
  if (page.frontmatter.draft)
    return undefined
  const thumbnailPath = getSearchThumbnailPath(page.frontmatter.image)
  if (!thumbnailPath || typeof page.frontmatter.image !== 'string')
    return undefined
  const imagePath = new URL(page.frontmatter.image, 'https://codlin.me').pathname
  return existsSync(path.join(CONTENT_PUBLIC_DIR, decodeURIComponent(imagePath))) ? thumbnailPath : undefined
}

/** 側欄項目內嵌的 frontmatter 只在 build 期排序用，送到 client 前拿掉 */
function stripSidebarFrontmatter<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, item) => key === 'frontmatter' ? undefined : item))
}

/** 站台核心：
 * - 掃描 content 的 md 產生路由（取代 VitePress 的檔案路由與 rewrites）
 * - 註冊 md 轉 Vue 的 Vite 外掛
 * - 產生 #site/data（client 用的站台設定、每頁資料的載入器）、#site/article-list（文章總覽用）、
 *   #site/server-data（只在 SSR 用的非 SEO head 與情緒頁資料）與 #site/seo-data（只在 SSR 用的 SEO 資料）
 */
export default defineNuxtModule({
  meta: { name: 'site' },
  setup(_options, nuxt) {
    const pageList = getSitePageList()
    /** 產生的型別宣告以絕對路徑引用專案內的型別 */
    const toImportPath = (relativePath: string) => path.resolve(nuxt.options.rootDir, relativePath).split(path.sep).join('/')
    const themeConfig = getThemeConfig()
    const plateSeriesMap = getPlateSeriesMap(themeConfig.sidebar)

    addVitePlugin(viteMarkdown(), { prepend: true })

    nuxt.hook('pages:extend', (routeList) => {
      for (const page of pageList) {
        routeList.push({
          name: page.routePath,
          path: page.routePath,
          file: path.join(CONTENT_PATH, page.filePath).replace(/\\/g, '/'),
        })
      }
    })

    const { articleList, ...clientThemeConfig } = themeConfig
    const site = {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      lang: SITE_LANG,
      dir: 'ltr',
      base: '/',
      cleanUrls: true,
      appearance: true,
      scrollOffset: 134,
      locales: {},
      head: [],
      themeConfig: { ...clientThemeConfig, sidebar: stripSidebarFrontmatter(themeConfig.sidebar) },
    }

    /** 每頁資料各自成為一個 chunk，換頁時才載入（見 app/middleware/site-page-data.global.ts）。
     * 全部塞進同一份模組的話，每頁都要先下載全站約 130 KB 的頁面資料，草稿的標題與描述也會跟著外流
     */
    pageList.forEach((page, index) => {
      addTemplate({
        filename: `site/pages/${index}.mjs`,
        getContents: () => `export default ${JSON.stringify(toClientPage(page, plateSeriesMap))}`,
        write: true,
      })
    })

    /** layout: false 的頁面（aquarium 各 app）進出要整頁載入，換頁前就得知道，不能等頁面資料 */
    const standalonePathList = pageList
      .filter((page) => page.frontmatter.layout === false)
      .map((page) => page.routePath)

    addTemplate({
      filename: 'site/data.mjs',
      getContents: () => [
        `export const site = ${JSON.stringify(site)}`,
        'export const pageLoaderMap = {',
        ...pageList.map((page, index) => `  ${JSON.stringify(page.routePath)}: () => import('./pages/${index}.mjs'),`),
        '}',
        `export const standalonePathList = ${JSON.stringify(standalonePathList)}`,
      ].join('\n'),
      write: true,
    })
    addTemplate({
      // 型別宣告檔名需對應 data.mjs，TypeScript 才找得到
      filename: 'site/data.d.mts',
      getContents: () => [
        `import type { ClientPageData, SiteData } from '${toImportPath('app/theme/site-data')}'`,
        'export declare const site: SiteData',
        'export declare const pageLoaderMap: Record<string, () => Promise<{ default: ClientPageData }>>',
        'export declare const standalonePathList: string[]',
      ].join('\n'),
      write: true,
    })

    /** 文章清單只有文章總覽用得到，獨立成模組由該元件匯入，不跟著每一頁載入 */
    addTemplate({
      filename: 'site/article-list.mjs',
      getContents: () => `export default ${JSON.stringify(articleList)}`,
      write: true,
    })
    addTemplate({
      filename: 'site/article-list.d.mts',
      getContents: () => [
        `import type { Article } from '${toImportPath('site/articles')}'`,
        'declare const articleList: Article[]',
        'export default articleList',
      ].join('\n'),
      write: true,
    })

    /** 首頁「最新文章」只需要前幾篇的標題、連結與封面，獨立成小模組，不必載入完整文章清單 */
    addTemplate({
      filename: 'site/latest-article-list.mjs',
      getContents: () => `export default ${JSON.stringify(getLatestArticleList(articleList))}`,
      write: true,
    })
    addTemplate({
      filename: 'site/latest-article-list.d.mts',
      getContents: () => [
        `import type { LatestArticle } from '${toImportPath('site/latest-articles')}'`,
        'declare const latestArticleList: LatestArticle[]',
        'export default latestArticleList',
      ].join('\n'),
      write: true,
    })

    /** 快取梗圖首屏梗圖：每次 build 隨機挑一批，SSR 直接輸出在 HTML，app 啟動後維持在清單最上方（見 meme-cache.vue） */
    addTemplate({
      filename: 'site/meme-featured-list.mjs',
      getContents: () => `export default ${JSON.stringify(getFeaturedMemeList())}`,
      write: true,
    })
    addTemplate({
      filename: 'site/meme-featured-list.d.mts',
      getContents: () => [
        `import type { FeaturedMeme } from '${toImportPath('site/meme-featured')}'`,
        'declare const featuredMemeList: FeaturedMeme[]',
        'export default featuredMemeList',
      ].join('\n'),
      write: true,
    })

    const serverData = {
      headMap: Object.fromEntries(pageList.map((page) => [page.routePath, getPageHeadList(page)])),
      emotionParamsMap: Object.fromEntries(
        pageList.filter((page) => page.params).map((page) => [page.params!.emotion, page.params]),
      ),
    }
    addTemplate({
      filename: 'site/server-data.mjs',
      getContents: () => `export default ${JSON.stringify(serverData)}`,
      write: true,
    })
    addTemplate({
      filename: 'site/server-data.d.mts',
      getContents: () => [
        `import type { HeadConfig } from '${toImportPath('site/head')}'`,
        `import type { EmotionPageParams } from '${toImportPath('content/aquarium/meme-cache/meme-seo')}'`,
        'declare const data: {',
        '  headMap: Record<string, HeadConfig[]>',
        '  emotionParamsMap: Record<string, EmotionPageParams>',
        '}',
        'export default data',
      ].join('\n'),
      write: true,
    })

    /** 每頁的 canonical、Open Graph、JSON-LD 等，由 app/plugins/site-seo.server.ts 交給 Nuxt SEO 模組輸出。
     * 只有 server 端匯入，資料量大（迷因頁的 JSON-LD）也不會進 client bundle
     */
    const seoData = {
      seoMap: Object.fromEntries(pageList.map((page) => [page.routePath, getPageSeo(page, articleList)])),
    }
    addTemplate({
      filename: 'site/seo-data.mjs',
      getContents: () => `export default ${JSON.stringify(seoData)}`,
      write: true,
    })
    addTemplate({
      filename: 'site/seo-data.d.mts',
      getContents: () => [
        `import type { PageSeo } from '${toImportPath('site/seo')}'`,
        'declare const data: {',
        '  seoMap: Record<string, PageSeo>',
        '}',
        'export default data',
      ].join('\n'),
      write: true,
    })

    nuxt.options.alias['#site/data'] = path.join(nuxt.options.buildDir, 'site/data.mjs')
    nuxt.options.alias['#site/article-list'] = path.join(nuxt.options.buildDir, 'site/article-list.mjs')
    nuxt.options.alias['#site/latest-article-list'] = path.join(nuxt.options.buildDir, 'site/latest-article-list.mjs')
    nuxt.options.alias['#site/meme-featured-list'] = path.join(nuxt.options.buildDir, 'site/meme-featured-list.mjs')
    nuxt.options.alias['#site/server-data'] = path.join(nuxt.options.buildDir, 'site/server-data.mjs')
    nuxt.options.alias['#site/seo-data'] = path.join(nuxt.options.buildDir, 'site/seo-data.mjs')

    /** 關掉 Nuxt 對動態 chunk 的 prefetch。
     * 預設每頁 idle 時會預取所有可能用到的 chunk（文章頁約 1 MB、首頁含 Babylon 約 2.7 MB），
     * 抵銷了 FishDiorama hydrateOnVisible、mermaid 動態載入的用意；原站也沒有 prefetch
     */
    nuxt.hook('build:manifest', (manifest) => {
      for (const chunk of Object.values(manifest)) {
        chunk.prefetch = false
        /** 不輸出 modulepreload：文章頁原本一次預載 37 個 chunk，在慢速網路與擋渲染的 CSS 搶頻寬，
         * CSS 晚約 0.8 秒到、FCP 跟著延後。改由 entry 執行時再依序載入（本機 preview A/B：文章頁 FCP 1.95 → 1.17 秒）
         */
        chunk.preload = false
      }
    })

    /** 草稿頁仍會 build 出來，以 route rules 交給 @nuxtjs/robots 輸出 noindex, nofollow，
     * @nuxtjs/sitemap 也會依同一條規則排除
     */
    nuxt.options.nitro.routeRules ??= {}
    for (const page of pageList.filter((page) => page.frontmatter.draft)) {
      nuxt.options.nitro.routeRules[page.routePath] = { ...nuxt.options.nitro.routeRules[page.routePath], robots: false }
    }

    // 所有頁面都預先渲染
    nuxt.options.nitro.prerender ??= {}
    nuxt.options.nitro.prerender.routes = [
      ...(nuxt.options.nitro.prerender.routes ?? []),
      ...pageList.map((page) => page.routePath),
      /** 搜尋結果縮圖只寫在 Pagefind 的 meta 裡，頁面上沒有對應的 <img>，Nuxt Image 不會自動產生，這裡明確列出 */
      ...new Set(pageList.map(getSearchThumbnail).filter((item): item is string => !!item)),
    ]
  },
})
