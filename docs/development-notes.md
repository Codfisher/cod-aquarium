# 開發疑難排解

記錄踩過的坑與處理方式，避免重蹈覆轍。

## 不要在 dev server 執行中跑 build

`npm run build` 與 dev server 共用 `.vitepress/cache`。build 會打斷 Vite 的依賴預先建置，在 cache 留下 `deps_temp_*` 殘骸，dev server 因此遲遲不開埠，瀏覽器看起來像「頁面一直卡在讀取中」。

此專案 build 本身也不快：`buildEnd` 會執行 `generateImages()`，把 `content/public` 底下的圖片各轉出 700／300 寬與原尺寸三份 webp。見下一節「build 逾時」。

**處理方式**

1. 用 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 找出 `vitepress build` 行程，`Stop-Process -Force` 終止。dev server 通常數秒內即恢復監聽。
2. 清掉 `.vitepress/cache/deps_temp_*` 殘骸，再重啟 dev server。

## Cloudflare Pages build 逾時

Cloudflare Pages 的 build 上限是 20 分鐘。一次匯入 227 筆迷因後，build 跑了 35 分鐘被強制終止。

**原因**：`generateImages()` 只排除了 `public/memes/`，沒排除迷因匯入流程產生的 `public/meme-posters/`、`public/meme-sprites/`。實測 696 張待處理圖片裡有 582 張來自這兩個目錄；sprite 是把動圖攤平成的大圖（常見 1500–3700 px 寬），本機單張就要 1–4 秒，Cloudflare 的機器更慢。前端直接讀原檔（`img-list.vue`、`animated-output.ts`），轉出來的縮圖完全沒用到，原尺寸那份還會以有損壓縮蓋掉 dist 裡的 sprite 原檔。

**處理方式**：當時把兩個目錄加進縮圖腳本的排除清單。現在縮圖改由 Nuxt Image 在預先渲染時產生，只處理 SSR 實際用到的圖片（`theme-image` 與 md 圖片），迷因圖庫不經過它，build 時間不再隨圖庫成長。

## Cloudflare Pages 的 npm ci 報「Missing: … from lock file」

Cloudflare Pages v3 build image 預設是 Node 22 + npm 10，本機是 Node 24 + npm 11。npm 11 重產的 `package-lock.json`，npm 10 解析 peer dependency 的結果不同（例如 `@tiptap/core` 的版本衝突），會判定 lock 與 `package.json` 不同步而拒絕安裝。本機 `npm ci` 照樣通過，所以只有部署時才會爆。

**處理方式**：根目錄的 `.node-version` 釘選 Node 24，讓 Cloudflare 跟本機用同一代 npm。之後本機升 Node 主版本時要一併更新這個檔案。要在本機重現 Cloudflare 的檢查，可以跑 `npx npm@<版本> ci --dry-run --ignore-scripts`。

## Cloudflare Pages 的 npm ci 卡在 onnxruntime-node 下載 GPU 函式庫

2026-11-09 連續兩次部署在 `npm ci` 失敗，都還沒跑到 build：第一次是 `onnxruntime-node` 安裝腳本從 GitHub Releases 下載 `onnxruntime-linux-x64-gpu-*.tgz` 時遇到 504；重試那次沒能還原相依快取，全部重新下載時大量 tarball 被判為損壞，最後 wrangler 底下的 esbuild 版本驗證不過。

**原因**：`onnxruntime-node` 由 devDependency `@huggingface/transformers` 帶入，只有已停用的舊版梗圖處理腳本 `process-meme-img.ts` 用到（現行流程是 `process-meme-img-v2.ts`）。它在 Linux x64 安裝時會自動下載 CUDA 函式庫，Cloudflare 每次都是全新安裝，等於每次 build 都依賴 GitHub 下載一大包網站用不到的檔案。

**處理方式**：移除舊版腳本，以及只有它在用的 `@huggingface/transformers`、`tesseract.js` 與根目錄的 tesseract 語言模型（`*.traineddata`）。移除前曾以 `.npmrc` 設 `onnxruntime-node-install-cuda=skip` 暫時跳過下載，build 從 7～10 分鐘降到約 5 分鐘。日後若再引入會在安裝時下載大型二進位檔的套件（機器學習推論、瀏覽器等），先確認 Cloudflare build 是否真的需要，不需要就設法跳過下載。

之後若又遇到 tarball 損壞，多半是 build 機器當下網路不穩，先重試，仍失敗再到 Pages 設定清除 build cache。

## Windows build 出現 EBUSY

失敗訊息形如 `EBUSY: resource busy or locked, rmdir ...dist\public\chunks`，常見原因有二：

1. 背景啟動的 `npx serve .vitepress/dist` 即使停掉外層 shell，node 子行程仍存活並握著 dist 目錄 handle。
2. 持久 shell 的工作目錄停在 dist 子目錄內，同樣會鎖住該目錄。

**處理方式**：用 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 查命令列，`Stop-Process` 終止殘留的 serve 行程；並確認 shell 已 `cd` 回專案根目錄後再 build。

## 驗證編譯結果不必 build

要確認某個檔案編得過、或想看 Vue／whyframe 轉譯後的產物，向執行中的 dev server 索取模組即可：

```bash
curl "http://localhost:3030/aquarium/meme-cache/index.md?import"
curl -o /dev/null -w "%{http_code}\n" "http://localhost:3030/aquarium/meme-cache/domains/img-list/feed-ad.vue?import"
```

`?import` 會強制走 Vite 的 transform，回傳編譯後的 JS。HTTP 200 代表編譯成功，內容則可用來檢查元件解析、whyframe 抽取等結果。

**這招對 production build 的 Rollup 打包行為沒用**：dev server 走的是 esbuild 單檔轉譯，不做完整型別檢查，也不會重現 `npm run build` 才會跑的 Rollup chunk 切分。下面這條「worker 格式與 code-splitting 衝突」的建置錯誤，只有真的 build 才會冒出來。

## worker 格式衝突：Invalid value "iife" for option "output.format"

**現象**

production build 在 `[vite:worker-import-meta-url]` 階段失敗：

```
Invalid value "iife" for option "output.format" -
UMD and IIFE output formats are not supported for code-splitting builds.
file: .../meme-cache/domains/img-editor/animated-output-client.ts
```

指名的 worker 檔案本身沒有異動過。

**成因**

Vite 的 worker 預設用 `iife` 打包，這個格式不支援 code-splitting。只要該 worker（或它依賴的模組）內部有動態 `import()`，Rollup 就得把輸出拆成多個 chunk，跟 `iife` 互斥。

`animated-output.worker.ts` 走的正是動態載入（見 `animated-output.ts` 對 gifenc／mp4-muxer 的處理），一直以來能過是因為 Rollup 的自動分包沒把它推到「需要拆 chunk」的門檻。**這個門檻會隨著專案其他地方新增程式碼而移動**：即使沒動過 worker 本身，其他模組長大也可能讓 Rollup 改變主意，build 忽然就失敗，且無法用 dev server 提前發現（見上一節）。

**處理方式**

在 `.vitepress/config.mts` 的 `vite` 設定明確指定 worker 格式為 ES module（支援 code-splitting），不依賴 Rollup 自動分包的判斷：

```ts
vite: {
  worker: {
    format: 'es',
  },
}
```

## VitePress 樣式隔離：vp-raw 與 cascade layer

**現象**

app 若不包在 whyframe 的 iframe 內，Nuxt UI 的按鈕與輸入框會被打回裸元素 —— 沒有內距、沒有背景、行高錯亂；但 `<div>`（toast、圖片）完全正常。

**成因**

1. [postcss.config.mjs](../postcss.config.mjs) 使用 VitePress 的 `postcssIsolateStyles()`
2. 它把 `base.css` 的選擇器改寫成 `button:not(:where(.vp-raw, .vp-raw *))` 這種形式
3. 那些規則**沒有 cascade layer**
4. Tailwind v4 建在原生 layers 上，工具類全在 `@layer utilities`
5. 無層級 CSS 的優先權高於任何層級，**與具體性無關**

於是 `button { padding: 0; line-height: inherit; color: inherit; border: 0 }` 直接輾過 `py-1`、`text-xs`。`<div>` 不在該重設的選擇器裡，所以看起來正常。

**解法**

```ts
onMounted(() => document.documentElement.classList.add('vp-raw'))
onUnmounted(() => document.documentElement.classList.remove('vp-raw'))
```

兩個要點：

