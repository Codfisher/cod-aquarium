import type { Buffer } from 'node:buffer'
import type { DefaultTheme, HeadConfig } from 'vitepress'
import type { MemeItem } from '../content/aquarium/meme-cache/meme-seo'
import type { Article } from './utils'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ui from '@nuxt/ui/vite'
import { whyframe } from '@whyframe/core'
import { whyframeVue } from '@whyframe/vue'
import dayjs from 'dayjs'
import { filter, isTruthy, map, piped } from 'remeda'
import Icons from 'unplugin-icons/vite'
import llmstxt from 'vitepress-plugin-llms'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { RssPlugin } from 'vitepress-plugin-rss'
import { getMemeAlt, getMemeKeywordList, getMemeName, parseMemeNdjson, SEO_MEME_LIMIT } from '../content/aquarium/meme-cache/meme-seo'
import { markdownItBaseImg } from './plugin/markdown-it-base-img'
import { markdownItCodeBlockName } from './plugin/markdown-it-code-block-name'
import { markdownItNowrap } from './plugin/markdown-it-nowrap'
import { viteMemeSearchIndex } from './plugin/vite-meme-search-index'
import { viteSeoMemeList } from './plugin/vite-seo-meme-list'
import { generateImages } from './scripts/resize-images'
import {
  getArticleList,
  getLatestDocPath,
  getOldestDocPath,
  getSidebar,
} from './utils'

export interface Config extends DefaultTheme.Config {
  articleList: Article[];
}

const HOSTNAME = 'https://codlin.me'
const SITE_TITLE = '鱈魚的魚缸'
const SITE_DESCRIPTION = '各種鱈魚滾鍵盤的雜記與研究'
const AUTHOR_NAME = '鱈魚 (Cod Lin)'
/** public 目錄絕對路徑，供讀取封面圖尺寸使用 */
const CONTENT_PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../content/public')
/** 酷東西頁的網址前綴，這些頁為可直接操作的網頁應用 */
const AQUARIUM_PATH = '/aquarium/'
/** 快取梗圖頁網址，供注入圖片集合的結構化資料 */
const MEME_CACHE_PATH = `${AQUARIUM_PATH}meme-cache/`
const MEME_NDJSON_PATH = resolve(CONTENT_PUBLIC_DIR, 'memes/a-memes-data.ndjson')

let memeListCache: MemeItem[] | undefined
/** 迷因資料於 build 期間不會變動，快取避免重複讀取與解析近千筆資料 */
function getMemeList(): MemeItem[] {
  if (!memeListCache) {
    memeListCache = parseMemeNdjson(readFileSync(MEME_NDJSON_PATH, 'utf-8'))
  }
  return memeListCache
}

/** 作者於各社群平台的連結，供 JSON-LD sameAs 建立實體關聯 */
const socialLinkList = [
  'https://github.com/Codfisher/cod-aquarium',
  'https://gitlab.com/codfish2140',
  'https://www.youtube.com/@codfish2140',
  'https://www.linkedin.com/in/shih-chen-lin-codfish/',
  'https://www.threads.com/@codfish2140',
]

/** 作者 Person 實體，以固定 @id 供各文章 author 跨頁引用，匯聚作者權重 */
const PERSON_ID = `${HOSTNAME}/#person`
const ORGANIZATION_ID = `${HOSTNAME}/#organization`
const WEBSITE_ID = `${HOSTNAME}/#website`
const personNode: Record<string, unknown> = {
  '@type': 'Person',
  '@id': PERSON_ID,
  'name': AUTHOR_NAME,
  'url': `${HOSTNAME}/`,
  'image': `${HOSTNAME}/codfish.webp`,
  'jobTitle': '全端工程師',
  'description': '熱衷於結合各類領域技術、開發酷酷的東西',
  'worksFor': { '@id': ORGANIZATION_ID },
  'sameAs': socialLinkList,
  /** 專業領域取自文章實際涵蓋的主題，供搜尋引擎判斷作者專業性 */
  'knowsAbout': [
    'Vue.js',
    'TypeScript',
    'JavaScript',
    '前端開發',
    'Babylon.js',
    'WebGL',
    'GLSL Shader',
    'Electron',
    'Node.js',
    '網頁效能優化',
  ],
}

/** 發布者 Organization 實體，供 BlogPosting publisher 引用 */
const organizationNode: Record<string, unknown> = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  'name': SITE_TITLE,
  'url': `${HOSTNAME}/`,
  'founder': { '@id': PERSON_ID },
  'logo': {
    '@type': 'ImageObject',
    'url': `${HOSTNAME}/favicon.png`,
    'width': 446,
    'height': 393,
  },
}

