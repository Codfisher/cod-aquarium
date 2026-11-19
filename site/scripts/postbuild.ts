/**
 * nuxt generate 之後執行，補上原本 VitePress 外掛產生的檔案：
 * 響應式圖片、feed.rss、llms 文件與 Pagefind 搜尋索引。
 * sitemap.xml 與 robots.txt 改由 @nuxtjs/sitemap、@nuxtjs/robots 在 nuxt generate 時產生
 *
 * 用法：vite-node site/scripts/postbuild.ts [-- --only feed,llms] [--out <目錄>]
 * --only 只跑指定步驟（cleanup、redirects、images、search-index、feed、llms、pagefind）；--out 改輸出目錄（預設 dist，images 固定輸出到 dist）
 */
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

// site/articles.ts 在模組載入時就依 NODE_ENV 判斷是否排除草稿，必須在 import 其他模組前設定
process.env.NODE_ENV = 'production'

const STEP_LIST = ['cleanup', 'redirects', 'images', 'search-index', 'feed', 'llms', 'pagefind', 'verify'] as const
type Step = typeof STEP_LIST[number]

function isStep(value: string): value is Step {
  return (STEP_LIST as readonly string[]).includes(value)
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      only: { type: 'string' },
      out: { type: 'string' },
    },
  })

  const stepList: Step[] = values.only
    ? values.only.split(',').map((step) => step.trim()).filter(isStep)
    : [...STEP_LIST]
  const { DIST_PATH } = await import('../constants')
  const outDir = values.out ? path.resolve(values.out) : DIST_PATH

  const stepTaskMap: Record<Step, () => Promise<void>> = {
    /** Nitro 會在輸出目錄留下 nitro.json（preset、版本、建置時間），不該對外公開 */
    'cleanup': async () => {
      const { rmSync } = await import('node:fs')
      rmSync(path.join(outDir, 'nitro.json'), { force: true })
    },
    /** Nitro 的 cloudflare-pages-static 會寫一行 /* /404.html 404 到 _redirects。
     * Cloudflare Pages 的 _redirects 不支援 404 狀態碼，而且 dist 有 404.html 時 Pages 本來就會用它回 404，
     * 這行規則沒有作用又有被誤判的風險，直接移除
     */
    'redirects': async () => {
      const { readFileSync, rmSync, writeFileSync, existsSync } = await import('node:fs')
      const redirectsPath = path.join(outDir, '_redirects')
      if (!existsSync(redirectsPath))
        return
      const ruleList = readFileSync(redirectsPath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() && !/\s404$/.test(line.trim()))
      if (ruleList.length)
        writeFileSync(redirectsPath, `${ruleList.join('\n')}\n`)
      else
        rmSync(redirectsPath)
    },
    'images': async () => {
      const { generateImages } = await import('./resize-images')
      await generateImages()
    },
    /** 快取梗圖的預建搜尋索引。Vite 外掛在 generateBundle 發出的 asset 只會留在 Nuxt 的 client 輸出目錄，
     * Nitro 只複製其中的 _nuxt/，所以改在這裡寫入；沒有它 app 會退回執行期建索引，第一次搜尋慢數百毫秒
     */
    'search-index': async () => {
      const { buildMemeSearchIndexJson, OUTPUT_FILE_NAME } = await import('../plugins/vite-meme-search-index')
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const outputPath = path.join(outDir, OUTPUT_FILE_NAME)
      mkdirSync(path.dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, buildMemeSearchIndexJson())
    },
    'feed': async () => {
      const { writeFeed } = await import('./postbuild/feed')
      await writeFeed(outDir)
    },
    'llms': async () => {
      const { writeLlmsFiles } = await import('./postbuild/llms')
      await writeLlmsFiles(outDir)
    },
    // 索引要讀最終的 HTML，放最後
    'pagefind': async () => {
      const { writePagefindIndex } = await import('./postbuild/pagefind')
      await writePagefindIndex(outDir)
    },
    /** sitemap 的每個網址都要是某頁的 canonical。
     * aquarium 目錄頁的尾斜線靠 server/plugins/sitemap-trailing-slash.ts 補回，
     * 它依賴 sitemap 的輸出格式，失效時兩者會不一致又不報錯，這裡把關
     */
    'verify': async () => {
      const { readFileSync, readdirSync } = await import('node:fs')
      const sitemap = readFileSync(path.join(outDir, 'sitemap.xml'), 'utf-8')
      const sitemapUrlList = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>/g)].map((match) => match[1]!)

      const canonicalSet = new Set<string>()
      for (const file of readdirSync(outDir, { recursive: true, encoding: 'utf-8' })) {
        if (!file.endsWith('.html'))
          continue
        const html = readFileSync(path.join(outDir, file), 'utf-8')
        const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1]
          ?? html.match(/<link[^>]*href="([^"]+)"[^>]*rel="canonical"/)?.[1]
        if (canonical)
          canonicalSet.add(canonical)
      }

      const mismatchList = sitemapUrlList.filter((url) => !canonicalSet.has(url))
      if (mismatchList.length)
        throw new Error(`sitemap 有 ${mismatchList.length} 個網址不是任何頁面的 canonical：\n${mismatchList.join('\n')}`)
      console.log(`[ verify ] sitemap ${sitemapUrlList.length} 個網址皆與 canonical 一致`)
    },
  }

  for (const step of stepList) {
    const startTime = performance.now()
    await stepTaskMap[step]()
    console.log(`[ postbuild ] ${step} 完成（${Math.round(performance.now() - startTime)} ms）`)
  }
}

main()
  // sharp、shiki 等會留下未釋放的資源，完成後主動結束，避免 build 卡住
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[ postbuild ] 失敗：', error)
    process.exit(1)
  })
