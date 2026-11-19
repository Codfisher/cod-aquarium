import type { EmotionPageParams } from '../content/aquarium/meme-cache/meme-seo'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { EMOTION_PAGE_MEME_LIMIT, EMOTION_SLUG_MAP, getEmotionMemeList, getEmotionSummaryList, getMemeName } from '../content/aquarium/meme-cache/meme-seo'
import { readSeoMemeList } from '../content/aquarium/meme-cache/meme-seo-source'
import { CONTENT_PATH, MEME_EXTEND_NDJSON_RELATIVE_PATH, MEME_NDJSON_RELATIVE_PATH, PROJECT_ROOT, SITE_DESCRIPTION } from './constants'

/** 單一頁面的建置期資料，欄位對齊原 VitePress 的 PageData，主題元件沿用同樣的讀法 */
export interface SitePage {
  /** 去掉日期前綴後的 md 相對路徑，例如 blog-vue/vue-shallow-ref-and-ref.md */
  relativePath: string;
  /** 原始 md 相對路徑，例如 blog-vue/241007.vue-shallow-ref-and-ref.md */
  filePath: string;
  /** 網址路徑，例如 /blog-vue/vue-shallow-ref-and-ref、/aquarium/hexazen/ */
  routePath: string;
  title: string;
  titleTemplate?: string | boolean;
  description: string;
  frontmatter: Record<string, unknown>;
  /** git 最後修改時間（毫秒） */
  lastUpdated?: number;
  /** 動態路由參數（情緒分類頁） */
  params?: EmotionPageParams;
}

/** 檔名前的發布日期前綴，例如 241007. */
const DATE_PREFIX_RE = /\d{6}\./

/** 去除檔名前的日期，對應原本 VitePress 的 rewrites */
export function toRewrittenPath(filePath: string): string {
  return filePath.replace(DATE_PREFIX_RE, '')
}

/** md 相對路徑轉網址：index 對應目錄（帶尾斜線），其餘去掉副檔名 */
export function toRoutePath(relativePath: string): string {
  const cleanPath = relativePath.replace(/\.md$/, '')
  if (cleanPath === 'index')
    return '/'
  if (cleanPath.endsWith('/index'))
    return `/${cleanPath.slice(0, -'index'.length)}`
  return `/${cleanPath}`
}

/** 從 markdown 內容取第一個 # 標題，與 VitePress 一樣作為沒寫 title 時的頁面標題 */
function extractFirstHeading(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('# '))
      return trimmedLine.slice(2).trim()
  }
  return undefined
}

/** 列出 content 下所有 md（排除 node_modules 與 public） */
function getMarkdownFileList(dirPath = CONTENT_PATH): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'public')
      continue

    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      result.push(...getMarkdownFileList(fullPath))
      continue
    }
    if (entry.name.endsWith('.md'))
      result.push(path.relative(CONTENT_PATH, fullPath).replace(/\\/g, '/'))
  }
  return result.sort()
}