- 掛在 `documentElement` 而非包裝元素。Nuxt UI 的 toast 與 modal 會 teleport 到 `body`，包裝元素罩不到。
- 不會 FOUC。app 根節點是 `client-only`，內容等掛載後才畫，`vp-raw` 早就到位（逐幀量測為 0 個裸樣式幀）。

**保護範圍的邊界**

`postcssIsolateStyles` 的 `includeFiles` 預設只有 `/base\.css/`。專案 `.vitepress/theme/style.css` 裡那 141 行 `.vp-doc` 巢狀規則**不在保護範圍**。因此：

| 情境 | 能否不用 iframe |
| --- | --- |
| `layout: false` 專屬頁（快取梗圖等） | 可以，掛 `vp-raw` 即可 |
| 文章內嵌（如 HexaZen EP01） | 不行，`.vp-doc` 會直接輾過去 |

**陷阱**

不要為了擴大保護範圍把 `style.css` 加進 `includeFiles`。那會連 `:root` 一起改寫成 `:root:not(:where(.vp-raw, .vp-raw *))`，掛了 `vp-raw` 的頁面整組主題變數會失效。

**附帶：whyframe 的 app 不跑 enhanceApp**

`content/_frame.md` 呼叫 `createApp(el)` 時沒帶 `opts`，所以 VitePress 的 `client-only` 沒註冊（主控台會有解析警告）、vue-i18n 也用不了 —— hexazen、minespace 的 `use-simple-i18n` 就是為此而生。脫離 iframe 反而一併解掉。

## 追查某條樣式為何沒生效

`getComputedStyle` 只給結果，不給勝出的規則，遇到 cascade layer 問題時幫助有限。這段貼進主控台即可列出所有命中該元素的規則與其所在 layer：

```js
function traceRules(selector, watchedList = ['padding-top', 'line-height', 'color', 'background-color']) {
  const element = document.querySelector(selector)
  if (!element)
    return '找不到元素'

  const hitList = []

  function walk(ruleList, layerPath) {
    for (const rule of ruleList) {
      const type = rule.constructor.name

      if (type === 'CSSLayerBlockRule') {
        walk(rule.cssRules, [...layerPath, rule.name || '(匿名)'])
        continue
      }
      if (rule.cssRules && type !== 'CSSStyleRule') {
        walk(rule.cssRules, layerPath)
        continue
      }
      if (type !== 'CSSStyleRule' || !rule.selectorText)
        continue

      let matched = false
      try {
        matched = element.matches(rule.selectorText)
      }
      catch {
        continue
      }
      if (!matched)
        continue

      const setList = watchedList.filter((prop) => rule.style.getPropertyValue(prop))
      if (!setList.length)
        continue

      hitList.push({
        layer: layerPath.length ? layerPath.join('>') : '(無層級)',
        selector: rule.selectorText.slice(0, 70),
        props: Object.fromEntries(setList.map((prop) => [prop, rule.style.getPropertyValue(prop)])),
      })
    }
  }

  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, [])
    }
    catch {
      // 跨域 sheet 讀不到 cssRules，跳過
    }
  }

  return hitList
}

console.table(traceRules('.meme-cache .emotion-list button'))
```

標為 `(無層級)` 的規則會勝過任何 `@layer` 內的規則，先看那幾條。

## GIF 輸出不要用「超過大小就抽格」收斂體積

**現象**

meme-cache 匯出的 GIF 動作非常頓，同一張圖匯出 mp4 卻很順。

**成因**

`animated-output.ts` 原本設了 400KB 的目標大小與一道畫質階梯，超標就降階重編，最後兩階分別把影格砍到 18 格與 14 格，且註明「最後一階不論多大都會採用」。三個問題疊在一起，讓階梯每次都直接觸底：

1. **影格上限訂死，沒跟時長走。** 120 格／6.96 秒的迷因被壓成 14 格，等於 2 fps。這個教訓 `meme-animation.ts` 的 `ANIMATED_MAX_FRAME_COUNT` 註解早就記過一次，輸出端沒同步。
2. **`GIF_MIN_SIZE` 反過來害了自己。** 文字可讀性下限把原生只有 300px 的迷因放大到 420px，像素量翻近兩倍、換不到任何底圖細節，卻讓體積連最後一階都塞不進 400KB。實測結果是全站動圖一律輸出 14 格。
3. **階梯有斷層。** 第三階（不抽格）到第四階（18 格）中間沒有級距，一跳砍掉六成影格，往往還超修（434KB → 178KB）。

測試沒擋住，是因為測資只有 3 格 40x40 的平面色塊，壓完只有幾 KB，根本推不到 400KB 門檻。

**處理方式**

改用 GIF 本來就有的跨影格機制，而不是拿影格換體積：與畫面上現有像素夠接近的點改寫成透明索引，配上 `dispose: 1`（不清除前一格），播放器就會沿用舊像素。迷因多半是靜止背景配一小塊動作，實測九成以上的像素能省掉。

比對對象要是「播放器當下實際顯示的畫面」而非前一格原圖，容差造成的誤差才不會逐格疊上去。

容差不能為 0：來源是 lossy webp，靜止背景每格都帶雜訊，逐位元比對只抓得到三成，零星的透明點還會打斷 LZW 的連續段，反而讓檔案變大（實測 -7%）。取 RGB 歐氏距離 24，三張代表性迷因省下 14~59%，RMSE 只從 3.1~4.5 升到 4.3~5.7。

目標大小與畫質階梯整個移除。GIF 的價值是到處都動得了，抽格會毀掉它唯一的優勢；真要小檔案，旁邊就有 `encodeMp4`。

順帶把合成改成串流式：原本一次收集所有 `ImageData`，420x420 的 120 格動圖要 85MB 未壓縮 RGBA，行動裝置會直接被系統收掉。

`GIF_MIN_SIZE` 也一併移除。文字怕縮、底圖怕放大，兩者共用同一張輸出畫布只能有一個縮放比，原本用「輸出長邊至少 420px」一刀切，等於為了文字犧牲每一張底圖。改成只約束真正怕縮的那一項：由最小的那段文字字級反推縮放比下限（`MIN_TEXT_OUTPUT_SIZE`），沒有文字時完全不設下限，直接照原生解析度輸出。

**寫測試時注意**

平面色塊壓完只有幾 KB，照不到「大檔案」這條路徑。要驗證體積相關的行為，測資得用壓不動的雜訊，並先斷言 `blob.size` 真的過了門檻，否則測試等於沒測到。

但雜訊測資也不能開太大。整套測試並行時，`unit` 專案會把 CPU 吃滿，瀏覽器分頁跟著被節流，過重的瀏覽器測試會把同批的其他測試一起拖垮，取剛好過門檻的尺寸即可。

同一個原因，瀏覽器測試裡凡是等非同步狀態的斷言都要用 `expect.poll`，且預設的 1 秒往往不夠（`text-item` 的 focus 測試就是這樣被拖垮的，已改成 poll 5 秒）。

## 動圖輸出的 worker 與 requestAnimationFrame

**現象**

匯出動圖時整個編輯器凍住，載入提示的轉圈動畫也停著不動。分頁切到背景再切回來，進度還停在原地。

**成因**

逐格合成與量化編碼是純 CPU 工作，長動圖要跑上好幾秒，全程佔著主執行緒。

原本靠 `requestAnimationFrame` 每四格讓出一次，但 rAF 跟著合成器的影格節奏走，分頁一切到背景就整個停擺 —— 使用者按下輸出跑去別的分頁，回來會發現什麼都沒發生。CPU 吃緊時單次 rAF 也可能拖到數百毫秒，整段編碼慢上一個數量級。

**處理方式**

編碼搬進 `animated-output.worker.ts`。主執行緒完全不受影響，還因此做得到進度回報 —— 原本主執行緒被佔滿，畫面根本沒機會更新。

讓出主執行緒的部分改用 `setTimeout(0)`，並在 worker 裡直接跳過（沒有畫面要顧，讓出只是白白多花時間）。

幾個設計上的取捨：

- **影格長圖由 worker 自己 `fetch`。** 主執行緒雖然已經載過，但那是 `HTMLImageElement`，過不了 `postMessage`；改傳 `ImageBitmap` 要嘛複製整張（動輒數十 MB），要嘛 transfer 走。同一個網址直接命中 HTTP 快取，還順便把解碼也移出主執行緒。
- **上層內容用複製而非 transfer。** `ImageBitmap` 一旦 transfer 走，主執行緒就成了空殼，worker 出事沒得回頭跑 fallback。去重後張數不多，複製的代價遠比失去退路划算。
- **逾時看的是進度心跳，不是總時限。** 長動圖本來就要跑十幾秒，訂死總時限會誤殺；只要進度還在動就繼續等。
- Safari 16.4 以前沒有 `OffscreenCanvas`，故 `animated-output.ts` 兩種執行環境都要跑得動，主執行緒那條路必須留著。

