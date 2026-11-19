import type { Buffer } from 'node:buffer'
import type { MemeItem } from '../content/aquarium/meme-cache/meme-seo'
import type { Article } from './articles'
import type { SitePage } from './pages'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getMemeAlt, getMemeKeywordList, getMemeName, MEME_CACHE_PATH, SEO_MEME_LIMIT } from '../content/aquarium/meme-cache/meme-seo'
import { readSeoMemeList } from '../content/aquarium/meme-cache/meme-seo-source'
import { getLatestDocPath, getOldestDocPath } from './articles'
import { AUTHOR_NAME, CONTENT_PUBLIC_DIR, HOSTNAME, SITE_DESCRIPTION, SITE_TITLE } from './constants'

/** 酷東西頁的網址前綴，這些頁為可直接操作的網頁應用 */
const AQUARIUM_PATH = '/aquarium/'

/** JSON-LD 的單一節點 */
export type SchemaNode = Record<string, unknown>

/** 結構化資料的 image 欄位，可為單張或多種比例 */
type SchemaImage = SchemaNode | SchemaNode[]

/** 交給 useSeoMeta 的 Open Graph、Twitter 與 article 欄位，鍵名同 unhead 的 useSeoMeta。
 * robots meta 由 @nuxtjs/robots 輸出，草稿的 noindex 見 modules/site.ts 的 route rules
 */
export interface PageSeoMeta {
  ogType: 'article' | 'website';
  ogSiteName: string;
  ogLocale: string;
  ogTitle: string;
  ogUrl: string;
  ogDescription: string;
  ogImage: { url: string; alt: string; width?: number; height?: number };
  twitterCard: 'summary_large_image' | 'summary';
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: { url: string; alt: string };
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  articleAuthor?: string[];
  articleSection?: string;
  articleTag?: string[];
}

/** 每頁的 SEO 資料：build 期算好，SSR 時由 app/plugins/site-seo.server.ts 交給 unhead 與 nuxt-schema-org 輸出 */
export interface PageSeo {
  canonicalUrl: string;
  seoMeta: PageSeoMeta;
  /** JSON-LD 的 @graph 節點，空陣列代表此頁不輸出結構化資料 */
  schemaNodeList: SchemaNode[];
}

