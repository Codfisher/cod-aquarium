/**
 * 以正式站 sitemap 為基準，逐頁比對本機建置（dist/）與正式站。
 *
 * 用法：
 *   node scripts/compare/run.mjs                    全部頁面 + 全站檔案 + 瀏覽器檢查
 *   node scripts/compare/run.mjs --skip-browser     只比 HTML 與全站檔案
 *   node scripts/compare/run.mjs --only /blog-vue/vue-shallow-ref-and-ref --only /aquarium/hexazen/
 *   node scripts/compare/run.mjs --local https://codlin.me --skip-browser   用正式站自己比自己，驗證工具本身
 *
 * 其他參數：--remote <來源>（預設 https://codlin.me）、--dist <目錄>（預設 dist）、--port <埠號>、
 *   --limit <頁數>、--concurrency <正式站併發，上限 4>、--browser-concurrency <預設 2，上限 4>、
 *   --skip-site（不比全站檔案）、--skip-md（不比每頁 .md 副本）、--output <目錄>
 *
 * 輸出：scripts/compare/output/report.json、report.md、screenshots/
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import PQueue from 'p-queue'
import { chromium } from 'playwright'
import { runBrowserCheck, toBrowserFindingList } from './lib/browser.mjs'
import { normalizeUrl } from './lib/diff.mjs'
import { createHtmlParser } from './lib/extract.mjs'
import { createFetcher } from './lib/http.mjs'
import { compareMarkdownCopy, comparePage } from './lib/page-checks.mjs'
import { toMarkdownReport } from './lib/report.mjs'
import { startServer } from './lib/server.mjs'
import {
  compareFeed,
  compareLlmsFull,
  compareNotFound,
  compareRedirect,
  compareSitemap,
  compareTextFile,
  parseSitemap,
} from './lib/site-checks.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..')
const MAX_REMOTE_CONCURRENCY = 4

const { values: options } = parseArgs({
  options: {
    'only': { type: 'string', multiple: true },
    'skip-browser': { type: 'boolean', default: false },
    'skip-site': { type: 'boolean', default: false },
    'skip-md': { type: 'boolean', default: false },
    'remote': { type: 'string', default: 'https://codlin.me' },
    'local': { type: 'string' },
    'dist': { type: 'string', default: path.join(PROJECT_ROOT, 'dist') },
    'port': { type: 'string', default: '0' },
    'limit': { type: 'string' },
    'concurrency': { type: 'string', default: '4' },
    'browser-concurrency': { type: 'string', default: '2' },
    'output': { type: 'string', default: path.join(SCRIPT_DIR, 'output') },
  },
})

function clampConcurrency(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Math.min(MAX_REMOTE_CONCURRENCY, Math.max(1, Number.isFinite(parsed) ? parsed : fallback))
}

function toPath(value) {
  const trimmedValue = value.trim()
  if (/^https?:\/\//.test(trimmedValue))
    return new URL(trimmedValue).pathname
  return trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`
}

/** sitemap 網址對應的 .md 副本路徑，首頁沒有副本 */
function toMarkdownCopyPath(urlPath) {
  if (urlPath === '/')
    return undefined
  return `${urlPath.replace(/\/$/, '')}.md`
}

function isHtmlResponse(result) {
  return result.status === 200 && /text\/html/.test(result.headers['content-type'] ?? '')
}