## 升級 mermaid 後 dev 報「does not provide an export named 'default'」

mermaid 不在 Vite 的預先建置名單內，dev 時瀏覽器直接載入它的 ESM 原檔；若它新增了 CommonJS／UMD 格式的依賴，瀏覽器就讀不到 default export。11.17 新增的 `fastdom` 就是一例，production build 由 Rollup 處理不受影響，只有 dev 會壞。

**處理方式**：把該依賴以 `mermaid > 套件名` 的形式加進 `config.mts` 的 `vite.optimizeDeps.include`。VitePress 偵測到 config 變更會自動重啟並重建依賴快取，瀏覽器重新整理即可。

## dev 啟動與瀏覽時的警告

- **`[NDT_DEP_0005] addCustomTab is deprecated`**：@nuxt/icon 2.6.3（Nuxt UI 內建）不論 devtools 有沒有開，都會呼叫舊版 devtools API 註冊分頁。本專案關閉了 devtools，所以用 `patches/@nuxt__icon@2.6.3.patch`（`pnpm-workspace.yaml` 的 `patchedDependencies`）讓它只在 devtools 開啟時註冊。升級 @nuxt/icon 時，先看新版改好了沒有，改好就移除 patch；還沒改好，就用 `pnpm patch` 重做。
- **`Vite discovered new dependencies at runtime`**：md 頁面、dev 才動態載入的模組裡的依賴，啟動時掃描不到。把它補進 `nuxt.config.ts` 的 `vite.optimizeDeps.include`，否則第一次打開那頁會觸發重新優化並整頁重載。
- **草稿封面 404**：dev 會列出草稿，草稿封面還沒做時，文章總覽、圖版列與相關文章會一直請求 `/_ipx/...` 得到 404。`site/articles.ts` 只在 dev、且只對草稿把缺檔的封面換成 `/cover.webp`。
- **可以忽略的**：無頭瀏覽器沒有 GPU 時出現的 `GPU stall due to ReadPixels`、`No available adapters.`（enderbox 偵測 WebGPU 後會改用 WebGL）、`Unrecognized feature: 'web-share'`（YouTube 官方嵌入碼）。另外還有 StackBlitz 嵌入元件自己的 preload 警告，以及 `--host` 帶出的「reachable from the network」提示（為了用手機連區網測試）。

## 網頁效能：別讓首屏背上不必要的負擔

2026-11 用 Lighthouse 12（手機模擬）量正式站，瓶頸依序是中文網頁字型、第三方腳本、首頁的 YouTube 與 Babylon，VitePress 本身的 hydration 只佔約 400 ms。相關規則：

- **不要再從 Google Fonts 載入中文字型給全站用。** Noto Sans TC 一頁要拆 29～50 個切片，每片到達都觸發整頁中文重排，拿掉後文章頁 LCP 由 10.5 s 降到 4.0 s。內文一律走 `--vp-font-family-base` 的系統字型；個別功能真的需要（例如迷因編輯器的字型選單），在該功能內按需載入。
- **嵌入 YouTube 等 iframe 加 `loading="lazy"`。** 首頁 12 個影片沒加時，播放器 JS 就超過 900 KB。
- **首屏以外的重型元件用 lazy hydration。** `defineAsyncComponent` 只是拆 chunk，hydration 時照樣立刻下載；要搭配 `hydrate: hydrateOnVisible()` 才會捲到附近才載入，範例見 `.vitepress/theme/index.ts` 的 `FishDiorama`。
- **圖片要優先載入，就在 md 明確寫 `loading="eager" fetchpriority="high"`。** `theme-image` 只自動判斷 `cover` class，明確寫出的屬性會優先採用；eager 的圖片由 Nuxt Image 在 head 加上 preload。
- **捲動或非同步更新時移動版面，一律用 `transform`。** CLS 只豁免輸入後 500 ms 內的位移，捲動不算輸入。meme-cache 曾因此在 Clarity 拿到 CLS 2.8：VueUse `useVirtualList` 的 `wrapperProps` 用 `marginTop` 推移，捲一下就被算一次位移；改用 `translateY` 後歸零，見 `img-list.vue` 的 `wrapperStyle`。
- **量測尺寸的 ref 不要掛在會被 `<transition mode="out-in">` 替換的元素上。** 新舊元素交接的空檔裡 ref 是 null、量到的高度歸零，依賴它的版面會先跳走再落回。
- **新增 `public/` 底下的資料檔，先確認 Cloudflare 有壓縮。** 只有名單內的 Content-Type 才會壓縮，副檔名認不得的會回 `application/octet-stream` 並原封傳輸（meme-cache 的 ndjson 就因此多傳約 380 KB）。在 `content/public/_headers` 覆寫 Content-Type，部署後用 `curl -sI -H "Accept-Encoding: br" <url>` 確認有 `content-encoding`。
- **藏起來的 lazy 圖片照樣會下載。** Chrome 在慢速網路會預載距視窗 2500px 內的 lazy 圖片，被 fixed 元素蓋住、或只是推到兩個螢幕高以外都不夠。
- **client-only 的 app，首屏圖片直接輸出在 HTML，別讓 LCP 等 JS 與資料。** meme-cache 原本的 LCP 要依序等 JS、ndjson、清單算繪、圖片，手機慢速 4G 約 5.7 秒。現在 build 時由 `site/meme-featured.ts` 隨機挑 10 張靜態、清晰的梗圖，透過 `#site/meme-featured-list` 同時給 SSR 與 client：`meme-cache.vue` 的 `<client-only>` `#fallback` 用相同的版面輸出這批圖（只顯示當下欄數的兩列），app 掛載後把它們固定在清單最前面，圖片直接沿用快取。尺寸相同的元素替換不會產生新的 LCP 候選，CLS 也沒有變化。本機 preview 對正式站（手機）：LCP 6.7 → 2.3 秒，TBT 1.8 → 1.0 秒。
  - 這時 ndjson 已經不在 LCP 的路徑上，`site/head.ts` 也拿掉了它的預載。預載會讓 146 KB 的資料跟擋渲染的 CSS、首屏圖片搶頻寬，拿掉後 LCP 2.68 → 2.26 秒。
  - 也比較過「先載一份首屏用的小 ndjson，再載完整資料」的做法。最好的情況是首屏資料直接打包進 JS，但 LCP 仍要等 JS 執行完，手機 5.3 秒、桌機 5.0 秒，沒有採用。