/** 網站 WebSite 實體，供文章 isPartOf 與首頁引用，串起完整實體圖 */
const websiteNode: Record<string, unknown> = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  'name': SITE_TITLE,
  'url': `${HOSTNAME}/`,
  'description': SITE_DESCRIPTION,
  'inLanguage': 'zh-Hant',
  'publisher': { '@id': ORGANIZATION_ID },
}

/** 文章分類對應的顯示名稱與該分類的入口頁，供麵包屑（BreadcrumbList）使用 */
const sectionMap: Record<string, { name: string; landing: string }> = {
  'blog-ocean-world': { name: '蔚藍世界', landing: getLatestDocPath('/blog-ocean-world/') },
  'blog-program': { name: '程式浮潛', landing: getLatestDocPath('/blog-program/') },
  'blog-vue': { name: 'Vue', landing: getLatestDocPath('/blog-vue/') },
  'column-cod-toys': { name: '自己的工具自己做，用 Electron 仿造 PowerToys！', landing: getOldestDocPath('/column-cod-toys/') },
  'column-hexazen': { name: '來個 3D 白噪音混音器', landing: getOldestDocPath('/column-hexazen/') },
  'column-shader-notes': { name: '鱈魚的 Shader 筆記', landing: getOldestDocPath('/column-shader-notes/') },
  'column-minespace': { name: '從 Minecraft 開始的 babylon.js 之路', landing: getOldestDocPath('/column-minespace/') },
  'column-chill-components': { name: '酷酷元件背後的星點', landing: getOldestDocPath('/column-chill-components/') },
}