let memeListCache: MemeItem[] | undefined
/** 迷因資料於 build 期間不會變動，快取避免重複讀取與解析上千筆資料 */
export function getMemeList(): MemeItem[] {
  if (!memeListCache)
    memeListCache = readSeoMemeList()
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

/** 全站共用實體的 @id 一律寫完整網址。
 * nuxt-schema-org 只保留 http 開頭的 @id，其餘會改寫成 #/schema/... 的形式，跨頁引用就對不上了
 */
const PERSON_ID = `${HOSTNAME}/#person`
const ORGANIZATION_ID = `${HOSTNAME}/#organization`
const WEBSITE_ID = `${HOSTNAME}/#website`

/** 作者 Person 實體，以固定 @id 供各文章 author 跨頁引用，匯聚作者權重 */
const personNode: SchemaNode = {
  '@type': 'Person',
  '@id': PERSON_ID,
  'name': AUTHOR_NAME,
  'url': `${HOSTNAME}/`,
  /** 寫成 ImageObject 而非網址字串：nuxt-schema-org 會把字串形式的 image 拆成獨立的 ImageObject 節點 */
  'image': { '@type': 'ImageObject', 'url': `${HOSTNAME}/codfish.webp` },
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
const organizationNode: SchemaNode = {
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
const websiteNode: SchemaNode = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  'name': SITE_TITLE,
  'url': `${HOSTNAME}/`,
  'description': SITE_DESCRIPTION,
  'inLanguage': 'zh-Hant',
  'publisher': { '@id': ORGANIZATION_ID },
}

let sectionMapCache: Record<string, { name: string; landing: string }> | undefined
/** 文章分類對應的顯示名稱與該分類的入口頁，供麵包屑（BreadcrumbList）使用 */
function getSectionMap() {
  if (!sectionMapCache) {
    sectionMapCache = {
      'blog-ocean-world': { name: '蔚藍世界', landing: getLatestDocPath('/blog-ocean-world/') },
      'blog-program': { name: '程式浮潛', landing: getLatestDocPath('/blog-program/') },
      'blog-vue': { name: 'Vue', landing: getLatestDocPath('/blog-vue/') },
      'column-cod-toys': { name: '自己的工具自己做，用 Electron 仿造 PowerToys！', landing: getOldestDocPath('/column-cod-toys/') },
      'column-hexazen': { name: '來個 3D 白噪音混音器', landing: getOldestDocPath('/column-hexazen/') },
      'column-shader-notes': { name: '鱈魚的 Shader 筆記', landing: getOldestDocPath('/column-shader-notes/') },
      'column-minespace': { name: '從 Minecraft 開始的 babylon.js 之路', landing: getOldestDocPath('/column-minespace/') },
      'column-chill-components': { name: '酷酷元件背後的星點', landing: getOldestDocPath('/column-chill-components/') },
    }
  }
  return sectionMapCache
}

/** 將 frontmatter 的 pubDate（YYYYMMDD 數字）轉為含時區的 ISO 8601 字串 */
export function toIsoDate(pubDate?: unknown): string | undefined {
  if (!pubDate)
    return undefined

  const value = String(pubDate)
  if (value.length !== 8)
    return undefined

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00+08:00`
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
      width: 1 + ((buffer[24] ?? 0) | ((buffer[25] ?? 0) << 8) | ((buffer[26] ?? 0) << 16)),
      height: 1 + ((buffer[27] ?? 0) | ((buffer[28] ?? 0) << 8) | ((buffer[29] ?? 0) << 16)),
    }
  }
  return undefined
}

/** 逐段掃 JPEG marker，從 SOF 段讀出寬高。社群縮圖用 JPEG（部分平台讀不了 WebP），需要這支才能輸出 og:image 尺寸 */
function parseJpegSize(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8)
    return undefined

  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xFF)
      return undefined

    const marker = buffer[offset + 1] ?? 0
    // SOF0～SOF15，扣掉 DHT（C4）、JPG（C8）、DAC（CC）這三個不是影格標頭的 marker
    const isFrameHeader = marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)
    if (isFrameHeader) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }

    offset += 2 + buffer.readUInt16BE(offset + 2)
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
    else if (/\.jpe?g$/.test(pathname)) {
      result = parseJpegSize(readFileSync(resolve(CONTENT_PUBLIC_DIR, `.${pathname}`)))
    }
  }
  catch {
    result = undefined
  }

  imageSizeMap.set(imageUrl, result)
  return result
}

/** 圖片 ImageObject，讀得到尺寸就一併帶上 */
function toImageObject(url: string): SchemaNode {
  const size = getImageSize(url)
  return size
    ? { '@type': 'ImageObject', 'url': url, 'width': size.width, 'height': size.height }
    : { '@type': 'ImageObject', 'url': url }
}

/** 首頁 → 本頁的兩層麵包屑 */
function toBreadcrumbNode(pageTitle: string, canonicalUrl: string): SchemaNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
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
}): SchemaNode {
  const { section, urlPath, pageTitle, canonicalUrl } = params

  const itemList: SchemaNode[] = [
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

  return { '@type': 'BreadcrumbList', '@id': `${canonicalUrl}#breadcrumb`, 'itemListElement': itemList }
}

/** 集合頁（文章總覽、快取梗圖）的結構化資料：WebSite + CollectionPage（含 ItemList）+ 麵包屑 */
function toCollectionPageNodeList(params: {
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  itemList: SchemaNode[];
  /** 頁面提供站內搜尋時的網址樣板，關鍵字以 {search_term_string} 標示 */
  searchUrlTemplate?: string;
  /** 預設為首頁 → 本頁兩層，深層頁面自行傳入 */
  breadcrumbNode?: SchemaNode;
  /** 同一頁的其他實體，例如快取梗圖本身也是網頁應用 */
  extraNodeList?: SchemaNode[];
}): SchemaNode[] {
  const {
    pageTitle,
    pageDescription,
    canonicalUrl,
    itemList,
    searchUrlTemplate,
    breadcrumbNode,
    extraNodeList = [],
  } = params

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

  return [
    websiteNode,
    // WebSite.publisher 指向 #organization、Organization.founder 指向 #person，同一個 graph 內要有這兩個節點，引用才不會落空
    personNode,
    organizationNode,
    {
      '@type': 'CollectionPage',
      '@id': `${canonicalUrl}#webpage`,
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
    ...extraNodeList,
    breadcrumbNode ?? toBreadcrumbNode(pageTitle, canonicalUrl),
  ]
}

/** 網頁應用節點，作者以 @id 指向 personNode，使用時 graph 內需一併放入 personNode */
function toWebApplicationNode(params: {
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  schemaImage: SchemaImage;
}): SchemaNode {
  const { pageTitle, pageDescription, canonicalUrl, schemaImage } = params

  return {
    '@type': 'WebApplication',
    '@id': `${canonicalUrl}#webapp`,
    'name': pageTitle,
    'description': pageDescription,
    'url': canonicalUrl,
    'image': schemaImage,
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
  }
}

/** 迷因的圖片 ItemList，附上關鍵字與圖中文字（OCR），利於圖片搜尋比對 */
function toMemeImageItemList(memeList: MemeItem[]): SchemaNode[] {
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

/** 依頁面類型組出 JSON-LD 節點：文章、首頁、文章總覽、快取梗圖、情緒分類頁、其餘酷東西頁 */
function getSchemaNodeList(params: {
  page: SitePage;
  articleList: Article[];
  isArticle: boolean;
  pageTitle: string;
  pageDescription: string;
  canonicalUrl: string;
  schemaImage: SchemaImage;
  publishedTime?: string;
  modifiedTime?: string;
  tagList: string[];
  section?: { name: string; landing: string };
}): SchemaNode[] {
  const {
    page,
    articleList,
    isArticle,
    pageTitle,
    pageDescription,
    canonicalUrl,
    schemaImage,
    publishedTime,
    modifiedTime,
    tagList,
    section,
  } = params
  const urlPath = page.routePath

  if (isArticle) {
    const blogPosting: SchemaNode = {
      '@type': 'BlogPosting',
      '@id': `${canonicalUrl}#article`,
      'headline': pageTitle,
      'description': pageDescription,
      'image': schemaImage,
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

    return [
      websiteNode,
      personNode,
      organizationNode,
      blogPosting,
      toArticleBreadcrumbNode({ section, urlPath, pageTitle, canonicalUrl }),
    ]
  }

  /** 首頁：宣告 WebSite 與作者 Person、Organization 實體，強化知識圖譜關聯 */
  if (urlPath === '/')
    return [websiteNode, personNode, organizationNode]

  /** 文章總覽為文章集合頁，宣告 CollectionPage（含文章 ItemList）+ 麵包屑 */
  if (urlPath === '/article-overview') {
    const itemList = articleList.map((article, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'url': `${HOSTNAME}/${article.link.replace(/^\//, '')}`,
      'name': article.text,
    }))

    return toCollectionPageNodeList({ pageTitle, pageDescription, canonicalUrl, itemList })
  }

  /** 快取梗圖為圖片集合頁，宣告 CollectionPage（含圖片 ItemList）+ 麵包屑 */
  if (urlPath === MEME_CACHE_PATH) {
    return toCollectionPageNodeList({
      pageTitle,
      pageDescription,
      canonicalUrl,
      itemList: toMemeImageItemList(getMemeList().slice(-SEO_MEME_LIMIT)),
      searchUrlTemplate: `${canonicalUrl}?q={search_term_string}`,
      // 頁面同時是可操作的梗圖搜尋器，與其他酷東西頁一致宣告 WebApplication
      extraNodeList: [
        toWebApplicationNode({ pageTitle, pageDescription, canonicalUrl, schemaImage }),
      ],
    })
  }

  /** 情緒分類頁（如「嘲諷梗圖」）為快取梗圖底下的圖片集合頁，麵包屑多一層快取梗圖 */
  if (page.params) {
    return toCollectionPageNodeList({
      pageTitle,
      pageDescription,
      canonicalUrl,
      itemList: toMemeImageItemList(page.params.memeList),
      breadcrumbNode: {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': '首頁', 'item': `${HOSTNAME}/` },
          { '@type': 'ListItem', 'position': 2, 'name': '快取梗圖', 'item': `${HOSTNAME}${MEME_CACHE_PATH}` },
          // 不用 pageTitle：它帶「｜快取梗圖」後綴，與第二層重複
          { '@type': 'ListItem', 'position': 3, 'name': `${page.params.label}梗圖`, 'item': canonicalUrl },
        ],
      },
    })
  }

  /** 其餘酷東西頁皆為可直接操作的網頁應用，宣告 WebApplication + 麵包屑。
   * 無 /aquarium/ 入口頁（導覽列為下拉選單），麵包屑僅首頁與本頁兩層
   */
  if (urlPath.startsWith(AQUARIUM_PATH)) {
    return [
      websiteNode,
      personNode,
      organizationNode,
      toWebApplicationNode({ pageTitle, pageDescription, canonicalUrl, schemaImage }),
      toBreadcrumbNode(pageTitle, canonicalUrl),
    ]
  }

  return []
}

/** 每頁的 canonical、Open Graph、Twitter、article meta 與 JSON-LD，原本是 VitePress 的 transformHead。
 *
 * 只在 SSR（預先渲染）輸出，client 端換頁不更新，與原本行為相同
 */
export function getPageSeo(page: SitePage, articleList: Article[]): PageSeo {
  const urlPath = page.routePath
  // canonical 與 og:url 皆用正規化後的實際網址：aquarium 目錄頁帶尾斜線，其餘不帶
  const canonicalUrl = `${HOSTNAME}${urlPath}`

  const frontmatter = page.frontmatter
  const isDraft = !!frontmatter.draft
  // 草稿不視為正式文章，避免輸出正式文章的結構化資料
  const isArticle = !!frontmatter.pubDate && !isDraft
  const pageTitle = (frontmatter.title as string | undefined) ?? page.title ?? SITE_TITLE
  const pageDescription = (frontmatter.description as string | undefined) ?? SITE_DESCRIPTION
  const frontmatterImage = typeof frontmatter.image === 'string' ? frontmatter.image : undefined
  const ogImage = frontmatterImage
    ? new URL(frontmatterImage, HOSTNAME).toString()
    : `${HOSTNAME}/cover.webp`
  const ogImageSize = getImageSize(ogImage)
  // X 的大圖卡吃 16:9，可用 frontmatter.twitterImage 另給一張；沒給就沿用 og:image
  const twitterImage = typeof frontmatter.twitterImage === 'string'
    ? new URL(frontmatter.twitterImage, HOSTNAME).toString()
    : ogImage
  const twitterImageSize = getImageSize(twitterImage)
  // 大圖卡需為橫式，否則正方或直式圖會被裁切，改用不裁切的一般卡
  const isWideImage = !twitterImageSize || twitterImageSize.width / twitterImageSize.height >= 1.6

  /** Open Graph：社群平台（LINE、Threads、Facebook 等）分享時的預覽卡片資訊；Twitter / X 卡片另列 */
  const seoMeta: PageSeoMeta = {
    ogType: isArticle ? 'article' : 'website',
    ogSiteName: SITE_TITLE,
    ogLocale: 'zh_TW',
    ogTitle: pageTitle,
    ogUrl: canonicalUrl,
    ogDescription: pageDescription,
    // 提供 og:image 尺寸，讓社群平台首次分享即可正確渲染大圖、避免掉版
    ogImage: { url: ogImage, alt: pageTitle, ...ogImageSize },
    twitterCard: isWideImage ? 'summary_large_image' : 'summary',
    twitterTitle: pageTitle,
    twitterDescription: pageDescription,
    twitterImage: { url: twitterImage, alt: pageTitle },
  }

  /** Google 建議結構化資料的圖片同時提供 16:9、4:3、1:1，frontmatter.structuredImageList 有給就全部列出，
   * 否則用 og:image，帶尺寸利於搜尋引擎判斷
   */
  const structuredImageUrlList: string[] = Array.isArray(frontmatter.structuredImageList)
    ? frontmatter.structuredImageList
        .filter((url: unknown): url is string => typeof url === 'string')
        .map((url: string) => new URL(url, HOSTNAME).toString())
    : []
  const schemaImage = structuredImageUrlList.length
    ? structuredImageUrlList.map(toImageObject)
    : toImageObject(ogImage)

  const publishedTime = isArticle ? toIsoDate(frontmatter.pubDate) : undefined
  const modifiedTime = isArticle && page.lastUpdated
    ? new Date(page.lastUpdated).toISOString()
    : publishedTime
  const tagList: string[] = isArticle && Array.isArray(frontmatter.tags) ? frontmatter.tags : []
  const section = isArticle
    ? getSectionMap()[page.relativePath.replace(/\.md$/, '').split('/')[0] ?? '']
    : undefined

  /** Open Graph article 專屬欄位 */
  if (isArticle) {
    seoMeta.articlePublishedTime = publishedTime
    seoMeta.articleModifiedTime = modifiedTime
    seoMeta.articleAuthor = [AUTHOR_NAME]
    seoMeta.articleSection = section?.name
    seoMeta.articleTag = tagList
  }

  return {
    canonicalUrl,
    seoMeta,
    schemaNodeList: getSchemaNodeList({
      page,
      articleList,
      isArticle,
      pageTitle,
      pageDescription,
      canonicalUrl,
      schemaImage,
      publishedTime,
      modifiedTime,
      tagList,
      section,
    }),
  }
}