- **串流資料別邊讀邊觸發整份清單重算。** meme-cache 原本每 500ms 觸發一次，無關鍵字時每次都重新洗牌、整份重繪；主執行緒一忙串流就讀得更慢、觸發更多次，4 倍 CPU 降速下會從 4 次膨脹到 30 次，前 15 秒長任務多達 27 秒。改為讀完才通知一次後，長任務降到 3 秒左右。
- **圖片的暗色版（`xxx-dark.webp`）放進 `content/public` 即可，不必另外登記。** `config.mts` 啟動時掃描出有暗色版的圖，以 `__DARK_IMAGE_LIST__` 傳給 `theme-image`，只對名單內的圖加上暗色 `<source>`（`media` 在掛載前用系統偏好的媒體查詢，避免 hydration 不一致）。過去一律嘗試載入暗色版，暗色模式下幾乎每篇封面都在 hydration 後多一次 404 再換回亮色，LCP 慢約 0.4 秒且封面會閃。新增暗色版後要重開 dev server 才會生效。
- **文章頁的 FCP 主要卡在全站共用的 style.css。** VitePress 把所有元件（含各 aquarium app）的樣式合成一支，2026-11 時解壓後 394 KB，文章頁只用到 46%；它是 render-blocking，還跟 JS 搶頻寬。理想上只留用到的規則，慢速 4G 下 FCP 可快約 1 秒、LCP 快約 1.7 秒。VitePress 寫死 `cssCodeSplit: false`，產 HTML 時也只連結第一支 CSS，硬拆會讓 SSR 畫面在 JS 到之前沒有樣式。
- **文章頁的 JS 一律低優先下載。** `config.mts` 的 `transformHtml` 會替 modulepreload 與 app.js 加 `fetchpriority="low"`，讓 style.css 與封面先拿到頻寬（鏡像代理實測 FCP 2.45 → 1.57 秒、LCP 3.45 → 2.86 秒）。直接拿掉 modulepreload 會讓 LCP 變慢。aquarium 頁的畫面靠 JS 繪製，不套用。
- **載入後不要動態插入或移除 `<style>`。** 每插入、移除一次都會讓整頁重算樣式，CSS 越大越貴，文章頁 4 倍降速下一次 300～800 ms。曾有三個來源，合計約 2 秒：VueUse `useDark` 預設 `disableTransition`，初始化時即使外觀沒變也會插入再移除停用轉場的樣式（VitePress 本身與 Nuxt UI 各一個實例）；Nuxt UI 的顏色變數在 Vue 版沒有 SSR，會插暫時版、正式版再移除暫時版。現已分別以 `appearance: { disableTransition: false }`、`ui({ colorMode: false })`、`theme/nuxt-ui-colors.css` 靜態化處理。追查方式：trace 開 `disabled-by-default-devtools.timeline.invalidationTracking`，看每次 `UpdateLayoutTree` 的元素數與失效原因。
- **`<source>`、`<img>` 的 `sizes` 不要個別綁定。** Vue 3.5 hydration 會把個別綁定的屬性重設一次，只略過值沒變的 src、srcset，不含 sizes；瀏覽器收到 sizes 就重新選圖、重新載入，LCP 被推到 hydration 之後。改用 `v-bind` 物件即可，見 `theme-image.vue` 的暗色 `<source>`。這兩項加起來讓文章頁 LCP 從約 4.3 秒降到約 2.2 秒（鏡像代理、慢速 4G、CPU 4 倍）。
- **Lighthouse 只量載入，抓不到互動造成的 CLS。** 要用 Playwright 模擬滾輪、輸入等操作，並以 `PerformanceObserver` 監聽 `layout-shift`，從 `sources` 找出元兇。

量測方式：`npx lighthouse@12 <url> --only-categories=performance --output=json --chrome-flags="--headless=new"`，搭配 `--blocked-url-patterns` 封鎖特定資源，就能拆出各項因素的影響。

## 效能修改用本機 preview 對正式站做 A/B

dev 量到的效益會失真。dev 版的 Vue、Nuxt UI 帶開發期檢查，又有模組轉譯開銷，同一版本跑幾輪就能差到 3 倍。meme-cache 收藏按鈕從 UButton 改原生 button 時，dev 量到快約 3 倍；改用兩個本機 preview（只差這顆按鈕）A/B 並錄 CPU profile，約 38 顆 UButton 在 4 倍降速下只佔 130～190 ms，換算一般裝置約 35～50 ms，差距不大，最後依 CLAUDE.md「Nuxt UI 元件優先」改回 UButton。要判斷修改值不值得上線，用本機 preview（正式打包）對 `codlin.me`（main 的現行版本）做 A/B，只要 build 一次。

**步驟**

1. 停掉 dev server（與 build 共用 `.vitepress/cache`，見「不要在 dev server 執行中跑 build」），再執行 `npm run preview`，本機約 6 分鐘，起來後在 `http://localhost:4173`。build 過程印出的 `[SSR] "document" was accessed` 是 `ssr-guard.ts` 刻意輸出的追蹤，不是失敗。
2. 確認兩邊跑的版本確實不同（例如檢查畫面上的元素 class 或版號），否則比的是同一份程式。
3. 用 Playwright 交替量兩邊，桌機與手機各 4 輪，取中位數。
4. 量完關掉 preview，否則下次 build 可能撞上 EBUSY（見「Windows build 出現 EBUSY」）。

**讓兩邊可比的條件**

- **CPU 降速 4 倍**（CDP `Emulation.setCPUThrottlingRate`），網路不降速。
- **先不降速暖機一次**，讓資料與圖片在兩邊都進 HTTP 快取，差異才會只剩 CPU。
- **兩邊都封鎖廣告與分析腳本**：localhost 不一定會填廣告，不封鎖會讓本機佔便宜。實測它們只增加 LCP 之後的長任務，不影響 LCP。
- **起點取「渲染所需資源全部到齊」**，不要取頁面開始載入。本機 preview 伺服器每次即時壓縮、回 `Cache-Control: no-cache`，JS 與資料都比 CDN 晚到 0.7 秒以上，絕對的 LCP 不能比，只能比資源到齊之後的 CPU 階段。
- **交替先後順序**（奇數輪 A 先、偶數輪 B 先），抵銷機器忙閒的時段差異。

量測核心（在 `page.goto(url, { waitUntil: 'load' })` 並等待約 10 秒後執行；LCP 與長任務要在載入前以 `addInitScript` 掛 `PerformanceObserver` 收集）：

```ts
const resourceList = performance.getEntriesByType('resource')
// 起點：ndjson 與主要 JS 中最晚收完者，之後全是 CPU
const received = Math.max(...resourceList
  .filter((entry) => /ndjson|\/app\.|meme-cache_index|framework\.|theme\./.test(entry.name))
  .map((entry) => entry.responseEnd))
const firstImg = resourceList
  .filter((entry) => /\/memes\/meme-/.test(entry.name) && entry.startTime >= received)
  .map((entry) => entry.startTime)
  .sort((a, b) => a - b)[0]
```

比較 `firstImg - received` 與 LCP 圖片時間減 `received`。換到其他頁面時，把正則換成該頁的資料與 chunk 名稱。

**不 build 就想試改動效益：鏡像代理**

只改 HTML 或靜態資源（換一支 CSS、加個屬性）時，可在本機架 Node 代理：從 `codlin.me` 抓內容快取、文字類以 brotli 壓縮後回傳，每個變體開一個 port，再用 CDP `Network.emulateNetworkConditions` 模擬慢速 4G（RTT 150 ms、下行 1.6 Mbps）交替量測。代理的上游也可以指向本機 preview（`http://localhost:4173`），讓 preview 與正式站走同一條 HTTP/2＋brotli 傳輸，就能直接比較連網路在內的 FCP／LCP，不受 preview 伺服器即時壓縮、no-cache 的影響（HTTP/2 需自簽憑證，Playwright 開 `ignoreHTTPSErrors`）。不要用 Playwright 的 `route.fulfill` 直接替換回應，它回傳的內容不經網路節流，攔截 HTML 還會打亂資源載入時序，數據會嚴重失真。

**在 dev 定位瓶頸的工具**（只用來找元兇，效益仍以 preview 為準）

- **元件層級耗時**：在 `enhanceApp` 暫時設 `app.config.performance = import.meta.env.DEV`，Vue 會為每個元件的 render／patch／mount 產生名為 `<元件名> mount` 的 measure。Vue 建立後會立刻 `clearMeasures`，事後查 `performance.getEntriesByType('measure')` 是空的，必須在載入前就用 `PerformanceObserver({ type: 'measure' })` 收集。
- **時間點 log**：用 `import.meta.env.DEV` 包住、以 `performance.now()` 為基準印時間，才能與 Resource Timing 對齊。定位完連同呼叫處一併移除。

## 用 cf CLI 查 Cloudflare Web Analytics（RUM）

`codlin.me` 在 zone 層級開了 RUM，Cloudflare 會在邊緣替 HTML 注入 beacon，repo 裡看不到。只對瀏覽器請求注入，curl 預設 UA 抓不到 `cloudflareinsights` 是正常的。

- **狀態**：`cf zones rum get -z codlin.me`，回傳的 `site_tag` 是查詢時的篩選條件。
- **資料**：`cf sql query "<SQL>" --scope-account <account id> --time-since <RFC3339> --time-until <RFC3339>`。資料集為 `events.rumPageloadEvents`（瀏覽量）與 `events.rumWebvitalsEvents`（LCP／INP／CLS 等），欄位用 `cf sql datasets --account-tag <account id> --include-columns true` 查。

踩過的坑：