/** 將 frontmatter 的 pubDate（YYYYMMDD 數字）轉為含時區的 ISO 8601 字串 */
function toIsoDate(pubDate?: number): string | undefined {
  if (!pubDate)
    return undefined

  const value = String(pubDate)
  if (value.length !== 8)
    return undefined

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00+08:00`
}

/** 將 build 的頁面相對路徑轉為正規化網站路徑，處理首頁與巢狀 index 的尾斜線 */
function toUrlPath(page: string): string {
  const cleanPath = page.replace(/\.md$/, '')
  if (cleanPath === 'index')
    return '/'

  // 目錄型頁面（如 aquarium/xxx/index）實際網址為帶尾斜線的目錄，不可保留 index
  if (cleanPath.endsWith('/index'))
    return `/${cleanPath.slice(0, -'index'.length)}`

  return `/${cleanPath}`
}

/** 解析 webp 檔頭取得寬高，支援 VP8 / VP8L / VP8X 三種 chunk */
function parseWebpSize(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF')
    return undefined

  const format = buffer.toString('ascii', 12, 16)
  if (format === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3FFF,
      height: buffer.readUInt16LE(28) & 0x3FFF,
    }
  }
  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3FFF) + 1,
      height: ((bits >> 14) & 0x3FFF) + 1,
    }
  }
  if (format === 'VP8X') {
    return {
      width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
      height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
    }
  }
  return undefined
}

/** 讀取 public 目錄中封面圖的實際尺寸（含快取），供 og:image 與 ImageObject 使用 */
const imageSizeMap = new Map<string, { width: number; height: number } | undefined>()
function getImageSize(imageUrl?: string): { width: number; height: number } | undefined {
  if (!imageUrl)
    return undefined

  if (imageSizeMap.has(imageUrl))
    return imageSizeMap.get(imageUrl)

  let result: { width: number; height: number } | undefined
  try {
    const { pathname } = new URL(imageUrl, HOSTNAME)
    if (pathname.endsWith('.webp')) {
      result = parseWebpSize(readFileSync(resolve(CONTENT_PUBLIC_DIR, `.${pathname}`)))
    }
  }
  catch {
    result = undefined
  }

  imageSizeMap.set(imageUrl, result)
  return result
}

/** 將結構化資料序列化為安全的 JSON-LD script，跳脫 < > & 避免提前關閉標籤或注入 */
function toJsonLdScript(data: Record<string, unknown>): HeadConfig {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
  return ['script', { type: 'application/ld+json' }, json]
}

/** 首頁 → 本頁的兩層麵包屑 */
function toBreadcrumbNode(pageTitle: string, canonicalUrl: string): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': '首頁', 'item': `${HOSTNAME}/` },
      { '@type': 'ListItem', 'position': 2, 'name': pageTitle, 'item': canonicalUrl },
    ],
  }
}

/** 文章麵包屑：首頁 →（分類）→ 文章。若正在看的就是分類入口文章，省略重複的分類層 */
function toArticleBreadcrumbNode(params: {
  section?: { name: string; landing: string };
  urlPath: string;
  pageTitle: string;
  canonicalUrl: string;
}): Record<string, unknown> {
  const { section, urlPath, pageTitle, canonicalUrl } = params

  const itemList: Record<string, unknown>[] = [
    { '@type': 'ListItem', 'position': 1, 'name': '首頁', 'item': `${HOSTNAME}/` },
  ]
  if (section && section.landing !== urlPath) {
    itemList.push({
      '@type': 'ListItem',
      'position': 2,
      'name': section.name,
      'item': `${HOSTNAME}${section.landing}`,
    })
  }
  itemList.push({
    '@type': 'ListItem',
    'position': itemList.length + 1,
    'name': pageTitle,
    'item': canonicalUrl,
  })

  return { '@type': 'BreadcrumbList', 'itemListElement': itemList }
}

/** 集合頁（文章總覽、快取梗圖）的結構化資料：WebSite + CollectionPage（含 ItemList）+ 麵包屑 */
function toCollectionPageGraph(params: {
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  itemList: Record<string, unknown>[];
  /** 頁面提供站內搜尋時的網址樣板，關鍵字以 {search_term_string} 標示 */
  searchUrlTemplate?: string;
}): Record<string, unknown> {
  const { pageTitle, pageDescription, canonicalUrl, itemList, searchUrlTemplate } = params

  const searchAction = searchUrlTemplate
    ? {
        potentialAction: {
          '@type': 'SearchAction',
          'target': {
            '@type': 'EntryPoint',
            'urlTemplate': searchUrlTemplate,
          },
          'query-input': 'required name=search_term_string',
        },
      }
    : {}

  return {
    '@context': 'https://schema.org',
    '@graph': [
      websiteNode,
      {
        '@type': 'CollectionPage',
        'name': pageTitle,
        'description': pageDescription,
        'url': canonicalUrl,
        'inLanguage': 'zh-Hant',
        'isPartOf': { '@id': WEBSITE_ID },
        'mainEntity': {
          '@type': 'ItemList',
          'numberOfItems': itemList.length,
          'itemListElement': itemList,
        },
        ...searchAction,
      },
      toBreadcrumbNode(pageTitle, canonicalUrl),
    ],
  }
}

/** 酷東西頁的結構化資料：WebApplication + 麵包屑。
 *
 * 這些頁是可直接在瀏覽器操作的作品，宣告為應用程式而非文章。
 * 無 /aquarium/ 入口頁（導覽列為下拉選單），麵包屑僅首頁與本頁兩層。
 */
function toWebApplicationGraph(params: {
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  imageObject: Record<string, unknown>;
}): Record<string, unknown> {
  const { pageTitle, pageDescription, canonicalUrl, imageObject } = params

  return {
    '@context': 'https://schema.org',
    '@graph': [
      websiteNode,
      personNode,
      organizationNode,
      {
        '@type': 'WebApplication',
        'name': pageTitle,
        'description': pageDescription,
        'url': canonicalUrl,
        'image': imageObject,
        'inLanguage': 'zh-Hant',
        'isPartOf': { '@id': WEBSITE_ID },
        'author': { '@id': PERSON_ID },
        'applicationCategory': 'BrowserApplication',
        'operatingSystem': 'Any',
        'browserRequirements': 'Requires JavaScript',
        // 全部免費，明確宣告避免被視為缺漏
        'offers': {
          '@type': 'Offer',
          'price': '0',
          'priceCurrency': 'TWD',
        },
      },
      toBreadcrumbNode(pageTitle, canonicalUrl),
    ],
  }
}

/** 快取梗圖頁的 sitemap 圖片清單。
 *
 * 迷因圖僅存在於 app 執行時 fetch 的 ndjson，爬蟲無從發現，
 * 於 sitemap 列出才有機會進入 Google 圖片索引。
 * 只放最新數張，避免近千張圖片淹沒 sitemap 中的文章。
 */
function toMemeSitemapImageList() {
  return getMemeList().slice(-SEO_MEME_LIMIT).map((meme) => ({
    url: `${HOSTNAME}/memes/${meme.file}`,
    title: getMemeName(meme),
    caption: getMemeAlt(meme),
  }))
}

/** 迷因的圖片 ItemList，附上關鍵字與圖中文字（OCR），利於圖片搜尋比對 */
function toMemeImageItemList(memeList: MemeItem[]): Record<string, unknown>[] {
  return memeList.map((meme, index) => {
    const keywordList = getMemeKeywordList(meme)
    const ocrText = meme.ocr?.trim()

    return {
      '@type': 'ListItem',
      'position': index + 1,
      'item': {
        '@type': 'ImageObject',
        'name': getMemeName(meme),
        'caption': getMemeAlt(meme),
        'description': getMemeAlt(meme),
        'contentUrl': `${HOSTNAME}/memes/${meme.file}`,
        'encodingFormat': 'image/webp',
        ...(keywordList.length ? { keywords: keywordList } : {}),
        ...(ocrText ? { text: ocrText } : {}),
      },
    }
  })
}

function getNavItem(data: DefaultTheme.NavItem) {
  if ('items' in data) {
    const items = data.items?.filter((item) => {
      if (!item)
        return false

      if ('link' in item) {
        return !!item.link
      }

      return true
    }) ?? []

    if (items.length === 0) {
      return undefined
    }
    return {
      ...data,
      items,
    }
  }

  return data
}

// https://vitepress.dev/reference/site-config
export default ({ mode }: { mode: string }) => {
  const articleList = getArticleList()

  /** 以正規化後的網址精確比對文章（避免 includes 子字串誤配互為前綴的文章） */
  const findArticleByUrl = (url: string) => {
    const key = url.replace(/^\//, '').replace(/\.html$/, '')
    return articleList.find((article) => article.link.replace(/^\//, '') === key)
  }

  /** 首頁與總覽頁的 lastmod，以最新文章發布日為代表（新增文章時內容才變動） */
  const latestArticleDate = toIsoDate(articleList[0]?.frontmatter?.pubDate)

  const baseConfig = {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    hostname: HOSTNAME,
    email: 'hi@codlin.me',
    lang: 'zh-Hant',
    copyright: 'Copyright © 2024-present <a href="mailto:hi@codlin.me">Cod Lin</a>',
  }
  return withMermaid({
    title: baseConfig.title,
    description: baseConfig.description,
    srcDir: 'content',
    assetsDir: 'public',
    ignoreDeadLinks: true,
    lang: baseConfig.lang,
    head: [
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'true' }],
      /** 以非阻塞方式載入 Google Fonts，避免 CSS 阻擋首次繪製（配合 display=swap 以 fallback 字體先顯示）。
       * Figtree 僅標題（800）與導覽列標題（700）使用，不載入未用到的 400、600
       */
      ['link', {
        rel: 'preload',
        as: 'style',
        href: 'https://fonts.googleapis.com/css2?family=Figtree:wght@700;800&family=Noto+Sans+TC:wght@400;600;800&display=swap',
        onload: 'this.onload=null;this.rel=\'stylesheet\'',
      }],
      ['noscript', {}, '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@700;800&family=Noto+Sans+TC:wght@400;600;800&display=swap">'],
      ['link', { rel: 'icon', href: '/favicon.ico' }],
      /** 讓瀏覽器與 RSS 閱讀器自動發現訂閱來源 */
      ['link', { rel: 'alternate', type: 'application/rss+xml', title: SITE_TITLE, href: '/feed.rss' }],
      /** 行動裝置瀏覽器 UI 底色，淺色用品牌 teal、深色對齊 VitePress 深色底 */
      ['meta', { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#0d9a88' }],
      ['meta', { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#1b1b1f' }],
      /** rel=me 供 IndieWeb 與部分平台驗證作者身分 */
      ['link', { rel: 'me', href: 'https://github.com/Codfisher' }],
      ['link', { rel: 'me', href: 'https://www.threads.com/@codfish2140' }],
      ['link', { rel: 'me', href: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' }],
    ],
    sitemap: {
      hostname: baseConfig.hostname,
      transformItems: piped(
        filter((item) => {
          const url = item.url.startsWith('/') ? item.url : `/${item.url}`
          // 首頁、文章總覽、酷東西頁皆為重要入口，一律納入 sitemap
          if (
            url === '/'
            || url === '/index.html'
            || url === '/article-overview.html'
            || url.startsWith('/aquarium')
          ) {
            return true
          }

          const target = findArticleByUrl(item.url)
          if (!target) {
            console.warn(`[ sitemap ] ${item.url} 不在 articleList 之中`)
            return false
          }

          return !target?.frontmatter?.draft
        }),
        map((item) => {
          // 去除 .html，否則 search console 會因重新導向導致無法抓取
          const url = item.url.replace('.html', '')
          // 首頁實際網址為根路徑（VitePress 會把 index 洗成空字串或 /index，統一正規化為 /）
          const normalizedUrl = (url === '' || url === '/index' || url === 'index') ? '/' : url

          // 首頁與總覽頁補上 lastmod，其餘沿用 VitePress 依 git 產生的值
          const bareUrl = normalizedUrl.replace(/^\//, '')
          const isEntryPage = bareUrl === '' || bareUrl === 'article-overview'
          const lastmod = (isEntryPage && latestArticleDate && !item.lastmod)
            ? latestArticleDate
            : item.lastmod

          // 文章附上封面圖，供 Google 圖片搜尋收錄
          const image = findArticleByUrl(item.url)?.frontmatter?.image
          // 快取梗圖頁改列出整份圖庫，讓爬蟲得以發現 app 內才會載入的迷因圖
          const isMemeCachePage = `/${bareUrl}`.replace(/\/index$/, '/') === MEME_CACHE_PATH
          const imageList = isMemeCachePage
            ? toMemeSitemapImageList()
            : (image ? [{ url: image }] : undefined)

          return {
            ...item,
            url: normalizedUrl,
            ...(lastmod ? { lastmod } : {}),
            ...(imageList ? { img: imageList } : {}),
          }
        }),
      ),
    },
    rewrites(id) {
      // 去除檔名前面的日期
      const result = id.replace(/\d{6}\./, '')
      return result
    },
    transformHead({ page, pageData }) {
      const urlPath = toUrlPath(page)
      // canonical 與 og:url 皆用正規化後的實際網址，避免指向 /index 等不存在路徑
      const canonicalUrl = `${baseConfig.hostname}${urlPath}`

      const frontmatter = pageData.frontmatter ?? {}
      const isDraft = !!frontmatter.draft
      // 草稿不視為正式文章，避免輸出正式文章的結構化資料
      const isArticle = !!frontmatter.pubDate && !isDraft
      const pageTitle = frontmatter.title ?? pageData.title ?? baseConfig.title
      const pageDescription = frontmatter.description ?? baseConfig.description
      const ogImage = frontmatter.image
        ? new URL(frontmatter.image, baseConfig.hostname).toString()
        : `${baseConfig.hostname}/cover.webp`
      const ogImageSize = getImageSize(ogImage)
      // 大圖卡需接近 1.91:1，否則正方或直式圖會被裁切，改用不裁切的一般卡
      const isWideImage = !ogImageSize || ogImageSize.width / ogImageSize.height >= 1.6
      const twitterCard = isWideImage ? 'summary_large_image' : 'summary'

      const headList: HeadConfig[] = [
        [
          'link',
          {
            rel: 'canonical',
            href: canonicalUrl,
          },
        ],
        /** Open Graph：社群平台（LINE、Threads、Facebook 等）分享時的預覽卡片資訊 */
        ['meta', { property: 'og:type', content: isArticle ? 'article' : 'website' }],
        ['meta', { property: 'og:site_name', content: baseConfig.title }],
        ['meta', { property: 'og:locale', content: 'zh_TW' }],
        ['meta', { property: 'og:title', content: pageTitle }],
        ['meta', { property: 'og:url', content: canonicalUrl }],
        ['meta', { property: 'og:description', content: pageDescription }],
        ['meta', { property: 'og:image', content: ogImage }],
        ['meta', { property: 'og:image:alt', content: pageTitle }],
        /** Twitter / X 卡片 */
        ['meta', { name: 'twitter:card', content: twitterCard }],
        ['meta', { name: 'twitter:title', content: pageTitle }],
        ['meta', { name: 'twitter:description', content: pageDescription }],
        ['meta', { name: 'twitter:image', content: ogImage }],
        /** gtag 先建立佇列 stub，事件照常累積；實際 gtag.js 延後至 load 事件才注入，
         * 避免其下載與執行（實測約 1.7 秒主執行緒）搶佔首屏，載入後會自動消化佇列
         */
        [
          'script',
          {},
          `window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-WL47JJHL0R');`,
        ],
        /** 第三方腳本延後注入，避免搶佔首屏主執行緒、改善 INP 與 LCP：
         * gtag 於 load 事件立即載入（降低漏記 pageview 機率）、Clarity 與 AdSense 再延 2 秒
         */
        [
          'script',
          {},
          `(function(){
            function loadGtag(){
              var g=document.createElement('script');
              g.async=true;
              g.src='https://www.googletagmanager.com/gtag/js?id=G-WL47JJHL0R';
              document.head.appendChild(g);
            }
            function loadThirdParty(){
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "sbra2ic0u4");
              var s=document.createElement('script');
              s.async=true;
              s.crossOrigin='anonymous';
              s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6608581811170481';
              document.head.appendChild(s);
            }
            function onLoaded(){loadGtag();setTimeout(loadThirdParty,2000);}
            if(document.readyState==='complete'){onLoaded();}
            else{window.addEventListener('load',onLoaded);}
          })();`,
        ],
        [
          'meta',
          {
            name: 'google-adsense-account',
            content: 'ca-pub-6608581811170481',
          },
        ],
      ]

      /** 提供 og:image 尺寸，讓社群平台首次分享即可正確渲染大圖、避免掉版 */
      if (ogImageSize) {
        headList.push(
          ['meta', { property: 'og:image:width', content: String(ogImageSize.width) }],
          ['meta', { property: 'og:image:height', content: String(ogImageSize.height) }],
        )
      }

      /** 草稿頁仍會被 build 出來，明確標示 noindex 以免被搜尋引擎當正式內容收錄 */
      if (isDraft) {
        headList.push(['meta', { name: 'robots', content: 'noindex, nofollow' }])
      }

      /** 首頁 LCP 圖片 preload，讓瀏覽器盡早開始下載封面圖 */
      if (page === 'index.md') {
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
      else {
        /** 文章頁 LCP 圖片 preload：封面圖與 frontmatter.image 同源，
         * 依 base-img 的響應式 srcset 產生對應 imagesrcset，讓瀏覽器盡早下載封面。
         */
        const coverPath = new URL(pageData?.frontmatter?.image ?? '', baseConfig.hostname).pathname
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

      /** 封面圖 ImageObject，帶尺寸利於搜尋引擎與社群平台判斷 */
      const imageObject: Record<string, unknown> = ogImageSize
        ? { '@type': 'ImageObject', 'url': ogImage, 'width': ogImageSize.width, 'height': ogImageSize.height }
        : { '@type': 'ImageObject', 'url': ogImage }

      /** 結構化資料（JSON-LD）：協助搜尋引擎理解內容、爭取複合式搜尋結果 */
      if (isArticle) {
        const publishedTime = toIsoDate(frontmatter.pubDate)
        const modifiedTime = pageData.lastUpdated
          ? new Date(pageData.lastUpdated).toISOString()
          : publishedTime
        const tagList: string[] = Array.isArray(frontmatter.tags) ? frontmatter.tags : []
        const section = sectionMap[page.replace(/\.md$/, '').split('/')[0]]

        /** Open Graph article 專屬欄位 */
        if (publishedTime) {
          headList.push(['meta', { property: 'article:published_time', content: publishedTime }])
        }
        if (modifiedTime) {
          headList.push(['meta', { property: 'article:modified_time', content: modifiedTime }])
        }
        headList.push(['meta', { property: 'article:author', content: AUTHOR_NAME }])
        if (section) {
          headList.push(['meta', { property: 'article:section', content: section.name }])
        }
        tagList.forEach((tag) => {
          headList.push(['meta', { property: 'article:tag', content: tag }])
        })

        const blogPosting: Record<string, unknown> = {
          '@type': 'BlogPosting',
          'headline': pageTitle,
          'description': pageDescription,
          'image': imageObject,
          'datePublished': publishedTime,
          'dateModified': modifiedTime,
          'inLanguage': 'zh-Hant',
          // author 以 @id 指回首頁宣告的 Person，匯聚同一作者實體的權重
          'author': { '@id': PERSON_ID },
          'publisher': { '@id': ORGANIZATION_ID },
          'isPartOf': { '@id': WEBSITE_ID },
          'mainEntityOfPage': {
            '@type': 'WebPage',
            '@id': canonicalUrl,
          },
          // 無 tag 時省略 keywords，避免輸出空字串
          ...(tagList.length ? { keywords: tagList.join(', ') } : {}),
          ...(section ? { articleSection: section.name } : {}),
        }

        const graph: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@graph': [
            websiteNode,
            personNode,
            organizationNode,
            blogPosting,
            toArticleBreadcrumbNode({ section, urlPath, pageTitle, canonicalUrl }),
          ],
        }

        headList.push(toJsonLdScript(graph))
      }
      else if (urlPath === '/') {
        /** 首頁：宣告 WebSite 與作者 Person、Organization 實體，強化知識圖譜關聯 */
        const graph: Record<string, unknown> = {
          '@context': 'https://schema.org',
          '@graph': [
            websiteNode,
            personNode,
            organizationNode,
          ],
        }
        headList.push(toJsonLdScript(graph))
      }
      else if (urlPath === '/article-overview') {
        /** 文章總覽為文章集合頁，宣告 CollectionPage（含文章 ItemList）+ 麵包屑 */
        const itemList = articleList.map((article, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'url': `${baseConfig.hostname}/${article.link.replace(/^\//, '')}`,
          'name': article.text,
        }))

        headList.push(toJsonLdScript(toCollectionPageGraph({
          pageTitle,
          pageDescription,
          canonicalUrl,
          itemList,
        })))
      }
      else if (urlPath === MEME_CACHE_PATH) {
        /** 快取梗圖為圖片集合頁，宣告 CollectionPage（含圖片 ItemList）+ 麵包屑。
         * 需於 head 注入，元件內以 script 標籤輸出會被 SSR 跳脫成 HTML 實體而無法剖析
         */
        headList.push(toJsonLdScript(toCollectionPageGraph({
          pageTitle,
          pageDescription,
          canonicalUrl,
          itemList: toMemeImageItemList(getMemeList().slice(-SEO_MEME_LIMIT)),
          searchUrlTemplate: `${canonicalUrl}?q={search_term_string}`,
        })))
      }
      else if (urlPath.startsWith(AQUARIUM_PATH)) {
        /** 其餘酷東西頁皆為可直接操作的網頁應用，宣告 WebApplication */
        headList.push(toJsonLdScript(toWebApplicationGraph({
          pageTitle,
          pageDescription,
          canonicalUrl,
          imageObject,
        })))
      }

      return headList
    },
    /** 移除每頁 head 對 mermaid 圖表 chunk（含 katex）的 modulepreload。
     * 這些 link 由 VitePress 依 SSR manifest 注入，讓「沒有圖表的文章」也白載約 0.8 MB；
     * mermaid 內部會在真正有圖表時以 dynamic import 載入（katex 亦為其數學式的動態依賴），
     * 移除 preload 不影響功能。
     *
     * 比對特徵：mermaid 產出的 chunk 檔名帶 8 碼大寫雜湊（如 flowDiagram-4HSFHLVR、
     * dagre-OKDRZEBW），以此與自製元件（如 diagram-uv）區分，並錨定 chunks/ 路徑
     * 避免誤殺檔名含相同關鍵字的文章頁 chunk。若 mermaid 改版後命名慣例改變，
     * 此規則會失效回退為「保留 preload」，僅損失效能不影響功能。
     */
    transformHtml(code) {
      const mermaidPreloadPattern = /<link\s+rel="modulepreload"[^>]*href="[^"]*\/chunks\/(?:[\w-]*[Dd]iagram-(?:v2-)?[0-9A-Z]{8}|dagre-[0-9A-Z]{8}|(?:mindmap|kanban|timeline)-definition-[0-9A-Z]{8}|virtual_mermaid[\w-]*|katex)\.[^"]*"[^>]*>/g
      return code.replace(mermaidPreloadPattern, '')
    },
    lastUpdated: true,
    markdown: {
      lineNumbers: true,
      theme: {
        light: 'github-dark',
        dark: 'github-dark',
      },
      config(md) {
        md.use((md) => markdownItBaseImg(md, mode))
        md.use(markdownItNowrap)
        md.use(markdownItCodeBlockName)
      },
    },

    themeConfig: {
      articleList,
      footer: {
        copyright: baseConfig.copyright,
      },
      outline: {
        label: '目錄',
        level: [2, 3],
      },
      lastUpdated: {
        text: '更新於',
      },
      nav: filter(
        [
          { text: '總覽', link: '/article-overview' },
          {
            text: '主題',
            items: [
              { text: '蔚藍世界', link: getLatestDocPath('/blog-ocean-world/') },
              { text: '程式浮潛', link: getLatestDocPath('/blog-program/') },
              { text: 'Vue', link: getLatestDocPath('/blog-vue/') },
            ],
          },
          getNavItem({
            text: '專欄',
            items: [
              {
                text: '用 Electron 仿造 PowerToys',
                link: getOldestDocPath('/column-cod-toys/'),
              },
              {
                text: '來個 3D 白噪音混音器',
                link: getOldestDocPath('/column-hexazen/'),
              },
              {
                text: '鱈魚的 Shader 筆記',
                link: getOldestDocPath('/column-shader-notes/'),
              },
              // {
              //   text: '從 Minecraft 開始的 babylon.js 之路',
              //   link: getOldestDocPath('/column-minespace/'),
              // },
              // {
              //   text: '酷酷元件背後的星點',
              //   link: getOldestDocPath('/column-chill-components/'),
              // },
            ],
          }),
          getNavItem({
            text: '酷東西',
            items: [
              {
                text: 'MCU Windows',
                link: 'https://codfish-210716.notion.site/MCU-Windows-2f896774ea2f4742af974c753f947bd4#4fcf87c34f544b71bce9a76d96adb39a',
              },
              {
                text: '酷酷的元件',
                link: 'https://chillcomponent.codlin.me/',
              },
              {
                text: 'Cyber Scales Desktop',
                link: '/aquarium/cyber-scales-desktop/',
              },
              {
                text: '快取梗圖',
                link: '/aquarium/meme-cache/',
              },
              {
                text: '鱈魚的彈珠',
                link: '/aquarium/codmarbles/',
              },
              {
                text: 'CodStack',
                link: '/aquarium/codstack/',
              },
              {
                text: 'HexaZen',
                link: '/aquarium/hexazen/',
              },
              {
                text: 'EnderBox',
                link: '/aquarium/enderbox/',
              },
              {
                text: 'Minespace',
                link: '/aquarium/minespace/',
              },
              {
                text: '速速湊',
                link: 'https://susugo.codlin.me/',
              },
            ],
          }),
        ],
        isTruthy,
      ),
      logo: '/favicon.ico',

      sidebar: {
        '/': filter(
          [
            {
              text: '主題',
              items: [
                {
                  text: '蔚藍世界',
                  link: getLatestDocPath('/blog-ocean-world/'),
                },
                {
                  text: '程式浮潛',
                  link: getLatestDocPath('/blog-program/'),
                },
                {
                  text: 'Vue',
                  link: getLatestDocPath('/blog-vue/'),
                },
              ],
            },
            {
              text: '專欄',
              items: [
                {
                  text: '自己的工具自己做，用 Electron 仿造 PowerToys！',
                  link: getOldestDocPath('/column-cod-toys/'),
                },
                {
                  text: '來個 3D 白噪音混音器',
                  link: getOldestDocPath('/column-hexazen/'),
                },
                {
                  text: '鱈魚的 Shader 筆記',
                  link: getOldestDocPath('/column-shader-notes/'),
                },
                {
                  text: '從 Minecraft 開始的 babylon.js 之路',
                  link: getOldestDocPath('/column-minespace/'),
                },
                // {
                //   text: '酷酷元件背後的星點',
                //   link: getOldestDocPath('/column-chill-components/'),
                // },
              ],
            },
          ],
          isTruthy,
        ),
        ...getSidebar(
          '/blog-ocean-world/',
          '蔚藍世界',
        ),
        ...getSidebar(
          '/blog-program/',
          '程式浮潛',
        ),
        ...getSidebar(
          '/blog-vue/',
          'Vue',
        ),

        ...getSidebar(
          '/column-cod-toys/',
          '自己的工具自己做，用 Electron 仿造 PowerToys！',
          'asc',
        ),
        ...getSidebar(
          '/column-hexazen/',
          '來個 3D 白噪音混音器',
          'asc',
        ),
        ...getSidebar(
          '/column-shader-notes/',
          '鱈魚的 Shader 筆記',
          'asc',
        ),
        ...getSidebar(
          '/column-minespace/',
          '從 Minecraft 開始的 babylon.js 之路',
          'asc',
        ),
        // ...getSidebar(
        //   '/column-chill-components/',
        //   '酷酷元件背後的星點',
        //   'asc',
        // ),
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/Codfisher/cod-aquarium' },
        { icon: 'gitlab', link: 'https://gitlab.com/codfish2140' },
        { icon: 'youtube', link: 'https://www.youtube.com/@codfish2140' },
        { icon: 'linkedin', link: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
        { icon: 'threads', link: 'https://www.threads.com/@codfish2140' },
      ],
      search: {
        provider: 'local',
        options: {
          _render(src, env, md) {
            const html = md.render(src, env)
            if (env.frontmatter?.draft)
              return ''

            return html
          },
        },
      },
    } as Config,

    vite: {
      optimizeDeps: {
        exclude: ['@babylonjs/havok'],
      },
      css: {
        preprocessorOptions: {
          sass: {
            api: 'modern-compiler',
          },
        },
      },
      plugins: [
        /** 停用 VitePress 預設 Inter 字體，改用 Noto Sans TC */
        {
          name: 'disable-vitepress-default-fonts',
          enforce: 'pre',
          transform(code, id) {
            if (id.includes('theme-default/styles/fonts.css')) {
              return { code: '', map: null }
            }
          },
        },
        /** 強制停用 vitepress data loader 功能
         *
         * 避免 build 時出現以下錯誤：
         * KHR_animation_pointer.data.js: config must export or return an object.
         *
         * https://github.com/vuejs/vitepress/issues/4482
         */
        {
          name: 'disable-vp-static-data-plugin',
          configResolved(config) {
            (config.plugins as any).splice(
              config.plugins.findIndex((p) => p.name === 'vitepress:data'),
              1,
            )
          },
        },
        viteSeoMemeList(),
        viteMemeSearchIndex(),
        Icons({
          autoInstall: true,
          compiler: 'vue3',
        }),
        RssPlugin({
          title: baseConfig.title,
          description: baseConfig.description,
          language: baseConfig.lang,
          baseUrl: baseConfig.hostname,
          copyright: baseConfig.copyright,
          author: {
            name: 'Cod Lin',
            email: baseConfig.email,
          },
          filter(post) {
            const article = articleList.find(
              ({ link }) => post.url.includes(link),
            )
            if (!article) {
              return false
            }

            if (post.frontmatter.pubDate) {
              post.date = dayjs(`${post.frontmatter.pubDate}`, 'YYYYMMDD').format()
            }

            return true
          },
        }),
        ui({
          router: false,
        }),
        llmstxt(),

        whyframe({
          defaultSrc: '/_frame',
        }),
        whyframeVue({
          include: /\.(?:vue|md)$/,
        }),
      ],
    },
    async buildEnd() {
      await generateImages()

      // 第三方插件（如 vitepress-plugin-rss）持有未釋放的資源，導致 process 無法正常退出
      // 延遲足夠時間讓後續插件完成後強制結束
      setTimeout(() => process.exit(0), 10_000)
    },
  })
}
