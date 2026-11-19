import type { SitePage } from './pages'
import { MEME_CACHE_PATH, SEO_MEME_LIMIT } from '../content/aquarium/meme-cache/meme-seo'
import { getArticleList } from './articles'
import { HOSTNAME } from './constants'
import { getMemeDataCommitDate, getSitePageList } from './pages'
import { getMemeList, toIsoDate } from './seo'

/** 只給 image:loc：Google 已不支援 image:title、image:caption（2022 年從文件移除），寫了只是讓 sitemap 變大 */
interface SitemapImage {
  loc: string;
}

/** @nuxtjs/sitemap 的 urls 項目（SitemapUrlInput 的子集） */
export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  images?: SitemapImage[];
}

/** 取兩個時間中較新者 */
function pickLatestDate(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!candidate)
    return current
  if (!current)
    return candidate
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current
}

/** 快取梗圖頁列出最新數張迷因圖。
 *
 * 迷因圖只存在 app 執行時 fetch 的 ndjson，爬蟲無從發現，列進 sitemap 才有機會進 Google 圖片索引
 */
function getMemeImageList(): SitemapImage[] {
  return getMemeList().slice(-SEO_MEME_LIMIT).map((meme) => ({
    loc: `${HOSTNAME}/memes/${meme.file}`,
  }))
}

/** 依 VitePress 的頁面順序排列：一般頁依原始檔名排序，動態路由（情緒分類頁）排最後 */
function sortLikeVitePress(pageList: SitePage[]): SitePage[] {
  return [
    ...pageList.filter((page) => !page.params),
    ...pageList.filter((page) => !!page.params),
  ]
}

/** sitemap 網址清單，規則同原 VitePress 設定的 transformItems，交給 nuxt.config 的 sitemap.urls。
 *
 * - 首頁、文章總覽、酷東西頁一律納入；其餘只收非草稿文章
 * - lastmod 取 git 最後修改時間；首頁與文章總覽沒有時改用最新文章發布日；快取梗圖各頁取頁面與迷因資料兩者較新者
 * - 文章附上封面圖、快取梗圖頁附上最新數張迷因圖
 *
 * loc 給完整網址，@nuxtjs/sitemap 會依 site.trailingSlash 統一去掉尾斜線，
 * aquarium 目錄頁的尾斜線由 server/plugins/sitemap-trailing-slash.ts 補回
 */
export function getSitemapUrlList(): SitemapUrl[] {
  const articleList = getArticleList()
  const articleMap = new Map(articleList.map((article) => [
    `/${article.link.replace(/^\//, '')}`,
    article,
  ]))
  /** 首頁與總覽頁以最新文章發布日為 lastmod（新增文章時內容才變動） */
  const latestArticleDate = toIsoDate(articleList[0]?.frontmatter?.pubDate)
  const memeDataCommitDate = getMemeDataCommitDate()

  const result: SitemapUrl[] = []
  for (const page of sortLikeVitePress(getSitePageList())) {
    const url = page.routePath
    const article = articleMap.get(url)
    const isEntryPage = url === '/' || url === '/article-overview'

    if (!isEntryPage && !url.startsWith('/aquarium')) {
      // 草稿本來就不在 articleList，不必警告
      if (!article && !page.frontmatter.draft)
        console.warn(`[ sitemap ] ${url} 不在 articleList 之中`)
      if (!article || article.frontmatter.draft)
        continue
    }

    // frontmatter lastUpdated: false 的頁面不提供更新時間
    const pageLastmod = page.frontmatter.lastUpdated === false || !page.lastUpdated
      ? undefined
      : new Date(page.lastUpdated).toISOString()
    const entryLastmod = isEntryPage && latestArticleDate && !pageLastmod
      ? latestArticleDate
      : pageLastmod
    const lastmod = url.startsWith(MEME_CACHE_PATH)
      ? pickLatestDate(entryLastmod, memeDataCommitDate)
      : entryLastmod

    // 文章附上封面圖，供 Google 圖片搜尋收錄
    const imageList: SitemapImage[] = url === MEME_CACHE_PATH
      ? getMemeImageList()
      : (article?.frontmatter.image ? [{ loc: article.frontmatter.image }] : [])

    result.push({
      loc: `${HOSTNAME}${url}`,
      // 統一轉 UTC，含時區的日期字串交給模組時不會有解讀差異
      ...(lastmod ? { lastmod: new Date(lastmod).toISOString() } : {}),
      ...(imageList.length ? { images: imageList } : {}),
    })
  }

  return result
}