- **zone 層級會收進所有子網域**（susugo、chillcomponent 等），一定要加 `requestHost = 'codlin.me'`，否則首頁瀏覽量會灌水好幾倍。
- **瀏覽量要用 `sum(sampleInterval)`**，資料是抽樣的。
- **沒量到的值是哨兵值**：時間類欄位是 `4294967295`（uint32 上限），CLS 是 `-1`，計算前要排除，否則 P75 會變成 4294967 ms。
- **SQL 限制**：不支援 `quantile` 這類參數化函式，P75 要撈原始列（`FORMAT JSONEachRow`）在本機依 `sampleInterval` 加權計算；`max` 要改用 `APPROX_MAX`；`ORDER BY` 必須搭配 `LIMIT`；WHERE 裡寫了 `timestamp` 條件就不能再帶 `--time-since`。
- **看到問題先依日期切開**，確認是不是修正上線前的舊資料。2026-11 查到 meme-cache 有 30 筆 CLS 超過 0.1，元兇是虛擬清單 wrapper，但全落在 11/05 改用 `translateY`（見「網頁效能」）上線之前，之後 CLS 最大 0.007，不必再修。

## meme-cache 的 SEO 結構

meme-cache 本體是 `layout: false` 的單頁 app，上千張圖共用一個網址，爬蟲只看得到 build 時產生的靜態內容：

- **主頁** `seo-content.vue`：h1、說明、情緒分類連結、最新 20 張（`SEO_MEME_LIMIT`）附描述與圖中文字。區塊刻意推到首屏 3000px 以下，避免 lazy 圖片與 app 搶頻寬。
- **情緒分類頁** `/aquarium/meme-cache/emotion/<slug>`：`emotion/[emotion].paths.ts` 依 `EMOTION_LIST` 每種情緒產生一頁，列最新 60 張（`EMOTION_PAGE_MEME_LIMIT`），沒有迷因的情緒不產生頁面。標題、描述與版面設定都由 `config.mts` 的 `transformPageData` 依路由參數寫入，`[emotion].md` 刻意不寫 frontmatter：動態路由會在內容開頭插入參數前綴，vitepress-plugin-llms 再把提示塞在前綴與 frontmatter 之間，frontmatter 就會解析失敗、整段 YAML 印在頁面上。描述要同時寫 `pageData.description`，`<meta name="description">` 讀的是它而不是 frontmatter。VitePress 1.6 的動態路由不支援 `watch`，dev 時改 ndjson 要重啟。頁面的 CTA 帶 `?emotion=` 進 app，app 會套用對應篩選。
- **新增情緒標籤**時要在 `meme-seo.ts` 的 `EMOTION_SLUG_MAP` 補英文代稱，型別與 `meme-seo.test.ts` 會擋漏填與重複。
- **資料來源**：build 端一律透過 `meme-seo-source.ts` 讀取主檔並合併 extend 檔的情緒標籤。只存在於 extend 檔的圖不會納入（app 會），目前沒有這種圖，張數與 app 一致。這支檔案用到 `node:fs`，不可被頁面匯入；頁面要資料走 `virtual:seo-meme-list`。
- **sitemap lastmod**：meme-cache 底下各頁取「頁面 .md」與「兩份 ndjson」最後 commit 時間的較新者，新增迷因後 lastmod 才會更新（`site/sitemap.ts`）。分類頁頁尾的「更新於」也直接改為 ndjson 的 commit 時間（`site/pages.ts` 的 `toEmotionPage`）。
- **社群縮圖**：`npm run task:generate-meme-og` 產生 `public/og/meme-cache-*.jpg` 四種比例，og:image 用 1200×630、X 用 1200×675（frontmatter `twitterImage`）、結構化資料列 16:9／4:3／1:1（frontmatter `structuredImageList`）。主頁與分類頁共用，由 `site/pages.ts` 的 `MEME_CACHE_SOCIAL_IMAGE` 寫入 frontmatter。圖上有中文字，要在裝有 Noto Sans TC 的本機產生後 commit，Cloudflare 的 Linux 環境沒有中文字型。用 JPEG 是因為部分 Slack、Discord 用戶端讀不了 WebP 預覽圖，腳本會擋 300 KB 以上的輸出（WhatsApp 上限 600 KB）。`twitterImage`、`structuredImageList` 是通用欄位，其他頁面也能用。
- 2026-11 Search Console：「梗圖」三個月 2 萬次曝光、平均排名約 7、點閱率 0.36%；「嘲諷梗圖」「哏圖」有曝光但幾乎沒點擊，是這次分類頁與文案調整的依據。

## SEO 模組

站台採用 Nuxt SEO 的各模組，但只取「SSR 輸出」與「建置期產檔」的部分：canonical、Open Graph、JSON-LD 只在 prerender 時寫進 HTML（與 VitePress 時期相同，client 換頁不更新），不增加 client bundle。逐一安裝而非 `@nuxtjs/seo`，後者另帶 `nuxt-ai-ready`（會產生 llms.txt，與 postbuild 的 llms 步驟重複）與 `nuxt-skew-protection`。

**各模組職責與設定**（設定都在 `nuxt.config.ts`）

| 模組 | 職責 | 重點設定 |
| --- | --- | --- |
| `nuxt-site-config` | 共用站台資訊（網址、名稱、語系、尾斜線） | `site`：`trailingSlash: false`、`indexable: true`（不指定時依環境推斷，預覽部署可能被判成不可收錄） |
| `@nuxtjs/robots` | 產生 `robots.txt` 與每頁 robots meta | `groups` 寫 `Allow: /`；`metaTag: true`（每頁 `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`）；草稿與 `/404.html` 以 `nitro.routeRules` 的 `robots: false` 改為 `noindex, nofollow`（草稿在 `modules/site.ts` 逐頁加）；`header: false`（不寫 X-Robots-Tag 進 `_headers`）、`credits: false` |
| `@nuxtjs/sitemap` | prerender 時產生 `sitemap.xml`，並把網址寫進 robots.txt | `zeroRuntime`、`excludeAppSources: true`（網址只來自 `site/sitemap.ts`）、`discoverImages: false`、`sortEntries: false`、`xsl: false`；圖片只給 `image:loc` |
| `nuxt-schema-org` | 輸出 JSON-LD | `defaults: false`（不自動加 WebSite、WebPage），`scriptAttributes` 讓 script 留在 head 最後 |
| `nuxt-seo-utils` | server 端 og:image 絕對網址修正、`app.head` 檢查、依 favicon.ico 補 `type` 與 `sizes`（`metaDataFiles`） | 自動 canonical、titleTemplate、og 推斷等全部關閉，理由見下 |
| `nuxt-og-image` | 停用 | 社群縮圖都已預先產好（frontmatter 的 `image`、`twitterImage`、`structuredImageList`） |
| `nuxt-link-checker` | `nuxt generate` 時檢查連結，只產報告不中斷建置 | 報告在 `node_modules/.cache/link-checker/link-checker-report.md`，不寫進 dist；略過 `trailing-slash` 檢查 |

**資料流**

- `site/seo.ts` 的 `getPageSeo` 在建置期算出每頁的 canonical、`useSeoMeta` 欄位（og、twitter、article）與 JSON-LD 節點，`modules/site.ts` 寫成 `#site/seo-data`，`app/plugins/site-seo.server.ts` 在 SSR 時交給 `useHead`、`useSeoMeta`、`useSchemaOrg`。新增頁面類型或改結構化資料改 `site/seo.ts`。
- 與 SEO 無關的 head（llms 連結等）仍由 `site/head.ts` 產生、`server/plugins/site-head.ts` 以 `render:html` 附加在 head 最後。
- `<title>` 與 meta description 由 `app/theme/use-page-head.ts` 負責，client 換頁會更新。標題已含站名，nuxt-seo-utils 的 titleTemplate 必須維持關閉（`seo.automaticDefaults: false`），否則站名重複。
- sitemap 網址清單（排除草稿、lastmod、文章封面與快取梗圖的迷因圖）在 `site/sitemap.ts`，由 `sitemap.urls` 帶入。

**為何關掉 nuxt-seo-utils 的自動行為**：它的預設值外掛是 universal，hydration 後會在 client 重算 canonical（全站統一尾斜線、轉小寫）、og:type、og:locale 等，unhead 會依去重鍵接管 SSR 已輸出的同名標籤並改寫。Googlebot 會執行 JS，canonical 被改成不帶尾斜線就與 sitemap 衝突。`setupNuxtConfigAppHeadWithMoreDefaults` 同理，它把 `og:type=website` 塞進 `app.head`，文章頁的 `article` 會在 hydration 時被蓋掉。

**尾斜線**：aquarium 各 app 的目錄頁（如 `/aquarium/hexazen/`）帶尾斜線，其餘不帶，沿用 VitePress 時期的網址。`site.trailingSlash` 只能全站一致，canonical 因此由 `site/seo.ts` 逐頁給；@nuxtjs/sitemap 在輸出前的最後一步才依設定去掉尾斜線，由 `server/plugins/sitemap-trailing-slash.ts` 在 `sitemap:output` 補回，sitemap 的 loc 才會與 canonical 一致。