/** 一次跑 git log 取得每個檔案最後一次 commit 的時間，避免每個檔案各跑一次 git */
function getGitTimestampMap(): Map<string, number> {
  const timestampMap = new Map<string, number>()
  try {
    const output = execFileSync(
      'git',
      ['log', '--format=@@%ct', '--name-only', '--', 'content'],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 256, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    let currentTimestamp = 0
    for (const line of output.split('\n')) {
      if (line.startsWith('@@')) {
        currentTimestamp = Number(line.slice(2)) * 1000
        continue
      }
      const file = line.trim()
      // log 由新到舊，第一次出現就是最後修改時間
      if (file && !timestampMap.has(file))
        timestampMap.set(file, currentTimestamp)
    }
  }
  catch {
    // 非 git 環境就不提供更新時間
  }
  return timestampMap
}

/** 迷因資料最後一次 commit 的時間（ISO 字串）。
 *
 * 新增迷因只會動到 ndjson，快取梗圖各頁的 md 不會變，
 * 頁尾「更新於」與 sitemap lastmod 都需要改用資料的時間
 */
export function getMemeDataCommitDate(): string | undefined {
  try {
    const output = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', MEME_NDJSON_RELATIVE_PATH, MEME_EXTEND_NDJSON_RELATIVE_PATH],
      { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return output || undefined
  }
  catch {
    return undefined
  }
}

/** 情緒分類頁的標題與描述，原本寫在 VitePress 的 transformPageData */
function toEmotionPage(base: SitePage, params: EmotionPageParams, memeDataCommitDate?: string): SitePage {
  const { label, total, memeList } = params
  const title = `${label}梗圖｜快取梗圖`
  // 帶入最新一張的描述，讓 15 頁的描述各有不同，不只差在情緒名稱與張數
  const latestMeme = memeList[0]
  const latestText = latestMeme?.describe?.trim()
    ? `最新收錄：${getMemeName(latestMeme).replace(/[。！？]$/, '')}。`
    : ''
  const description = [
    `收錄 ${total} 張${label}梗圖。`,
    latestText,
    '只記得畫面或台詞，也能用梗圖搜尋器找到那一張。',
  ].filter(Boolean).join('')

  return {
    ...base,
    relativePath: `aquarium/meme-cache/emotion/${params.emotion}.md`,
    routePath: `/aquarium/meme-cache/emotion/${params.emotion}`,
    title,
    description,
    // 頁尾「更新於」改用迷因資料的 commit 時間，md 本身的時間與內容無關
    lastUpdated: memeDataCommitDate ? new Date(memeDataCommitDate).getTime() : base.lastUpdated,
    frontmatter: {
      ...base.frontmatter,
      ...MEME_CACHE_SOCIAL_IMAGE,
      title,
      description,
      layout: 'doc',
      aside: false,
      sidebar: false,
      prev: false,
      next: false,
    },
    params,
  }
}

/** 快取梗圖主頁與情緒分類頁共用的社群縮圖，由 site/scripts/generate-meme-cache-og.ts 產生。
 * 各平台比例不同：og:image 用 1.91:1，X 用 16:9，結構化資料依 Google 建議給 16:9、4:3、1:1
 */
export const MEME_CACHE_SOCIAL_IMAGE = {
  image: 'https://codlin.me/og/meme-cache-1200x630.jpg',
  twitterImage: 'https://codlin.me/og/meme-cache-1200x675.jpg',
  structuredImageList: [675, 900, 1200].map((height) => `https://codlin.me/og/meme-cache-1200x${height}.jpg`),
}

/** 情緒分類頁的路由參數，原本由 emotion/[emotion].paths.ts 產生 */
function getEmotionParamsList(): EmotionPageParams[] {
  const memeList = readSeoMemeList()
  return getEmotionSummaryList(memeList).map((summary) => ({
    emotion: EMOTION_SLUG_MAP[summary.emotion],
    label: summary.emotion,
    total: summary.total,
    memeList: getEmotionMemeList(memeList, summary.emotion).slice(0, EMOTION_PAGE_MEME_LIMIT),
  }))
}

/** 動態路由的 md，展開成多頁 */
export const EMOTION_PAGE_FILE = 'aquarium/meme-cache/emotion/[emotion].md'

let pageListCache: SitePage[] | undefined

/** 收集全站頁面。build 期間內容不變，結果快取 */
export function getSitePageList(options: { refresh?: boolean } = {}): SitePage[] {
  if (pageListCache && !options.refresh)
    return pageListCache

  const timestampMap = getGitTimestampMap()
  const memeDataCommitDate = getMemeDataCommitDate()
  const result: SitePage[] = []

  for (const filePath of getMarkdownFileList()) {
    const source = fs.readFileSync(path.join(CONTENT_PATH, filePath), 'utf-8')
    const { data, content } = matter(source)
    const frontmatter: Record<string, unknown> = { ...data }
    const relativePath = toRewrittenPath(filePath)
    const title = typeof frontmatter.title === 'string'
      ? frontmatter.title
      : (extractFirstHeading(content) ?? '')

    const page: SitePage = {
      relativePath,
      filePath,
      routePath: toRoutePath(relativePath),
      title,
      titleTemplate: frontmatter.titleTemplate as string | boolean | undefined,
      description: typeof frontmatter.description === 'string' ? frontmatter.description : SITE_DESCRIPTION,
      frontmatter,
      // 與 VitePress 相同：frontmatter 寫 lastUpdated: false 就不帶時間，頁尾（含贊助區塊）因此不顯示
      lastUpdated: frontmatter.lastUpdated === false ? undefined : timestampMap.get(`content/${filePath}`),
    }

    if (filePath === EMOTION_PAGE_FILE) {
      for (const params of getEmotionParamsList()) {
        result.push(toEmotionPage(page, params, memeDataCommitDate))
      }
      continue
    }

    if (filePath === 'aquarium/meme-cache/index.md') {
      Object.assign(page.frontmatter, MEME_CACHE_SOCIAL_IMAGE)
    }

    result.push(page)
  }

  pageListCache = result
  return result
}
