import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Beasties from 'beasties'

/** 執行時才加上的 class、或 Beasties 依 SSR 的 HTML 比對不到的規則，一律保留：
 * - `.dark`：暗色模式由 head 的 script 在瀏覽器端加上，SSR 的 <html> 沒有，漏掉的話暗色使用者會先看到亮色樣式
 * - `is-hydrated`、`is-content-revealed`：分別在站內換頁、跳到錨點時才加上（見 app/plugins/vitepress-client.client.ts）
 * - `.VP`、`DocSearch`、`vpi-`、`.vp-doc`：主題外框與文章內文。實測只靠選擇器比對會漏掉搜尋框、圖示、行內程式碼等規則，
 *   整組保留後，只用內嵌 CSS 渲染的畫面與完整 CSS 一致
 */
const ALLOW_RULE_LIST = [/\.dark/, /is-hydrated/, /is-content-revealed/, /\.VP/, /DocSearch/, /vpi-/, /\.vp-doc/]

/** aquarium 各 app 頁（layout: false）的 <html> 帶 vp-raw（見 app/app.vue）。
 * 它們的畫面由 JS 在瀏覽器端繪製，SSR 的 HTML 幾乎是空的，算不出有意義的關鍵 CSS，跳過
 */
const STANDALONE_HTML_RE = /<html[^>]*class="[^"]*\bvp-raw\b/

function getHtmlPathList(dirPath: string): string[] {
  return readdirSync(dirPath, { recursive: true, encoding: 'utf-8' })
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.join(dirPath, file))
}

/** 把首屏用到的 CSS 內嵌進每個預先渲染的 HTML，完整 CSS 改成非同步載入（media="print" 載完再切回 all）。
 *
 * 全站共用的 entry.css（壓縮後約 50 KB）是擋渲染的資源，慢速網路下要等它下載完才能首次繪製。
 * 本機 preview 對正式站 A/B（手機、慢速 4G、CPU 4 倍降速）：FCP、LCP 約提前 0.4～0.7 秒，HTML 增加約 15 KB（gzip）
 */
export async function inlineCriticalCss(outDir: string) {
  const beasties = new Beasties({
    path: outDir,
    publicPath: '/',
    preload: 'media',
    // 完整 CSS 仍要載入，供換頁後的其他頁面與互動狀態使用
    pruneSource: false,
    inlineFonts: false,
    // Nuxt 已內嵌的元件樣式保留原樣
    reduceInlineStyles: false,
    allowRules: ALLOW_RULE_LIST,
    logLevel: 'warn',
  })

  let processedCount = 0
  let skippedCount = 0
  for (const htmlPath of getHtmlPathList(outDir)) {
    const html = readFileSync(htmlPath, 'utf-8')
    if (STANDALONE_HTML_RE.test(html)) {
      skippedCount++
      continue
    }
    writeFileSync(htmlPath, await beasties.process(html))
    processedCount++
  }

  console.log(`[ critical-css ] 處理 ${processedCount} 頁，略過 aquarium app 頁 ${skippedCount} 頁`)
}