**JSON-LD 的 @id**：`#website`、`#person`、`#organization` 一律寫完整網址（`https://codlin.me/#person`）。nuxt-schema-org 只保留 `http` 開頭的 @id，其餘會改寫成 `#/schema/...`，跨頁引用就斷了；沒有 @id 的根節點也會被自動補上，所以 BlogPosting、BreadcrumbList、CollectionPage、WebApplication 都明確給 `<網址>#article`、`#breadcrumb`、`#webpage`、`#webapp`。字串形式的 `image` 會被拆成獨立的 ImageObject 節點，Person 的頭像因此直接寫成 ImageObject。模組會把各節點的鍵依字母排序，JSON 內容等價。

**client 負擔**：`modules/seo.ts` 把 nuxt-site-config 與 nuxt-seo-utils（derivedTags）的 universal 外掛改成只在 server 執行，並移除 nuxt-og-image 停用時仍登記的 `defineOgImage` 等自動匯入（它們會連帶載入 consola，經由 `#imports` 打包進 aquarium 頁的 chunk，約 6.5 KB）。`site-seo.server.ts` 另在序列化前刪掉 nuxt-site-config 寫進 payload 的設定。導入前後文章頁的 entry chunk 都是 162.6 KB、modulepreload 總量相同；升級這些模組後，照下方「驗證方式」再量一次。

**其他**

- `content/public/robots.txt` 已移除，內容改寫在 `robots` 設定。@nuxtjs/robots 發現 public 目錄有 robots.txt 時會把它改名成 `_robots.txt`，不要再加回來。
- @nuxtjs/robots 對 `200.html`、`404.html` 另外直接寫一個 robots meta（404 固定 `noindex, nofollow`），所以 404.html 會有兩個相同的 noindex，無害；`/404.html` 的 route rule 是為了讓另一個 meta 也是 noindex，否則兩者互相矛盾。200.html 另有 nuxt-site-config 注入的 `window.__NUXT_SITE_CONFIG__`。
- `_headers` 會多一段 `/sitemap.xml`（`Content-Type: text/xml`、`Cache-Control: max-age=600`、`X-Sitemap-Prerendered`），由 @nuxtjs/sitemap 的 route rules 產生。

**試過但不採用的功能**（2026-11 逐項開啟後 `nuxt generate` 比對輸出）

| 功能 | 結果 | 依據 |
| --- | --- | --- |
| nuxt-seo-utils 自動預設（`automaticDefaults`、`fallbackTitle`、`automaticOgAndTwitterTags`、`mergeWithSiteConfig`、`extendRouteRules`、`setupNuxtConfigAppHeadWithMoreDefaults`） | SSR 標題變成「標題 \| 鱈魚的魚缸 \| 鱈魚的魚缸」；hydration 後 aquarium 頁 canonical 掉尾斜線、文章 og:type 從 article 變 website、標題殘留 `%siteName`；文章頁 entry 多 6.5 KB、modulepreload 多 11.6 KB | 不採用 |
| nuxt-schema-org `defaults: true` | 每頁多一個 WebPage（`#webpage`，name 帶站名後綴、ReadAction、breadcrumb 連結），CollectionPage 會與它合併後也掛上 ReadAction | Google 的 Article、Breadcrumb 規範都不需要 WebPage，現有結構已涵蓋 Article 的建議欄位（author＋url、datePublished、dateModified、headline、image），只多位元組，不採用 |
| nuxt-schema-org `identity`、`defineArticle` 慣例結構 | 會另建 `#identity` 節點並自動指派 author、publisher，與現有 `#person`、`#organization` 重複 | 同上，Google 不看 @id 命名，不採用 |
| @nuxtjs/sitemap `discoverImages`（搭配 prerender 來源） | 圖片從 85 張增為 1070 張（情緒頁各 60 張、文章內文圖） | Google 說明 image sitemap 主要給「不容易找到」的圖（例如 JS 載入的）；這些圖都在靜態 HTML 裡，只是讓 sitemap 變大 12 倍，不採用。快取梗圖主頁的 20 張來自 JS app，仍手動列出 |
| sitemap `priority`、`changefreq` | 未開 | Google 明言忽略這兩個值 |
| sitemap `news`、sitemap index | 未開 | 不是新聞發布者；90 個網址不需分割 |
| nuxt-link-checker `fetchRemoteUrls` | 模組先以 400 ms 逾時探測 nuxtseo.com，本機環境探測失敗而自動停用，無法驗證；Cloudflare 上報告沒人看，只會多出依賴外網的建置時間 | 不採用，要查外部連結時本機臨時開啟 |
| robots `blockAiBots`、`blockNonSeoBots`、`contentSignal` | 未開 | 是否擋 AI 爬蟲是內容授權決策，留給站長決定 |

**驗證方式**

1. `rm -rf dist node_modules/.cache/nuxt` 後 `pnpm nuxt generate`，再 `pnpm exec vite-node site/scripts/postbuild.ts`。
2. 看 build log 的 Nuxt Link Checker Summary 與報告檔。目前的 4 個 error 都是 `./xxx` 相對連結被誤判（模組把頁面路徑當目錄解析），瀏覽器解析正確。
3. `MSYS_NO_PATHCONV=1 node scripts/compare/run.mjs --skip-browser` 對正式站逐頁比對 head、JSON-LD、sitemap、robots.txt。
4. 抽查 `dist/sitemap.xml` 的 aquarium 網址帶尾斜線、草稿不在清單內；`dist/robots.txt` 為 `User-agent: *`、`Allow: /`、`Sitemap`。
5. 量 client 負擔：比較文章頁 HTML 中 modulepreload 與 `type="module"` script 的檔案總大小、entry chunk 大小，以及 `__NUXT_DATA__` 長度。

## API（Hono）與 Cloudflare Pages 部署

網站與 `/api` 同屬 Cloudflare Pages 專案 `cod-aquarium`（網域 `codlin.me`），前端以同網域呼叫 API。原本獨立的 Worker `cod-aquarium-server`（`*.workers.dev`）已併入，待刪除。

**程式結構**

- `server/hono/`：Hono app（`index.ts` 掛 CORS 與簽章 cookie 使用者 ID 中介層，並匯出 `AppType` 給前端 `hc<AppType>('/')`）、`reactions/`、`schema/`（drizzle）、`type.ts`（bindings 型別）。這個目錄不在 Nitro 掃描範圍，不會被當成 handler；**不要把 Hono 程式放進 `server/api/`、`server/routes/`**，Nitro 會把每個檔案都註冊成路由。
- `server/routes/api/[...].ts`：唯一的 Nitro 路由，把 `/api/**` 用 `toWebRequest` 轉成標準 Request，連同 `event.context.cloudflare` 的 env（D1 binding `DB`）、ExecutionContext 交給 Hono。
- `server/drizzle/`：D1 migrations，`wrangler.jsonc` 的 `migrations_dir` 指向這裡。

**wrangler.jsonc 是 Pages 設定**

有 `pages_build_output_dir` 時，這個檔案就是 Pages 專案的設定來源，控制台上的相容日期、bindings、環境變數改為唯讀。Pages 不支援 `main`、`workers_dev`、`observability` 等 Workers 專用欄位。secret（`COOKIE_SECRET`）不寫進檔案，在控制台的 Pages 專案設定。`compatibility_date` 不要晚於本機 wrangler 內建 workerd 的日期，否則本機模擬會警告並退回。

**Cloudflare Pages 建置設定**

- Build command：`pnpm run build`
- Build output directory：`dist`

**本機開發**

- `pnpm dev`（`nuxt dev`）時，Nitro 會把 `cloudflare-pages` preset 換成 `cloudflare-dev`，以 wrangler 的 `getPlatformProxy` 依 `wrangler.jsonc` 模擬 D1，資料存在 `.wrangler/state/v3`（與 `wrangler d1 --local` 共用）。第一次使用或新增 migration 後執行 `pnpm server:migrate:local`。
- 本機 secret 放 `.dev.vars`；沒有 `.dev.vars` 時 wrangler 會改讀 `.env`，終端機出現「Using vars defined in .env」就是這個原因。
- `pnpm server:preview`（`wrangler pages dev`）以 build 後的 `dist/` 模擬正式環境，含 Pages Functions 與 `_routes.json`。

