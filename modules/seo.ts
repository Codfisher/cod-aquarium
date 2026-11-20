import { defineNuxtModule } from '@nuxt/kit'

/** nuxt-og-image 停用時註冊的 mock 自動匯入 */
const OG_IMAGE_IMPORT_NAME_SET = new Set(['defineOgImage', 'defineOgImageComponent', 'defineOgImageScreenshot'])

/** 只在 SSR 有用、卻預設也會打包進 client 的外掛 */
const SERVER_ONLY_PLUGIN_RE_LIST = [
  // nuxt-site-config：提供 useSiteConfig，client 端沒有任何程式使用
  /nuxt-site-config[\\/].*[\\/]0\.siteConfig/,
  // nuxt-seo-utils：依最終的 og:image、canonical 同步衍生標籤，這些標籤只在 SSR 輸出
  /nuxt-seo-utils[\\/].*[\\/]derivedTags/,
]

/** 讓 Nuxt SEO 模組（設定見 nuxt.config.ts）只在 SSR 作用，不增加 client 負擔。
 *
 * 本站的 SEO 標籤只在 prerender 輸出（app/plugins/site-seo.server.ts），client 換頁不更新，
 * 各模組為 client 端準備的外掛與自動匯入都用不到
 */
export default defineNuxtModule({
  meta: { name: 'seo' },
  setup(_options, nuxt) {
    /** nuxt-og-image 停用後仍會註冊 defineOgImage 等 mock，mock 連帶載入有副作用的 logger（consola），
     * 經由 #imports 打包進 aquarium 頁的 chunk（約 6.5 KB）。本站不用這些函式，直接移除。
     * 各模組在 setup 期間才登記自動匯入，要等全部模組載入完再掛 hook，才排得到它們後面
     */
    nuxt.hook('modules:done', () => {
      nuxt.hook('imports:extend', (importList) => {
        const keptList = importList.filter((item) => !OG_IMAGE_IMPORT_NAME_SET.has(item.name))
        importList.splice(0, importList.length, ...keptList)
      })
    })

    /** dev 時各模組的開發工具（schema-org、link-checker 等）會在 client 呼叫 useSiteConfig，
     * 外掛改成只在 server 跑的話會讀不到設定而報錯，所以只在正式建置套用；dev 的 bundle 大小不重要
     */
    if (nuxt.options.dev)
      return

    nuxt.hook('app:resolve', (app) => {
      let matchedCount = 0
      for (const plugin of app.plugins) {
        if (SERVER_ONLY_PLUGIN_RE_LIST.some((re) => re.test(plugin.src))) {
          plugin.mode = 'server'
          matchedCount++
        }
      }
      // 依檔名比對外掛，模組升級改名後會悄悄失效（外掛回到 client），比對不到時提醒
      if (matchedCount < SERVER_ONLY_PLUGIN_RE_LIST.length)
        console.warn(`[seo] 只比對到 ${matchedCount}/${SERVER_ONLY_PLUGIN_RE_LIST.length} 個應改為 server-only 的外掛，請檢查 modules/seo.ts 的 SERVER_ONLY_PLUGIN_RE_LIST`)
    })
  },
})
