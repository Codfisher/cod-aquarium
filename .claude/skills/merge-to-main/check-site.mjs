// merge-to-main 收尾第二段：部署檢查（check-deploy.mjs）通過後，用真的瀏覽器到正式網域逐頁檢查。
// curl 只看得到 SSG 輸出的 HTML；這裡抓的是 hydration 之後才會出現的問題：JS 錯誤、hydration mismatch、
// 載入失敗的資源、破圖、手機版橫向溢出、站內死連結。每頁另存一張首屏截圖供人工目視。
// 用法：node .claude/skills/merge-to-main/check-site.mjs [截圖輸出目錄]
// 結束碼：0 全部通過；1 有項目失敗。
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, devices } from 'playwright'

const SITE = 'https://codlin.me'
// heading 為 h1 必須包含的文字；沒有 h1 的整頁式子專案（layout: false）改驗 document.title
const PAGES = [
  { path: '/', heading: '歡迎來到鱈魚的魚缸' },
  { path: '/article-overview', heading: '文章列表' },
  { path: '/blog-program/what-is-mutation-testing-and-stryker', heading: '來點突變吧' },
  { path: '/aquarium/meme-cache/', heading: '迷因梗圖搜尋' },
  { path: '/aquarium/codmarbles/', title: '鱈魚的彈珠' },
]
const VIEWPORTS = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 } } },
  { name: 'mobile', options: devices['Pixel 7'] },
]
const LINK_CONCURRENCY = 8
// headless Chromium 自己丟的 Permissions-Policy 警告（compute-pressure），與網站無關，會讓桌機首頁誤判失敗
const IGNORED_CONSOLE_PATTERN = /Permissions policy violation/

const outDir = process.argv[2] ?? join(tmpdir(), 'cod-site-check')
mkdirSync(outDir, { recursive: true })
let failed = false

function report(ok, label, detail) {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? `：${detail}` : ''}`)
  if (!ok) failed = true
}

const isSameOrigin = url => url.startsWith(SITE)

async function checkPage(context, viewportName, { path, heading, title }) {
  const page = await context.newPage()
  const problemList = []
  page.on('pageerror', error => problemList.push(`JS 錯誤 ${error.message}`))
  page.on('console', (message) => {
    const text = message.text()
    if (IGNORED_CONSOLE_PATTERN.test(text)) return
    if (message.type() === 'error' || /hydration/i.test(text)) problemList.push(`console.${message.type()} ${text.slice(0, 200)}`)
  })
  page.on('response', (response) => {
    if (isSameOrigin(response.url()) && response.status() >= 400) problemList.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    if (isSameOrigin(request.url())) problemList.push(`請求失敗 ${request.url()} ${request.failure()?.errorText ?? ''}`)
  })

  const response = await page.goto(`${SITE}${path}`, { waitUntil: 'load' })
  const h1 = page.locator('h1').first()
  if (heading) await h1.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  // 等非同步資料與 lazy 元件載完；第三方追蹤可能讓網路一直不閒置，逾時不算失敗
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

  const headingText = (await h1.textContent({ timeout: 1_000 }).catch(() => null))?.replace(/\s+/g, ' ').trim() ?? ''
  const documentTitle = await page.title()
  const layout = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    // complete 且寬度為 0 才是破圖；lazy 尚未載入的圖 complete 為 false，不算
    brokenImageList: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.currentSrc || img.src),
    linkList: [...document.querySelectorAll('a[href]')].map(anchor => anchor.href),
  }))
  if (heading && !headingText.includes(heading)) problemList.push(`h1 應包含「${heading}」，實際為「${headingText}」`)
  if (title && !documentTitle.includes(title)) problemList.push(`title 應包含「${title}」，實際為「${documentTitle}」`)
  if (layout.overflowX > 1) problemList.push(`橫向溢出 ${layout.overflowX}px`)
  for (const src of layout.brokenImageList) problemList.push(`破圖 ${src}`)

  const screenshot = join(outDir, `${viewportName}${path.replaceAll('/', '_') || '_'}.png`)
  await page.screenshot({ path: screenshot })
  await page.close()

  report(response?.status() === 200 && problemList.length === 0, `[${viewportName}] ${path}`, `${response?.status()}，${heading ? `h1「${headingText}」` : `title「${documentTitle}」`}`)
  for (const problem of problemList) console.log(`   ${problem}`)
  return { screenshot, linkList: layout.linkList }
}

async function checkLinks(linkList) {
  // 只驗站內連結；去掉 hash 與重複，原始碼資源與圖片檔不屬頁面連結
  const targetList = [...new Set(linkList.filter(isSameOrigin).map(href => href.split('#')[0]))]
  const brokenList = []
  let cursor = 0
  async function worker() {
    while (cursor < targetList.length) {
      const href = targetList[cursor++]
      const res = await fetch(href).catch(() => ({ status: 0 }))
      if (res.status === 0 || res.status >= 400) brokenList.push(`${res.status} ${href}`)
    }
  }
  await Promise.all(Array.from({ length: LINK_CONCURRENCY }, worker))
  report(brokenList.length === 0, '站內連結', `共 ${targetList.length} 個，失效 ${brokenList.length} 個`)
  for (const item of brokenList) console.log(`   ${item}`)
}

const browser = await chromium.launch()
try {
  const screenshotList = []
  const linkList = []
  for (const { name, options } of VIEWPORTS) {
    const context = await browser.newContext({ ...options, locale: 'zh-TW', timezoneId: 'Asia/Taipei' })
    for (const target of PAGES) {
      const result = await checkPage(context, name, target).catch((error) => {
        report(false, `[${name}] ${target.path}`, error instanceof Error ? error.message : String(error))
        return { screenshot: undefined, linkList: [] }
      })
      if (result.screenshot) screenshotList.push(result.screenshot)
      linkList.push(...result.linkList)
    }
    await context.close()
  }
  await checkLinks(linkList)
  console.log(`--- 首屏截圖（${screenshotList.length} 張）---`)
  for (const file of screenshotList) console.log(file)
}
finally {
  await browser.close()
}
process.exitCode = failed ? 1 : 0