**資料庫 schema 變更**：改 `server/hono/schema/` → `pnpm server:generate` 產生 migration → `pnpm server:migrate:local` 本機套用 → 部署前 `pnpm server:migrate` 套用到正式 D1。

**測試**：`pnpm server:test`，以 `@cloudflare/vitest-pool-workers` 在 workerd 裡跑。Pages 設定沒有 `main`，進入點在 `vitest.server.config.ts` 指定為 `server/hono/index.ts`；migrations 在設定檔（Node 端）讀取後以 binding 傳進測試套用，不能在測試檔內呼叫 `readD1Migrations`。workerd 原生 `node:console` 未實作 vitest 需要的 `Console` 類別（compat date 2025-09-21 起預設啟用），測試環境以 `disable_nodejs_console_module` 關閉。

**Worker 大小上限**：Pages Functions 與 Workers 同樣有大小上限（免費 3 MB、付費 10 MB，皆為壓縮後）。`cloudflare-pages` preset 會把 Vue SSR renderer 與所有頁面的伺服器端程式碼一起打包進 `dist/_worker.js`，頁面用到的大型套件（Babylon 等）可能讓 Worker 超過上限而部署失敗。網站頁面全部預先渲染，正式環境的 Worker 只需要處理 `/api`，所以 Worker 只應包含 API。

## 文章頁的圖版帶（圖版對開骨架）

主題（`blog-*`）與專欄（`column-*`）文章頁不顯示側欄。上方改成一列同系列文章的封面圖版，左欄放大字版號與圖說，右欄是與內文 h2 一致、以 01、02 編號的章節。設計脈絡見 `DESIGN.md` 與 `.impeccable/surfaces/app-theme-components-vpdoc-vue.md`。

- **資料**：`site/plate-series.ts` 依側欄設定算出每篇文章所屬系列，由 `modules/site.ts` 寫進該頁自己的頁面資料 chunk（`plateSeries`）。不放進全站共用的 `#site/data`，避免每頁都下載全站封面清單。`hasSidebar`（`app/theme/composables/sidebar.js`）看到 `plateSeries` 就不顯示側欄。
- **封面與 LCP**：圖版頁的內文封面（`{.cover}`）由 `theme-image` 直接不渲染，改由圖版帶上「閱讀中」那張呈現（顯示 320px、手機 200px，輸出 640 寬，eager）。2026-11 從 200px 放大，讓封面夠大、不必在內文重複一張，LCP 仍只有這一張圖。本機 preview 以同一份 build 對 400 寬 A/B（三篇文章、各 7 輪）：手機 LCP 平均 +0.02 秒，桌機 +0.18 秒（其中約 0.08 秒是同輪 FCP 的雜訊）。preload 由 Nuxt Image 依同一個 `<NuxtImg>` 輸出，網址一定一致。
- **首次繪製就置中**：圖版帶後面緊接一段 inline script，在 hydration 前把目前這張捲到中間。Vue 模板不能直接寫 `<script>`，用 `<component :is="'script'">` 加文字節點。`v-html` 在 SSR 對 script 不輸出內容；文字節點會被跳脫 `& < > " '`，所以 script 內只能用反引號當字串引號。
- **待驗證**：水合前的置中效果，以及「LCP 不得變差」，都要用本機 preview 對正式站 A/B 量測（見上方「效能修改用本機 preview 對正式站做 A/B」）。dev 模式擋掉 JS 時連 CSS 都不會載入，無法驗證。

## 首頁結構

- **最新文章**：`<home-latest-plates />` 讀 `#site/latest-article-list`（`site/latest-articles.ts` 在 build 時取最新 4 篇的標題、連結、封面，桌機剛好一列），不載入完整文章清單。dev 會連草稿一起列出，草稿封面還沒做時改用預設封面（見 `site/articles.ts`）。
- **主題入口**：`<home-topic-list />` 的連結取自主題設定的側欄「主題」群組，與導覽列一致指向各主題最新一篇；主題介紹文字寫在元件內。
- **作品影片**：`<youtube-facade video-id title />` 先顯示 YouTube 縮圖，點了才載入播放器。原本 12 個 iframe 每個都會先下載播放器。作品以 `<div class="work-entry">` 包起來，桌機影片與說明左右並排，樣式在 `style.css` 檔尾。作品的外部連結用 `<work-link href label icon />`（`web/components/work-link.vue`，icon 放大淡化當浮水印），多個連結以 `<div class="work-link-list">` 包起來排成一列。
- **出版書籍、鐵人賽**：`<home-book-list />`、`<home-ironman-list />`，資料直接寫在元件內。書封取自博客來商品頁，轉成 600 寬 webp 放在 `content/public/home/`。鐵人賽的屆數只寫查證過的，未確認就留空（`edition` 可省略）。兩者都在首屏之外，以 `hydrateOnVisible` 延後 hydration。
- **圓角**：全站內容一律圓角。`style.css` 的 `img` 預設 1rem 圓角加 1px 框；自己畫框的元件（圖版、影片縮圖、書封卡片）要把圓角放在外層並 `overflow: hidden`，內層 img 拿掉預設的框與圓角。只讓內層圓角的話，外層的底色（例如影片縮圖的黑底）會從四角露出來。表格與程式碼區塊的圓角見 `vp-doc.css`、`style.css`。

## Nuxt 版效能調校紀錄（2026-11）

以本機 preview 對正式站（VitePress 版）做 A/B，條件同上一節「效能修改用本機 preview 對正式站做 A/B」。除了文章頁的 TBT，各頁 LCP 都比正式站快、CLS 降到 0。改動與原因：

- **首次載入不播入場動畫**：`.vp-doc` 的第一個子元素在 Nuxt 是包住整篇內容的 div，入場動畫讓整篇從透明開始，主執行緒忙著 hydration 時動畫卡在 0，內文要等 JS 跑完才看得見（首頁 LCP 4.2 → 1.3 秒）。現在只在站內換頁時播放（`html.is-hydrated`）。
- **SSR 不可輸出 0 高度**：`useElementSize` 在 SSR 量到 0，文章總覽的清單容器曾因此被壓成 0 高，要等 hydration 才出現（LCP 4.3 → 1.9 秒）。掛載前不要套用量測值。
- **不輸出 modulepreload**（`modules/site.ts` 的 `build:manifest`）：一次預載 37 個 chunk 會和擋渲染的 CSS 搶頻寬，文章頁 FCP 1.95 → 1.17 秒。
- **`content-visibility: auto`**：文章內文第 6 個區塊之後、首頁作品區延後排版。長文 LCP 2.08 → 1.69 秒。跳到錨點前必須解除（`html.is-content-revealed`），否則以估計高度算出的捲動位置會偏差數百 px。
- **SSR 就輸出本地導覽列**：標題清單要在 client 才算得出來，沒有側欄的頁面若依此隱藏，hydration 後才長出 48px 的列，造成 CLS 0.05。
- **延遲 hydration**：md 裡同步匯入的示範元件在編譯時改成 `defineAsyncComponent` ＋ `hydrateOnVisible`（`site/markdown/vite-plugin.ts`），頁尾、文末導覽、贊助區也是。文章頁 TBT 約降 40～230ms，LCP 不變。
- **Nuxt Fonts 自架 Figtree**：效能持平（差異在雜訊內，多 20～40KB 字型檔），保留是為了不連 Google 與 fallback 字型尺寸修正。全站只能在 `--display-font-family` 寫一次 Figtree：直接寫在巢狀規則或元件樣式裡，@nuxt/fonts 插入 fallback 的位置會算錯，build 報 `Invalid empty selector`。

**量測陷阱**

- Git Bash 會把 `/blog-vue/...` 這類參數轉成 Windows 路徑，跑量測腳本要加 `MSYS_NO_PATHCONV=1`。
- 鏡像代理（Node http2）不做串流優先權排序，CSS 與 JS 平分頻寬，會放大「預載太多 chunk」的傷害；方向可信，絕對值會比 CDN 悲觀。
- 先看 LCP 候選清單（每個候選的元素與時間），再看 Chrome trace 的 Layout 與 v8 解析，比只看總 TBT 更快找到原因。

## 圖片：Nuxt Image 與 theme-image

站內圖片一律交給 Nuxt Image（`@nuxt/image`，ipx）。`nuxt generate` 時，SSR 用到的每個尺寸都會透過 `x-nitro-prerender` 產生成 `/_ipx/...` 靜態檔，不用另外列路由。