async function main() {
  const remoteOrigin = options.remote.replace(/\/$/, '')
  const outputDir = path.resolve(options.output)
  fs.mkdirSync(outputDir, { recursive: true })

  let localOrigin = options.local?.replace(/\/$/, '')
  let localSource = localOrigin ?? ''
  let closeServer
  if (!localOrigin) {
    const distPath = path.resolve(options.dist)
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error(`找不到 ${distPath}/index.html，請先建置（pnpm build），或用 --local 指定來源`)
      process.exit(1)
    }
    const server = await startServer({ distPath, port: Number(options.port) })
    localOrigin = server.origin
    localSource = distPath
    closeServer = server.close
  }

  const remoteFetcher = createFetcher({ concurrency: clampConcurrency(options.concurrency, MAX_REMOTE_CONCURRENCY) })
  // 本機來源若指向正式站（自我驗證），同樣套用併發上限
  const isLocalRemoteSite = !localOrigin.startsWith('http://127.0.0.1') && !localOrigin.startsWith('http://localhost')
  const localFetcher = isLocalRemoteSite ? remoteFetcher : createFetcher({ concurrency: 8 })
  const fetchPair = (urlPath) => Promise.all([
    remoteFetcher.fetchWithChain(`${remoteOrigin}${urlPath}`),
    localFetcher.fetchWithChain(`${localOrigin}${urlPath}`),
  ])

  console.log(`正式站：${remoteOrigin}`)
  console.log(`本機：${localOrigin}（${localSource}）`)

  const [remoteSitemap, localSitemap] = await fetchPair('/sitemap.xml')
  if (remoteSitemap.status !== 200) {
    console.error(`無法取得正式站 sitemap.xml（${remoteSitemap.status}）`)
    process.exit(1)
  }

  let pathList = parseSitemap(remoteSitemap.body).map((item) => new URL(item.loc).pathname)
  if (options.only?.length) {
    const onlyPathList = options.only.flatMap((value) => value.split(',')).filter(Boolean).map(toPath)
    pathList = onlyPathList
  }
  if (options.limit)
    pathList = pathList.slice(0, Number(options.limit))

  // 全站檔案與行為
  const siteFindingList = []
  const isSiteCheckEnabled = !options['skip-site'] && !options.only?.length
  if (isSiteCheckEnabled) {
    console.log('比對全站檔案…')
    siteFindingList.push(...compareSitemap(remoteSitemap, localSitemap))

    const [remoteFeed, localFeed] = await fetchPair('/feed.rss')
    siteFindingList.push(...compareFeed(remoteFeed, localFeed))
    const [remoteLlms, localLlms] = await fetchPair('/llms.txt')
    siteFindingList.push(...compareTextFile('/llms.txt', remoteLlms, localLlms))
    const [remoteLlmsFull, localLlmsFull] = await fetchPair('/llms-full.txt')
    siteFindingList.push(...compareLlmsFull(remoteLlmsFull, localLlmsFull))
    const [remoteRobots, localRobots] = await fetchPair('/robots.txt')
    siteFindingList.push(...compareTextFile('/robots.txt', remoteRobots, localRobots, { severity: 'major' }))

    const notFoundPath = `/__site-compare-not-found-${Date.now().toString(36)}`
    const [remoteNotFound, localNotFound] = await fetchPair(notFoundPath)
    siteFindingList.push(...compareNotFound(remoteNotFound, localNotFound))

    // 轉址：.html → 乾淨網址、目錄缺斜線
    const siteOriginList = [remoteOrigin, localOrigin, 'https://codlin.me']
    const normalize = (url) => normalizeUrl(url, url, siteOriginList)
    const articlePath = pathList.find((item) => /^\/(?:blog|column)-/.test(item))
    const directoryPath = pathList.find((item) => item.startsWith('/aquarium/') && item.endsWith('/'))
    const redirectCaseList = [
      articlePath && `${articlePath}.html`,
      directoryPath && directoryPath.replace(/\/$/, ''),
      directoryPath && `${directoryPath}index.html`,
    ].filter(Boolean)
    for (const redirectPath of redirectCaseList) {
      const [remoteRedirect, localRedirect] = await Promise.all([
        remoteFetcher.fetchWithChain(`${remoteOrigin}${redirectPath}`, { headOnly: true }),
        localFetcher.fetchWithChain(`${localOrigin}${redirectPath}`, { headOnly: true }),
      ])
      siteFindingList.push(...compareRedirect(redirectPath, remoteRedirect, localRedirect, normalize))
    }
  }

  // 逐頁比對 HTML
  console.log(`比對 ${pathList.length} 頁 HTML…`)
  const browser = await chromium.launch()
  const parser = await createHtmlParser(browser)
  const pageQueue = new PQueue({ concurrency: 8 })
  const pageResultList = []
  let doneCount = 0

  await Promise.all(pathList.map((urlPath) => pageQueue.add(async () => {
    const [remoteFetch, localFetch] = await fetchPair(urlPath)
    const [remoteData, localData] = await Promise.all([
      isHtmlResponse(remoteFetch) ? parser.parse(remoteFetch.body) : undefined,
      isHtmlResponse(localFetch) ? parser.parse(localFetch.body) : undefined,
    ])
    const findingList = comparePage({ path: urlPath, remoteFetch, localFetch, remoteData, localData, remoteOrigin, localOrigin })

    const markdownCopyPath = toMarkdownCopyPath(urlPath)
    if (!options['skip-md'] && markdownCopyPath) {
      const [remoteMarkdown, localMarkdown] = await fetchPair(markdownCopyPath)
      findingList.push(...compareMarkdownCopy({ remoteFetch: remoteMarkdown, localFetch: localMarkdown }))
    }

    pageResultList.push({
      path: urlPath,
      remoteStatus: remoteFetch.status,
      localStatus: localFetch.status,
      findingList,
      remoteData,
      localData,
    })
    doneCount++
    if (doneCount % 10 === 0 || doneCount === pathList.length)
      console.log(`  HTML ${doneCount}/${pathList.length}`)
  })))
  await parser.close()

  // 瀏覽器實際載入
  if (!options['skip-browser']) {
    console.log('瀏覽器載入與截圖…')
    const browserResultMap = await runBrowserCheck({
      browser,
      pathList,
      remoteOrigin,
      localOrigin,
      outputDir,
      concurrency: clampConcurrency(options['browser-concurrency'], 2),
      onProgress: (done, total, urlPath) => console.log(`  瀏覽器 ${done}/${total} ${urlPath}`),
    })
    for (const pageResult of pageResultList) {
      const browserResult = browserResultMap.get(pageResult.path)
      if (!browserResult)
        continue
      pageResult.browser = browserResult
      pageResult.findingList.push(...toBrowserFindingList(browserResult))
    }
  }
  await browser.close()
  await closeServer?.()

  pageResultList.sort((a, b) => pathList.indexOf(a.path) - pathList.indexOf(b.path))
  const meta = {
    generatedAt: new Date().toISOString(),
    remoteOrigin,
    localOrigin,
    localSource,
    isBrowserSkipped: options['skip-browser'],
  }
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify({ meta, siteFindingList, pageResultList }, null, 2))
  fs.writeFileSync(path.join(outputDir, 'report.md'), toMarkdownReport({ meta, siteFindingList, pageResultList }))

  const allFindingList = [...siteFindingList, ...pageResultList.flatMap((result) => result.findingList)]
  const summary = ['critical', 'major', 'minor'].map((severity) =>
    `${severity} ${allFindingList.filter((finding) => finding.severity === severity).length}`,
  ).join('、')
  console.log(`完成：${summary}`)
  console.log(`報告：${path.join(outputDir, 'report.md')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
