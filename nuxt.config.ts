import { fileURLToPath } from 'node:url'
import Icons from 'unplugin-icons/vite'
import { HOSTNAME, SITE_DESCRIPTION, SITE_LANG, SITE_TITLE } from './site/constants'
import { getDarkImageList } from './site/dark-image'
import { viteBuildWorkaround } from './site/plugins/vite-build-workaround'
import { viteMemeSearchIndex } from './site/plugins/vite-meme-search-index'
import { viteMinespaceIssueLog } from './site/plugins/vite-minespace-issue-log'
import { viteSeoMemeList } from './site/plugins/vite-seo-meme-list'
import { getSitemapUrlList } from './site/sitemap'

const themePath = (relativePath: string) => fileURLToPath(new URL(`./app/theme/${relativePath}`, import.meta.url))
/** 專案根目錄下的 glob；Vite 的 root 是 app/，路徑要用絕對位置，並統一成斜線 */
const projectGlob = (pattern: string) => fileURLToPath(new URL(`./${pattern}`, import.meta.url)).split('\\').join('/')

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  modules: [
    '@nuxt/ui',
    '@nuxt/image',
    /** Nuxt SEO 全家桶，逐一安裝而非 @nuxtjs/seo：後者另帶 nuxt-ai-ready（會產生 llms.txt，與 postbuild 的 llms 步驟重複）
     * 與 nuxt-skew-protection（多一支 client 外掛），本站都用不到。
     * 每頁的 SEO 資料見 site/seo.ts，由 app/plugins/site-seo.server.ts 交給各模組，說明見 docs/development-notes.md「SEO 模組」
     */
    'nuxt-site-config',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    'nuxt-seo-utils',
    'nuxt-og-image',
    'nuxt-link-checker',
  ],

  /** Nuxt SEO 各模組共用的站台設定 */
  site: {
    url: HOSTNAME,
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    defaultLocale: SITE_LANG,
    /** 全站預設不帶尾斜線；aquarium 目錄頁例外，canonical 由 site/seo.ts 逐頁給，sitemap 由 server/plugins/sitemap-trailing-slash.ts 補回 */
    trailingSlash: false,
    /** 明確宣告可收錄：未指定時依環境推斷，Cloudflare Pages 的預覽部署等情境可能被判成不可收錄，robots.txt 會變成 Disallow: / */
    indexable: true,
  },

  /** robots.txt 內容同原本的 content/public/robots.txt（User-agent: * / Allow: / / Sitemap，Sitemap 由 @nuxtjs/sitemap 自動加入） */
  robots: {
    groups: [{ userAgent: ['*'], allow: ['/'] }],
    /** 不加「# START nuxt-robots」等註解 */
    credits: false,
    /** 每頁輸出 robots meta（預設值 index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1）。
     * max-image-preview:large 是 Google Discover 顯示大圖的條件之一；草稿與 404 由 route rules 改成 noindex, nofollow
     */
    metaTag: true,
    /** 不透過 route rules 加 X-Robots-Tag，否則 cloudflare-pages-static 會把它寫進 _headers */
    header: false,
    /** 只需要 robots.txt，不做爬蟲偵測 */
    botDetection: false,
  },

  sitemap: {
    /** 只在 prerender 產生 sitemap.xml，產生器不進 server bundle */
    zeroRuntime: true,
    /** 網址清單完全由 site/sitemap.ts 決定（排除草稿、lastmod、封面與迷因圖），不自動收集路由與 prerender 結果 */
    excludeAppSources: true,
    urls: () => getSitemapUrlList(),
    /** 不從 HTML 自動抓圖片、影片，否則每篇文章內文的圖都會列進去 */
    discoverImages: false,
    discoverVideos: false,
    /** 維持 site/sitemap.ts 的順序（同 VitePress 時期） */
    sortEntries: false,
    xsl: false,
    credits: false,
    minify: true,
  },

  schemaOrg: {
    /** 不自動加 WebSite、WebPage 節點，全部由 site/seo.ts 決定 */
    defaults: false,
    /** JSON-LD 維持放在 head 最後（模組預設放 body 最後、且以 high 優先權排在 og 之前）。
     * 迷因頁的 JSON-LD 有數十 KB，排在前面會把 og、canonical 推遠，部分社群爬蟲只讀 HTML 開頭一段
     */
    scriptAttributes: { tagPosition: 'head', tagPriority: 'low' },
  },

  /** nuxt-seo-utils：自動行為多為 universal 外掛，會在 client 重算 canonical、og 等並覆寫 SSR 輸出，全部關閉，
   * 改由 site/seo.ts 逐頁給值、只在 SSR 輸出。保留 server 端的 og:image 絕對網址修正
   */
  seo: {
    /** 關閉 titleTemplate（%s %separator %siteName）、自動 canonical（全站統一轉小寫與尾斜線）、og:type、og:locale 等預設值 */
    automaticDefaults: false,
    fallbackTitle: false,
    automaticOgAndTwitterTags: false,
    mergeWithSiteConfig: false,
    extendRouteRules: false,
    /** 依 public 的 favicon.ico 補上 type 與 sizes（16x16 32x32 48x48），瀏覽器不必下載就知道有哪些尺寸。
     * 只影響 SSR 輸出的 HTML，client entry 實測位元組數不變
     */
    metaDataFiles: true,
    /** 不在 app.head 加 og:type=website：app.head 會跟著 client 渲染，hydration 時會把文章頁 SSR 的 og:type=article 蓋掉 */
    setupNuxtConfigAppHeadWithMoreDefaults: false,
    /** 不改寫 app.head 的 inline script 與 prerender HTML，輸出維持原樣 */
    minify: false,
  },

  /** 社群縮圖都已預先產好（frontmatter 的 image、twitterImage、structuredImageList），不在執行期產圖 */
  ogImage: {
    enabled: false,
  },

  /** nuxt generate 時檢查各頁連結，只產報告、不中斷建置。報告寫在 dist 以外，避免跟著部署 */
  linkChecker: {
    failOnError: false,
    /** aquarium 目錄頁本來就帶尾斜線（見 site.trailingSlash），這項只會產生數百則誤報；真的多了尾斜線的連結會以 404 抓到 */
    skipInspections: ['trailing-slash'],
    report: {
      markdown: true,
      storage: 'node_modules/.cache/link-checker',
    },
  },

  dir: {
    public: 'content/public',
  },

  ui: {
    /** 由 @nuxt/fonts 自架 Figtree（設定見下方 fonts），取代 head 的 Google Fonts */
    fonts: true,
    /** 外觀由主題的 useDark 管理 .dark class（儲存鍵沿用 VitePress），不再開第二套 */
    colorMode: false,
    experimental: {
      componentDetection: true,
    },
  },

  /** 圖示改用 svg 模式：預設的 css 模式會在瀏覽器端為每個圖示即時產生 CSS 選擇器並插入樣式，
   * 文章頁 CPU profile（4 倍降速）光 @nuxt/icon 的 css-selectors 就佔 43ms；svg 模式由 SSR 直接輸出內嵌 <svg>
   */
  icon: {
    mode: 'svg',
    /** 只在 client 才渲染的圖示（client-only 的 app、延遲載入的元件）SSR 沒有輸出 svg，預設會向 api.iconify.design 即時請求，
     * 多一次跨網域連線與往返。掃描全站共用的 app／web 與 meme-cache 的原始碼，把用到的圖示打包進 client（約 9 KB gzip）。
     * 範圍刻意不含其他 aquarium app：圖示會進入口 chunk，每頁都要付，其他 app 的圖示維持按需請求
     */
    clientBundle: {
      scan: {
        globInclude: [
          'app/**/*.{vue,ts}',
          'web/**/*.{vue,ts}',
          'content/aquarium/meme-cache/**/*.{vue,ts}',
        ],
        globExclude: ['node_modules', 'dist', 'build', 'coverage', '**/*.test.ts', '.*'],
      },
    },
  },

  /** 圖片由 Nuxt Image 產生響應式尺寸與 webp（取代原本 postbuild 的 sharp 縮圖與手寫 srcset）。
   * nuxt generate 時 ipx 只產生 SSR 實際用到的尺寸（$img 透過 x-nitro-prerender 通知 Nitro），輸出在 /_ipx/。
   * 只產 1 倍密度：文章欄寬 688px，手機高解析螢幕也只取到 688 寬，避免下載 2～3 倍大的圖拖慢 LCP（與原本 300／700 兩種寬度的取捨相同）
   */
  image: {
    /** 要給絕對路徑：相對路徑會以 srcDir（app/）解析成不存在的 app/content/public 而被略過，ipx 全部回 IPX_FILE_NOT_FOUND */
    dir: fileURLToPath(new URL('./content/public', import.meta.url)),
    /** 提供 nuxtApp.$img：theme-image 在 web/ 底下（不在 app/），不經 Nuxt 的自動匯入，無法直接用 useImage */
    inject: true,
    format: ['webp'],
    quality: 80,
    /** densities 不在這裡設：模組以 defu 合併設定，陣列會與預設的 [1, 2] 串接而無法覆蓋，改由 theme-image 傳 densities="x1" */
    screens: { xs: 320, sm: 640, md: 768, lg: 1024, xl: 1280 },
  },

  /** 只自架 Figtree：省掉 fonts.googleapis.com、fonts.gstatic.com 兩次跨網域連線，並產生 fallback 字型尺寸修正，減少換字時的跳動。
   * 其他字型由各 aquarium app 自己的載入器或系統字型提供，標成 none 避免被自動解析而重複下載
   */
  fonts: {
    families: [
      { name: 'Figtree', provider: 'google', weights: [700, 800], subsets: ['latin'], preload: { weights: [800], styles: ['normal'] } },
      ...[
        'Orbitron',
        'Rajdhani',
        'Titan One',
        'Minecraft',
        'Noto Sans TC',
        'JetBrains Mono',
        'Fira Code',
        'Cascadia Code',
        'SF Mono',
        'Material Symbols Sharp',
        'Bricolage Grotesque',
      ].map((name) => ({ name, provider: 'none' as const })),
    ],
  },

  /** 主題樣式依原 VitePress 預設主題的順序載入，再疊上站台自訂樣式與 Tailwind */
  css: [
    themePath('styles/vars.css'),
    themePath('styles/base.css'),
    themePath('styles/icons.css'),
    themePath('styles/utils.css'),
    themePath('styles/components/custom-block.css'),
    themePath('styles/components/vp-code.css'),
    themePath('styles/components/vp-code-group.css'),
    themePath('styles/components/vp-doc.css'),
    themePath('styles/vp-icons.css'),
    '~/assets/css/tailwind.css',
  ],

  alias: {
    '#vp': themePath('vitepress.ts'),
    '#vp/types': themePath('types/default-theme.d.ts'),
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hant', dir: 'ltr' },
      viewport: 'width=device-width,initial-scale=1',
      link: [
        /** Figtree 由 @nuxt/fonts 自架（見上方 fonts），僅標題（800）與導覽列標題（700）使用。
         * 內文中文用系統字型（見 style.css 的 --vp-font-family-base），不載入 Noto Sans TC：
         * 它一頁要拆 29～50 個 unicode-range 切片（1.2～1.7 MB），每片到達都觸發整頁中文重排
         */
        { rel: 'icon', href: '/favicon.ico' },
        /** 讓瀏覽器與 RSS 閱讀器自動發現訂閱來源 */
        { rel: 'alternate', type: 'application/rss+xml', title: '鱈魚的魚缸', href: '/feed.rss' },
        /** rel=me 供 IndieWeb 與部分平台驗證作者身分 */
        { rel: 'me', href: 'https://github.com/Codfisher' },
        { rel: 'me', href: 'https://www.threads.com/@codfish2140' },
        { rel: 'me', href: 'https://www.linkedin.com/in/shih-chen-lin-codfish/' },
      ],
      meta: [
        /** 行動裝置瀏覽器 UI 底色，淺色用品牌 teal、深色對齊深色底 */
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#0d9a88' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#1b1b1f' },
        { name: 'google-adsense-account', content: 'ca-pub-6608581811170481' },
      ],
      script: [
        /** 首次繪製前就套上暗色 class，避免閃白。儲存鍵沿用 VitePress，舊訪客的偏好不會遺失 */
        {
          id: 'check-dark-mode',
          innerHTML: '(()=>{const e=localStorage.getItem("vitepress-theme-appearance")||"auto",a=window.matchMedia("(prefers-color-scheme: dark)").matches;(!e||e==="auto"?a:e==="dark")&&document.documentElement.classList.add("dark")})();',
        },
        {
          id: 'check-mac-os',
          innerHTML: 'document.documentElement.classList.toggle("mac",/Mac|iPhone|iPod|iPad/i.test(navigator.platform));',
        },
        /** gtag 先建立佇列 stub，事件照常累積；實際 gtag.js 延後至 load 事件才注入 */
        {
          innerHTML: 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date),gtag("config","G-WL47JJHL0R");',
        },
        /** 第三方腳本延後注入，避免 gtag、Clarity、AdSense 在首屏期間佔住主執行緒（實測 TBT 各約 60 至 130 ms）。
         * 觸發條件為「首次互動」與「load 後 3.5 秒的閒置」兩者先到者，只載入一次；互動若早於 load，等 load 後再載。
         * AdSense 另有 window.__loadAdsense 供廣告欄位元件在接近視窗時呼叫（見 web/components/google-adsense.vue）；
         * 觸發後 gtag 立刻載入，Clarity 待 gtag 載完再等 1.5 秒（rIC），AdSense 再等 1.5 秒（rIC），避免三支擠成同一個長任務；
         * 閒置觸發時頁面若已有廣告欄位，就交給欄位元件或互動，不由閒置載入
         */
        {
          innerHTML: `(function(){var d=document,w=window,done={},evList=["pointerdown","keydown","scroll","touchstart"];function once(k,fn){if(!done[k]){done[k]=1;fn()}}function add(src,cors,cb){var e=d.createElement("script");e.async=!0;if(cors)e.crossOrigin="anonymous";if(cb){e.onload=cb;e.onerror=cb}e.src=src;d.head.appendChild(e)}function later(fn){setTimeout(function(){"requestIdleCallback"in w?w.requestIdleCallback(fn,{timeout:2e3}):fn()},1500)}function clarity(){once("c",function(){(function(t,s,n,u,a,o){t[n]=t[n]||function(){(t[n].q=t[n].q||[]).push(arguments)},a=s.createElement("script"),a.async=1,a.src="https://www.clarity.ms/tag/"+u,o=s.getElementsByTagName("script")[0],o.parentNode.insertBefore(a,o)})(w,d,"clarity","sbra2ic0u4")})}function ads(){once("a",function(){add("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6608581811170481",1)})}w.__loadAdsense=ads;function start(skipAds){once("s",function(){add("https://www.googletagmanager.com/gtag/js?id=G-WL47JJHL0R",0,function(){later(function(){clarity();later(function(){skipAds&&d.querySelector("ins.adsbygoogle")||ads()})})})})}function stop(){evList.forEach(function(n){w.removeEventListener(n,onInteract)})}function onInteract(){stop();ready(function(){start(0)})}function ready(fn){d.readyState==="complete"?fn():w.addEventListener("load",fn,{once:!0})}evList.forEach(function(n){w.addEventListener(n,onInteract,{passive:!0,once:!0})});ready(function(){setTimeout(function(){stop();function go(){start(1)}"requestIdleCallback"in w?w.requestIdleCallback(go,{timeout:4e3}):go()},3500)})})();`,
        },
      ],
    },
  },

  vite: {
    vue: {
      include: [/\.vue$/, /\.md$/],
    },
    define: {
      __DARK_IMAGE_LIST__: JSON.stringify(getDarkImageList()),
    },
    optimizeDeps: {
      exclude: ['@babylonjs/havok'],
      /** Nuxt 只從 app 入口開始掃描依賴，md 頁面匯入的元件（web/、content/）掃不到，
       * dev 開到那些頁時才發現新依賴，觸發重新優化並整頁重載。啟動時就把這些元件一起掃
       */
      entries: [
        projectGlob('web/**/*.vue'),
        projectGlob('content/**/*.vue'),
      ],
      /** 掃描抓不到的（例如套件的子依賴、CommonJS）在此明確列出 */
      include: [
        '@babylonjs/core/Maths/math.vector',
        /** app/plugins/babylon-dev-warnings.client.ts 只在 dev 動態載入，掃描不到 */
        '@babylonjs/core/Misc/devTools',
        '@fingerprintjs/fingerprintjs',
        '@floating-ui/vue',
        '@stackblitz/sdk',
        /** CommonJS，需轉成 ESM */
        'dayjs',
        'hono/client',
        'lodash-es',
        'mermaid',
        /** mermaid 依賴 UMD 格式的 fastdom 並以 default import 引用，不預先建置會報 does not provide an export named 'default' */
        'mermaid > fastdom',
        'mermaid > fastdom/extensions/fastdom-promised.js',
        'pinia',
        'remeda',
        /** CommonJS */
        'zdog',
      ],
    },
    /**
     * Vite 的 worker 預設用 iife 打包，不支援 code-splitting；
     * meme-cache 動圖編碼 worker 內有動態 import，明確指定 es 格式才不會看情況時好時壞
     */
    worker: {
      format: 'es',
      /** worker 另外打包，不套用上面的 plugins */
      plugins: () => viteBuildWorkaround(),
    },
    css: {
      preprocessorOptions: {
        sass: {
          api: 'modern-compiler',
        },
      },
    },
    plugins: [
      ...viteBuildWorkaround(),
      viteSeoMemeList(),
      viteMemeSearchIndex(),
      viteMinespaceIssueLog(),
      Icons({
        autoInstall: false,
        compiler: 'vue3',
      }),
    ],
  },

  nitro: {
    /** 正式環境只輸出靜態檔，API 由根目錄 functions/ 的 Pages Functions 交給 Hono，
     * Worker 不含 Vue SSR 與頁面程式（含 Babylon），才不會超過 Worker 大小上限
     */
    preset: 'cloudflare-pages-static',
    output: {
      dir: 'dist',
      publicDir: 'dist',
    },
    /** 404 頁交給 @nuxtjs/robots 標 noindex。草稿的 noindex 由 modules/site.ts 逐頁加入；
     * 寫在 nitro 而非頂層 routeRules，才不會進 client 的 app manifest
     */
    routeRules: {
      '/404.html': { robots: false },
    },
    prerender: {
      crawlLinks: false,
      /** 輸出 /foo.html 而非 /foo/index.html，否則 Cloudflare Pages 會把 /foo 轉址到 /foo/，與既有網址不符 */
      autoSubfolderIndex: false,
      /** 任何一頁渲染失敗就中斷建置，避免缺頁上線變 404 */
      failOnError: true,
    },
  },

  /** 靜態 preset 沒有 dev 版本，dev 改用 cloudflare-dev 才能以 getPlatformProxy 取得 D1 */
  $development: {
    nitro: {
      preset: 'cloudflare-dev',
      /** Nitro 啟動時會清空輸出目錄，dev 不能沿用 dist，否則一開 dev server 就把建置結果刪光 */
      output: {
        dir: '.output',
        publicDir: '.output/public',
      },
    },
  },

  experimental: {
    /** 404.html 要在建置時以 404 狀態 SSR，否則只會輸出 noSSR 的空殼 */
    prerenderErrorPages: true,
  },

  typescript: {
    strict: true,
    tsConfig: {
      include: ['../web/**/*', '../content/**/*', '../site/**/*', '../modules/**/*'],
      exclude: ['../content/public'],
      compilerOptions: {
        types: ['node', 'unplugin-icons/types/vue', '@types/wicg-file-system-access', '@vitest/browser/matchers'],
      },
    },
  },
})