- **元件**：用 `web/components/theme-image.vue`，它只是包一層 `<NuxtImg>`，補上 Nuxt Image 沒有的三件事：暗色版 `<source>`、圖版頁的內文封面不渲染、把 `https://codlin.me/...` 轉成站內路徑。
- **md 圖片**：`site/plugins/markdown-it-theme-image.ts` 轉成 `<theme-image sizes="xs:100vw sm:100vw md:688px">`。原圖不存在（常見於草稿封面）、外部網址或 GIF 時輸出一般 `<img>`，`src` 以 `:src` 綁定字串。
- **寬度依顯示尺寸挑**：固定尺寸的縮圖傳 `width`，取顯示尺寸的 2～3 倍（圖版帶 200／目前這張 400、總覽 300、首頁最新文章 300）；隨版面縮放的傳 `sizes`。一律只產 1 倍密度（`densities="x1"`）。

**踩過的坑**

- `image.dir` 要給絕對路徑。相對路徑會以 srcDir（`app/`）解析成不存在的目錄而被略過，build 時每張圖都回 `IPX_FILE_NOT_FOUND`。
- `densities` 不能寫在 nuxt.config：模組以 defu 合併設定，陣列會與預設的 `[1, 2]` 串接，設 `[1]` 照樣產 2 倍圖。
- `sizes` 每個值都要有斷點前綴。沒有前綴的 `100vw` 會被算成寬度 1（`w_1`）。
- 檔名有中文的圖片 ipx 讀不到，改用英文檔名。
- 原圖不存在時 ipx 讓預先渲染整個失敗（`failOnError`），所以 md 外掛先檢查檔案是否存在。
- 一般 `<img src="/...">` 會被 Vue 的資源網址轉換當成模組匯入，原圖不存在就 build 失敗，要寫成 `:src="'/...'"`。

**後續實驗（2026-11）**

- **主題元件併成同一支 chunk（rolldown `codeSplitting.groups`）不可行。** server 端的元件樣式模組也會被併進群組，Nitro 找不到檔案（`Could not resolve "./xxx-styles-1.mjs-!~{08l}~.js"`），用 `vite:extendConfig` 的 `isClient` 也分不開。請求數因此維持約 90 個，但這不是核心指標。
- **圖版帶的首次繪製前置中 script 要保留。** 它讀 `offsetLeft` 會在解析中途強制排版，CPU profile 上記在 HTML 文件本身（4 倍降速約 240ms）。拿掉後 FCP 反而晚 0.3 秒（已解析的上半部不能先畫），LCP 不變。TBT 看似從約 410 降到約 280ms，是因為 FCP 延後，hydration 長任務落到 TBT 的計算區間（FCP 之後）以外，總工作量沒有變。
- **比較 TBT 時要一起看 FCP。** FCP 提早，計入 TBT 的區間就變長，同樣的 hydration 工作會算出更高的 TBT。
- **找 TBT 元兇要對回原始碼。** 暫時在 nuxt.config 加 `sourcemap: { client: 'hidden' }` 重新 build，錄 CDP CPU profile 後用 source-map-js 把每個取樣點對回原始檔與套件，就能看出時間花在哪個套件、哪個函式（分析完一定要移除，避免 .map 部署出去）。2026-11 的結果：Vue hydration 約佔一半，Nuxt UI 本體只佔約 34ms（4 倍降速），反而是 `@nuxt/icon` 的 css 模式在瀏覽器端產生選擇器佔了約 70ms。
- **Nuxt Icon 用 svg 模式**（nuxt.config 的 `icon.mode`）。css 模式會在 client 為每個圖示即時產生 CSS 並插入樣式；svg 模式由 SSR 輸出內嵌 `<svg>`，這部分 CPU 歸零。
- **文章總覽的標籤篩選區拆成獨立元件（`article-tag-filter.vue`）並閒置時 hydration**，日期改用字串切割、不載入 dayjs。60 個 UButton 不再與 90 篇文章擠在同一個長任務，總覽 TBT 約 320 → 180ms。

## 關鍵 CSS 內嵌（Beasties）

postbuild 的 `critical-css` 步驟（`site/scripts/postbuild/critical-css.ts`）用 [Beasties](https://github.com/danielroe/beasties)（critters 的後繼 fork，`@nuxtjs/critters` 包的舊版已不再維護）處理 `dist` 的每個 HTML：把用得到的 CSS 規則內嵌，完整的 entry.css 改成 `media="print"` 非同步載入。全站共用的 entry.css（壓縮後約 50 KB）原本擋渲染，A/B 結果 FCP、LCP 約提前 0.4～0.7 秒，HTML 增加約 15 KB（gzip），build 多約 30 秒。

- **`allowRules` 不能省。** Beasties 拿 SSR 的 HTML 比對選擇器：`.dark` 是瀏覽器端腳本才加的，不保留的話暗色使用者會先看到亮色樣式；主題外框與 `.vp-doc` 也有不少規則比對不到（搜尋框、`vpi-` 圖示、行內程式碼）。驗證方式：擋掉 `/_nuxt/*.css` 與 `*.js`，只用內嵌 CSS 渲染，與完整樣式截圖比對。
- **aquarium app 頁（`<html class="vp-raw">`）略過**：畫面由 JS 繪製，SSR 的 HTML 幾乎是空的。
- **首次繪製提前後，沒預留空間的圖片會造成版面位移。** 以前擋渲染的 CSS 讓首繪晚於封面下載完成，問題被藏住；現在首繪早於圖片，首頁封面只有 `aspect-ratio` class 而沒有 `width`／`height`，曾造成 CLS 0.09。md 外掛現在會自動補上原圖尺寸（`getImageSizeMap`）。
- **讀圖片尺寸不要用 sharp。** build 程序若先載入 sharp，Nitro 預先渲染時 ipx 再載入自己那份會失敗（`Could not load the "sharp" module`），所有圖片回 500。改用只讀檔頭的 `image-size`。

**研究過但沒採用**

- **nuxt-delay-hydration**：延到第一次互動才 hydration，宣稱可大幅降低 TBT。目前 TBT 已約為正式站一半，而延後 hydration 會讓搜尋快捷鍵、圖版帶等互動在首次互動前無效，風險大於效益。
- **Cloudflare Early Hints**：Cloudflare 會自動把 HTML 裡的 preload 轉成 103 回應，部署後即生效，本機無法量測。
- **Speed Brain／Speculation Rules**：只加速後續換頁，不影響首次載入；官方文件註明不支援 pages.dev。
- **Vue Vapor 模式**：Nuxt 4.6 僅實驗性 interop 支援，需 Vue 3.6 RC，hydration 仍在修正。

## 快取梗圖與 aquarium app 頁的載入（2026-11）

aquarium 各 app 的畫面完全由 JS 繪製，與文章頁的取捨相反。

- **app 頁補回關鍵 chunk 的 modulepreload**（postbuild 的 `standalone-preload`）：全站不輸出 modulepreload 後，app 頁變成「入口 → Vue → app 本體」三段瀑布。只預載入口與頁面底下 50KB 以上的大 chunk；全部依賴都預載反而更慢（3D app 近 300 支小 chunk 一起搶頻寬，HexaZen 的 TBT 從約 280 暴增到約 2000ms）。
- **md 的延遲 hydration 改寫跳過 `layout: false` 的頁面**：app 元件就在首屏，延遲的話要等 hydration 後偵測到可見才下載 app 本體。
- **不要用 `useRafFn` 每幀讀版面尺寸**：`use-sticky-toolbar` 原本每幀讀 `innerHeight`、`visualViewport` 並量工具列高度，載入期間每幀都強制同步排版、閒置時也每秒跑 60 次。改成監聽 visualViewport 的 resize／scroll、視窗 resize、focusin／focusout，工具列高度用 `useResizeObserver`。
- **Nuxt UI 的 Toast 預設帶倒數進度條**，停留期間每一幀都重新渲染。歡迎提示改成 `progress: false`，並延到 `requestIdleCallback` 才顯示（原本整個 toast 佔約 400ms，4 倍降速）。
- **虛擬清單 overscan 從預設 5 列降到 2 列**，首屏同時下載的梗圖與要渲染的卡片少一半以上；廣告掛載距離同步加大，總提前量維持約 8 列，不影響廣告備妥時間。
- **找元件層級的成本用「含子呼叫的總時間」**：只看函式自身時間，Vue 的渲染成本會散在 `mergeProps`、`updateProps` 等內部函式裡，看不出是哪個元件；沿呼叫鏈往上歸到 `.vue` 檔，toast 的成本才浮現。
