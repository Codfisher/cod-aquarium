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
- **新檔明明在，卻一直 `Failed to resolve import`**：先在共用檔加了 import、幾秒後才建立被引用的檔案，Vite 解析失敗時記住了「這個資料夾沒有這支檔」。Windows 上新增檔案的事件會漏，快取不更新，強制重新整理、touch 引用它的檔或它本身都沒用。把新檔移出資料夾再移回來（觸發一次刪除加新增）就好，不必重開 dev server。避免的方法是先寫好新檔、最後才加 import。
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
- **第三方腳本（gtag、Clarity、AdSense）延後到互動或閒置才載入。** 正式站封鎖第三方後，短文手機分數 86 → 99、LCP 2697 → 1425 ms、TBT 324 → 106 ms，LCP 的 render delay 由 295 降到 13 ms，代表三支腳本在首屏期間佔住主執行緒（TBT 各約 60～130 ms）。`nuxt.config.ts` 的 head inline script 改為「首次互動（`pointerdown`、`keydown`、`scroll`、`touchstart`，passive、once）」與「load 後 3.5 秒再 `requestIdleCallback`（timeout 4 秒）」兩者先到者觸發，各腳本只載入一次；互動若早於 load，等 load 後再載。gtag 的 `dataLayer` stub 與 `gtag("config")` 仍在 head 同步執行，事件先累積，pageview 在 gtag.js 載入後照送。
  - 副作用：Lighthouse 不會互動，3.5 秒的閒置計時可能落在量測窗內，載入發生在量測後段時 TBT 仍會被算到；實際使用者多半在這之前就有互動。
  - **三支腳本要錯開，不能同一刻載入。** 第一版上線後短文手機 LCP 2697 → 1916 ms，TBT 卻 324 → 543 ms：三支在約 4.6～4.9 秒同時下載、執行，擠成長任務。現在觸發條件不變，觸發後 gtag 立刻載入，載完（`onload`／`onerror`，被擋掉也會往下走）再等 1.5 秒以 `requestIdleCallback` 載入 Clarity，Clarity 之後再等 1.5 秒同樣以 rIC 載入 AdSense（只有沒有廣告欄位的 auto ads 頁面；互動觸發時照舊一定載入）。廣告欄位進入視窗（600px）的路徑仍呼叫 `window.__loadAdsense()` 即時載入，不受錯開影響。
  - AdSense 除了互動與閒置，廣告欄位 `google-adsense.vue` 會在接近視窗（`rootMargin: 600px`）時呼叫 `window.__loadAdsense()` 立即載入。`adsbygoogle` 陣列支援先 push 後載入，元件掛載時照常 push，腳本就緒後才消化。閒置觸發時若頁面已有 `ins.adsbygoogle`，改由欄位元件或互動觸發，沒有欄位的頁面（auto ads）才靠閒置載入。
- **信箱不要輸出成 HTML 明文，否則 Cloudflare 會注入擋渲染的 `/cdn-cgi/scripts/.../email-decode.min.js`。** 這是 Cloudflare 的 Email Address Obfuscation，掃到 HTML 內的信箱（含 `mailto:`）就會改寫並在頁面引入解碼腳本。現在所有信箱連結改用 `web/components/mail-link.vue`：信箱只在 client 掛載後才組出，prerender 的 HTML 不含明文，畫面與點擊行為不變；md 內用 `<mail-link>寫信</mail-link>`，不給 slot 就顯示信箱本身。注意 `site/constants.ts` 的 `COPYRIGHT` 含明文，只給 RSS 使用，網頁頁尾走 `COPYRIGHT_TEXT`／`COPYRIGHT_NAME`；元件內的信箱不能 import `site/constants.ts`（含 node 模組，會讓 client 報 `fileURLToPath is not a function`）；新增信箱連結不要直接寫 `mailto:hi@...`。驗證：`grep -rl "hi@codlin.me" dist --include=*.html` 應無結果。
- **`/_nuxt/builds/*` 的 `Cache-Control` 被 Cloudflare 串成多段。** `_headers` 由 Nitro 依 Nuxt 的 route rules 產生（`/_nuxt/builds/meta/*`、`/_nuxt/builds/*`、`/_nuxt/fonts/*`、`/_nuxt/*`），Cloudflare Pages 不會讓內層覆寫外層，而是把所有符合的規則值串起來：meta json 變三段、`latest.json`（部署偵測入口）變成「`max-age=1` 加 `max-age=31536000, immutable`」。`site/scripts/postbuild.ts` 新增 `headers` 步驟，把 `/_nuxt` 的規則改寫成外層一條、內層以 `! Cache-Control` 先移除再設定：`/_nuxt/*` 一年 immutable、`/_nuxt/builds/*`（`latest.json`）`max-age=1, must-revalidate`、`/_nuxt/builds/meta/*`（檔名帶 buildId、內容不變）一年 immutable。
- **hexazen 教學影片不要一開頁就下載。** `bulletin-modal.vue` 的 UCarousel 會一次渲染所有步驟，三支 mp4 約 2.6 MB 全部 autoplay 下載。改為 `preload="none"`，並以 Carousel 的 `@select` 記錄走到的最大步驟，只對已輪播到的步驟設定 `src`。
- **meme-cache 的圖片編輯器不要隨頁面本體載入。** `ImgEditorModal` 原本靜態匯入、常駐掛載，拉進 interactjs、snapdom、zod、colord 等，頁面本體 chunk 肥大（gzip 約 123 KB），首屏的 JS 與擋渲染的 CSS 搶頻寬（只擋掉那支 chunk，慢速 4G＋CPU 4 倍的 LCP 由約 2.45 秒降到約 1.80 秒）。現在 `defineAsyncComponent`，第一次開啟才以 `v-if="editorMounted"` 掛載、之後不卸載，所以關閉動畫與編輯狀態照舊；資料載完且 `requestIdleCallback` 時預取 chunk（Safari 沒有 rIC，改 3 秒後），首次開啟不必等下載（實測點擊前 chunk 已載入、點擊後沒有新請求）。`standalone-preload` 的 `PRELOAD_SKIP_KEY_LIST` 要排除它，否則頁面 chunk 的 `dynamicImports` 會被整批加進 modulepreload，白拆。meme-cache 頁面本體預載的 chunk 現為 4 支、gzip 合計約 105 KB，編輯器的 93 KB 拆成獨立 chunk。
- **只在 client 渲染的圖示會打 api.iconify.design，要用 `icon.clientBundle` 打包。** svg 模式下 SSR 的圖示是內嵌 `<svg>`，但 client-only 的 app、延遲載入的元件在瀏覽器端才渲染，圖示沒打包就向 Iconify API 即時請求（meme-cache 3 次、文章頁的上下篇箭頭 1 次，每次是跨網域連線加往返）。`nuxt.config.ts` 的 `icon.clientBundle.scan` 掃描 `app/`、`web/`、`content/aquarium/meme-cache/` 的 `.vue`／`.ts`，目前約 68 個圖示。**增量：全站共用的圖示 chunk 由 32 KB（gzip 9.7 KB）變 64 KB（gzip 18.9 KB），每頁 +約 9 KB gzip，CPU 只多約 5 ms（4 倍降速）。** 範圍刻意不含其他 aquarium app（含它們就是整包進每一頁），所以 codmarbles、hexazen 等頁仍有少量圖示請求；要補的話在掃描範圍加上該目錄，或在 `clientBundle.icons` 明列。驗證：在 preview 開首頁、文章頁、meme-cache，`performance.getEntriesByType('resource')` 不應有 iconify 請求。
- **client-only 的 app 頁，首屏要有 fallback，而且 `defineAsyncComponent` 要關 `suspensible`。** codmarbles、hexazen 的 `index.md` 原本是沒有 fallback 的 `<client-only>`，載入畫面在 app 本體裡，而本體靜態匯入整個 Babylon（約 2.4 MB JS），慢速 4G＋CPU 4 倍要約 16 秒才看到任何東西。現在 `#fallback` 輸出載入畫面（codmarbles 沿用 `loading-overlay.vue`，hexazen 新增 `components/loading-screen.vue`，兩者都不匯入 Babylon），FCP 約 16 秒 → 約 1.5 秒。有兩個陷阱：
  - ClientOnly 掛載後就把 fallback 換成預設 slot，但 slot 裡的是非同步元件，本體載完前畫面是空白的（實測 hydration 後約 12 秒）。`defineAsyncComponent` 在 Nuxt 頁面內預設 `suspensible: true`，載入交給外層 Suspense，`loadingComponent` 根本不會顯示，所以要 `{ loadingComponent, delay: 0, suspensible: false }`，讓載入中繼續顯示同一個載入畫面。
  - fallback、載入中、app 內三處各有一份載入畫面，彈珠動畫要接得上：`loading-overlay.vue` 的 Web Animation 一律把 `startTime` 設 0（文件時間軸原點），相位只由當下時間決定，新舊實例永遠同步；載入文字用 `useState` 讓 SSR 與三處顯示同一句（隨機文字會 hydration 不一致）。彈跳由 `top` 改 `translate`，否則每幀都算一次 CLS（載入畫面顯示久了會累積到 0.016）。
- **codmarbles 的資產快取。** Cloudflare 對 `/assets/*` 靜態檔預設 `max-age=0, must-revalidate`，每個零件實例各自 `ImportMeshAsync`，同一個 gltf 重複請求（cone.gltf 31 次），開一次賽道就有約 870 次 304 往返。`content/public/_headers` 對 `/assets/kay-platformer-pack/*`（codmarbles 專用）與 `/assets/textures/*`（codmarbles、hexazen 共用的小檔）設 `public, max-age=86400, stale-while-revalidate=604800`；`/assets/*` 底下其他資料夾是 enderbox、minespace、hexazen 在用，沒動。`postbuild` 的 `headers` 步驟只改寫 `/_nuxt` 的規則，不受影響（部署後以 `curl -sI` 確認沒有被串成多段）。
  - **`preloadTrackAssets` 移除。** 它載入 94 個 container 卻沒被用到（`track-segment` 註解掉了，原因寫「FPS 下降原因不明」），`assetCache` 的 key 也不一致（`set(partData.path)` vs `has(fullPath)`）。本機 preview、慢速 4G＋CPU 4 倍、冷快取，量「app 的 JS 到齊後到載入畫面消失（賽道建好）」，各 3 次：保留預載 158.2／158.5／158.1 秒，移除後 133.0／133.4／133.0 秒，移除的快 25 秒，請求數也少約 270 個（1569 → 1302）。沒有不變慢，所以移除；key 不一致一併消失。
  - **後續（第三批）已改為每個模型只載一次 AssetContainer，再複製成實例，見「第三批修正」。**

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
- **情緒分類頁** `/aquarium/meme-cache/emotion/<slug>`：`emotion/[emotion].paths.ts` 依 `EMOTION_LIST` 每種情緒產生一頁，列最新 60 張（`EMOTION_PAGE_MEME_LIMIT`），沒有迷因的情緒不產生頁面。標題、描述與版面設定都由 `config.mts` 的 `transformPageData` 依路由參數寫入，`[emotion].md` 刻意不寫 frontmatter：動態路由會在內容開頭插入參數前綴，vitepress-plugin-llms 再把提示塞在前綴與 frontmatter 之間，frontmatter 就會解析失敗、整段 YAML 印在頁面上。描述要同時寫 `pageData.description`，`<meta name="description">` 讀的是它而不是 frontmatter。VitePress 1.6 的動態路由不支援 `watch`，dev 時改 ndjson 要重啟。頁面的 CTA 帶 `?emotion=` 進 app，app 會套用對應篩選。這些頁面經過 VPDoc，但 `aquarium/` 底下一律不進站內搜尋（VPDoc 的 `isSearchIndexed`），否則梗圖描述會混進文章搜尋結果。
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

- Build command：`git fetch --unshallow && pnpm run build`（Cloudflare 預設淺層 clone，sitemap 的 lastmod、文章的更新日期都靠完整的 git 歷史）
- Build output directory：`dist`
- 2026-11 從 VitePress 換成 Nuxt 時，用 `cf pages edit` 把原本的 `npx vitepress build`、`.vitepress/dist` 改成上面的設定；pnpm 版本由 `package.json` 的 `packageManager` 決定（Cloudflare 內建的 pnpm 會自動切換），Node 版本由 `.node-version` 決定

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
- **共用封面的系列**：專欄常整個系列用同一張封面。同系列被多篇共用的封面，非目前這版會疊一層「版號＋短標題」的版號圖版（短標題取標題冒號後的部分），目前這版圖層淡出、顯示封面。底下的 img 照樣保留，換頁時放大過程不中斷。之後某篇改用自己的封面，就會自動顯示圖片。
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

**第二批修正的 A/B（2026-11）**

改動：第三方腳本錯開、meme-cache 編輯器延遲載入、clientBundle 圖示、codmarbles／hexazen 首屏載入畫面、codmarbles 資產快取與移除預載。本機 preview 對正式站（改動前的 main），CPU 4 倍、暖快取、封鎖廣告與分析腳本，手機與桌機各 4 輪取中位數，單位 ms（TBT／長任務總和）：

| 頁面 | 桌機 TBT | 桌機長任務 | 手機 TBT | 手機長任務 |
| --- | --- | --- | --- | --- |
| 短文 | 160 → 182 | 687 → 743 | 190 → 211 | 627 → 703 |
| 長文 | 196 → 212 | 739 → 803 | 214 → 231 | 684 → 728 |
| 首頁 | 340 → 368 | 490 → 518 | 288 → 251 | 413 → 351 |
| meme-cache | 663 → 754 | 988 → 1104 | 654 → 684 | 1004 → 1034 |

- 差異都在雜訊內（單次 TBT 分佈約 ±80 ms），與預期相符：廣告分析腳本被封鎖、本機又不經 CDN，這批的效益不在這個量測條件裡。**絕對的 FCP／LCP 不能比**，本機伺服器沒有 CDN 往返，FCP 固定快 200～300 ms，與改動無關。
- 第三方腳本錯開要在正式站用 Lighthouse（不封鎖第三方）驗證；本機 preview 實測無互動時的請求時間：gtag 3.9 秒、Clarity 5.6 秒（gtag 之後 1.7 秒）、AdSense 7.1 秒（再 1.5 秒），有廣告欄位的頁面（meme-cache）AdSense 在 0.6 秒由欄位觸發，不受影響。
- codmarbles、hexazen 慢速 4G＋CPU 4 倍、冷快取（手機與桌機各 3 輪）：FCP 約 15.3～15.7 秒 → 約 1.5 秒。LCP 沒有改善（15.3 → 15.8 秒、17.9 → 18.5 秒）：後段的 LCP 是 app 本體畫出的 UI（提示框文字），本機伺服器又慢約 0.5 秒，載入畫面不會是 LCP 的最大元素。hexazen 的 CLS 由 0.021 降到 0（推測是原本 app 掛載時畫面從空白變成有內容）。
- 這個量測沒有量到的是第三方腳本錯開、meme-cache 頁面 chunk 變小（編輯器 93 KB gzip 不再與 CSS 搶頻寬）的效益，要看上線後的 Lighthouse（不封鎖第三方，手機，各 3 次取中位數，與上一批上線後比較）：

| 頁面 | 分數 | LCP | TBT |
| --- | --- | --- | --- |
| 短文 | 85 → 95 | 1916 → 1919 ms | 543 → 208 ms |
| 長文 | 82 → 91 | 2074 → 2061 ms | 600 → 287 ms |
| 首頁 | 80 → 90 | 2295 → 2061 ms | 664 → 331 ms |
| meme-cache | 70 → 78 | 3609 → 3003 ms | 511 → 483 ms |

  TBT 的下降來自三支第三方腳本錯開，LCP 持平代表上一批的收益沒有被抵銷。meme-cache 的 TBT 變化小，它本身的長任務主要來自 app 的 hydration 與清單渲染，不是第三方腳本。codmarbles、hexazen 上線後以同樣的手機條件（慢速 4G＋CPU 4 倍、封鎖第三方）量到 FCP 約 1.9 秒、CLS 0.002／0.007。

**量測陷阱**

- 本機伺服器對 `Cache-Control: no-cache`、即時壓縮，FCP 與正式站不可比；改動對 FCP 的影響要用「同一個伺服器、兩個版本」的方式分離（做法見關鍵 CSS 的試驗：把 build 的 HTML 另存一份，用 Node 靜態伺服器同時提供兩種版本）。
- meme-cache 首屏圖片是 build 時隨機挑的 10 張，每次 build 的圖片大小不同，LCP 會因為挑到較大的圖片而差數百毫秒，不能拿來比較兩次 build。
- Git Bash 會把 `/blog-vue/...` 這類參數轉成 Windows 路徑，跑量測腳本要加 `MSYS_NO_PATHCONV=1`。
- 鏡像代理（Node http2）不做串流優先權排序，CSS 與 JS 平分頻寬，會放大「預載太多 chunk」的傷害；方向可信，絕對值會比 CDN 悲觀。
- 先看 LCP 候選清單（每個候選的元素與時間），再看 Chrome trace 的 Layout 與 v8 解析，比只看總 TBT 更快找到原因。

## 升級 Nuxt 4.7（2026-11）

Nuxt 4.6.4 → 4.7.0，同時升級 Nuxt UI 4.13.1、Nuxt SEO 各模組與 Vue 3.5.46。本站是 `cloudflare-pages-static` 靜態輸出，官方宣傳的 SSR 吞吐量、`experimental.staticRoutes`、Nitro v3 都用不到；預期收益在前端：水合前載入的檔案變少、V8 compile hints、靜態內部 `<NuxtLink>` 直接輸出 `<a>`（官方量測 Nuxt UI 首頁 TBT 276 → 180 ms）。實際效益要以上線後的 Lighthouse 與前幾批比較。

- **Node 版本下限提高**：`^22.22.3 || ^24.15.0 || >=26`。`.node-version` 寫的是 `24`，Cloudflare 會裝 24 的最新版。
- **新版剛發布時 pnpm 會擋安裝**：`pnpm-workspace.yaml` 設了 `minimumReleaseAge`，明確指定版本安裝時 pnpm 會把套件自動加進 `minimumReleaseAgeExclude`。等這些版本超過等待期，就可以把清單清掉。
- **pinia 至少要 3.0.4**：Nuxt 內部用的 vue-router 5 要求 `pinia@^3.0.4 || ^4.0.2`。專案自己的 `vue-router` 還是 4.x（`app/router.options.ts` 等處直接匯入），這次沒有動。
- **模板檢查**：4.7 起，靜態 `to` 對不到任何頁面的 `<NuxtLink>` 會出現 `NUXT_B4025` 警告；要關掉就設 `experimental.templateDiagnostics: false`。

**上線後 Lighthouse（手機、不封鎖第三方，交替量 3 次取中位數）**

建置只花 4 分鐘，量測前舊版就已下線，所以改量兩次部署各自的 pages.dev 網址：舊版 `1bbd749b.cod-aquarium.pages.dev`，新版 `4f3c0145.cod-aquarium.pages.dev`。兩邊網域型態相同，可以直接比較。短文是 `/blog-vue/vue-trigger-ref-problem`，長文是 `/blog-program/effect-ts-in-real-projects`。

| 頁面 | 分數 | TBT | LCP | 請求數 | 傳輸量 | JS 執行時間 |
| --- | --- | --- | --- | --- | --- | --- |
| 首頁 | 86 → 94 | 358 → 96 ms | 3039 → 2811 ms | 91 → 43 | 665 → 435 KB | 700 → 321 ms |
| 短文 | 86 → 94 | 307 → 88 ms | 3108 → 2741 ms | 85 → 39 | 627 → 402 KB | 643 → 268 ms |
| 長文 | 91 → 97 | 175 → 34 ms | 2738 → 2504 ms | 77 → 33 | 784 → 574 KB | 621 → 225 ms |
| meme-cache | 81 → 75 | 449 → 589 ms | 2894 → 3052 ms | 115 → 85 | 1391 → 1365 KB | 1551 → 1570 ms |

- 首頁與文章頁的 TBT 降 70～80%，請求數與 JS 執行時間都減半，3 輪方向一致。只換了框架版本就有這個幅度，比官方範例（Nuxt UI 首頁 -35%）還大。
- meme-cache 看不出差別：舊版 3 輪 TBT 落在 361～929 ms，新版落在 387～614 ms，起伏大於版本差。這頁的成本在 app 本身的 hydration 與清單渲染，不在框架；LCP 受首屏隨機梗圖影響（見量測陷阱）。
- **之後要比較兩個版本時，用各次部署的 pages.dev 網址交替量測**，不必趕在新版上線前量舊版。部署網址用 `cf pages deployments list --project-name cod-aquarium --env production` 查詢。

## 圖片：Nuxt Image 與 theme-image

站內圖片一律交給 Nuxt Image（`@nuxt/image`，ipx）。`nuxt generate` 時，SSR 用到的每個尺寸都會透過 `x-nitro-prerender` 產生成 `/_ipx/...` 靜態檔，不用另外列路由。

例外是頁面上沒有對應 `<img>` 的網址，要自己加進 prerender。目前只有站內搜尋的封面縮圖（Pagefind 結果左側 48px）：
- 網址由 `site/search-thumbnail.ts` 統一產生（`/_ipx/q_80&s_96x96/...`），`modules/site.ts` 把每頁的縮圖加進 prerender 清單。
- 同一個網址也寫進頁面資料的 `searchThumbnail`，VPDoc 再以 `data-pagefind-meta="thumbnail:..."` 帶進索引。
- 封面檔不存在或是草稿時不給縮圖，否則預先渲染會 404，讓 build 失敗。
- 不用 Pagefind 預設的 `image` meta：它抓內容區第一張圖，圖版頁的封面不在內容區。

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

postbuild 的 `critical-css` 步驟（`site/scripts/postbuild/critical-css.ts`）用 [Beasties](https://github.com/danielroe/beasties)（Google Critters 交給 Nuxt 團隊後的後繼 fork）處理 `dist` 的每個 HTML：把用得到的 CSS 規則內嵌，完整的 entry.css 改成 `media="print"` 非同步載入。全站共用的 entry.css（壓縮後約 50 KB）原本擋渲染，A/B 結果 FCP、LCP 約提前 0.4～0.7 秒，HTML 增加約 15 KB（gzip），build 多約 30 秒。

- **不用 `@nuxtjs/critters` 模組，直接呼叫 Beasties。** 那個模組底層也是 Beasties（0.10 起唯一相依），效能相同，但它沒有排除頁面的選項，會整站處理。aquarium 各 app 頁（`layout: false`）的 SSR HTML 幾乎是空的，畫面靠 JS 繪製，完整 CSS 改成非同步載入後，app 啟動時可能還沒有樣式，造成閃爍或量錯尺寸，所以要跳過（以 `<html class="vp-raw">` 判斷）。換模組也得自己寫 Nitro hook 才能排除，程式碼不會比較少。2026-11 評估後決定維持現狀。
- **`allowRules` 不能省。** Beasties 拿 SSR 的 HTML 比對選擇器：`.dark` 是瀏覽器端腳本才加的，不保留的話暗色使用者會先看到亮色樣式；主題外框與 `.vp-doc` 也有不少規則比對不到（搜尋框、`vpi-` 圖示、行內程式碼）。驗證方式：擋掉 `/_nuxt/*.css` 與 `*.js`，只用內嵌 CSS 渲染，與完整樣式截圖比對。
- **aquarium app 頁（`<html class="vp-raw">`）略過**：畫面由 JS 繪製，SSR 的 HTML 幾乎是空的。
- **首次繪製提前後，沒預留空間的圖片會造成版面位移。** 以前擋渲染的 CSS 讓首繪晚於封面下載完成，問題被藏住；現在首繪早於圖片，首頁封面只有 `aspect-ratio` class 而沒有 `width`／`height`，曾造成 CLS 0.09。md 外掛現在會自動補上原圖尺寸（`getImageSizeMap`）。
- **讀圖片尺寸不要用 sharp。** build 程序若先載入 sharp，Nitro 預先渲染時 ipx 再載入自己那份會失敗（`Could not load the "sharp" module`），所有圖片回 500。改用只讀檔頭的 `image-size`。

**研究過但沒採用**

- **nuxt-delay-hydration**：延到第一次互動才 hydration，宣稱可大幅降低 TBT。目前 TBT 已約為正式站一半，而延後 hydration 會讓搜尋快捷鍵、圖版帶等互動在首次互動前無效，風險大於效益。
- **Cloudflare Early Hints**：Cloudflare 會自動把 HTML 裡的 preload 轉成 103 回應，部署後即生效，本機無法量測。
- **Speed Brain／Speculation Rules**：只加速後續換頁，不影響首次載入；官方文件註明不支援 pages.dev。
- **Vue Vapor 模式**：Nuxt 4.6 僅實驗性 interop 支援，需 Vue 3.6 RC，hydration 仍在修正。
- **精簡內嵌 CSS 裡沒用到的自訂屬性（2026-11 試驗，已撤掉）**：文章頁 HTML 內嵌的 `<style>` 約 151 KB，其中 Beasties 內嵌的那一大塊約 84 KB，自訂屬性宣告佔約 30 KB（`--vp-c-*`、`--vp-code-*`、各 `.vpi-*` 圖示的 `--icon` 等）。試做用 postcss 解析每個 `<style>`，保留「任一內嵌規則或元素 `style` 屬性有 `var(--x)` 引用」的自訂屬性，並遞迴展開變數引用變數（另保留 JS 用 `getPropertyValue` 讀的 `--vp-nav-height`）。實際只能砍掉約 22 KB 解壓後（HTML brotli 少約 3.5 KB、約 9%），因為 `allowRules` 整組保留的 `.VP`、`vpi-`、`.vp-doc` 規則本身就用到大半變數。**兩個內嵌版本用同一個本機伺服器（brotli、慢速 4G、CPU 4 倍、暖快取、手機與桌機各 6 輪取中位數）比較：** FCP 只快 12～38 ms（雜訊範圍），樣式重算（`RecalcStyleDuration`）反而多 60～95 ms、主執行緒總工作量多 40～165 ms，沒有明顯改善，所以撤掉不上線。要再嘗試的方向是縮小 `allowRules`（例如 `vpi-` 只留頁面實際用到的圖示），而不是修剪變數。

## 快取梗圖與 aquarium app 頁的載入（2026-11）

aquarium 各 app 的畫面完全由 JS 繪製，與文章頁的取捨相反。

- **app 頁補回關鍵 chunk 的 modulepreload**（postbuild 的 `standalone-preload`，頁面不需要的功能以 `PRELOAD_SKIP_KEY_LIST` 排除，目前只有 meme-cache 的圖片編輯器）：全站不輸出 modulepreload 後，app 頁變成「入口 → Vue → app 本體」三段瀑布。只預載入口與頁面底下 50KB 以上的大 chunk；全部依賴都預載反而更慢（3D app 近 300 支小 chunk 一起搶頻寬，HexaZen 的 TBT 從約 280 暴增到約 2000ms）。
- **md 的延遲 hydration 改寫跳過 `layout: false` 的頁面**：app 元件就在首屏，延遲的話要等 hydration 後偵測到可見才下載 app 本體。
- **不要用 `useRafFn` 每幀讀版面尺寸**：`use-sticky-toolbar` 原本每幀讀 `innerHeight`、`visualViewport` 並量工具列高度，載入期間每幀都強制同步排版、閒置時也每秒跑 60 次。改成監聽 visualViewport 的 resize／scroll、視窗 resize、focusin／focusout，工具列高度用 `useResizeObserver`。
- **Nuxt UI 的 Toast 開著時不要用內建倒數，圖示也不要用動畫版。** 歡迎提示延到 `requestIdleCallback` 才顯示，細節見「第三批修正」。
- **虛擬清單 overscan 從預設 5 列降到 2 列**，首屏同時下載的梗圖與要渲染的卡片少一半以上；廣告掛載距離同步加大，總提前量維持約 8 列，不影響廣告備妥時間。
- **找元件層級的成本用「含子呼叫的總時間」**：只看函式自身時間，Vue 的渲染成本會散在 `mergeProps`、`updateProps` 等內部函式裡，看不出是哪個元件；沿呼叫鏈往上歸到 `.vue` 檔，toast 的成本才浮現。

## 第三批修正：meme-cache toast 與 codmarbles 賽道建構（2026-11）

**meme-cache：歡迎 toast 是載入後穩態 CPU 的最大來源**

用 sourcemap＋CDP CPU profile（4 倍降速）定位：載入完 5～9 秒間主執行緒仍有約 40% 忙碌，Vue 執行環境自耗最多，往上歸屬到 `Toast.vue`、`Button.vue`。toast 開著的 3 秒約忙 1000～1450ms，關掉後只剩約 130ms。兩個原因：

- Reka UI 的 `ToastRootImpl` 以 `useRafFn` 每幀更新 `remaining`，slot 因此每幀重繪整個 toast（含按鈕），`progress: false` 擋不住。改為 `duration: 0`（不倒數），自己用 VueUse `useTimeoutFn` 在 12 秒後 `toast.remove(id)`。代價是滑鼠停在 toast 上不會暫停計時。
- `line-md:emoji-grin`、`line-md:uploading-loop` 是持續播放的動畫 SVG，兩個就讓每 2 秒多約 250ms。改為靜態的 `lucide:smile`、`lucide:upload`，toast 內不要再放動畫圖示。

結果（本機 preview，手機 CPU 4 倍，3 秒窗內主執行緒忙碌時間）：toast 開著的第二個窗約 1000 → 150～180ms，與 toast 關掉後（約 125ms）相同。

A/B（本機 preview 對改動前的 build，CPU 4 倍、暖快取、封鎖第三方，各 4 輪中位數，ms）：

| | TBT | 長任務總和 | LCP |
| --- | --- | --- | --- |
| 桌機 | 664 → 577 | 1014 → 952 | 554 → 472 |
| 手機 | 681 → 635 | 1081 → 960 | 500 → 476 |

TBT 差異在雜訊內（上一輪只改 rAF 時是 565 → 573、524 → 520），因為每幀的工作都小於 50ms，不算長任務。效益在載入後持續的主執行緒與耗電，Lighthouse 看不出來，所以不用期待分數變動。

沒有找到值得改的其他項目：首屏 Vue hydration、`use-meme-data` 解析 ndjson（約 160ms）、Nuxt UI 的 Button（約 140ms）都是一次性且分散，沒有單一元件佔大頭。

**codmarbles：每個模型只載入一次**

量測（本機 preview，慢速 4G＋CPU 4 倍，真 GPU 的 headed Chrome，app JS 到齊後到載入畫面消失）：

| | 之前 | 之後 |
| --- | --- | --- |
| 冷快取（3 次） | 121.4／121.3／121.6 秒 | 30.3／30.1／30.5 秒 |
| 暖快取（3 次） | 121.2／121.5／121.4 秒 | 30.3／30.2／30.1 秒 |
| 賽道資產請求數 | 1304 | 269 |

本機 wrangler 不快取，所以暖冷相同；正式站有 `max-age=86400`，暖快取會更快。原因是重複請求與重複解析：94 個不同 gltf、454 個零件，原本每個零件各自 `ImportMeshAsync`（各自請求、解析、建材質）。現在 `loadContainer` 以 Promise 快取，每個模型 `LoadAssetContainerAsync` 一次，零件以 `instantiateModelsToScene(…, false, { doNotInstantiate: true })` 複製（共用材質與幾何，不用 InstancedMesh，行為與原本一致）。

- **FPS 沒有下降。** headed Chrome、真 GPU、不限幀率、同視角量 10 秒，各 3 次中位數：舊版 89.3 → 新版 101.6 FPS；CPU 4 倍 24.3 → 28.2 FPS。繪製呼叫數、可見網格數相同（506、133）；材質由 455 個減為 110 個，是 FPS 較高的原因。原註解「FPS 大幅下降，原因不明」無法重現，推測是當時把 container 內的原始網格也加進了場景，造成重複繪製。
- **`getChildMeshes()[0]` 不等於原本的 `meshes[1]`。** 多網格模型（如 `lever_floor`）順序會互換，物理與材質調整會掛到錯的零件。現在在 container 載入時記下 `meshes[1]` 在階層中的位置（`geometryMeshIndex`），複製體階層與來源相同，用同一個位置取回。驗證：872 個網格的位置、包圍盒、頂點數、物理 body 與形狀類型、材質數值、是否凍結，與舊版逐項一致。
- **Windows 上用真 GPU 跑 Chrome 的旗標**：預設會落到 SwiftShader 或 WARP。要 `--use-angle=vulkan --enable-features=Vulkan --disable-gpu-compositing --ignore-gpu-blocklist`；少了 `--disable-gpu-compositing`，GPU 行程會反覆崩潰，Babylon 報 `WebGL not supported`。量不限幀率的 FPS 再加 `--disable-frame-rate-limit --disable-gpu-vsync`。
- Resource Timing 預設只存 250 筆，量 codmarbles 要先 `performance.setResourceTimingBufferSize(20000)`，否則賽道資產請求一筆都看不到。

**沒採用**：物理形狀的共用（Havok 的 mesh shape 每個 body 各建一個）。該段在 profile 上自耗只有約 70ms，不值得擔行為風險。

**上線後 Lighthouse（手機、不封鎖第三方，各取中位數，與第二批上線後比較）**

| 頁面 | 分數 | LCP | TBT |
| --- | --- | --- | --- |
| meme-cache（3 次） | 78 → 76 | 3003 → 3323 ms | 483 → 495 ms |
| 短文（3 次） | 95 → 91 | 1919 → 1919 ms | 208 → 336 ms |

meme-cache 沒有變化，與預期相符：toast 的成本是載入後的穩態，不在 Lighthouse 的 TBT 內；LCP 差異來自每次 build 隨機挑的首屏梗圖大小（見量測陷阱）。短文的 TBT 變高，但這次沒有動到文章頁的任何程式，三次量測 306～349 ms 都高於上次的 208 ms，推測是第三方腳本載入時機或量測環境的變動，不是這批造成；下次量測再確認。

## Minespace：渲染搬進 Worker（2026-11）

設計與分階段見 [plans/2026-11-25-minespace-render-worker.md](plans/2026-11-25-minespace-render-worker.md)。Babylon 的引擎、世界生成與所有每幀的邏輯都在一支 Dedicated Worker 裡，畫在 `canvas.transferControlToOffscreen()` 交過去的 OffscreenCanvas 上；主執行緒只剩 Vue 介面、輸入擷取、音景（Web Audio 在 worker 裡不存在）、`localStorage`／`sessionStorage` 與 F6 寫入問題紀錄。

**檔案配置**（都在 `content/aquarium/minespace/domains/render-host/`）

| 檔案 | 在哪條執行緒 | 做什麼 |
| --- | --- | --- |
| `protocol.ts` | 兩邊 | 訊息型別與傳輸層介面。只放可結構化複製的資料 |
| `render-runtime.ts` | 渲染端 | 原本 `main-scene.vue` 的初始化、開始漫遊與狀態回報，不依賴 Vue 元件、`window`、`document` |
| `render-worker.ts` | worker | 入口：載入完成通知、能力偵測、時間戳換成 `performance.now`、（開發時）錯誤攔截、把訊息交給 runtime |
| `worker-transport.ts`／`in-process-transport.ts`／`create-render-transport.ts` | 主 | 兩種傳輸層與選擇邏輯 |
| `use-render-host.ts` | 主 | 傳輸層生命週期、尺寸與設定同步、頁面可見性通知、心跳檢查、狀態讀回 |
| `use-render-preference.ts` | 主 | 畫質、材質包、立體紋理開關（`bumpEnabled`）、視野、日出方位、自動換日（`isAutoAdvance`）、日夜流速的持久化（`useStorage`） |
| `use-input-capture.ts` | 主 | 鍵盤、滑鼠、滾輪、pointer lock、觸控，累積後每幀送一次 `input` |
| `render-settings.ts` | 渲染端 | 設定的響應式副本（`useGraphicsQuality`、`useTexturePack`、`useDayNight` 讀它） |
| `render-constants.ts` | 兩邊 | 視野的預設值與範圍。獨立成檔，主執行緒的選單才不必為了兩個數字載入整個 Babylon |
| `composables/performance-reading.ts` | 兩邊 | 效能讀數的型別與區段的英文名稱，理由同上 |

**訊息**：下行 `probe`、`init`、`resize`、`settings`（只送有變的欄位）、`input`、`command`（`start`、`set-control`、`travel`、`set-time`、`add-time`、`toggle-probe`、`toggle-pass-timer`、`cycle-debug-mode`、`request-handoff`、`set-visibility`、`switch-realm`）、`dispose`。上行 `loaded`（worker 入口載入完）、`probe-result`、`ready`（帶場景 id 與世界資料副本給音景用）、`realm-changed`（換場景後的場景 id 與新的世界資料，見下方「場景與世界層」）、`init-error`、`context-lost`、`context-restored`、`frame-status`（約 4 Hz）、`pose`（最高約 30 Hz，人站著不動時不送；給音訊聽者）、`sound`（雷聲）、`log`（錯誤與診斷，成批）、`handoff-snapshot`。

**選傳輸層**

1. 先建 worker，等它送 `loaded`（入口模組求值完）。載入失敗由 `error` 事件處理，只留 120 秒的保底時限；這段不算「不支援」，慢網路上要下載整個 Babylon，可能好幾十秒。
2. 收到 `loaded` 才送 `probe`，讓它開一塊用完即丟的 OffscreenCanvas 試 `webgl2`、確認 `Worker` 存在，答覆的時限只有 5 秒。
3. 通過才 `transferControlToOffscreen`（只能做一次，所以一定要先偵測）。不通過、載入出錯或逾時，就改走 `InProcessTransport`。

`InProcessTransport` 是同一份 runtime 動態載入後直接跑在主執行緒、畫在原本的 canvas 上，訊息排進微任務再送（不是同步呼叫，免得兩邊重入）。網址帶 `?renderer=main` 可強制走退路。

**生命週期與失敗處理**

- 連線要等 worker 載入與能力偵測，元件可能在這段時間卸載。`use-render-host` 用 `AbortController` 與 `isDisposed` 把偵測途中與剛建好的傳輸層收掉，不會留下沒人管的 worker。
- 偵測通過後 worker 的 `error`、`messageerror` 由常駐監聽器轉成 `init-error`。世界還沒 `ready` 就失敗，會換一塊新 canvas（`canvasKey`，舊的已轉移、收不回來）改走主執行緒，並清掉舊的錯誤狀態，且不再回頭試 worker；退路本身也失敗就顯示「初始化失敗」並收掉傳輸層。`ready` 之後的例外只記進紀錄，不蓋畫面：渲染中偶發的例外多半不致命，全螢幕錯誤又收不掉。worker 死掉（例如 OOM 被殺）不會有任何事件，改用 `frame-status` 的心跳逾時偵測，見下方「停住的提示」。
- **背景分頁。** worker 的 `requestAnimationFrame` 不會被瀏覽器降頻（實測背景分頁時主執行緒約 2.5 次／秒，worker 仍是 33 次／秒），不處理的話會在沒人看的分頁裡全速畫圖。主執行緒用 `useDocumentVisibility` 把可見性以 `set-visibility` 通知渲染端：隱藏就 `stopRenderLoop` 並停掉狀態與位姿的計時器，可見再恢復並補送一份狀態。恢復時引擎的 `performanceMonitor.reset()` 要先做：`deltaTime` 是兩次取樣的差，不歸零的話第一幀等於「隱藏了多久」，所有吃 `getDeltaTime`／`getAnimationRatio` 的東西（粒子、雲的演變、羊、風）會被一口氣推進那麼久；歸零後第一幀的 `deltaTime` 是 0，第二幀才是正常值（直接用 Babylon 的 `PerformanceMonitor` 驗證過：沒歸零是 20000 毫秒，歸零後是 0 與 17）。Playwright 底下背景分頁的 `document.visibilityState` 永遠是 `visible`（連原生啟動的 Chrome 以 CDP 連上也一樣），驗證時改為覆寫 `visibilityState` 並派發 `visibilitychange`。
- **停住的提示。** 世界 `ready` 之後、頁面看得到時，主執行緒超過 5 秒沒收到渲染端任何訊息，就顯示一條可關閉、不擋畫面的提示（字句與「初始化失敗」不同）；渲染端恢復或頁面從背景回來，提示自己消失。隱藏期間沒有訊息是刻意的，不計入。被系統殺掉的 worker 沒有事件，這是唯一偵測得到的辦法。
- WebGL 上下文丟失與恢復是一對訊息（`context-lost`、`context-restored`），恢復時提示會收掉。
- 正式版不裝錯誤攔截（Logger 與 console 都維持原樣）；開發時 worker 攔下例外並 `preventDefault`，不會在主執行緒重複回報。巢狀 worker（地形、全局光、雲雜訊）的 `onerror` 也都記完就 `preventDefault`：沒處理的 error 會一路冒到主執行緒，被當成「渲染端死了」而在 `ready` 之前觸發退回主執行緒，開發與正式版的行為會不一致。
- 處理訊息時丟的例外（`start` 時天氣建立失敗之類）在 `render-runtime` 接住並 `console.error`，開發時進紀錄與徽章，正式版印在主控台；引擎建好之後建場景失敗會先 `engine.dispose()` 再往上丟，不留下握著 WebGL 上下文的引擎。

**踩坑**

- **`createSharedComposable` 在 worker 裡不共用。** VueUse 在沒有 `window` 與 `document` 時直接回傳原本的函式，每次呼叫都長出一份新狀態：F4 面板的開關寫進其中一份，渲染端讀的是另外幾份，開關完全沒作用（只有 worker 路徑，退路上正常，所以不容易發現）。`use-dev-toggles` 因此改成模組層級的單例，模組在每條執行緒只求值一次。渲染端可達的程式碼不要再用 `createSharedComposable`；已稽核過，主執行緒專用的 `use-render-preference`、`use-font-loader` 沒問題，`useGraphicsQuality`、`useTexturePack` 早已改成讀 `render-settings` 的模組層級響應式物件。
- **VueUse 在 worker 裡靜默失效。** `useWebWorker`、`useWebWorkerFn` 的 `window` 預設是 `undefined`，沒有 `window` 就整個不動（前者收不到訊息，後者算完不收 worker）。`useWebWorkerFn` 傳 `{ window: globalThis }` 解決；`useWebWorker` 的型別不讓傳，直接改用 `worker.onmessage`。
- **`engine.resize()` 在 worker 裡會越縮越小。** 沒有 `window` 時它讀 `canvas.width` 當 CSS 寬，但那個值已經除過硬體縮放。`setHardwareScalingLevel` 內部也會呼叫它，所以得把引擎實例上的 `resize` 換成「主執行緒量好的 CSS 尺寸 ÷ 縮放倍率」。尺寸一律由主執行緒量，用 `resize` 訊息送。
- **`new Image()`、`CanvasRenderingContext2D` 在 worker 裡不存在。** `pixel-material.ts` 改 `fetch` + `createImageBitmap`，不用 `instanceof CanvasRenderingContext2D`。Babylon 的 `Texture` 在沒有 `HTMLImageElement` 時自己走 ImageBitmap，不必處理。
- **Vue 的 `onBeforeUnmount` 在 worker 裡會警告。** 渲染端的 composable 一律改 `onScopeDispose`，runtime 用一個 `effectScope` 包住建立它們的那一段（要同步，`await` 之後就不在 scope 裡了）。
- **滾輪的 `preventDefault` 必須在主執行緒同步呼叫**，所以滾輪調時刻在主執行緒算好，送 `add-time`。
- **Babylon 在 worker 裡用 `Date.now` 當時間戳。** `PrecisionDate.Now` 沒有 `window` 時退回 `Date.now`：`deltaTime` 只有毫秒解析度，而且會跟著系統時鐘走，時鐘往回撥時是負的。`render-worker.ts` 用 `Object.defineProperty` 把 `Now` 換成 `performance.now()`，漫遊控制器的 `deltaTime` 也加了下限 0。F3 面板「幀距」開啟後第一秒內仍可能出現離譜的數字（第一筆樣本是「現在減零」，等於時間戳本身，Babylon 自己的行為，退路上同樣會出現，過一秒就恢復），不是這次的問題。
- **worker 的錯誤進不了主執行緒的 `window.onerror`。** 渲染端用 `installIssueCapture(self)` 自己攔 `console`、Babylon `Logger` 與全域錯誤，記進待送區，每 250 毫秒成批以 `log` 訊息送回，匯進主執行緒那一份清單（F6 才兩邊都有）。每幀都寫的診斷值只送有變的。
- **問題紀錄不下載，經 Vite 寫進檔案。** 開發模式下主執行緒每出現一種新的錯誤或警告，等 1 秒成批把整份紀錄經 HMR 通道（`import.meta.hot.send('minespace:issue-log')`）送給 dev server，由 `site/plugins/vite-minespace-issue-log.ts` 寫進 `logs/minespace-issues.log`（覆寫成最新一份，`*.log*` 已被 gitignore），終端機印一行摘要；F6 會連同最新次數與執行時狀態再送一次。同一種問題的次數增加不送，免得每幀都冒的警告讓檔案每秒重寫。查 Minespace 的錯誤直接讀這個檔案。
  - 坑：送出的那段（`composables/issue-log-channel.ts`）必須獨立成檔、由 `useErrorLogger` 動態載入。`use-error-logger.ts` 渲染端的 worker 也會載入，用到 `import.meta.hot` 的模組會被 Vite 注入 HMR 客戶端，不能讓 worker 跟著拉進去。
  - 坑：外掛裡的路徑不能用 `server.config.root` 解析。Nuxt 把 Vite 的 root 設成 srcDir（`app/`），第一版因此寫到 `app/logs/`，終端機卻印 `logs/`。改成從外掛檔案的位置（`import.meta.url`）往上推專案根目錄，同 `vite-meme-search-index.ts`。
  - 改了外掛或 `nuxt.config.ts` 要重開 dev server 才生效。
- **合成的 Esc 鍵不會讓瀏覽器解除 pointer lock。** 用 Playwright 驗證選單時，改呼叫 `document.exitPointerLock()` 來模擬。
- **`音景` 這一段不再出現在 F3 面板**：音景搬到主執行緒，渲染端的探針量不到它。

**已知限制與行為**

- **F3 面板量不到主執行緒的成本。** 探針在渲染端，輸入處理、音景更新與 HUD 的重繪都在主執行緒，不在數字裡；面板剛打開的頭半秒顯示「量測中」，不是零。
- 站著不動時 `pose` 不送，音景自己用 250 毫秒的計時器更新（日夜、天氣、會動的音源不靠人移動）。
- 沒有開始漫遊之前，輸入擷取雖然已接上，但鍵盤、滑鼠、滾輪都被 `hasStarted` 擋住，開始面板後面按 Esc 不會鎖住滑鼠。

**驗證**：以 Playwright（headless Chrome、真 GPU，腳本不在版控內）逐項走過開始漫遊、pointer lock、滾輪調時刻、WASD 與跳躍、F3、F6、Tab、選單、材質包、快速前往、視窗縮放、畫質切換重新整理回到原位；worker 與 `?renderer=main` 兩條路都跑過；手機觸控以 CDP 的 `Input.dispatchTouchEvent` 驗證搖桿與視角。同樣走路 8 秒，主執行緒的 rAF 間隔中位數 worker 路徑 17.6 ms、退路 35.2 ms（headless、GPU 為瓶頸，僅供相對比較）。

## Minespace：場景與世界層（2026-11）

設計與分階段見 [plans/2026-11-27-minespace-realms-design.md](plans/2026-11-27-minespace-realms-design.md)。這一節是第一、二階段（世界層與引擎層分離、場景氣氛設定）；第三到五階段（傳送門、遠景、湖中島）見下一節「Minespace：傳送門、遠景與湖中島」。場景清單目前有大廳（禪庭）與湖中島。

**檔案配置**（都在 `content/aquarium/minespace/domains/realm/`）

| 檔案 | 誰引用 | 做什麼 |
| --- | --- | --- |
| `realm-definition.ts` | 三邊 | `RealmDefinition` 與氣氛設定的型別。只放純資料，主執行緒與地形 worker 都讀得到 |
| `realm-list.ts` | 三邊 | 大廳（`HUB_REALM`）與大場景清單（`REALM_ENTRY_LIST`，各場景的定義與大廳那一頭的門）、`getRealm`（認不得的 id 退回大廳）、`getNextRealmId`。各大場景的定義在自己的資料夾，見「Minespace：大場景框架與第一批」 |
| `realm-terrain.ts` | 地形 worker | 場景 id 對應地形生成器。設計文件把生成寫成定義裡的 `generate(state)`，實作拆出來：各箱庭的造景程式有好幾千行，跟著定義被渲染端引用就會打進渲染 worker |
| `active-realm.ts` | 渲染端 | 目前場景的模組層級狀態（`activeRealmState`：`isLooping`、`hasGardens`、氣氛設定、邊界），以及把氣氛設定套上去的函式 |
| `world-layer.ts` | 渲染端 | `generateRealmWorld`（地形 worker）與 `createWorldLayer`（建一整層並回傳 `dispose`） |

**兩層各有什麼**

- 引擎層（`render-runtime` 的 `initialize`／`buildWorld`，整個工作階段只建一次）：引擎、場景、鏡頭、後製、天空、體積雲、日夜、自動曝光、玩家控制器、天氣與粒子、場景深度圖、行進版光束、羊群與燈池的 composable 本身。
- 世界層（`createWorldLayer`，換場景時整層拆掉重建）：方塊資料、材質工廠（`TextureSkinner`，它替每份材質持有貼圖與動畫觀察者，所以跟著方塊走）、區塊網格、水面地圖、水面與焦散的推動者、全局光、燈火光暈、燈池的燈、以及只有大廳有的外圍白沙、水鏡池倒影、羊群、營火（`hasGardens`）。
- 場景深度圖與行進版光束原本夾在世界建立的中間，現在排在第一份世界層之後建。讀它們的地方都在綁定材質時才去拿，建立先後不影響畫面。

**換場景**（`switchRealm`；平常由傳送門觸發，外面包一層霧的轉場 `travelToRealm`，開發模式按 F9 也走同一段）

1. 地形 worker 先生好新的方塊資料，失敗就留在原場景，什麼都還沒拆。
2. 控制器的全局光先拿掉、天氣的濕潤改掛空清單並清掉雨雪的射線快取，再拆舊的世界層。
3. 建新的世界層；建網格失敗就用手上那份舊資料原地建回去。
4. `activateRealm` 換旗標與氣氛設定、控制器 `setWorld`、天氣 `setWorld`（濕潤重掛、射線快取再清一次）、人放到出生點並套用出生朝向。
5. 送 `realm-changed`，主執行緒更新 `realmId` 與 `worldState`，音景看著 `worldState` 整份重建（音源清單依場景挑，見 `createEmitterList`）。

日夜、天氣、控制器不重建：它們疊在同一份大氣狀態上，順序是觀察者掛上去的順序，重掛會排到最後面，天色就落後一幀。控制器改成從 `world` 物件讀方塊資料與全局光，`setWorld` 只換內容。

**`isLooping`**：大廳是 true。false 時控制器的座標改成夾在世界內（`clampAxis`，深水推回岸邊之外的最後一道保險）、邊界白霧整道收掉（`edgeRatio` 只剩轉場會拉起來）、體積雲不把長距離位移當成跨邊界平移。

**氣氛設定**：每個欄位寫成 `{ value }`（固定）、`{ offset }` 或 `{ scale }`（疊在原本的值上），沒寫就原封不動，連夾限都不做，所以大廳的空設定算出來與沒有場景系統時每個數字都一樣。

| 組 | 欄位 | 套在哪 |
| --- | --- | --- |
| 霧 | 色調（顏色只收 `value` 與逐通道 `scale`）、起點、終點 | `use-weather`：日夜的基準霧色與晴天霧距先換成場景基準，箱庭天氣再從這裡疊 |
| 光 | 直射光、天光、高光倍率 | 同上，取代晴天的那組 1 |
| 光 | 曝光 | `use-day-night` 的 `applyToPipeline`，乘在日夜曝光上，照樣過節流門檻 |
| 雲 | 雲量偏移、層雲、雲塔、高積雲、風速 | `volumetric-cloud` 在 `deriveCloudWeather` 之後就地改 `CloudWeather`，雨再疊在最後 |
| 雲 | 雲底高度 | 整層升降（厚度不變），夾在 70 到 135 格：再高雲塔會撞進高積雲 |
| 地表特效 | 晨霧機率、濃度 | `use-weather`：機率以日序抽一次籤，同一天整個清晨結果一樣 |

套用順序是日夜基準 → 每日天氣 → 場景氣氛 → 箱庭天氣範圍（只有 `hasGardens` 的場景有：雨、雪、沼澤霧、地獄谷熱氣）。換場景時直接換值、不做漸變（那一刻霧已蓋滿畫面）。氣氛設定的霧與光平常在天氣系統的每幀裡套；開始漫遊（`start`）之前天氣還沒建，改由 `use-weather` 的 `trackRealmBaseline` 先套霧色、霧距與三個光的倍率（排在日夜之後、控制器之前），換畫質重來回到湖中島時，開始面板後面就已經是湖的霧。大廳的設定是空的，這個觀察者寫回建立時的那組初始值，畫面不變。

**換畫質重來**：`reload-handoff` 多了 `realmId`，重來之後回到原本的場景，認不得的 id 退回大廳。

**踩坑與注意**

- 雨與雪的粒子記著每根格柱的落點高度（`impactYMap`），地形一換就全錯，換場景前後都要清。換場景的空檔裡射線打不到東西，查過的格柱會被記成空的，所以新世界進來時要再清一次。
- 水面的離岸距離圖由焦散的 `disposeWaterMapTexture` 一起釋放，水面那邊的參考要另外放掉，否則新世界建好前材質讀到的是已釋放的貼圖；世界層因此先建水面、後建焦散，拆的時候倒過來。
- 營火、羊群、燈池原本只在整個渲染端收掉時才釋放，現在各自有 `dispose`／`stop`。之後新增屬於某個場景的東西，要記得在 `createWorldLayer` 登記收尾，並且來回傳送十次之後看 WebGL 資源數與 worker 的 heap 有沒有一直漲（量法見下一節的「驗收」）。
- 原本綁著禪庭座標的東西都已接到場景上：落葉與沼澤霧粒子跟著 `hasGardens` 開關（`setActive`，關的時候連飄在半空的一起清掉）、水面的湧浪範圍由場景的 `swellArea` 給（湖中島沒有）、選單的快速前往只在大廳出現、音源清單依場景挑。

## Minespace：傳送門、遠景與湖中島（2026-11）

設計第三到五階段。湖中島是水鏡池的大場景。第一版（大島、亭子、大樹、長棧道、門在水鏡池西側白沙上）使用者看過之後改了方向：大場景延伸所屬箱庭的設計，傳送門立在那座箱庭的木座邊上（原則寫在設計文件）。下面是改版後的樣子，第一版的數字留在「效能」與「上線前就抓到的錯」裡當紀錄。

**新增的檔案**（都在 `domains/realm/`）

| 檔案 | 誰引用 | 做什麼 |
| --- | --- | --- |
| `lake/lake-layout.ts` | 三邊 | 湖中島的尺寸與定點（湖心、水面高度、島與池的半徑、沙灘寬、木棧、回程門、邊界半徑）與岸線距離 `measureShoreDistance`，純資料 |
| `lake/lake-terrain.ts` | 地形 worker | 湖中島的地形：島身、沙灘、淺灘、斜坡、深水、島中池、木棧與紙燈柱、盆景松、立石、石燈籠、花草、睡蓮、回程門 |
| `portal-terrain.ts` | 地形 worker | 門框與木牌柱的方塊（`placePortalStructure`），兩個場景共用；門洞淨寬、門高、木牌朝向的常數渲染端也讀 |
| `portal-gate.ts` | 渲染端（世界層） | 門洞裡的霧面（ShaderMaterial）與木牌的薄板、牌面（木紋與字畫在同一張 DynamicTexture） |
| `realm-transition.ts` | 渲染端（引擎層） | 轉場：`realmTransitionState`（濃度與霧色）、蓋滿畫面的霧幕、霧裡的粒子 |
| `backdrop.ts` | 渲染端（世界層） | 三圈山稜、世界外的湖面、深水的湖底平面 |

**傳送門**

- 定義在 `RealmDefinition.portalList`：門洞中心、腳底高度、門洞沿哪一軸攤開、目的地、目的地出生點（不給就用目的地自己的）、旁邊木牌的位置與朝向。
- 門是一座小鳥居（`placePortalFrame`）：兩根細木樁（`WOOD_POST`，粗 0.42）立在門洞中心左右各一格、柱腳墊石板，柱頭壓一道深色木（島木），最上面一排深色半磚加兩端的階梯（笠木，收法與箱庭的 `placeTorii` 相同）。整座五格寬、五格高；門洞淨寬 `PORTAL_CLEAR_HALF_WIDTH × 2` 約 1.58 格、高 `PORTAL_OPENING_HEIGHT` 三格。沒有穿過門洞的「貫」：門只有三格高，那一根正好在頭的高度。門洞前後各一格的花草一併清掉。
- 大廳那座立在水鏡池的池心偏南一格的水裡（`(126, 174)`，`POND_GATE_OFFSET`），門洞沿 X 軸、朝北；水鏡池那塊挑出水面的木板改成從北岸一路鋪進門洞（`placePortalFrame` 清門洞時會留下腳底那格半磚）。木牌立在木板起點西側兩格的草地上 `(124, 168)`、牌面朝北。更早兩版的位置（木座北緣 `(126, 167)`、西側白沙 `(111, 173)`）都已拿掉，理由見設計文件「大廳那一頭」。
- 湖中島那座在島北緣草地的最外一排（`LAKE_PORTAL_POINT`），同樣朝北；木牌在西側三格、牌面朝南（這裡的人從島上走過去），東側四格一盞石燈籠。
- 落點：大廳往南穿過門，落在湖中島門南側三格、面朝南（池子在正前方，門在背後）；湖中島往北穿過門，落在大廳門北邊四格的木板上 `(126, 170)`、面朝南看著門。兩邊離觸發範圍都還有兩格半以上。
- 觸發：`render-runtime` 的 `trackPortals` 每幀看腳底在不在門洞的觸發範圍（兩根柱子的內緣之間、前後各半格、腳底高度到門頂）。只在「從外面走進去」那一刻觸發（`wasInsidePortal`）；轉場途中（`isTraveling`）一律不理，這段時間走進門裡也算「已經在門裡」，要先走出去。按著前進鍵穿過去再落地時，人會繼續往前走，大廳那邊三格半後走回門裡，那時霧還在散（約兩秒），這一下被吃掉，人直接穿過門走進箱庭，不會來回彈。
- 木牌（`portal-gate`）：一根兩格高的細木樁（方塊）加上一片一格半寬、四分之三格高、六公分厚的薄板（網格），底緣離地一格、頂緣一格七五，與眼睛差不多高。牌面的木紋（二十四乘十二的像素格、三片板）與字畫在同一張 512×256 的 DynamicTexture 上，不借材質包的貼圖（換包要跟著換、對比太強壓不住字）。字是場景名加一句短語（`signCaption`，七八個字以內；HUD 那一句長的是 `description`），深褐墨色，先描一圈淡米色的粗邊（線寬是字級的 0.16、`lineJoin: 'round'`）再填字，白天夜裡、中英文都讀得到。字級往下縮到放得下為止，但標題不低於 64、短語不低於 40 像素。
- 木牌的字跟著介面語言：語言是主執行緒 `useSimpleI18n` 偵測的，`use-render-host` 把它併進 `RenderSettings.locale` 送過去（`use-render-preference` 的 `getSettings` 不含語言），`portal-gate` 看著 `renderSettings.locale` 重畫。worker 裡的 OffscreenCanvas 只認得系統字型，字型清單寫的是各平台都有的黑體。

**轉場**（`travelToRealm`）

1. 送 `realm-transition` 給主執行緒播目的地的轉場音效（非空間音源，淡入；換好場景的 `setWorld` 時淡出，換場景失敗沒有 `setWorld` 就靠十秒的保底淡出），同時在地形 worker 開始生新場景——生成時間藏在霧裡。
2. 霧 1.5 秒蓋滿。兩層：`realmTransitionState.ratio` 被漫遊控制器當成邊界白霧的濃度（霧距收到幾格、灰罩蓋天、雲與粒子淡掉），天氣把 `atmosphere.fogColor` 往轉場霧色拉；另外一片蓋滿畫面的霧幕（頂點直接是裁切座標，掛在鏡頭上只是為了半透明排序排在最後）從畫面四周往中間長，最後兩成一定全蓋，拆世界的那一下看不到。霧色是日夜的基準霧色乘上目的地的 `fogTint`，夜裡過門霧是暗的。粒子是硬邊的小方點（與空氣浮塵同一種畫法），湖是往下落的藍白水珠、大廳是往上浮的暖白細沙，畫在最上面那一層（Babylon 同一層裡先畫粒子、後畫半透明網格，放同一層會被霧幕蓋住）。
3. `switchRealm`，再等新世界的著色器編好（每幀問 `scene.isReady`，最多 4 秒），免得霧散開時看著樹一棵一棵冒出來。
4. 霧 2 秒散開。
- 生成或建網格失敗：人留在原場景，霧照樣散開，錯誤記進紀錄（F6 匯得出來）。原本地形 worker 出錯只靠 20 秒逾時收尾，穿門時等於對著一片白等二十秒，現在 worker 的 `onerror` 直接讓 `generate` 失敗。
- 全程不重新整理頁面，pointer lock 不會掉。遠山的著色器也看邊界白霧的濃度（`veilRatio`），霧湧上來時山跟著化進霧色，不會在一片白裡留著剪影。
- HUD 的區域欄整趟只換一次：霧湧上、換場景、霧散開這段時間不重算所在箱庭（`isTraveling` 時跳過），出發地一直顯示到換好的那一刻，`enterWorldLayer` 再直接算一次目的地。選這個而不是一進門就顯示目的地：霧剛湧上時人還看得到出發的箱庭，標題先跳成目的地反而對不上畫面。

**遠景布景**（`backdrop.ts`，屬於世界層，換場景時跟著拆）

- 三圈山稜在湖心外 350、550、800 格，一圈是一條環狀的四邊形帶，三圈合成一個網格。稜線在圓上取雜訊（頭尾接得起來），高度與每一段的寬度都量化成階梯；雜訊在圓上取樣的半徑決定一圈有幾座大山，給大了會變成一排細高的樓（第一版就是），收到一點四到二點二。最近那圈用另一層雜訊挖出缺口，看得到後面兩圈。
- 顏色：基準色乘上此刻的天光與一點直射光（日夜給的），再往地平線色（`atmosphere.fogColor`，帶著場景的染色）混，越遠混越多，山腳再多混一層水氣。不吃一般的距離霧。
- 畫在天空那一層（rendering group 1）的不透明佇列：太陽、月亮與天空罩都不寫深度，放第一層的話日落時太陽會畫在山前面；第一層的雲貼在遠平面上畫，自然藏在山後；灰罩是半透明、排在後面，轉場時照樣蓋得住山。
- 世界外的湖面：一圈一圈套著的方框（外緣到湖心 1200 格），用一般的 StandardMaterial：世界裡的方塊水也是它，色調映射、距離霧、大氣透視是同一套。倒影用「掠射時發光」近似（Babylon 的菲涅耳：左色是掠射、右色是正對，一開始寫反了），顏色每幀換成天邊往中空色偏一點、乘 `LAKE_REFLECTION_RATIO`。不開全尺寸鏡面。
- 與方塊水的接縫：第一版是一個中間挖掉整個世界的方框，兩邊接在世界邊緣的一條直線上，正午貼近看是一條筆直的亮暗分界——方塊水有像素貼圖、半透明、看得到湖底與雲影，平面是素色，再怎麼調色也對不齊。改成平面從世界邊緣往裡疊 `LAKE_PLANE_FEATHER_WIDTH`（44）格、抬高兩公分蓋在方塊水上，這一段由內往外從全透明到不透明（頂點色的 alpha、六圈、每圈照平滑曲線取），交界攤成四十幾格的漸層。平面因此進了半透明佇列，`forceDepthWrite` 照寫深度，貼在遠平面上的雲才不會畫到湖面上。倒影倍率同時從 0.62 降到 0.4，漸層兩頭的亮度差小一點。推回線離湖心 57 格，最近的漸層起點也在四十格外。
- 繪製：山一次、世界外湖面一次、湖底平面一次。

**湖中島**

- 世界照舊 280 × 40，`isLooping: false`。尺寸都在 `lake-layout.ts`：

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `ISLAND_RADIUS` | 25 | 島的岸線半徑，岸線吃兩層噪音（正負三格上下） |
| `BEACH_WIDTH` | 3 | 岸線往內三格是與湖面齊平的沙灘，再往內是高一格的草地（`ISLAND_GROUND_Y` = 11） |
| `ISLAND_POND_RADIUS` | 10 | 島中池半徑，`getNoisyDistance`（頻率 0.13、幅度 3），黏土底，深兩格、偏西北一窪三格 |
| `SHALLOW_WIDTH` | 8 | 岸外三格深一格、到八格深兩格（細沙底），再一段斜坡下到深水（湖底頂面 3.5，七格深） |
| `BOARDWALK` | 起點相對湖心 (-1, 13)、十步 | 兩排半磚每步往東北一格，盡頭與半途各一根紙燈柱 |
| `LAKE_PORTAL_POINT` | (140, 117) | 從島心往正北找草地最後一排（`findPortalZ`），門前左右五格、往內兩排到沙灘外一排的岸線拉直，再兩格混回原本的岸線，門柱、木牌與燈籠一定落在同一排草地上 |
| `LAKE_SLOW_RADIUS`／`LAKE_PUSH_RADIUS` | 37／57 | 淺灘外緣再四格開始減速，再二十格開始推回 |

- 島上照水鏡池擺：池子、木棧、紙燈、盆景松四棵（只種盆景松，大樹一棵就比整池水高）、青苔立石三顆、石燈籠兩盞（一盞在池東北、一盞在回程門東側）；草地上零星一格高的小丘（池邊與門前不隆）。花草是紙莎草（貼著池岸與湖岸）、高草、蕨、堇；睡蓮在池裡成叢，湖的淺灘零星幾叢。
- 出生點在回程門南側三格、面朝南（池子、木棧與紙燈在正前方）。
- 氣氛：霧色藍白（逐通道倍率，夜裡照樣暗）、霧距 90～240、天光 ×1.06、直射光 ×0.94、雲量 +0.15、層雲 +0.3、風速 ×0.55、晨霧天天有且濃度 ×1.6。天氣範圍只有大廳有，湖中島不會下雨。
- 音景（`lake/lake-sounds.ts` 的 `LAKE_EMITTER_DEFINITION_LIST`，全沿用既有音檔）照水鏡池：池畔一隻蛙、池面上換位置的水鳥（白天）、夜裡水邊的草蟲；岸邊四顆「岸邊的水」，十二到二十六秒才響一次、音量 0.2、可聽十二格。第一版的木棧底下的水、一圈八顆不停的拍岸與夜裡兩片遠遠的蛙鳴已拿掉：疊起來整座島一直有聲音，與水鏡池「一聲一聲、中間是空白」相反。沒有鄰居要避，不走 `measureNeighbourLimit`。HUD 的區域欄顯示場景名稱與 `description`。
- 邊界（`RealmBoundary`，控制器的 `applyRealmBoundary`）：只在水裡作用。離湖心超過減速線之後，往外的那個分量越游越慢，到推回線剩三成；超過推回線有一股往湖心的水流，每超出一格快 0.9 格／秒（上限 4.2）；停下來不划的話水流把人慢慢帶回減速線。

**HUD 的音源清單：同名併成一條**

- 症狀：湖岸一圈十顆音源都叫「岸邊的水」，清單上疊著兩三條一模一樣的字；大廳的潮汐磯（六顆「拍岸浪聲」）也一樣。
- 改法：`SpatialSoundscape.update` 以名稱算出的開關鍵（`getSoundMuteKey`，`title:` 加中英文名）把同名的併成一條，響度取最響那顆、距離取最近那顆。清單那一條的 `id` 就是開關鍵，按一下整組一起開關（包括還沒載入、在遠處的那幾顆）。
- 舊版存在瀏覽器裡的是一顆一顆的音源 id（`minespace-muted-sounds`）：音景照樣認得，同名裡有一顆是關的整條就顯示關著；按一下打開時連那幾個舊 id 一起清掉。
- 實測（潮汐磯）：清單四條（拍岸浪聲、外海濤聲、海豚、海鷗），六顆拍岸浪聲併成一條；按一下六顆的增益都變 0、儲存的是 `["title:拍岸浪聲|Waves on the shore"]`，再按一下六顆回到 1、儲存清空；舊版只存 `coast-shore-2` 時整條顯示關著、只有那一顆是 0，按一下全部回到 1。
- 換場景後音景整份重建、新音檔還在載入，清單會空零點幾秒。「四下無聲」改成清單空了一秒半才出現（`refDebounced`），有東西就立刻收起，霧都還沒散就先被告知「這裡什麼都沒有」的那一下不見了。

**轉場中 HUD 跳成「白沙之間／四下無聲」**

- 第一版的門在水鏡池範圍外的白沙上（範圍是木座再加四格），站在門裡就是「白沙之間」；從湖中島回來時落點 x = 115 剛好壓在範圍邊上，而且 `realm-changed` 比狀態先送，主執行緒有一幀是「已經在大廳、箱庭還是空的」。音景重建那一下清單是空的，就是「四下無聲」。
- 修法三處：門搬進箱庭木座（範圍內）；轉場途中不重算所在箱庭，`enterWorldLayer` 先算好、先送狀態再送 `realm-changed`；「四下無聲」延後一秒半出現。實測來回十趟，霧湧上的 250／450／700 毫秒與霧散開時截 HUD：去程一路是「水鏡池」、到了是「湖中島」，回程一路是「湖中島」、到了是「水鏡池」，沒有一次出現白沙之間或四下無聲。

**效能：深水的湖底不畫方塊**

- 第一版湖底照方塊畫，高畫質在湖中島出生點比大廳出生點慢兩成多（交錯三輪：FPS 41～42 對 53～56、GPU 23.8 對 18.2 毫秒），A/B 拆開來看，換掉深水湖底就回到 16.9 毫秒：七萬格湖底連同兩層陰影與深度圖多出三百多萬個三角形（F3 的三角形 5298k → 2163k）。
- 作法與大廳外圍白沙同一招：深水那一層換成 `BlockId.LAKE_BED`（`isHidden`，碰撞照算、不畫，加在 enum 最後面，不影響既有方塊的編號），改由 `backdrop` 的一片湖底平面畫，貼圖用材質包的黏土、平鋪、開 mipmap，換材質包時跟著換。隱藏方塊對鄰居仍算實心，斜坡最底那一格的側面照畫，不會破洞。
- 第一版結果（交錯三輪，高畫質 1280×720，出生點平視）：大廳 FPS 51～53、GPU 18.3～18.6 毫秒；湖中島 FPS 53、GPU 18.0～18.3。
- 改版後（同一個量法）：大廳 FPS 53、GPU 18.4～18.7 毫秒、CPU 13.2～15.1、繪製 964～965；湖中島 FPS 54～57、GPU 16.9～17.6、CPU 4.1～4.5、繪製 162～163。島變小、大樹拿掉，比第一版還快一點。

**上線前就抓到的錯：MirrorTexture 漏一個觀察者，整個大廳世界層留在記憶體**

- 症狀：來回走傳送門，worker 的 heap 每趟漲約 6 MB（44 → 82 → 110 MB／0、5、10 趟），WebGL 資源數卻完全不變；F9 原地連換（人沒走動）不漲。關掉 F4 的「水面倒影」就不漲。
- 根因：Babylon 9.20 的 `MirrorTexture` 在建構時往 `scene.imageProcessingConfiguration.onUpdateParameters` 掛一個觀察者，`dispose` 時先呼叫父類別的 `dispose`（`BaseTexture.dispose` 會把 `_scene` 清成 null），再用 `getScene()` 去拔——拿到 null，觀察者永遠留著，連帶留住整面鏡子。大廳的傳送門就在水鏡池，走過去鏡子就會被畫過，每拆一次大廳就漏一份。
- 找法：對渲染 worker 取兩次 heap snapshot 比對（多出四百多個 Mesh、三百多份 StandardMaterial），再從一個在湖中島時不該存在的 `MirrorTexture` 沿反向的參考邊找到 GC root，路徑就停在那個觀察者上。腳本不在版控內，作法：CDP 以非 flatten 模式連到 render worker，`HeapProfiler.takeHeapSnapshot` 收齊 chunk，自己建反向邊做 BFS。
- 修法：`water-mirror` 比對建構前後 `onUpdateParameters.observers` 的清單，找出它掛的那一個，收的時候自己拔。修完 10 趟：44.5（從沒去過湖）→ 66.3（5 趟）→ 67.0 MB（10 趟），第一趟之後持平。第一趟多出來的二十 MB 左右推測是湖中島第一次編譯的著色器，加上 `scene._materialsRenderTargets`（每幀重用的 SmartArray，只清長度不清內容）裡留著的一份舊鏡子；有上限、不會累積（關掉倒影時第一趟只多 5 MB，之後一樣持平）。
- 之後建 Babylon 的物件，`dispose` 之後要在 heap 上確認真的被收掉，資源數不變不代表沒漏。

**驗收**（Playwright、headless Chrome、真 GPU、1280×720，腳本不在版控內）

- 大廳：出生點與抬頭看天和第一、二階段之前的截圖比對，平均絕對差 0.81、0.77（雲飄的位置）；夜裡出生點 8.3（螢火蟲與燈火閃爍）。水鏡池俯看那張的鏡頭擺在 `(126, 14, 167)`，現在正好站在門的笠木上，構圖不同是預期的。另拍了水鏡池的門（白天、夜裡、俯看、從池裡回看）、木牌近看（中英、白天夜裡）、舊門位置 `(111, 173)` 已是空沙地。
- 湖中島：俯看全島、門（從島上與沙灘）、木牌近看（中英、白天夜裡）、木棧與紙燈、池子、日落、夜裡的池子與門；四個畫質各一張抬頭看天（沒有棋盤格）與一張看遠山；高與極致各兩張正午的接縫（推回線附近與漸層裡面）。
- 真的走過去：假的 pointer lock 按住 W，從大廳飛石 `(126, 161)` 往南、從湖中島 `(140, 121.5)` 往北。worker 路徑來回十趟：去程約 1.1 秒觸發、回程約 0.8 秒；落點每趟一樣（湖中島 `(140, 11.5, 120)`、大廳 `(126, 6.69, 163)`），原地站 1.5 秒都沒有又被送走；`scene.meshes`／`materials`／`textures`／`geometries`、觀察者數量與引擎貼圖快取每趟一樣（395／257／276／396、onBeforeRender 25、internal texture 160）；worker heap 55.1（開始）→ 67.6（5 趟）→ 68.1 MB（10 趟），第一趟之後持平；主控台與 worker 沒有錯誤。`?renderer=main` 來回三趟同樣乾淨、資源數一樣。

**踩坑**

- 門前拉直岸線時只限制了左右、沒限制前後，門那一排以南整條十一格寬的帶子都被判成草地，一路長到世界南緣。拉直的範圍要前後左右都框住（`measureApronWeight`）。生地形之後用 `vite-node` 跑 `generateRealmTerrain` 印一張俯視字元圖對一次，比開瀏覽器快得多。
- 用 `pose` 指令把鏡頭擺在半空拍俯瞰時，等太久人就掉進湖裡了；高處的鏡頭拍之前只等三四百毫秒。
- 驗接縫時把鏡頭擺到漸層裡面（離湖心八十幾格，推回線外），還看得到一道比較淡的斜線。用射線把截圖上的線換回世界座標，落在湖底平面上、漸層起點附近；開關 F4 逐項試，關掉雲影或藏掉湖底平面就不見，藏掉世界外湖面則還在。在推回線以內的位置看不到，沒有再追下去。

**已知限制**

- 淺灘看得到湖底，但沒有設計文件寫的那麼「清澈見底」：水的方塊不透明度（0.72）與大廳共用，調它會改到大廳每一池水。
- 世界外湖面的漸層從離湖心約 96 格開始（世界邊緣往內 44 格）。站在推回線（57 格）附近看是一段平順變亮的水面；游不到的漸層裡面貼近看，還有上一條踩坑寫的那道淡線。
- 走進門後霧蓋上來的 1.5 秒裡人還能繼續走；換好之後人會被放到目的地的出生點，不影響結果。

## Minespace：大場景框架與第一批（海中沙島、林海）（2026-11）

湖中島之後同時要做好幾座大場景，先把湖中島的程式抽成框架，再照它做潮汐磯與松籟林的大場景。設計見 [plans/2026-11-27-minespace-realms-design.md](plans/2026-11-27-minespace-realms-design.md) 的「第一批延伸」。

**一座大場景一個資料夾**（`domains/realm/<id>/`）

| 檔案 | 誰引用 | 做什麼 |
| --- | --- | --- |
| `<id>-layout.ts` | 三邊 | 尺寸與定點，純資料 |
| `<id>-terrain.ts` | 地形 worker | `generate<Id>World(state)` |
| `<id>-realm.ts` | 三邊 | `RealmDefinition` 與大廳那一頭的門（`createGardenGate`） |
| `<id>-sounds.ts` | 主執行緒 | 音源清單 |

新增一座要登記四處，各一行：`realm-definition.ts` 的 `RealmId`、`realm-list.ts` 的 `REALM_ENTRY_LIST`（大廳的門、場景清單、F9 輪換都從這份長出來）、`realm-terrain.ts` 的 `REALM_TERRAIN_MAP`（型別是 `Record<RealmId, …>`，漏了型別檢查會擋）、`soundscape/realm-emitter-map.ts`。HUD、音景面板、快速前往、箱庭天氣、換畫質重來都看 `hasGardens` 與 `realmId`，不必另外接。

**抽出來的共用零件**（都在 `domains/realm/`）

- `garden-gate.ts` 的 `createGardenGate`：給箱庭、門洞朝哪一邊、門洞中心離箱庭中心的偏移（`inner`），算出門、木牌（門旁三格）與回來時的落點（門前四格、面朝門）。木牌預設的位置不合適時（水鏡池門旁三格是水）在場景那邊覆寫 `portal.sign`。
- `island-shape.ts` 的 `createIslandShape`：吃噪音的島形、門前那一段岸線拉直（原本寫死在湖中島裡），多了橢圓伸縮、噪音位移、門在北岸或南岸。湖中島改用它之後方塊資料逐位元相同（SHA-1 比對）。
- `realm-terrain-kit.ts`：`findTopSolidY`（多一個起點高度參數）、`isWaterSurface`、`isNextToWater`。
- `backdrop.ts`：山稜、世界外水面、底層平面三樣都可有可無。山稜改成樣式表 `RIDGE_STYLE_MAP`（`mountain` 湖中島、`forest` 林海、`islet` 海中沙島），新增一種就加一份；`presenceThreshold` 讓一圈只留雜訊高的那幾段（遠海上零星的小島）。底層平面借 `floor.blockId` 那種方塊頂面的貼圖與色調，`isEndless` 決定鋪滿世界或一路鋪到地平線。
- 邊界多一個 `medium`：`water` 照舊只在水裡作用、停下來會漂回淺灘；`land` 走在地上也作用、停下來不會被拖走（林海）。
- 鏡面倒影：`RealmDefinition.mirrorTargetList`（正方形範圍加水面或冰面），`createWaterMirrors` 改成吃一份範圍清單；大廳照舊映那五座箱庭（`HUB_MIRROR_TARGET_LIST`），大場景映自己列的。湖中島的島中池第一個用上。MirrorTexture 少拔一個觀察者的那個繞法照舊在 water-mirror 裡。
- `placePortalFrame` 清門洞時留下腳底那格半磚：水鏡池的木板鋪進門洞。
- `garden-kit.ts` 的 `placeSmallBoat`：潮汐磯那艘小舟抽出來，可以橫躺或直躺。

**大廳的門搬進箱庭裡**

使用者看過門立在木座邊上的版本後定案「傳送門要放在箱庭內，接近中央處」。門洞中心的偏移放在 `garden-layout.ts`（`POND_GATE_OFFSET`、`COAST_GATE_OFFSET`、`FOREST_GATE_OFFSET`），箱庭的造景與大場景那一頭的門讀同一個點：

- 水鏡池 `(126, 174)`：門立在池心偏南一格的水裡、門洞朝北，那塊挑出水面的木板改成從北岸筆直鋪進門洞（原本是一段斜的木板加一根紙燈柱，門頂已有紙燈，柱子拿掉）。木牌 `(124, 168)` 在木板起點西側的草地上。
- 潮汐磯 `(82, 197)`：沙地正中偏北、門洞朝北，門後是那一池淺海；漂流木往西挪五格，北緣大鳥居到門這一路是空的沙。海中沙島那一頭跟著翻過來：回程門在島北緣、人往南走上島，鳥居移到南岸外。
- 松籟林 `(140, 57)`：小徑走到中央開成半徑兩格半的石板空地，四周五格半不種樹，門洞朝南。
- 落點都在門前四格、面朝門；選單的「返回禪庭」用的是同一點，快速前往落在門前六格。三處都確認是站得住的地面（木板、沙、草）。

**海中沙島**（`realm/coast/`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `SAND_ISLAND_RADIUS` | 16 | 岸線半徑，`stretchZ` 1.2（南北壓扁），實際約 34 × 27 格 |
| `TIDAL_FLAT_WIDTH` | 3 | 與海面齊平的灘，噪音挖出零星潮池 |
| `DUNE_GROUND_Y` | 11 | 灘以內的沙地，沙丘再高一兩格；門前十一格不隆 |
| `REEF_WIDTH` | 16 | 岸外 2 格內一格深、7 格內兩格深、12 格內三格深、16 格內四格深；兩格深起有珊瑚，三格深起有一兩格高的珊瑚頭 |
| `SEA_FLOOR_Y` | 3 | 深海底，LAKE_BED 加沙底平面 |
| `COAST_PORTAL_POINT` | (140, 130) | 北岸沙地最外一排 |
| `SEA_TORII_POINT` | (140, 157) | 南岸外六格的淺海裡，`placeTorii`（半寬 3、高 5） |
| `COAST_SLOW_RADIUS`／`COAST_PUSH_RADIUS` | 36／56 | 同湖中島的算法 |

出生點在門南側三格、面朝南。湧浪範圍蓋住整片可游的海（`swellArea` 半邊長 56），浪頭貼著島岸拍上來。

**林海**（`realm/forest/`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `FOREST_GROUND_Y` | 10 | 平地；林子裡零星一格高的小丘，小徑、空地、門前不隆 |
| `FOREST_PORTAL_POINT` | (140, 172) | 落腳空地 `ARRIVAL_CLEARING`（半徑 9）的南緣 |
| `SHRINE_CLEARING` | (131, 110)，半徑 8 | 鳥居、兩盞石燈籠、老橡樹 |
| `FOREST_PATH_POINT_LIST` | 七個骨架點的 Catmull-Rom | 兩格寬石板，沿路每十六個取樣點一盞石燈籠、左右交錯 |
| `THICKET_START_RADIUS` | 42 | 往外樹越種越密，地面每四格抬一格、最多四格 |
| `FOREST_EDGE_RADIUS` | 60 | 以外不種樹，地面是 LAKE_BED，由鋪到地平線的草地平面代替 |
| `FOREST_SLOW_RADIUS`／`FOREST_PUSH_RADIUS` | 44／54 | `medium: 'land'` |

種樹：每 2×2 格抽一次籤，機率由低頻噪音決定（12%～62%），空地邊緣三格內漸漸密回來，小徑中心線 2.6 格內不長樹幹；密林那一圈拉到 62%。林子裡是 `placePineTree`（樹幹 6～9 格）與一成 `placeOakTree`；密林那一圈換成細高的松（`placeThicketPine`，樹幹 8～10 格、頂上十三格葉）。

**效能：樹葉**

- 樹葉是鏤空方塊，每一格整顆畫（十二個三角形、兩面都畫、alpha test）、不被相鄰樹葉剔除，還要進兩層陰影與深度圖。禪庭全場只有三千格樹葉，林海第一版有三萬三千格（密林那一圈佔三分之二），高畫質出生點 36 FPS、GPU 27.3 毫秒（大廳 51、19.0）。
- 改了三處，葉子剩一萬六千格：掏空樹冠（`hollowCrownList`：六面都貼著樹葉或樹幹的那格拿掉，外觀不變，少三成）、密林那一圈換成細高的松並把機率從 85% 降到 62%、`FOREST_EDGE_RADIUS` 從 64 收到 60。
- 剩下的差距不在葉子的格數。A/B（同一個出生點、交錯載入）：拿掉全部松葉 GPU 23.0 → 17.1 毫秒；只拿掉密林那一圈的葉子只省 0.5 毫秒；F4 關掉接觸硬化陰影省 3～4 毫秒。貴的是近處樹冠那幾層鏤空葉片，每一層都要做一次接觸硬化陰影的取樣；大廳的畫面一半是天空與平的白沙，林子裡整個畫面都是樹葉。
- 量測數字見下方「驗收」。

**驗收**（Playwright、headless Chrome、1280×720；另有三組代理人同時在跑，FPS 只採沒有其他瀏覽器在跑的那幾段）

- 效能（高畫質，交錯三輪，出生點平視）：大廳 FPS 47～50、GPU 18.6～19.8 毫秒；海中沙島 42～45、21.3～22.1；林海 39～42、23.2～24.6。海中沙島掉 6～14%、林海掉 16～20%，沒有達到 10% 以內，見「未解」。
- 來回走傳送門（假的 pointer lock 按住 W，worker 路徑十趟）：湖中島、海中沙島、林海三條每趟資源數一樣（`meshes`／`materials`／`textures`／`geometries` 445／281／284／446、onBeforeRender 25、internal texture 168），落點每趟一樣、原地站 1.5 秒沒有又被送走，HUD 一路是出發地、到了是目的地。worker heap：湖中島 56.3 → 77.5 → 78.2 MB、海中沙島 46.1 → 57.3 → 58.1、林海 45.7 → 56.4 → 57.6（開始／5 趟／10 趟），第一趟之後持平。`?renderer=main` 各三趟，資源數一樣。
- 湖中島島中池的倒影：開關 F4 的「水面倒影」截圖平均差 4.25，看得到天空與池邊的倒影。
- 四個畫質抬頭看天，兩座都沒有棋盤格。

**倒影調得柔一點**（使用者：「水鏡池的反光效果能不能再唯美一點」，改在 `garden/water-mirror.ts`，所有鏡面一起套用）

- 菲涅耳：原本整面一律五成透明，像一張半透明的照片鋪在水上。改成照視線與水面的夾角混：低頭往下看 0.22（看得到池底與睡蓮），貼著水面望過去 0.9（對岸的松、石與燈完整倒過來），中間照 (1 − cos)² 過渡。Babylon 內建的透明度菲涅耳是「加」在透明度上的，會把邊緣淡出的遮罩加回來、露出方形的邊，所以寫成材質外掛 `MirrorSurfacePlugin` 乘上去。
- 微微的晃動：鏡面的反射座標是投影算的，凹凸貼圖擾動不到它。外掛用一條 regex 注入，在取樣之前把座標推一點：兩組慢的正弦交疊，位移千分之二點五個畫面。只動倒影，睡蓮、木板與水本身不動。
- 模糊：`MirrorTexture.blurKernel` 4，倒影貼圖只有兩三百像素見方，糊一點才不會一格一格。
- 液體不進倒影：每一種方塊是一個橫跨整個世界的網格（沒有分區塊剔除），湖中島的倒影一開，七萬格湖面整個再畫一遍，三角形 2076k → 3977k、GPU 多約六毫秒。水映在水裡幾乎看不出來，倒影的清單把液體拿掉之後回到 2136k。
- 夜裡燈的倒影是方塊本身（紙燈、門頂的燈），燈火的光暈圓盤沒有放進倒影：它的柔性淡出拿主畫面的深度圖比對，畫進倒影會被切得亂七八糟。
- 量測：交錯 A/B 那幾輪碰上其他代理人同時在跑，數字跳太大（同一個畫面 22～98 毫秒），使用者也改成先不驗收，效能與模糊的代價都還沒有可信的數字。

**未解**

- 兩座大場景的 FPS 掉幅超過 10%。林海的大頭是近處樹冠的鏤空葉片疊陰影取樣，可行的方向：甲、林海的樹葉不投影或改用便宜的陰影濾波（改渲染器，影響所有場景，要另外 A/B）；乙、林子再疏一點、樹冠再小一點（外觀會變）；丙、接受。海中沙島比湖中島多約 4 毫秒，嫌疑是整片海的湧浪、海上積雲與較強的高光，那幾次 A/B 碰上機器忙碌，數字不可信，還沒定位。

**踩坑**

- 測試頁要擋掉 HMR：好幾個代理人同時改檔，dev server 的 HMR 會把測試頁整頁重載，`pose` 之類的測試指令全部失效（截圖張張一樣）。測試腳本用 `context.routeWebSocket(/.*/, () => {})` 把 HMR 的 websocket 接到一個不說話的假連線上。
- 用 route 改測試頁的模組做 A/B 時，比對的是轉譯後的文字：`0.62` 會變成 `.62`，照原始碼寫的字串對不上，改寫就默默沒生效。改寫函式找不到字串要丟錯。
- 搶 `heavy.lock` 的迴圈要睡短一點（兩秒）：睡二十秒的那一方一直搶不到。

## Minespace：鐘聲村與地底湖窟（2026-11）

市井坊與岩響窟的大場景，資料夾 `domains/realm/village/` 與 `domains/realm/cave/`（各四支：layout、terrain、realm、sounds；洞窟多一支 `cave-glow.ts`）。設計見[設計文件](plans/2026-11-27-minespace-realms-design.md)的「鐘聲村與地底湖窟」。

**共用檔案的改動**

| 檔案 | 改了什麼 |
| --- | --- |
| `garden/garden-builders-major.ts` | 井、鐘樓、紙燈柱抽成 `placeVillageWell`／`placeBellTower`（`BellTowerSize` 可放大）／`placeLampPost`，抽完用 `generateWorld` 前後比對雜湊，一個位元都沒變；岩響窟的洞室西壁多挖一個龕給傳送門（排在整座箱庭最後挖，亂數撒的石筍與蛛網落進去也會清掉；兩端只挖三格高、最裡面一排不挖到兩端：西北角的岩最薄，挖滿會見天） |
| `garden/garden-layout.ts` | `CAVE_GATE_POINT`：洞室中心往西七格 |
| `realm/garden-gate.ts`、`world/landmark.ts` | `GardenGate.travelSpawn`：選單快速前往的落點可以自己給（岩響窟的門在山腹裡，門前六格是湖，往上找站得住的地方會找到山頂） |
| `realm-definition.ts`、`active-realm.ts` | `isUnderground`（地底的場景）、`caveDripList`（洞頂滴水粒子搬去哪）、`RealmRidgeStyle` 加 `hills` |
| `apply-realm-engine.ts`（新） | 換場景時切引擎層裡綁著場景的東西：地底時藏天空罩／星空／日月與光暈／陰天罩（用 `isVisible`，日月光暈每幀被除錯開關拿 `isEnabled` 對一次）、雲的 `visibleRatio` 先寫零、太陽 `shadowEnabled = false`；岩響窟洞口那盞天光只在大廳開；兩組洞頂滴水粒子大廳照舊、有 `caveDripList` 的搬過去、其餘停掉（原本它們留在每個大場景的同一個座標上：湖面上、田裡）。`render-runtime` 在 `enterWorldLayer` 與初次 `buildWorld` 各叫一次 |
| `use-fps-controller.ts` | 地底時洞穴程度直接全滿（不量頭頂，也不慢慢爬：陰影是關的，爬的那兩三秒陽光會穿過岩層）；地底的場景可用自己氣氛設定的霧距與 `ambientRatio` 蓋過洞穴那一份 |
| `use-day-night.ts` | 地底時光照取樣固定在子夜（`UNDERGROUND_LIGHTING_TIME`），HUD 的日月圖示另取一份真實時刻 |
| `use-weather.ts` | 地底時 `skyBodyFade = 0`（光束與行進版光束跟著收）、雲 `visibleRatio = 0`（雲的行進與雲影圖都不算） |
| `use-babylon-scene.ts` | 洞口天光與滴水粒子的名字抽成常數 |
| `realm-decoration.ts`（新）、`world-layer.ts` | 場景自己的渲染端裝飾，世界層登記收尾；目前只有洞窟的螢光蟲 |
| `block-constants.ts` | `GLOW_LICHEN`（螢光地衣，加在 enum 最後） |
| `backdrop.ts` | `hills` 樣式 |

**鐘聲村**

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `FIELD_Y`／`TERRACE_Y` | 8／9 | 田地與台地那一層草，台地高一格就是木座的邊 |
| `TERRACE_RADIUS` | 34 | 四次方超橢圓，邊吃 ±1.6 格噪音，門前左右七格拉直 |
| `VILLAGE_PORTAL_POINT` | (108, 140) | 台地西緣石砌邊往內一格，市街西端，門洞沿 Z |
| `FIELD_OUTER_RADIUS`／`HILL_CREST_RADIUS`／`HILL_OUTER_RADIUS` | 58／94／110 | 花田外緣、丘陵稜線（高出田地十格）、超過就是 LAKE_BED |
| `VILLAGE_SLOW_RADIUS`／`VILLAGE_PUSH_RADIUS` | 66／82 | `medium: 'land'` |

- 大廳那座：市井坊中央石板廣場、井西邊三格 `(195, 198)`，門洞朝西，木牌 `(195, 201)` 朝西；落點與選單「返回禪庭」都在門西四格 `(191, 198)`，快速前往在門西六格 `(189, 198)`。不放井西邊四格：快速前往的落點會正好是廣場那圈紙燈柱西邊那一根，人被放到燈柱頂上。
- 建築（使用者看過第一版說「房子太過重複」）：`village-buildings.ts` 把屋子拆成可以各自挑的部分（`placeHouse`：面寬進深、一到三層、牆分木板／深色木／木骨白壁／白壁／石砌一樓、石砌腳、玻璃窗或障子、四坡或沿 X／Z 的兩坡、出簷、門開哪一面、門廊、二樓露台、煙囪、側邊小棚、屋後小院），七塊民家地各拿一種樣式（洗過牌）；另有十座各有輪廓的建築：旅籠（兩層木骨白壁、露台、簷下提燈）、神社（兩格高石壇、石階、鳥居、社殿、石燈籠、神池）、水車小屋（水道裡直徑七格的水車）、鍛冶屋（臨街敞開、餘燼爐、紅磚煙囪）、高倉（木樁撐起、稻草屋頂、梯子）、市場棚（四面敞開、三列攤位）、望樓（十格高的木架、頂上燈籠）、湯屋（露天湯池與木籬）、陶房（紅磚窯、曬坯架）、市街東端的屋根門；加上原本的鐘樓、井、攤子、灶。路：七格的市街、三格的小巷、北邊兩格的後巷（北側一道矮石牆，到各建築門前斷開）、南邊兩格寬的水道與木橋。燈柱擺之前看頭上有沒有屋頂，落在屋裡或屋簷下的不擺。
- 丘陵的高度先算整張圖，再壓成相鄰兩格最多差一格（`measureHillHeightMap`）：噪音的坡有些地方一步兩三格，第一版實測人在離中心六十格左右就卡在坎前，像撞到看不見的牆。

**地底湖窟**

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `CAVE_FLOOR_Y` | 8 | 洞底那一層，地底湖水面與它齊平 |
| `HALL_CENTER`、`HALL_RADIUS_X`／`Z` | (132, 140)、44／36 | 大廳橢圓，吃兩層噪音；穹頂 `4 + 18 × (1 − d²)` 加 ±3 |
| `GROTTO_CENTER` | (200, 140) | 碎石前室，回程門 `CAVE_PORTAL_POINT` (206, 140)、門後舊洞口到 x = 215 |
| `UNDERGROUND_LAKE_*` | (112, 146)、13 | 深兩格，偏北一窪三格 |
| `GLOW_CLUSTER_LIST` | 三叢 | 螢光最密處，各掛一盞冷色真光 |

- 大廳那座（使用者要求「放在洞穴最內部」）：岩響窟洞室西壁的龕裡 `(72, 79)`，門洞朝東、對著地底湖與通道；木牌在門北三格的龕裡、朝東。門在山腹裡，`createGardenGate` 的門外四格會落進湖裡，整份自己給：落點與「返回禪庭」在門前三格的湖岸 `(75, 79)` 面朝門，快速前往落在洞口外 `(96, 96)` 面朝洞口（`travelSpawn`）。
- 整個世界先 `state.fill(LAKE_BED)`，挖洞後只把貼著空氣與水的那一層換成看得見的岩（`exposeRockLining`）。露出來的方塊約 1.4 萬，是大廳的八分之一；世界頂與四邊一面都不畫。
- 地形 worker 生完要 0.24 秒（逐格判斷露岩），比其他場景慢一點，藏在轉場的霧裡。
- 音源高度一律直接給 `y`：`getWaterlineY` 從世界頂往下找，在實心的世界裡會停在四十格高的岩頂上。
- 螢光（使用者要的「螢光洞窟」）：洞頂一片一片的 `GLOW_LICHEN`（自發光 0.45、`lightLevel: 0`：不點真光，也不擴散烘進去的暖色方塊光）約 560 格；渲染端 `cave-glow` 一個網格畫洞頂幾千顆螢光蟲、垂下的細絲與湖上的倒影（一次繪製、加法混合、各自相位明滅，頂點在著色器裡才搬到位，所以 `alwaysSelectAsActiveMesh`），排在天氣那一層（`WEATHER_RENDERING_GROUP`），不然半透明的水後畫會把倒影蓋掉。倒影不開鏡面：鏡像點與鏡頭的連線穿過水面的那一點放一片小方片，岸上的那幾片會落到洞底頂面底下被深度擋掉。三盞冷色 PointLight 掛在三叢底下三格，渲染端在叢集光源容器之外，材質的光源名額夠（太陽、天光、叢集容器、這三盞）。

**踩坑**

- 地底的場景頭上整片是岩，漫遊控制器量「頭頂幾層實心」得到的是半滿（大廳穹頂二十格高，掃描只看十四格），洞裡的霧與光只做一半，所以改成旗標直接全滿。
- 岩響窟的洞穴霧距（5～26）放到九十格寬的大廳，對面的石柱與燈全被吃成黑；地底場景用自己的霧距（8～56）。洞穴的微光不變的話前室與大廳是一片均勻的灰，收成一半，燈籠才說了算（自動曝光還會再往亮拉一點）。
- 引擎層的岩響窟洞口天光與滴水粒子原本在每個大場景都留在原座標（湖中島是湖面上、村落是田裡的丘陵裡），見上表 `apply-realm-engine`。

**驗收**：使用者說大景還會微調，正式驗收等定案再做。目前只有冒煙檢查：`vite-node` 生成大廳、湖中島（雜湊不變）、村落、洞窟都過；村落從回程門走得到廣場與花田、洞窟從出生點走得到湖與門（地形上的廣度優先搜尋）；瀏覽器載入村落、切到洞窟沒有錯誤；選單「返回禪庭」從村落落在 `(191, 198)`。未做：來回十趟的資源與 heap、`?renderer=main`、交錯 FPS A/B（建築改版前在出生點量過一次：村落 46 FPS、洞窟 60 FPS，但當時別的代理人也在用 GPU，不能當數字）、四個畫質的對照、洞窟大廳那座門從洞口按 W 一路走進去（測試腳本每 150 毫秒用 pose 轉向，會把跨階的動量清掉，卡在通道第一個抬高的那一格，沒有驗到）。

## Minespace：金葉林與千蛙沼（2026-11）

金葉苑與蛙聲澤的大場景，設計見 [plans/2026-11-27-minespace-realms-design.md](plans/2026-11-27-minespace-realms-design.md) 的「第二批延伸：金葉林與千蛙沼」。資料夾 `domains/realm/autumn/`、`domains/realm/swamp/`，各四支（layout、terrain、realm、sounds），照湖中島的分法。

**共用的部分**

| 改了哪裡 | 做什麼 |
| --- | --- |
| `realm/island-shape.ts` 的 `createSideIslandShape` | 回程門立在東或西側的島形。`createIslandShape` 只認南北（門前拉直、找邊都沿 Z），不另寫一份，把座標轉九十度餵進去、門的位置再轉回來。原本的函式沒動，湖中島與海中沙島的方塊雜湊不變 |
| `RealmDefinition.weatherParticle` | 大場景要開的天氣粒子（落葉、沼澤霧片）與範圍。大廳照舊由 `hasGardens` 開金葉苑、蛙聲澤那兩份 |
| `weather/particle-area.ts` | 粒子的取樣範圍：大廳鋪滿整座木座；大場景改成鋪在鏡頭四周 `followRadius` 格內、圓心夾在範圍裡，粒子數不變也夠濃。`clearRadius` 讓出鏡頭身邊一圈 |
| `falling-leaves`／`swamp-mist` | `setActive` 換成 `setArea(area \| null)`：換範圍就清掉重新預熱。霧片多一個 `setDensity`（乘在生成速度上）與 `measureMistDensity`（晨昏 `peakDensity`、白天 `dayDensity`、夜裡介於兩者）；大場景的範圍還帶 `waterSurfaceY`（射線打到比它高的木棧、扶手、枯木就重抽，最多四次）與 `heightRange`（霧片離水面多高）。容量從八十片加到一百六十片，生成速度仍照八十片算（`baseParticleCount`），大廳的濃度不變 |
| `use-weather` | 每幀依場景給範圍與濃度；濃度排在範圍之前，換場景重新預熱時才照這一刻的濃度生 |
| `backdrop` 的 `RIDGE_STYLE_MAP` | 新增 `autumn`（三圈赭紅褐黃的圓丘）、`marsh`（兩圈貼著水面的低矮林線，近的那圈有缺口） |
| `block-constants` 的 `floatsOnWater`、`voxel-renderer` 的平板高度 | 見下面「落葉整片埋在草皮底下」 |

**金葉林**（`autumn-layout.ts`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `GROVE_RADIUS`／`GROVE_RIM_WIDTH` | 42／2 | 林地的邊（吃兩層噪音，正負四格上下）；最外兩格是矮一格的「唇」，就是箱庭木座那道半磚邊 |
| `GROVE_GROUND_Y`／`LOWLAND_Y` | 13／8 | 林地草地與坡腳外低林的高度。低林整根是 LAKE_BED，由 `backdrop.floor`（泥土貼圖、鋪到地平線）代替 |
| `SLOPE_RUN` | 2.5 | 唇外每兩格半降一格（吃一點噪音），四到八格下到低林 |
| `AUTUMN_PORTAL_POINT` | (179, 140) | 林地東緣草地最外一排，門洞沿 Z、朝東；木牌北側三格朝西，石燈籠南側四格 |
| `AUTUMN_SLOW_RADIUS`／`AUTUMN_PUSH_RADIUS` | 43／57 | `medium: 'land'`：唇開始走不快，坡腳外被推回 |

- 樹：林地上八十棵白楊（目標九十、間距至少五格半，避開耙沙、長凳、鳥居、落地那一眼的視線；約每七十格見方一棵，金葉苑是三十八格一棵。第一版三十六棵、每一百五十格一棵，獨立審查說看起來空）；唇、坡與坡腳外到離中心六十二格是兩百六十棵「落了葉的白楊」（間距三格多），照 `placeAspenTree` 種完再拔掉八到七成的葉子，只拔這一棵新長的（先記下樹冠範圍裡原本是空氣的格子）。整座場景的葉子方塊 10 036 顆（大廳 2 991；第一版 7 762），找地面另寫 `findGroundY` 只認地面方塊，坡上的樹冠很低，`findTopSolidY` 會把隔壁的葉子當成地面。
- 鳥居在林地西緣：往西走到「五格都還是草地」的最後一排，五格寬的柱腳才不會一根落在唇上。回程門外（東側十格）與鳥居外（西側十格）不種樹，從門洞望出去不是一根樹幹。
- 地面：每一格草地都撒，八成落葉；低林那一層近處（離中心六十二格內）也撒五成五。
- 落葉粒子：範圍林地中心半徑四十八格，跟著鏡頭鋪在十四格內（與金葉苑同一個半徑，同樣的片數就是同樣的濃度；第一版二十二格只剩四成）。射線打到的表面低於林地頂面四格半（`canopyMinY`）就重抽，最多六次：大場景的樹比箱庭疏，隨便抽多半打在地上，葉子是從腳邊冒出來的。

**千蛙沼**（`swamp-layout.ts`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `MARSH_RADIUS`／`MARSH_RIM_WIDTH` | 46／4 | 沼澤的邊（吃兩層噪音，正負六格上下）；最外四格只剩一格深的淺水與零星泥點 |
| `SWAMP_WATER_Y` | 10 | 水面與泥灘同一層：與蛙聲澤一樣，水是往泥地裡挖下去的 |
| 泥灘門檻 | 0.12（頻率 0.06） | 蛙聲澤是 0.18（頻率 0.15）；放大後泥灘大兩倍多，佔三成上下，越近沼澤邊門檻越高 |
| `SWAMP_DEEP_FLOOR_Y` | 5 | 外圍五格深，水底是 LAKE_BED，由 `backdrop.floor`（黏土）代替；世界外是暗綠的水面 |
| `SWAMP_PORTAL_POINT` | (99, 140) | 沼澤西緣泥岸最外一排，門洞沿 Z、朝西；木牌北側三格朝東，紙燈南側四格；木棧從門東側一格起 |
| `BOARDWALK_POINT_LIST`／`PLATFORM_LIST` | 七個轉折、三座平台 | 每兩點之間只走一個軸，兩排並著走（多走一格補轉角）；扶手沿 X 的在北、沿 Z 的在西，每三格一根 |
| `SWAMP_SLOW_RADIUS`／`SWAMP_PUSH_RADIUS` | 50／66 | `medium: 'water'` |

- 扶手與紙燈的木樁從水底一路疊上來（湖中島紙燈柱的作法），不是一塊木頭浮在水面。枯木站在一兩格深的水裡就從水底長上來，深水裡不種，離木棧兩格以上。
- 門前那塊泥岸：門洞往東三排、南北各五格一定是泥，再往東六排收窄成沿著木棧的泥岬（見下面效能）。門那一排與兩側各一格不種紙莎草：它一疊三四格，木牌柱只換掉底下兩格，上面那截會浮在牌頂（第一版就是）。
- 霧（蛙聲澤那套延續過來）：第一版霧距 24～125、霧片白天只給兩成、讓出身邊十格，白天幾乎看不到，使用者問「怎麼沒有延續實體霧效果」；獨立審查量出密度只有箱庭的十三分之一到四分之一。現在兩層都照蛙聲澤：
  - 場景霧：大廳站進蛙聲澤木座時，霧色、霧距與光往 `SWAMP_ATMOSPHERE`（霧距 2～20）拉（`MIST_ZONE`）。千蛙沼整片都是沼澤，改成看時刻：`fogRatio` 白天 0.45、晨昏 0.92（`measureMistDensity` 同一條曲線），疊在場景自己的基準（10～70）上，白天約 6～50 格、晨昏約 3～25 格。
  - 霧片：跟著鏡頭鋪在二十格內，只生在水面與泥灘上（射線打到木棧、扶手、枯木就重抽，路看得清楚），高度照蛙聲澤 0.5～5；生成速度白天是蛙聲澤的 1.5 倍、晨昏 3 倍（容量因此加到大廳那一份的三倍）。晨昏的每格見方密度與箱庭相當。

**大廳的門**：都用 `createGardenGate` 的 `inner`，立在箱庭裡、靠近中央（使用者：「傳送門要放在箱庭內，接近中央處，才有傳送門的特色感」；第一版在木座邊上）。

- 金葉苑：門洞中心在箱庭中心 (-1, -2)，朝西對著西緣的鳥居。`buildAutumnGarden` 種樹時讓出門四周六格（亂數照樣抽完才跳過，其他白楊的位置與高矮不變）。落點在門西邊四格的落葉上。
- 蛙聲澤：門洞中心在 (0, 6)，朝北對著棧道。`buildSwampGarden` 中段那座平台原本是五格寬的半磚、離棧道還隔兩排水（走不上去），改成九格寬、從棧道南邊那排一路鋪到門後兩排的整格木板（頂面比棧道高半格，自動跨得上去）。一定要整格：門框清門洞時會把那一格設成空氣，半磚的平台會在門洞裡挖出一個洞。門因此比甲板高一格，`SWAMP_HUB_GATE` 把 `portal.y` 加一（觸發範圍從腳底高度算）。枯木避開平台（同樣抽完亂數才跳過）；紙燈移到平台東南角，木牌在門西側三格的平台上。落點在門北邊四格、平台北端的木板上；選單快速前往落在門前六格（`landmark` 的 `GATE_TRAVEL_DISTANCE`），正好是棧道南邊那排半磚。門若放在 (0, 5)，快速前往會落在棧道北側那排扶手的木樁裡。
- 用字元俯視圖確認過：金葉苑門前後、木牌四周沒有樹，最近的樹冠在三格外；蛙聲澤的門柱、木牌與紙燈都在平台上。

**踩坑：落葉整片埋在草皮底下**

- 症狀：金葉林第一版滿地都是草綠，看不到一片落葉，方塊數卻有八千多顆 `FALLEN_LEAVES`。
- 根因：`voxel-renderer` 把所有 `flat` 外型的平板都放在方塊中心往下 0.6 格，那是給睡蓮貼水面用的（水面矮八分之一格）。落葉與腐葉鋪在實地上，0.6 就比草地頂面還低 0.1 格，整片被草皮蓋住。大廳金葉苑的兩百多片落葉、松籟林的腐葉從加進來那天起就看不到。
- 修法：`BlockDef.floatsOnWater`（只有睡蓮），浮在水上的照舊 -0.6，其他的貼著頂面再抬兩公分（-0.48）。大廳因此有變：金葉苑與松籟林的地上看得到落葉了（那是它們本來的設計）。

**踩坑：量測腳本被別人的存檔打斷**

- 多個人同時改檔時，dev server 每存一次就對頁面送 HMR，`@vite/client` 會整頁重新整理，量到一半的腳本跟著斷（`__msPost is not a function`、開始鈕等不到）。
- 把 `@vite/client` 換成假的會讓頁面整個起不來（它還負責樣式與環境變數）。改成照原樣載入、只把裡面的 `new WebSocket(` 換成一個永遠不連線的替身（Playwright 的 `route` 改寫回應），收不到更新、也不會斷線重連後重新整理。

**效能**（高畫質 1280×720、出生點、與大廳出生點交錯三輪）

- 量的時候另外幾個代理人也在開瀏覽器、跑型別檢查，同一輪裡大廳自己就在 FPS 26～55 之間跳，只看同一輪交錯的相對差。
- 金葉林第一版（林地三十六棵）：FPS 47／50／51、GPU 20.3／19.2／18.6 毫秒、繪製 166、三角形 610k；同一輪大廳 FPS 41～55、GPU 18.2～20.7、繪製 989、三角形 1168k。在一成以內。
- 金葉林林地加到八十棵之後：FPS 36／37、GPU 27.5／26.6、三角形 807k；同一輪大廳 FPS 40～44、GPU 19.6～21.2，掉了一成多。邊界那一圈的葉子再收（一到三成 → 半成到兩成，葉子方塊 11 619 → 10 036），收完還沒有重量（使用者要求定案前先不反覆驗收）。
- 千蛙沼第一版（霧距 24～125、霧片白天兩成）：FPS 41～45、GPU 21.9～23.4，同一輪大廳 FPS 46～53、GPU 17.7～19，GPU 多兩成。拆開看：藏掉水面 −3.2 毫秒、藏掉霧片 −1.3 毫秒；水面是整片沼澤的主角，動不了，改的是出生點前面那塊泥岬（近處少一點水）與霧片讓出身邊一圈。
- 千蛙沼霧片照蛙聲澤加濃之後：一百一十六片、身邊不讓的時候，霧片一項就多六毫秒（藏掉前後 28.4 → 22.6）；讓出身邊八格、白天 0.8 之後（白天約六十片、清晨約一百六十片），FPS 42／41、GPU 22.9／23.7，同一輪大廳 FPS 41／42、GPU 21.2／20.2，FPS 打平、GPU 多一成上下，霧片一項約 1.1 毫秒。清晨出生點 34 FPS（同一頁白天 40）。
- 回程與記憶體：金葉林 worker 路徑來回十趟（門搬進箱庭之後），去程約 0.7 秒觸發、回程約 0.5 秒；落點每趟一樣（金葉林 (176, 13.5, 140)、大廳 (193, 7.5, 80)），原地站 1.5 秒都沒有又被送走；`scene.meshes`／`materials`／`textures`／`geometries` 每趟一樣（521／320／297／522）。heap、千蛙沼的十趟與 `?renderer=main` 那三趟在使用者喊停之前沒跑完，見「未驗收」。
- 選單「返回禪庭」：千蛙沼按下去落在 (121, 6.5, 222)（門還在木座邊上時的門前四格），HUD 是蛙聲澤；門搬進箱庭之後還沒重按。

**邊界實測**（高畫質、假的 pointer lock 按住 W）

- 金葉林往北：走到離中心 42.2 格（唇上）被樹幹擋住，停在原地，放開也不會被拖走（`land`）。往西：一路走下坡，42.6 → 47.7 → 51.1 → 53.9 → 56.0 → 57.7 → 58.3 格（十四秒），過了推回線 57 格只再多走一格多。
- 千蛙沼往北游：45.5 → 49.2 → … → 64.0 → 65.7 格（十八秒，推回線 66），放開之後 64.8 → 63.9 → 63.3 → 62.3，水流把人慢慢帶回來。

**未驗收**（使用者：「大景還會一直微調，等定案再驗收」）：千蛙沼與金葉林的 heap 平穩、`?renderer=main`、四個畫質的天空、門搬進箱庭之後的回程十趟（金葉林那十趟是門已經搬進去之後跑的）與「返回禪庭」落點、金葉林收葉子之後的 FPS。

## Minespace：雪稜與溪谷（2026-11）

雪稜丘與遣水的大場景，方向寫在設計文件的「雪稜與溪谷」。兩座都照框架（`domains/realm/<id>/` 四支檔案加四處登記），下面只記這兩座自己的東西。

**新增的檔案**

| 檔案 | 做什麼 |
| --- | --- |
| `realm/alpine/alpine-layout.ts` | 中心、雲海高度、稜線與雪原高度、崖邊半徑、推回線、回程門與雪台；稜線座標 `measureRidgeCoordinate`、崖外距離 `measureCliffOvershoot` |
| `realm/alpine/alpine-terrain.ts` | 先算整張高度圖（稜線、雪坡、岩峰、崖邊岩盤、雪台與門外雪坡、融雪池），再放方塊、補半格雪、岩上薄雪、矮松、花草、燈籠、門 |
| `realm/alpine/alpine-realm.ts`、`alpine-sounds.ts` | 定義與大廳那座門、音源 |
| `realm/alpine/cloud-sea.ts` | 渲染端：腳下的雲海（`backdrop.cloudSea`），由 `backdrop.ts` 建與拆 |
| `realm/river/river-layout.ts` | 谷底高度、谷頭與峽尾、跌水、稜線高度、谷底中線／半寬／溪心／溪寬的函式、瀑布、回程門、保險邊界 |
| `realm/river/river-terrain.ts` | 每一格柱分成谷底／土坎／谷壁／看不到四種，放方塊後挖溪、瀑布與潭、峽尾岩縫、木橋、飛石、鹿威、大石、橡樹、燈籠、花草、睡蓮 |
| `realm/river/river-realm.ts`、`river-sounds.ts` | 定義與大廳那座門、音源 |
| `realm/river/waterfall-mist.ts` | 渲染端：瀑布底下的水沫與水霧（`backdrop.waterfallMist`），由 `backdrop.ts` 建與拆 |

共用檔案的改動：`block-constants` 在 enum 最後加 `SNOW_SLAB`（半格雪）與 `SNOW_BLOCK`（六面都是雪），既有方塊的編號不動（湖中島的世界雜湊不變）；`backdrop.ts` 加 `snowpeak` 樣式、山稜的積雪（`RidgeStyle.snow`，頂點色的綠色通道放雪線）、雲海與瀑布水霧；`realm-definition` 加 `snowpeak`、`RealmBackdrop.cloudSea`／`waterfallMist` 與兩個 id；`garden-builders-major` 在雪稜丘與遣水各補四顆通往門的飛石、雪稜丘三株矮松改成一律往東歪。

**雪稜的常數**（`alpine-layout.ts`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `CLOUD_SEA_Y` | 6 | 這一層以下全是不畫的 LAKE_BED；雲面在 6.6，蓋住切口 |
| `CREST_Y`／`SNOWFIELD_Y` | 27／17 | 稜線頂面與雪原，稜線兩側每格落 0.27 格左右 |
| `PEAK_START_ALONG`、峰頂 | 40、46 | 稜線過了四十格往上爬一段（一步一格），盡頭是兩格一階的岩峰，峰頂到世界頂 |
| `CLIFF_RADIUS` | 64 ± 4 | 雪原外緣的斷崖 |
| `ALPINE_SLOW_RADIUS`／`PUSH_RADIUS` | 46／54 | 崖邊吹上來的風，`medium: 'land'` |
| `ALPINE_PORTAL_POINT` | (106, 140) | 西側雪台的外緣，雪台頂面 21；門外十四格是一路往下的雪坡 |

**溪谷的常數**（`river-layout.ts`）

| 常數 | 值 | 說明 |
| --- | --- | --- |
| `VALLEY_FLOOR_Y`／`UPPER_FLOOR_Y` | 12／13 | 下游與上游的谷底，`CASCADE_X`（130）那道坎是跌水 |
| `VALLEY_HEAD_X`／`VALLEY_END_X` | 84／204 | 瀑布崖腳與峽尾 |
| `RIM_MIN_Y`／`RIM_MAX_Y` | 29／37 | 稜線高度；`HIDDEN_TOP_Y` = 28 |
| `WALL_SLOPE` | 2.4 | 谷壁每往外一格高幾格，兩格多一階，爬不上去 |
| `WATERFALL_TOP_Y` | 35 | 瀑布從這一層落下（落差二十二格），主水幕九格寬；瀑布那面崖頂到 38 |
| `PLUNGE_POOL` | 崖腳往東 7、半徑 9、深 4 | 潭心最深，往外兩圈各淺一格 |
| `RIVER_PORTAL_POINT` | (178, 132) | 下游北岸草地最東一排 |
| 邊界 | 中心 (144, 140)、66／76 | 只是保險，谷底最遠一點約 63 |

**看不到的實心岩一律不畫**

- 雪稜：雲面以下那一層（y = 5）整片是 LAKE_BED，崖外也是（萬一掉下去有地可踩），再往下什麼都不放。只放一層就夠：隱藏方塊對鄰居算實心，崖壁的最下一格不會畫底面；崖外若照湖中島鋪一層岩床，五萬格岩床的頂面全會畫出來。
- 溪谷：稜線往外三排以外整柱是 LAKE_BED，頂到 28（比最矮的稜線矮一格）。人在谷底，眼睛約十四格高，越過二十九格高的稜線往外看，視線早就高過二十八格，看不到這一層的頂面；稜線背面在二十八格以下的崖壁也因此不必畫。踩過的坑：第一版想讓稜線外面維持稜線的高度，但稜線高度沿谷在變，外面那一大片的高低差會從矮的稜線上方露出來，而隱藏方塊的側面不畫，看到的是破洞。外面那片一定要比所有稜線都矮。
- 從稜線上方（例如截圖用的高空鏡頭）往下看，稜線外是一片空白，這是預期的，人走不上去。
- 量法：`vite-node` 跑地形，數「至少一面露在外面」的實心方塊。大廳 27.1k（含所有門）、雪稜 19.5k、溪谷 17.0k；樹葉大廳 1954、雪稜 162、溪谷 1218。

**雪坡怎麼走得上去**

控制器只會自動跨半格（`STEP_ASSIST_HEIGHT` 0.55），一整格要跳。雪坡每三四格一階，一路跳很煩：旁邊有一格剛好比自己高一格的雪，就在自己頭上補一片 `SNOW_SLAB`，一格拆成兩個半階。岩、冰、雪台與門外那兩排不補（雪台的邊要留一格的坎）。

**薄雪把坡磨成斜面**（`SNOW_LAYER_QUARTER`）

半格的階還是看得出一階一階。方塊新增 `SNOW_LAYER_QUARTER`（四分之一格，`layer` 外型、碰撞高度同厚度），加上既有的 `SNOW_LAYER`（八分之一）與 `SNOW_SLAB`（半格），一層雪塊上能疊出 0、1/8、1/4、1/2 格四種高度。`alpine-terrain.ts` 的 `smoothSnowSurface` 取代了原本的半格補法：

- 地形仍先照整數高度放好；`ColumnInfo.rawY` 留著四捨五入之前的連續高度，雪面記成「八分之一格」的整數，每一格在候選高度裡挑離連續高度近的，反覆掃到穩定。
- 相鄰兩格落差超過半格要扣分，所以不會各選各的選出四分之三格的階；連續高度本身差一格半以上的是雪崖，不限制。旁邊剛好高一整格的雪，至少補半格（保留舊規則的底線）。
- 雪面落在整數高度的上半時，頂上那塊降成半格、下面墊雪塊（只在四周全是雪時才降，貼著岩或冰維持原本的稜角）。
- 緊貼岩的雪堆起四分之一格、再外一圈八分之一格（岩背風面的雪堆），把岩與雪之間接成緩坡。
- 雪台、門外的坡、融雪池與池岸（`isSmoothable` 為 false）高度是刻意訂的，不補。
- 排在花草與矮松之前：補了薄雪的格柱，樹與花草自己會跳過，不會浮在薄雪上；石燈籠用 `clearSnowLayer` 把底下清成整格的雪。
- 神遊的格子（`drift-grid`）本來就把 `layer` 外型當站立面、站立高度取碰撞高度，不必改。
- 量測（`vite-node` 跑地形，與舊版比相鄰兩格的雪面落差）：落差在四分之一格以內的相鄰格從 229 組增到約 1900 組，需要跳的階（超過 0.55）2029 組變 2048 組，沒有新增超過 1.8 格（跳不上去）的階。

**雪的側面**

第一版雪地用 `SNOW`，側面是「雪蓋在土上」那一張貼圖，雪坡一階疊一階，每一階露出一條粉褐色的土邊，整座山像土堆。改用六面都是雪的 `SNOW_BLOCK`；岩與陡處（落差兩格以上）照舊露岩。

**門的位置**

- 大廳那一頭：第一版照框架立在木座邊上（飛石走過來的那一邊的正中）。使用者要門「放在箱庭內，接近中央處」，改用 `createGardenGate` 的 `inner`：雪稜丘的門在岩稜西南側山腳 `(214, 143)`，夾在岩稜與融雪池之間；遣水的門在水道東岸 `(63, 139)`，門洞往西框住水道與瀑布。兩座都在 `garden-builders-major` 補四顆飛石，從木座邊走到門前（飛石蓋掉花草，紙莎草連上面兩格一起清）。門框、木牌與落點都用 ASCII 圖對過：不碰矮松、融雪池、鹿威與木橋，落點在飛石上、離觸發範圍三格半。
- 雪稜丘箱庭的三株矮松原本歪向三個方向，註解卻寫「全部歪向同一邊」；改成一律往東（與雪稜同一個風向），東北那株往西挪兩格，樹冠才不會伸出木座。
- 雪稜的回程門第一版直接整平一塊雪台，門外西邊卻剛好隆起一塊比雪台還高的坡，門洞望出去是一堵岩。改成門外十四格只往下削、每三格矮一格，門洞望出去是一路落到雪原的坡與雲海。

**溪谷的瀑布**（使用者看過第一版：「太單調，要自然、壯觀一點」）

- 第一版是一面五格寬、平平的流水牆貼在一整面直崖上，落進半徑七的圓潭。改版：崖頂缺口往崖裡挖六排、兩邊水口低一格；主瀑布九格寬落二十二格（`WATERFALL_TOP_Y` = 上游谷底 + 22），兩塊突出的岩（`STRAND_ROCK_LIST`）把水幕分成三股；一側一道兩段的小瀑布（`SIDE_FALL`：崖縫 → 岩台小池 → 翻進潭），另一側兩條細流（`TRICKLE_LIST`）；`shapeWaterfallCliff` 讓崖面吃噪音凹進去一兩格（簷）、三層岩層往外突、階上長蕨、簷下垂藤；潭半徑九、中心深四、邊上一圈青苔大石；谷頭的半寬從九放到十三，容得下這些。
- 小瀑布擺在主瀑布靠谷底中線的那一側（谷頭在那一側比較寬，`measureSideSign`），細流在另一側；細流與小瀑布的水柱都只疊在空氣格裡，碰到東西就停，不會插進岩裡。
- 水沫與水霧（`river/waterfall-mist.ts`，由 `backdrop.waterfallMist` 建）：兩套粒子共用一張柔邊貼圖。水沫 240 顆、一兩秒；水霧 70 顆、六到十秒、順著溪往下游飄。顏色每幀用天光加直射光算（與雲海同一套），太陽照到時是亮的暖白，夜裡跟著暗。大廳的遣水沒有水花粒子可以借。
- 跌水：上游谷底高一格，第一版只有兩層水面一高一低，音景卻擺了一顆「跌水」。`placeCascade` 在坎下第一排的水面上疊一格流水。

**遠景**

- `snowpeak`：三圈，雪線在山腳往上三十格。第一版每段窄（二十來格寬的段配一百五十格的起伏），頂上一截白，整圈像一排淡色高樓；段數減少、起伏收小後是一塊一塊的山。
- 雲海（`cloud-sea.ts`）：一片 2400 格見方的平面，著色器取兩次三層值雜訊（往太陽挪一點再取一次當打光），先用低頻雜訊推歪座標；遠處把細碎那兩層收掉（不然變成閃爍的斜紋），越遠越淡進地平線色。對比給太強時雲面像一條條發亮的金屬紋。
- 溪谷的林稜幾乎都被谷壁擋住，只在稜線低處露出來。

**效能**（高畫質 1280×720、交錯三輪、各場景出生點，F3 中位數）

| 場景 | FPS | 幀 GPU 毫秒 | 幀 CPU 毫秒 | 繪製 | 三角形 |
| --- | --- | --- | --- | --- | --- |
| 大廳 | 42～46 | 18.3～19.5 | 15.9～17.7 | 979～980 | 1166k |
| 雪稜 | 60（頂到垂直同步） | 13.4～15.7 | 3.2～3.8 | 116 | 1137k |
| 溪谷 | 60（頂到垂直同步） | 14.7～15.2 | 4.9～5.0 | 180～181 | 584k |

**驗收**（Playwright、headless Chrome、真 GPU、1280×720，腳本不在版控內）

- 真的走過去（假的 pointer lock 按住 W）：雪稜從大廳 `(209.5, 143)` 往東、從雪稜 `(108.6, 140)` 往西；溪谷從大廳 `(67.5, 139)` 往西、從溪谷 `(175.4, 132)` 往東。雪稜（門還在木座邊上時）worker 路徑連續九趟乾淨：去程約 0.8 秒觸發、回程約 0.45 秒，資源數每趟一樣（網格／材質／貼圖／幾何 446／281／284／447、onBeforeRender 25、引擎貼圖 168），worker heap 56.3（開始）→ 76.4 MB（5 趟）；第十趟被別的代理人改檔觸發的 HMR 重新整理打斷。溪谷的十趟兩次都被 HMR 打斷（只跑完一趟）。門搬進箱庭之後，`?renderer=main` 雪稜、溪谷各來回三趟乾淨：落點固定、HUD 正確、資源數每趟一樣（445／281／284／446）。
- 落點：雪稜 `(109, 21.5, 140)`、溪谷 `(175, 12.5, 132)`；回大廳落在各自門外四格的飛石上。原地站 1.5 秒都沒有又被送走；HUD 去程是「雪稜」、回來是「雪稜丘」。
- 邊界：雪稜從雪原外圈按住衝刺往外走十二秒，四個方向最遠停在離中心 56.6～57.4 格（推回線 54、崖邊至少 60），放開三秒內被推回 54 格；往稜線方向走被岩階擋在 40.8 格。溪谷往南、北、西衝刺都被谷壁擋在谷底（y 一直是 12.5），沒有爬上去。
- 四個畫質各一張抬頭看天，沒有棋盤格；雪稜天藍得比較深。
- 型別檢查：minespace 只有原本的 86 個 TS4114。

**還沒驗收的**（使用者要大場景定案後再整套驗收，下面這些改動之後只做了 eslint、型別檢查與一次載入）

- 溪谷改版的瀑布、水霧粒子、跌水流水：沒有重量 FPS（上表是改版前的數字），沒有夜裡與四個畫質的截圖
- 雪稜兩窪融雪池的冰面倒影（`mirrorTargetList`，兩張鏡面算繪目標）：沒有重量 FPS
- 兩座門搬進箱庭之後：worker 路徑十趟、heap、選單「返回禪庭」落點、快速前往落點都沒有在瀏覽器裡走過（落點只用 ASCII 圖對過：雪稜丘 `(208, 143)` 是飛石、遣水 `(69, 139)` 是草地）
- 溪谷 worker 路徑十趟（兩次都被 HMR 打斷）

**已知限制**

- 從可走範圍上方的高空往下看，溪谷稜線外、雪稜崖外都是空的（不畫的 LAKE_BED）；人走不到那個高度。
- 雪稜的推回只在水平方向，萬一真的從崖邊掉下去會落在雲面底下那層不畫的地上，被風推向崖壁；推回線離崖邊六格以上，衝刺實測最遠到離中心 57.4 格。

## Minespace：千頃麥浪、野花原與羊鳴谷（2026-11）

> 後來羊鳴谷與牧野拿掉（連同羊群系統），野花原併進風露原，見「Minespace：拿掉三座箱庭、草苑與蟲聲叢併成風露苑」。下面是當時的紀錄。

麥浪田、草苑、牧野的大場景，資料夾 `domains/realm/wheatfield/`、`meadow/`、`pasture/`（各四支：layout、terrain、realm、sounds）。設計見[設計文件](plans/2026-11-27-minespace-realms-design.md)的同名一節。

**共用檔案的改動**

| 檔案 | 改了什麼 |
| --- | --- |
| `realm-definition.ts` | `RealmId` 加三座；`RealmRidgeStyle` 加 `plains`／`downs`／`fells`；`sheepFlock?: RealmSheepFlock`（羊群的中心、半邊長、隻數） |
| `fauna/use-sheep-flock.ts` | `start` 多收 `area`，不給就是牧野那四隻（`HUB_SHEEP_FLOCK`，亂數順序不變，大廳的羊站回原位）；每隻羊記著自己的 `roamArea`，挑目標與壓回範圍都看它 |
| `realm/world-layer.ts` | `hasGardens` 或有 `sheepFlock` 就放羊；營火照舊只在大廳 |
| `realm/realm-terrain-kit.ts` | `fillHeightStep`：高度圖填成四方相鄰最多差一格（只往上填），順掃倒掃各一次 |
| `realm/backdrop.ts` | 三種山稜樣式 |
| `garden/garden-builders-major.ts` | 麥浪田從南北路往西鋪一段三格寬碎石到門後一格，不動亂數 |
| `realm-list.ts`、`realm-terrain.ts`、`soundscape/realm-emitter-map.ts` | 各登記三座 |

草苑與牧野的箱庭不用改：草苑的門落在花叢裡（花草可以穿過），牧野的門立在柵欄門裡面一格。

**常數**

| 場景 | 常數 | 值 | 說明 |
| --- | --- | --- | --- |
| 麥浪 | `WHEATFIELD_GROUND_Y` | 8 | 起伏零到四格疊在上面 |
| 麥浪 | `WHEATFIELD_PORTAL_POINT` | (164, 140) | 東西路東端，門洞沿 Z；四周五格拉平、再七格混回起伏 |
| 麥浪 | 緩坡 | 74 起、100 最高（+4）、112 外是 LAKE_BED | 半徑吃 ±8 格噪音 |
| 麥浪 | slow／push | 74／88 | `medium: 'land'` |
| 野花原 | `MEADOW_GROUND_Y` | 8 | 圓丘最高七八格 |
| 野花原 | `MEADOW_PORTAL_POINT` | (118, 146) | 門洞沿 Z，落在往東延伸的低谷口；第一版在 (114, 140)，一落地眼前就是一座圓丘 |
| 野花原 | 外圍坡 | 66 起、98 最高（+10）、112 外是 LAKE_BED | |
| 野花原 | slow／push | 70／84 | |
| 羊鳴谷 | `PASTURE_GROUND_Y` | 8 | 谷底 |
| 羊鳴谷 | 山谷 | 橢圓半徑（x × 0.9、z × 1.15）32 內平、86 最高（+16）、100 外是 LAKE_BED | |
| 羊鳴谷 | `SHEEP_PADDOCK` | 中心 (140, 146)、半邊 14 | 北門正對回程門 `(140, 126)` |
| 羊鳴谷 | `PASTURE_SHEEP_FLOCK` | 半邊 10、八隻 | 柵欄裡面三格擺乾草與水槽，羊走不到 |
| 羊鳴谷 | slow／push | 48／60 | 邊界是圓、山谷是橢圓：往南北推回線在坡的上半段，往東西還在坡腳 |

大廳那一頭：麥浪田門 `(135, 140)` 朝東、木牌 `(135, 137)`，落點 `(139, 140)`、快速前往 `(141, 140)`（都在碎石路上）；草苑門 `(175, 127)` 朝西、木牌 `(175, 130)`，落點 `(171, 127)`、快速前往 `(169, 127)`；牧野門 `(173, 150)` 朝北、木牌 `(176, 148)`，落點 `(173, 146)`、快速前往 `(173, 144)`（木座外的白沙）。

**箱庭特徵對照**

| 箱庭的東西 | 來源 | 大場景 |
| --- | --- | --- |
| 麥子照壟、每四行空一行、兩成抽穗 | `buildWheatGarden` | 照搬，每塊田壟向與抽穗比例各異 |
| 碎石路三格寬 | 同上 | 十字兩條 |
| 稻草人（竹竿、橫桿、草束頭） | 同上 | 四成的田各一個 |
| 草束一到兩層 | 同上 | 沿路一堆堆 |
| 石燈籠兩盞 | 同上 | 十二盞 |
| 蒲公英、堇 6% 開在空壟 | 同上 | 照搬 |
| 麥浪隨風擺 | `wind-sway`（交叉立板一律擺） | 自動 |
| 麥稈摩擦四顆 | `sound-data` | 二十九顆 |
| 高草與五種花、62%、比例 | `buildMeadowGarden` | 照搬，花一半成叢 |
| 孤樹一棵、樹旁長凳 | 同上 | 丘頂最多六棵，各配長凳 |
| 草原的風、日頭下的草蟲、草間的蟲聲 | `sound-data` | 照搬，各多幾顆 |
| 柵欄一圈留一道門 | `buildPastureGarden` | 谷底三圈，加坡上長柵欄 |
| 乾草堆（兩捆並排、一捆疊高） | 同上 | 照搬擺法 |
| 木板水槽 | 同上 | 照搬尺寸，槽心改成看得到的水 |
| 高草七成、蒲公英三成、30% | 同上 | 照搬，放羊那圈 18% |
| 羊群（白天走動、入夜趴下） | `use-sheep-flock` | 八隻，範圍放大 |
| 牧場羊群、夜草間的蟲 | `sound-data` | 羊三顆、蟲七顆 |

三座箱庭在大廳沒有其他綁定的效果（天氣範圍、粒子、霧區、鏡面都沒有），全專案搜過箱庭 id 與 `PASTURE_*` 常數。

**踩坑**

- 圓丘用開根號做成圓頂，坡腳那一圈是垂直的，一步兩三格；村落踩過同一個坑。三座都先算整張高度圖再 `fillHeightStep`，量過可走範圍內地形相鄰差最多一格，回程門腳下仍是門的那一層。
- 牧野箱庭的羊走動範圍（柵欄縮兩格）蓋到乾草堆，羊會站上草堆；大場景縮四格，柵欄裡面三格留給乾草與水槽。
- 牧野箱庭的木牌若照預設放在門旁三格，正好在北邊柵欄後面，牌面朝北會貼在欄杆上，所以另給位置。

**規模**（地形 worker 生成時間、看得到的實心方塊、交叉立板等裝飾）

- 千頃麥浪：約 0.1 秒、露出方塊 4.0 萬、裝飾 2.8 萬（麥 2.7 萬）
- 野花原：約 0.2 秒、4.3 萬、2.4 萬
- 羊鳴谷：約 0.2 秒、3.4 萬、0.96 萬（柵欄五百多根）
- 對照：大廳 2.7 萬／0.47 萬、鐘聲村 4.2 萬／0.67 萬。麥浪與野花原的花草是其他場景的四五倍，效能 A/B 尚未量（建造階段，見下）

**驗收**（建造階段，使用者要求定案後再做）：只做了 eslint、vue-tsc、生成檢查與每座一次載入的煙霧測試；來回傳送、記憶體、FPS A/B、四種畫質、邊界、選單「返回禪庭」、快速前往都還沒量。

## Minespace：拓荒原、石殿遺址與湯煙谷（2026-11）

爐火壇、石廊跡、地獄谷的大場景，資料夾 `domains/realm/campfire/`、`ruins/`、`jigoku/`（各四支：layout、terrain、realm、sounds；拓荒原多 `campfire-fires.ts`、石殿遺址多 `ruins-colossi.ts`、湯煙谷多 `jigoku-steam.ts`，都掛在 `realm-decoration`）。設計見[設計文件](plans/2026-11-27-minespace-realms-design.md)的「拓荒原、石殿遺址與湯煙谷」。爐火壇的大場景第一版是「營火谷」（林緣谷地、一座大篝火、六處營地、橡樹林），使用者改成西部拓荒的原野，舊的內容與 `woodland` 山稜樣式已拿掉。

**共用檔案的改動**

| 檔案 | 改了什麼 |
| --- | --- |
| `use-babylon-scene.ts` | `createCampfireSmoke` 多一個 `point`（預設爐火壇的火塘），拓荒原每個火塘各叫一次 |
| `block-constants.ts`、`texture-pack.ts` | 新方塊 `RED_SAND`（紅土）、`RED_ROCK`（紅岩）、`CANVAS`（篷布，借羊毛白）加在 enum 最後；新貼圖 `redSand`／`redRock`：迷你像素用 `default_desert_sand`／`default_desert_stone`，原版用 `red_sand`／`red_sandstone`，其餘材質包退回迷你像素 |
| `world/light-source.ts` | 餘燼的光源往上抬到火焰高度（見踩坑），所有餘燼都受影響 |
| `garden-layout.ts` | `CAMPFIRE_GATE_OFFSET`（4, 0）、`RUINS_GATE_OFFSET`（0, 2）、`JIGOKU_GATE_OFFSET`（0, 3） |
| `garden-builders-minor.ts` | 爐火壇拿掉東側矮凳（門的位置）、乾草往北一格；石廊跡正南那根斷柱不放（亂數照抽，其餘七根不變） |
| `garden-builders-middle.ts` | 地獄谷鳥居到熔岩縫之間（`|x| ≤ 4`、`z ≥ 2`）不堆岸；石碑移到 (+4, +4)、石燈籠移到 (±2, +4) |
| `backdrop.ts`、`realm-definition.ts` | 山稜樣式 `mesa`、`crag`、`caldera` |
| `realm-list.ts`、`realm-terrain.ts`、`realm-emitter-map.ts`、`realm-decoration.ts` | 三座各一行 |

**常數**

| 場景 | 常數 | 值 |
| --- | --- | --- |
| 拓荒原 | `CAMP_GROUND_Y`／`PRAIRIE_RADIUS`／`GULLY_DEPTH`／`ROCK_WALL_RADIUS`／`ROCK_WALL_HEIGHT` | 9／62／4／72／8（兩格一階） |
| 拓荒原 | `WAGON_CIRCLE_RADIUS`、`COOK_FIRE_POINT`、`HOMESTEAD_POINT` | 11、(138, 134)、(166, 116) |
| 拓荒原 | `CAMP_PORTAL_POINT`、`CAMP_SLOW_RADIUS`／`CAMP_PUSH_RADIUS` | (164, 140)、60／70 |
| 石殿遺址 | `RUINS_GROUND_Y`／`RUINS_TERRACE_Y` | 9／10（殿基高一格） |
| 石殿遺址 | `COLONNADE_RECT`／`HALL_RECT`／`CHAMBER_RECT` | x 132～148 z 148～184／x 118～162 z 104～148／x 132～148 z 92～104 |
| 石殿遺址 | `RUINS_RIM_START_RADIUS`／`RUINS_RIM_RADIUS`／`RUINS_RIM_HEIGHT`、邊界 | 58／82／9、60／72 |
| 湯煙谷 | 已重做成火口與熔岩湖，常數見下面的「Minespace：湯煙谷改成火口與熔岩湖」 | |

- 大廳那三座：爐火壇 (130, 107) 門洞朝東、落點 (134, 107)；石廊跡 (154, 109) 朝南、落點 (154, 113)；地獄谷 (118, 89) 朝南、落點 (118, 93)。快速前往再退兩格，都落在木座外的白沙上。
- 規模（`collectLightSourceList` 後的真光數／樹葉格／露出來的方塊／花草）：拓荒原 9／0／12 萬／4700；石殿遺址 13／0／12.1 萬／1800；湯煙谷（第一版，已重做）59（熔岩面光源 26）／0／11.6 萬／1600。大廳（含十幾座門的燈）是 117／2700／11 萬／4800。地形生成 0.12～0.24 秒。

**箱庭特徵對照**

| 箱庭的東西 | 出處 | 大場景 |
| --- | --- | --- |
| 火塘（沉進地面的餘燼）、半磚石圈、矮凳 | `buildCampfireGarden` | 篷車圈裡煮飯的那一堆與外圍兩處守夜的小火照搬；使用者不要大營火，沒有篝火 |
| 籬笆柱木板棚、柴、木箱、木桶、乾草 | 同上 | 換成拓荒的語彙：篷車、木屋工地、拴馬處；木箱、木桶、乾草、原木照用 |
| 橡樹、蕨與高草（兩成四） | 同上 | 使用者要乾草原：換成乾草、山艾、仙人掌與曬白的枯樹（四成二），不照搬 |
| 火焰立板與方塊煙（`createCampfireSmoke`，只在大廳） | `use-babylon-scene` | 三堆火各一組，`campfire-fires` |
| 營火劈啪（campfire，0.9、20 格） | `sound-data` | 篷車邊的柴火 0.85／20 格、守夜小火 0.6／13 格；另加草原的風、岩壁的風、夜蟲、遠嚎 |
| 八根斷柱一圈、刻紋石碑、橫樑、藤蔓 | `buildRuinsGarden` | 大殿正中照搬；長廊與殿內石柱、牆、拱門同一套石磚與青苔圓石 |
| 石板縫裡的青苔與草、倒下的青苔石、石燈籠 | 同上 | 殿基四分之一換青苔／草；殿外亂石；七盞＋石室兩盞 |
| 石生植物、高草、灌叢（三成） | 同上 | 殿基三成、荒地一成四、亂石坡一成 |
| 廊間穿堂風、石縫滲水、棲在斷樑的鴞 | `sound-data` | 穿堂風八顆、滲水三顆（石室那顆最響）、鴞兩隻（夜） |
| 熔岩縫（兩格深、黑曜石磚底）、黑曜石岸 | `buildJigokuGarden` | 撐開成一整座熔岩湖（一格深、玄武岩底），岸變成十格高的崖 |
| 石板→圓石→黑曜石磚三層地面、餘燼 | 同上 | 台地由外往內石與礫→圓石→玄武岩夾黑曜石磚；餘燼一格都不撒（每格一盞燈），換成不點燈的 `MAGMA_ROCK` 裂縫 |
| 鳥居、刻紋石碑、一對石燈籠、沒有橋 | 同上 | 鳥居兩座（進谷的木棧上一座、熔岩裡一座大的），碑與燈籠在湖裡的祠台；路只到祠台，不跨熔岩 |
| 炭黑枯木、白骨、枯灌／枯草／石生植物（兩成） | 同上 | 枯木三十株、白骨八塊、同一個配方（一成半），玄武岩上不長 |
| 地獄谷熱氣（`JIGOKU_ATMOSPHERE`：霧 3～22、入夜不暗、光 0.55／天光 1.12／高光 0.12） | `use-weather` | 寫在氣氛設定：霧色固定值（暗紅，比地獄谷暗得多）、24～300、0.5／0.9／0.14；另加一層煙幕 |
| 熔岩滾沸一圈、地底悶響 | `sound-data` | 熔岩面上十三顆（兩道瀑布最響）、泥池四顆（小一號），悶響三顆加遠火山一顆 |

**石殿遺址的遠景巨像（`ruins/ruins-colossi.ts`）**

- 世界只有四十格高，四五十格以上的巨像放不進方塊世界，人又走不到，做成方塊是白花幾萬個面。改成布景：一個網格、約一百五十個方盒（不畫底面，約一千五百個三角形）、一次繪製，排在山稜那一層（渲染群組 1），不投影。
- 立在離遺址中心一百六十五到兩百八十格的岩地平面上（世界外），亂石坡坡頂擋住下半截。不吃距離霧，照山稜那一套自己往霧色混：依距離一成到五成半，腳下再多混一層，轉場時跟著 `veilRatio` 化掉；顏色是石頭與青苔的基準色乘上此刻的天光與直射光。
- 為了一層一層退進霧裡：場景霧從 30～150 推到 40～220（坡頂只混兩成左右），`crag` 三圈岩稜的混色加重到 0.5／0.64／0.76，比最遠的神殿還淡。
- `realm-decoration` 的參數多了 `atmosphere`（`world-layer` 帶進來），遠景一類的裝飾要讀天色。

**踩坑**

- 新模組要先寫好，最後才在共用檔案加 import：使用者的開發頁一直開著，先加 import 會讓 Vite 解析失敗、整頁壞掉（石殿遺址的巨像就踩過一次）。
- 營火照亮的範圍很小（使用者：「光源被周圍的石頭擋住，明亮區塊很小」）：真光、光暈與全局光的種子都擺在餘燼那一格的中心，而餘燼沉在地面那一層，光源比地面低半格。地面與矮凳的頂面法線朝上、光從底下來，一點都照不到，只剩石圈與矮凳朝火的側面亮；全局光的種子也落在被地面包住的粗格裡。改成 `light-source.ts` 收集時把餘燼的光往上抬一格二（頭上兩格空才抬滿、一格空抬一半、被蓋住不抬），三條路（`use-block-lights`、`lamp-glow`、`voxel-gi-grid`）都讀同一個座標，一起修好。只抬餘燼，岩漿的面光源不動。影響所有餘燼：爐火壇、營火谷、地獄谷與湯煙谷地上零星的餘燼（光暈改浮在地面上方一格左右）、鐘聲村鐵匠鋪的爐。烘進方塊的光（`use-chunk-worker` 的廣度優先擴散）本來就從餘燼上方那一格空氣往外漫，不受影響。亮度與範圍沒改（`use-block-lights` 不動）。這是第一版營火谷時修的，拓荒原的三堆小火照樣受惠。
- `createCampfireSmoke` 找火塘高度用 `getGroundY`（從上往下第一個實心方塊），火塘正上方不能有棚頂，所以棚子離火塘四格起。
- 湯煙谷的蒸氣與氣泡排在 `WEATHER_RENDERING_GROUP`：粒子在半透明之前畫，留在預設那一層的話，熱泉上的蒸氣會被後畫的水面整片蓋掉（同洞窟的螢光倒影）。
- 熔岩縫照地獄谷的餘燼密度撒會讓光源破百，收到 0.13 之後全谷五十九盞（熔岩四格見方一盞、餘燼兩格見方一盞）。重做成火口之後改用不點真光的方塊，降到十五盞（見「Minespace：湯煙谷改成火口與熔岩湖」）。

**驗收**：建構階段只做了冒煙檢查（見下）；來回傳送、記憶體、FPS A/B、四種畫質的天空、邊界與快速前往都還沒量，等設計定案後再補。

## Minespace：聽雨林、雨聽深院與白矇雪原（2026-11）

> 後來雨聽深院與雨聽堂拿掉，見「Minespace：拿掉三座箱庭、草苑與蟲聲叢併成風露苑」。下面是當時的紀錄。

聽雨亭、雨聽堂、吹雪野的大場景，資料夾 `domains/realm/rainvale/`、`rainhall/`、`blizzard/`（各四支：layout、terrain、realm、sounds）。設計見[設計文件](plans/2026-11-27-minespace-realms-design.md)的「聽雨林、雨聽深院與白矇雪原」。

**大場景的天氣（`RealmDefinition.weather`）**

大廳的雨雪綁在箱庭座標上（`use-weather` 的 `RAINVALE_ZONE`／`RAINHALL_ZONE`／`BLIZZARD_ZONE`），只在 `hasGardens` 時算。大場景改由定義給 `weather: { rain?, snow?, hasThunder? }`，`rain`／`snow` 是 `{ min, max, periodSecond }`，`measureRealmWeatherLevel` 用兩道週期互質的正弦在 min 與 max 之間起落。算出來的雨（雪）勢接回原本的 `rainRatio`／`snowRatio`，下游整套照舊：粒子（跟著鏡頭、射線打到屋頂或樹冠就停，亭子裡與簷下是乾的）、霧與光（滿檔時整份換成 `RAIN_ATMOSPHERE`／`SNOW_ATMOSPHERE`，場景自己的 `atmosphere` 只在雨勢沒滿時露出來）、陰天罩與天體淡出、雲淡掉、地濕、`weather` 給音景的鳥蟲噤聲。`hasThunder` 時 `thunderRatio = rainRatio`，雷聲要有一顆 id 為 `rainvale-thunder`、`trigger` 模式的音源（渲染端只認這個名字）。沒給 `weather` 的場景雨雪都是零，不會漏到別的場景。

**共用檔案的改動**

| 檔案 | 改了什麼 |
| --- | --- |
| `realm-definition.ts` | `RealmWeather`、`RealmWeatherLevel`、`RealmDefinition.weather`；`RealmId` 三個 |
| `use-weather.ts` | `measureRealmWeatherLevel`；大場景的 `rainRatio`／`snowRatio`／`thunderRatio` 改看定義 |
| `garden-builders-middle.ts` | 雨聽堂牆高 4 → 5（門有五格高，收進屋裡）；屋裡那盞落地燈從西北角挪到門西南一格 |
| `realm-list.ts`、`realm-terrain.ts`、`realm-emitter-map.ts` | 三座各一行 |

聽雨亭、吹雪野的造景沒動，門立在原本空著的格子上。

**常數**

| 場景 | 常數 | 值 |
| --- | --- | --- |
| 聽雨林 | `RAINVALE_GROUND_Y`、`THICKET_START_RADIUS`／`RAINVALE_EDGE_RADIUS`、邊界 | 10、40／52、42／50 |
| 聽雨林 | `RAINVALE_PORTAL_POINT`、`ARRIVAL_POND`、雨勢 | (164, 142)、(153, 141) 半徑 5、0.78～1／150 秒、打雷 |
| 雨聽深院 | `RAINHALL_FLOOR_Y`、`HALL_RECT`（相對中心）、`HALL_WALL_HEIGHT` | 10、x ±11 z −26～−14、5 |
| 雨聽深院 | `CLOISTER_OUTER_RECT`、`CLOISTER_WIDTH`、`CLOISTER_WALL_HEIGHT`、渡廊 z | x ±23 z −28～28、4、4、−14～−12 |
| 雨聽深院 | `RAINHALL_PORTAL_POINT`、雨勢 | (140, 115)、0.95～1／180 秒 |
| 白矇雪原 | `BLIZZARD_GROUND_Y`、`DRIFT_WALL_START_RADIUS`／`BLIZZARD_EDGE_RADIUS`、邊界 | 10、44／58、44／52 |
| 白矇雪原 | `BLIZZARD_PORTAL_POINT`、雪勢 | (140, 110)、0.72～1／80 秒 |

- 大廳那三座（相對箱庭中心）：聽雨亭 (3, 2) 朝東、雨聽堂 (0, −2) 朝南（木牌改到門東南一格）、吹雪野 (0, −1) 朝北。快速前往的落點：聽雨亭與吹雪野落在木座邊緣，雨聽堂落在屋前的卵石滴水線上。
- 規模（`vite-node` 數的：發光方塊／樹葉格）：聽雨林 7／12 800；雨聽深院 31／0；白矇雪原 23／440。地形生成 0.05～0.28 秒。

**箱庭特徵對照**

| 箱庭的東西 | 出處 | 大場景 |
| --- | --- | --- |
| 雨區（雨絲、陰天、霧、地濕、鳥蟲噤聲）、只在聽雨亭打雷 | `use-weather` | 聽雨林整片 0.78～1、打雷；雨聽深院 0.95～1、不打雷 |
| 屋頂底下沒有雨（雨滴射線） | `rain-particles` | 照用：亭子、大堂、迴廊、渡廊底下都是乾的 |
| 積水倒影 | `water-mirror`（聽雨亭在名單上） | 聽雨林落腳那一池一面鏡子 |
| 三棵橡樹配叢林葉（樹冠接成一片） | `buildRainvaleGarden` | 每九格見方抽一次，機率六成上下；外圈細高樹 |
| 一窪一格深黏土底的積水 | 同上 | 八窪，最大那窪中間深兩格 |
| 圍籬細柱小亭、榻榻米、木階梯椅、吊燈、風鈴 | 同上 | 四座，尺寸材料照搬，椅子朝各自那窪水 |
| 苔石、菇與腐葉為主的地被（一成九） | 同上 | 十四塊苔石、同配方同密度（外圈三成二） |
| 雨打樹葉一圈、遠雷（trigger）、蟾蜍 | `sound-data` | 樹冠雨網格、亭頂雨、水面雨、遠雷九十格、蟾蜍 |
| 三面牆南面敞開的屋、側窗、障子、出簷階梯、兩層屋頂 | `buildRainhallGarden` | 大堂照搬放大；迴廊與渡廊同一套出簷 |
| 卵石滴水線與上面的積水 | 同上 | 依屋頂算出每一道出簷的滴水線，一成積水；中庭一大窪 |
| 和紙燈、吊燈、風鈴、坐墊、石燈籠兩盞、蕨與捲葉草（兩成二） | 同上 | 燈二十來盞、坐墊十幾個、風鈴兩個、石燈籠十盞、同配方同密度 |
| 屋瓦雨一圈、簷下滴水、蟾蜍 | `sound-data` | 屋瓦雨二十一顆、簷下滴水十七顆、中庭雨三顆、蟾蜍兩隻 |
| 暴風雪（滿檔的內縮給零、白矇六格、天與地同色） | `use-weather`、`atmosphere` | 整片 0.72～1，大部分時候白矇 |
| 雪地、順風拖長的薄雪紋（同一組噪音） | `buildBlizzardGarden` | 照搬；另加東西向的雪丘 |
| 三盞石燈籠、三株往西歪的矮松、兩塊石、枯枝 5%、最後蓋雪 | 同上 | 正中照搬；外面燈籠二十盞內（一半半埋）、松二十來株、石六塊、枯枝 5%、蓋雪 |
| 四面的暴風雪一圈、打旋陣風 | `sound-data` | 每十格一顆暴風雪、七陣會飄的陣風；不加別的聲音 |

**踩坑與注意**

- 雨聽堂的門立在屋裡，預設木牌位置（門旁三格）落在牆上，`RAINHALL_HUB_GATE` 在 `createGardenGate` 之後改寫 `portal.sign`。
- 門有五格高（三格門洞、島木、笠木），四格高的屋子裝不下，所以雨聽堂牆加高一格；屋頂維持出簷加兩層，站在屋裡頭頂三層，`measureCoverRatio` 不會當成進洞穴壓暗（大堂同理，迴廊與渡廊只有兩層）。
- 聽雨林的池子曾經整片是綠的（使用者回報）：布景的地面平面（`backdrop.floor`）是鋪滿整個世界的一片面，不只在林子外。照林海的寫法給在草地頂面（10.5），它比積水的水面（矮八分之一格）還高，每一窪水都被一片草地蓋住。關掉倒影、關掉雨都一樣綠，大廳的聽雨亭照樣是藍的，才確定不是倒影或雨。改成林子外的 LAKE_BED 與平面都壓低兩格（`RAINVALE_OUTER_FLOOR_Y`），平面整片藏在地底下；雨聽深院四面封住，用不到平面，直接拿掉。**有水的場景，地面平面一定要低於最低的水面**（湖中島與千蛙沼給的是湖底的高度，所以沒事）。
- 白矇雪原自己寫蓋雪：`capWithSnow` 會替每一格雪丘頂再鋪一層薄雪，也會在細樁頂上浮一片全寬的雪。
- 雨勢滿檔時場景自己的霧與光整份被 `RAIN_ATMOSPHERE`／`SNOW_ATMOSPHERE` 蓋掉，要調那兩座的霧色得調天氣那一組（會連大廳一起變）或把雨勢上限壓低。

**驗收**：建構階段只做了冒煙檢查（eslint、各場景載入一次無錯誤、少量截圖）；來回傳送、記憶體、FPS A/B（尤其雨雪粒子與聽雨林的鏡面）、四種畫質的天空、邊界、快速前往、雷聲與閃電都還沒量，等設計定案後再補。

## 體積雲：每日天氣與指定日序

雲有每日天氣（`cloud-daily-weather.ts`）：每個遊戲日用日序抽出溫度、濕度、風三個數字，兩天之間在正午與正午之間平滑內插，由它推出雲量、層雲、雲塔、風速、高積雲、卷雲與夜光雲。日序由 `use-day-night` 的 `applyToCloud` 數午夜（時刻從 1 繞回 0 加一，往回撥減一），寫進 `volumetricCloudState.dayPosition`；起點是真實日曆日，每天打開天空不同。

**對著特定天氣調雲**：開發模式下 `reload-handoff` 的 `dayIndex` 欄位會覆寫起始日序（正式版不讀）。Playwright 腳本在 `sessionStorage['minespace-reload-handoff']` 的 JSON 裡多放 `dayIndex` 即可。用 `npx vite-node` 載入 `cloud-daily-weather.ts` 印出前幾十天的 `deriveCloudWeather` 結果，挑出想看的日子（例如雲塔最強、層雲最強、夜光雲出現的那幾天），夜光雲要把時刻設在日落後 / 日出前（約 0.77 / 0.23）才看得到。

## 體積雲：圖層、區域變化與踩過的坑

程式在 `domains/weather/volumetric-cloud/`，密度與光照全在 `cloud-glsl.ts`，`volumetric-cloud.ts` 管步數、降解析度與時間累積。

**各層雲**

- **積雲**：球殼（半徑 12000）內行進，天氣圖決定哪裡有雲，高度剖面決定垂直形狀，基底與細節 3D 雜訊啃輪廓。
- **雲塔**：雲塔那天把整個球殼的頂抬高（最多 +70 格），再由著色器的 `towerMask` 讓一部分地區真的長到那裡。光線步長與雲影步長一律以「基準厚度」計算（`cloudLightOpticalDepth` 除以 `cloudWeather.z`，雲影同理），不隨當天厚度變，否則打光與雲影會跟著天氣變。
- **高積雲**（300 到 330 格）：薄層，只走 3 到 12 步（`stepCount / 12`）。積雲不透明度達 0.9、或整層覆蓋率上限（`z × 1.9`）低於 0.03 時整層跳過；光線步的區域取樣沿用主取樣的，不重取。
- **卷雲**：`cloud-noise.ts` 的 `createCirrusMap` 在 worker 裡沿流場做 LIC（線積分卷積），預烘成 2D 貼圖，著色器只查圖。在著色器裡扭座標試過，像大理石紋。
- **夜光雲**：貼在天球上的銀藍細絲，不走球殼求交，只在日落後一小段時間出現。
- **地面反光**（ground bounce）：白沙反照率高，雲底帶一層暖亮。向下取一次密度估下方遮蔽，只在 `heightRatio` 介於 0.15 到 0.5、非遠處、透光率夠時做，往上以 smoothstep 淡出到解析式估計，避免 0.5 那層出現硬邊。
- **高光柔性壓縮**（`cloudSoftClip`）：逆光時薄雲邊亮度遠超過 1，預乘後直接全白。先除回不透明度，超過 0.75 的部分用指數收進 1，再乘回去。
- **抗振鈴**：合成用 Catmull-Rom 放大，負瓣會讓高對比邊界過衝，太陽附近的雲邊描上一圈藍邊。結果夾在最近四個原始格的最小與最大之間。

**宏觀變化與宏觀圖**

天氣圖以 0.31 倍頻率再取一次（週期約 1 萬格），用來推擠基底雜訊的取樣座標（避免雲形重複），並調整局部覆蓋率（0.2 到 1.7 倍）。原本這是對天氣圖多取兩次樣（0.31 與 0.23 兩個頻率），現在 worker 把它們烘成一張 RGBA「宏觀圖」（`createMacroMap`：紅覆蓋、綠偏移 X、藍偏移 Y），著色器一次取樣拿齊。偏移 Y 是天氣圖種類通道轉置再平移的結果，只要與偏移 X 不相關就夠，不必保留第二個頻率。

**高空的雲不要乘 `cloudOrigin`**

`cloudOrigin` 是風吹過的距離加上循環世界的平移。高積雲與卷雲要比積雲飄得快，原本整個 `cloudOrigin` 乘 1.4 與 1.6，連世界平移也乘了：鏡頭走出邊界被搬一個世界寬時，兩層雲會分別跳 0.4、0.6 倍世界寬。現在拆成 `cloudWindShift`（xy 是風，zw 是世界平移），只放大風，世界平移固定乘一。夜光雲沒有世界座標，只吃風。

**踩過：不能拿隨地點變化的係數去乘絕對座標**

曾讓基底雜訊的頻率依區域在 0.8 到 1.3 倍之間變化（`basePoint * scale * sizeScale`），想讓有的區域雲大、有的零碎。但 `basePoint` 是絕對座標，含風吹過的總距離與雲自己的演變量，兩者隨遊玩時間無限增長。乘上隨地點變的係數後，相鄰兩點取樣位置的差等於「座標乘係數差」，越玩越大，半小時到一小時後雲被拉成長條紋。把 `windTravel` 調大即可重現。要區域性的尺度變化，只能在兩次固定頻率的取樣之間混合，不能縮放座標。

**遠處的簡化路徑要與完整路徑對齊**

超過 `FAR_DETAIL_DISTANCE`（600 格）不取細節雜訊。完整路徑的結果是 `eroded × mix(0.55, 1.15, detailFbm) × 1.8`；簡化路徑若直接回傳原始密度，雲在 600 格那條線上會突然變細變淡，看得到等高線。現在簡化路徑以細節平均值（`detailFbm` 實測平均 0.47，`mix` 平均 0.83）預先套一次侵蝕與增益（`cloudDensityLevel` 的 level 1）。跳空、光線與遮蔽取樣用原始密度（level 2），因為跳空必須是完整路徑的超集合。

**雲影隔一幀重算**

雲影圖是軟邊、變化慢，`renderShadowMap` 偶數幀才畫，其餘沿用上一張，並連同當時的中心一起交給地面外掛（圖與中心必須是同一組）。剛開始、被傳送、或離上次中心超過圖寬 20%（循環世界換邊）時，當幀就重算。

### 雲團連成一大片

- 原本滿天都是碎碎的小朵，不管哪天都一樣。原因有三：基底雜訊週期參考 Photon 時從 300 縮到 220，雲變小；`cloudDensityLevel` 只把基底最高的那一段（門檻 0.72～0.93）當成雲，切出來全是孤立的雲團，覆蓋率再高也只是顆數變多；侵蝕把邊啃得很碎。
- 改法：週期放回 300；門檻跟著區域雲量走（`CLOUD_MERGE_GLSL`），`regional` 從 0.6 到 0.95 時門檻降到 0.64～0.9，雲團之間的鞍部長出雲、連成一大片，雲少的地方照舊零散；同一段侵蝕減一成。
- 坑：第一版門檻壓到 0.5～0.82、侵蝕減四成，整片密度頂到飽和，基底的起伏被抹平，只剩每 26 格重複一次的細節雜訊在撐，大片雲上出現規則的斜紋，頭頂也變成沒有團塊的陰天。連起來的雲仍要留住基底那一層的鼓起與縫隙。
- 成本：高畫質同一輪交錯量，修改前後都約 29 FPS。雲的面積變大，行進成本理論上會增加，之後若要再放寬門檻得重量。

## Minespace：萬花蜂台、蟲鳴夜原、百囀林苑與蟬雨深林（2026-11）

> 後來萬花蜂台與蜂巢圃拿掉，蟲鳴夜原併進風露原，見「Minespace：拿掉三座箱庭、草苑與蟲聲叢併成風露苑」。下面是當時的紀錄。

蜂巢圃、蟲聲叢、鳴禽庭、蟬時雨的大場景，設計見 [plans/2026-11-27-minespace-realms-design.md](plans/2026-11-27-minespace-realms-design.md) 的同名一節。四座都是陸地，各四支（layout、terrain、realm、sounds），共用 `realm/land-realm-kit.ts`。

**共用的部分**

| 改了哪裡 | 做什麼 |
| --- | --- |
| `realm/land-realm-kit.ts` | `fillGroundColumn`／`fillHiddenColumn`（地柱、外圍不畫的 LAKE_BED）、`samplePathCurve`／`createPathDistanceMap`（Catmull-Rom 小徑與距離表）、`hollowEnclosedLeafList`（拿掉六面都貼著樹冠的葉子）、`plantOnGround` |
| `RealmWeatherParticle.fireflyDensity` | 螢火生成速度的倍率（air-motes 的 `update` 第五個參數）。螢火容量從 48 加到 144（`use-weather`），生成速度沒變，大廳的螢火一樣多 |
| `backdrop` 的 `RIDGE_STYLE_MAP` | 新增 `blossom`、`moor`、`arbor`、`canopy`（`downs` 已被野花原用掉） |
| 箱庭造景 | `buildApiaryGarden` 竹籬讓出正中三格；`buildInsectGarden`、`buildSongbirdGarden`、`buildCicadaGarden` 撒完草再拔出門前那幾步（亂數順序不變）；`buildCicadaGarden` 四棵樹的樹幹一律七格（亂數照抽） |

**常數**

| 場景 | 常數 | 值 | 說明 |
| --- | --- | --- | --- |
| 萬花蜂台 | `APIARY_FLOOR_RADIUS`／`TERRACE_WIDTH`／`TERRACE_COUNT` | 15／6／5 | 谷底半徑、花台寬與層數，半徑吃 ±4 的噪音 |
| | `RIM_STEP_WIDTH`／`RIM_RISE_MAX` | 4／4 | 最上層外兩道兩格一階的花坡，稜線在谷底以上九格 |
| | `APIARY_SLOW_RADIUS`／`APIARY_PUSH_RADIUS` | 42／51 | `land` |
| 蟲鳴夜原 | `MEADOW_RADIUS`／`DOWNS_STEP_WIDTH`／`DOWNS_RISE_MAX` | 44／3／8 | 草坡前兩階各一格、之後兩格一階 |
| | `INSECT_SLOW_RADIUS`／`INSECT_PUSH_RADIUS` | 42／52 | `land` |
| | `INSECT_ZONE_LIST`／`ZONE_MIX_MAP` | 六區 | 每一格照最近的中心分區（座標先各吃一層九格的噪音位移），交界 `ZONE_BLEND_WIDTH` 七格內有機會長隔壁那一區的草；每一區一組權重與疏密（terrain） |
| 百囀林苑 | `PARK_RADIUS`／`SONGBIRD_EDGE_RADIUS` | 38／54 | 草地外每三格高一格，橡樹每三格見方抽一次、越外越密 |
| | `SONGBIRD_SLOW_RADIUS`／`SONGBIRD_PUSH_RADIUS` | 40／49 | `land` |
| 蟬雨深林 | `CROWN_BOTTOM_Y` | 17 | 主林層樹冠底面（腳底以上六格），蟬的音源掛在這裡 |
| | `WOOD_RADIUS`／`CICADA_EDGE_RADIUS` | 40／52 | 老樹每十八格見方抽一次、主林層每四格、矮樹每五格；外圍主林層更密、樹冠小 |
| | `CICADA_SLOW_RADIUS`／`CICADA_PUSH_RADIUS` | 42／51 | `land` |

**箱庭特徵對照**（箱庭裡有什麼 → 大場景怎麼延續）

- 蜂巢圃：蜂箱三個疊在木板上、頂上木半磚 → 谷底九個、花台十四組各三個；竹籬 → 谷底一道、每組上坡一側七格；蜂蜜與木桶 → 谷底與每組旁邊；花（同一組比例、六成）→ 全谷；蜂群繞蜂箱轉（`orbit`）→ 每組一群；夜裡螽斯 → 每組一隻。大廳沒有蜜蜂粒子，大場景也沒有
- 蟲聲叢：草（同一組比例、七成八）→ 落腳那一區照抄，其他五區換花色（使用者要求）；枯木樁一兩格 → 三四根一叢；圓石立石加一塊圓石 → 十幾堆；乾土、仙人掌、三成枯灌 → 五片窪地；日行草蟲兩顆、夜裡合唱兩顆加兩隻獨奏 → 鋪滿。螢火在大廳是全域的（不綁蟲聲叢），這裡乘三倍
- 鳴禽庭：三株矮橡樹 → 二十來叢三株；鳥屋 → 十座；飲水盤 → 六只；花（同一組比例、六成六）→ 全草地；烏鶇（換樹）、交嘴雀、水鳥、夜梟 → 各多幾隻，一顆風聲都不放
- 蟬時雨：擠在一起的橡樹 + 合成一片的濃蔭（一成八葉縫）→ 整片闊葉林，樹冠擠成一片、約一成五的縫；土與苔的地、林下四種草（三成四、不放花）→ 全林；緣廊（坐墊、吊燈、短簷）→ 兩道；石燈籠 → 三盞；蟬六顆一圈掛在樹冠高度 + 近處一隻 → 每十五格一顆 + 五隻；入夜蟋蟀 → 疏疏一片。這四座在大廳都沒有天氣範圍、鏡面或專屬粒子

**踩坑：碗狀場景不能鋪地面平面**

- `backdrop.floor` 是一整片鋪過世界的平面（`isEndless` 只決定鋪不鋪到地平線），高度只能低於所有看得到的地面。萬花蜂台與蟲鳴夜原的外圍比場景中心高（花坡、草坡），平面若放在稜線那一層，就成了蓋在谷上的天花板。這兩座不給 `floor`，稜線外的 LAKE_BED 從場景裡本來就看不到。
- 外圍墊太高，遠景就整圈被擋掉：花坡第一版墊高十格，從谷底看出去兩百多格外低於六十格的東西全看不到，山稜等於白畫。花坡收到四格，遠景樣式的底也墊高（`blossom` 最近那圈底高二十四格）。

**葉子方塊數**（`map.ts` 數的，大廳 2 991、林海 16 080、金葉林 11 619）：萬花蜂台 0、蟲鳴夜原 0、百囀林苑 12 640（拿掉包在裡面的之後）、蟬雨深林 15 766（第二版一棵一棵的樹冠，拿掉包在裡面的之後；第一版平蓋子 9 295）。

**踩坑：林子裡的音源被抬到樹冠頂**

- 症狀：蟬雨深林第一版在林下走幾乎聽不到蟬（使用者回報）。
- 根因：大場景的音源沒給 `y` 時，高度是 `getWaterlineY` + `heightOffset`；`getWaterlineY` 找這一柱最上面那格穿不過去的方塊，樹葉也算（`passable` 只有花草）。蟬給 `heightOffset: 8`，實際落在樹冠頂再往上八格，離林下的耳朵將近二十格，可聽距離十八格幾乎全被垂直那一段吃掉。遮蔽不是原因：樹葉本來就在 `SOUND_TRANSPARENT_SET`。
- 修法：林子裡的音源直接給世界座標的 `y`（蟬在 `CROWN_BOTTOM_Y`、百囀林苑的鳥在腳底以上五格），蟬每十三格一顆、可聽二十二格。大廳的蟬時雨與松籟林的鳥同樣貼齊樹冠頂再往上，大廳的音源清單是共用檔，沒動。

**尚未驗收**（使用者要等設計定案再整套驗收）：來回傳送與記憶體、高畫質 FPS 對照大廳、四種畫質的天空、夜裡的螢火與燈、邊界推回、選單「返回禪庭」與快速前往（快速前往的落點用字元圖確認過：蜂巢圃門北邊六格的白沙、蟲聲叢門東邊六格的木地板、鳴禽庭門東邊六格的白沙、蟬時雨門南邊六格的木地板）。

## Minespace：拿掉三座箱庭、草苑與蟲聲叢併成風露苑（2026-11）

使用者：「刪除牧野、雨聽堂、蜂巢圃，並重新規劃箱亭位置」、「草苑和蟲聲叢好像有點重疊，巧妙融合成一個」。設計與新佈局的表見[設計文件](plans/2026-11-27-minespace-realms-design.md)的「風露原與大廳重排」。箱庭從二十二座變成十八座（內圈五、中圈四）。

**拿掉的東西**

| 位置 | 拿掉什麼 |
| --- | --- |
| `domains/realm/pasture/`、`rainhall/`、`apiary/`、`insect/` | 整個資料夾；`realm-list`、`realm-terrain`、`soundscape/realm-emitter-map` 的登記；`RealmId` 少四個 |
| `garden-layout` | `GardenId` 與 `GARDEN_LIST` 少 `pasture`、`apiary`、`rainhall`、`insect`；`PASTURE_CENTER`／`PASTURE_HALF_SIZE` |
| `garden-builders-minor`／`-middle`、`garden-generator` | `buildPastureGarden`、`buildApiaryGarden`、`buildInsectGarden`、`buildRainhallGarden` 與分派表 |
| `sound-data` | 牧野、蜂巢圃、雨聽堂、蟲聲叢的音源（蟲聲叢那幾顆併進風露苑） |
| `use-weather` | 雨聽堂的雨區（`RAINHALL_ZONE`），`RAIN_ZONE_LIST` 只剩聽雨亭 |
| 羊群 | `fauna/use-sheep-flock.ts` 整支刪掉（大廳的牧野與羊鳴谷是僅有的兩群）；`world-layer`／`render-runtime` 的接線、`RealmDefinition.sheepFlock` 與 `RealmSheepFlock`、`WOOL_TEXTURE`、效能面板的「羊群」標籤 |
| `backdrop`／`RealmRidgeStyle` | `fells`、`blossom`、`moor` |
| 音檔 | `bee.mp3`、`village-sheep.mp3`（只有那兩座用） |

刻意留著的：`BlockId.HONEY_BLOCK`（列舉中間拿掉一項，後面每一種方塊的編號都會位移）、材質包裡五種羊毛貼圖（`woolGrey` 等，拿掉要動材質包、清單與同步腳本，另外處理）、`rain-roof`（聽雨林還在用）、`land-realm-kit`（風露原、鳴禽庭、蟬時雨還在用）。

**合併**

- 代號沿用 `meadow`（資料夾 `domains/realm/meadow/`），名稱風露苑／風露原。`buildMeadowGarden` 換成兩座合起來的造景，`MEADOW_PLANT_MIX` 是兩座的花草各一半
- `meadow-layout` 新增 `MEADOW_ZONE_LIST`（七區）、`MEADOW_PATH_CONTROL_POINT_LIST`、`MEADOW_HOLLOW_LIST`。窪地不寫死座標：模組載入時以拉平前的高度每六格量一次谷底（比四周七格都低、中心四格內起伏不到一格半），由低到高挑、彼此隔二十四格，音源與地形 worker 讀同一份（目前五處：(92, 146)、(116, 110)、(140, 110)、(158, 134)、(170, 176)）
- 窪地在谷底、本來就平，沙直接換掉每一格最上面那層草，不另外拉平：野花原的地面是先算高度圖再 `fillHeightStep` 填階，事後拉平一塊會在邊上留下兩格以上的落差
- 規模（`vite-node` 生的）：枯木樁 238 格、圓石 59 格、仙人掌 17 格、孤樹 6 棵（橡木 37 格）、月見草 261 株；地形生成約 0.14 秒

**重排**

- 只動內圈與中圈；外圈八座、麥浪田、出生點不動。移動的是風露苑（新）、水鏡池（112.5° → 90°）、聽雨亭（157.5° → 168.75°）、吹雪野（112.5° → 67.5°），孤石改放在中圈 112.5° 與 337.5°
- 跟著箱庭中心走的東西都是相對座標，不必改：`createGardenGate` 的門、落點與快速前往、`travelPoint`（吹雪野改角度）、天氣與霧的範圍、鏡面、營火煙、飛石、耙紋、音源與鄰居限距。只有一處要補：水鏡池在出生點正後方，它的飛石會從出生點腳下穿過，`placeApproachStoneList` 最後把出生點那一格與四周一圈的飛石拿掉
- 驗證：`vite-node` 跑 `generateRealmTerrain('hub')`，對十八座門的落點與十八個快速前往點各跑一次 `findSafeStandingPosition`，全都落在原地、腳下不是水；木座之間最近四格（中圈與外圈相鄰的那幾對，與重排前一樣）

**尚未驗收**：風露原的白天與夜裡（霧色、螢火、蟲聲日夜交替）、傳送來回、FPS 對照大廳、選單快速前往實際點一次。

## Minespace：眼睛適應與球諧天光（2026-11）

參考 Photon（Minecraft 光影）的自動曝光、Purkinje shift 與天光球諧，只借想法、沒有抄程式碼（授權不同）。三項都有 F4 開關（自動曝光、暗視覺偏藍、球諧天光），可以逐項 A/B。

曾經也照 Photon 做過雨後彩虹（畫在天空著色器裡、靠「剛淋過雨」的記憶撐九十秒），實際看起來很不自然，已整個拿掉。

**先弄清楚色調映射在哪。** 後製管線沒開 HDR（`hdr = false`）時，Babylon 不把影像處理接成後製，曝光、ACES、色調曲線與打散全在每一份 `StandardMaterial` 的著色器裡，畫面進畫布時已經是調過色的八位元顯示值。後製管線的 `imageProcessing` 物件存在但從沒被啟用（`camera._postProcesses` 裡是 `null`，`width` 是 -1）。這決定了自動曝光與暗視覺偏藍的做法。

**自動曝光（`domains/renderer/eye-adaptation.ts`）**

- 量測：場景畫完後用 `blitFramebuffer` 把畫布縮成 64×36 的小圖，像素緩衝區非同步讀回（約每 0.2 秒一次，不卡管線），CPU 上對 gamma 轉線性、ACES 反函數、除以送出時的曝光、取對數平均（中央加權）。反函數是必要的：量到的是調過色的值，不還原的話曝光一動、量到的跟著動，會追自己的尾巴。
- 讀回不用柵欄（`fenceSync`）：柵欄加上同一塊 PBO 寫了又被寫，ANGLE 每次都吐 `READ-usage buffer was written, then fenced, but written again before being read back`（`?renderer=main` 與 worker 都有）。改成送出後隔至少 3 幀且 30 毫秒再 `getBufferSubData`，最小重現是「不要柵欄、晚 2～3 幀讀」零警告。同時最多一份在飛；關掉兩個開關時丟掉還沒讀的那份，重新打開才不會拿到關著之前的舊畫面。
- 天空不除曝光：天空與雲是 `ShaderMaterial`，沒有曝光與色調映射，整張圖統一除以倍率會讓夜裡多補約 0.2 檔。讀回時用鏡頭朝向與 fov 算每個畫素的射線仰角，高過地平線（y > 0.03）當天空，不除；其餘照除。畫布上只有顏色，要用深度圖得另外再讀回一次，所以用射線判斷。洞頂與山壁偶爾被當成天空，影響限於那幾格。
- 水面倒影：倒影內容在 `MirrorTexture` 裡由場景材質畫，倍率已經乘進去，鏡面材質再畫一次那張貼圖若又乘一次就是兩份。`excludeMirrorMaterials` 對每份 `StandardMaterial` 掛一次性的綁定觀察，第一次綁定時看 `reflectionTexture` 是不是 `MirrorTexture`，是的話之後每次綁定把 `exposureLinear` 改回原本的曝光（不含自動曝光與洞穴倍率）。一般材質掛完就收，之後沒有成本。（日夜基準曝光仍在 RTT 與鏡面各乘一次，那是原本調好的外觀，沒動。）
- 適應：亮適應 1.1 秒、暗適應 4 秒的指數平滑（遊戲手感，不是生理值）。倍率只往亮調（最多 0.6 檔），不往暗調：實測正午低頭看白沙比抬頭看天亮一檔半，往暗調的話低頭就會灰。
- 套用：覆寫場景 `imageProcessingConfiguration.bind`，在原本綁定做完後把 `exposureLinear` 乘上倍率。不改 `exposure` 屬性，所以不會通知材質重建（改屬性每次要全場材質失效，見 `use-day-night` 的 `applyToPipeline`）。
- `EXPOSURE` 旗標：Babylon 只在 `exposure !== 1.0` 時開 `EXPOSURE` 定義，剛好等於 1.0 時著色器沒有 `exposureLinear`，倍率整個失效，`exposure` 每次跨過 1.0 還會讓全場材質重編一次。所以同時覆寫 `prepareDefines`，影像處理開著就把 `EXPOSURE` 設為真，不依賴基準曝光是不是 1.0。
- 洞穴加成與自動曝光：兩者做的是同一件事，不能疊。洞穴加成改為由 `use-day-night` 每幀寫進 `eyeAdaptationState.caveExposure`，在綁定時乘上去（不再寫 `exposure` 屬性，洞穴深度每幀都在變，原本每次寫都通知全場材質失效）。自動曝光的「接手程度」`engagement`（時間常數 0.5 秒）同時拿來縮放自動曝光的檔數與淡出洞穴加成，開關切換與第一筆量測出來時是交叉淡化，總曝光不會跳，也沒有材質重編。
- 基準與死區：`REFERENCE_LOG_LUMINANCE = -2.6`、死區 0.5 檔，正午各視角倍率恆為 1。實測（出生點平視，對數亮度）：上午 -2.5、正午 -2.2、午後 -2.1、日落 -3.9（倍率 1.25）、暮色 -4.8（1.5）、深夜 -7（1.6 上限）、洞裡 -4 ~ -5.3（1.3 ~ 1.5）。
- 為什麼不全程跑 GPU（1×1 亮度圖加回饋貼圖）：回饋貼圖的值要被每份材質的著色器讀到，得多一個取樣器；量測與適應只是純量運算，放 CPU 最省。

**暗視覺偏藍**：用同一個適應後亮度，算「調過曝光之後」有多暗，寫進 `ColorCurves` 的陰影那一段（色相 222、濃度與去飽和各十餘）。色調曲線是調色後依畫素亮度加權的，暗畫素吃陰影、亮畫素吃亮部，與視桿只在暗處作用相符；日夜循環只用到「整體」那組，陰影那組是空的。`ColorCurves` 的屬性只是設旗標、沒有通知，每幀寫是免費的（與 `exposure` 相反）。

**球諧天光（`domains/renderer/sky-light.ts`）**：材質外掛，在霧之前 `color += (X·n.x + Z·n.z) * baseColor`，與體素全局光同位置。X、Z 是一階球諧的水平分量：對 48 個方向取天空色（`sampleSkyGradient`，與天色著色器是鏡像，改曲線要一起改）算 `(2/N) Σ 天色 × 方向`。只取水平兩軸：垂直軸是半球光在做的事（還帶洞穴、地面染色、夜間補光的調整），零階與垂直分量不加，平均亮度不動，白沙落在 ACES 膝點上的曝光調校原封不動。向量每 0.4 秒重算、每幀趨近。增益 3：天色是 LDR 漸層，落日側的天邊沒有現實那麼亮，一比一的偶極算出來肉眼看不出。日落時朝向太陽的牆約暖 8 個色階、背面冷 8 個，正午天色對稱，畫面不動。雨天與洞裡乘 `specularRatio` 與開闊程度收掉。`disableLighting` 的自發光材質（燈罩光暈、日月盤與光暈、營火火焰）不加：外掛在 `prepareDefines` 依 `material.disableLighting` 設 `MINESPACE_SKY_LIGHT`，著色器整段包在 `#ifdef` 裡，這些材質的著色器與沒有外掛時相同，光暈不會被染成一邊暖一邊冷。

**量測**（本機整合顯卡，F3 的 GPU 毫秒，同一視角兩次）：全開 34.3、36.4、35.3，全關 35.5、35.3 ——在雜訊內，成本量不出來。正午出生點視角全開與全關比對，天空與沙地平均差 1% 左右（倍率為 1）。

**驗證用的小技巧**：Playwright 腳本要在 `page.goto` 前蓋掉 `Element.prototype.requestPointerLock`，否則 headless Chrome 會在 Windows 上 `ClipCursor` 把真滑鼠鎖進視窗。

## Minespace：效能優化（2026-11）

本機整合顯卡（AMD，ANGLE D3D11）、1280×720、出生點平視、`dayIndex` 15、時刻 0.45，F3 面板的幀率讀數，交錯 A/B 各三輪取中位數。**前後對照**（「前」＝把下面四項在執行期逐項還原，同一份程式碼、同一個時段交錯跑）：

| 畫質 | 前 FPS | 後 FPS | 前 GPU 毫秒 | 後 GPU 毫秒 | 前 CPU 毫秒 | 後 CPU 毫秒 |
| --- | --- | --- | --- | --- | --- | --- |
| 最省 | 52 | 74 | 8.6 | 6.8 | 17.3 | 13.4 |
| 標準 | 30 | 56 | 23.3 | 16.8 | 21.9 | 17.1 |
| 高 | 20 | 36 | 40.5 | 27.0 | 24.3 | 22.3 |
| 極致 | 11 | 23 | 74.5 | 41.9 | 32.8 | 35.1 |

（CPU 幀時間含等 GPU 的時間，GPU 吃重的那幾級讀數會偏高，只拿來看最省與標準那兩級。）

**逐道工序計時（F8）。** 幀 GPU 只有一個總數，看不出誰慢。F3 開著時按 F8（只在開發模式）：`composables/use-gpu-pass-timer.ts` 把一幀切成十幾段（陰影每一層、水鏡、場景深度、雲的影圖／行進／時間累積、主畫面各繪製群組的不透明與半透明……），每段各用一個 `EXT_disjoint_timer_query_webgl2` 的 `TIME_ELAPSED_EXT` 夾起來，結果併進 F3 清單的「GPU 段名」與「CPU 段名」列（CPU 是送出那一段的牆鐘時間）。三個限制：Chrome 在 ANGLE D3D11 上 `QUERY_COUNTER_BITS_EXT` 是 0，時間戳查詢永遠回零，只能用經過時間查詢；那種查詢同一時間只能有一個、不能巢狀，所以標記是接力的（每個標記先結束上一段）；它與 F3 的整幀 GPU 計時互斥，開著 F8 時「幀 GPU」那列是各段加總。要在其他地方插標記就呼叫 `markGpuPass('名字')`（包在 `import.meta.env.DEV` 裡）。

**高畫質一幀的 GPU 組成（優化前，F8）**：雲行進 22.5（52%）、主畫面不透明與鏤空 17.5（41%）、陰影每層 0.4、雲的影圖／時間累積／合成共約 1.3、半透明 0.6、場景深度 0.01。頂點端幾乎不花錢：整個世界只有約 3.6 萬個薄實例（269 個網格），陰影那趟連同兩百多次繪製呼叫總共 0.4 毫秒，所以「依區塊做視錐剔除」之類的做法這個場景用不上。

**做了的四項**

| # | 項目 | 針對的熱點與數字 | 結果 |
| --- | --- | --- | --- |
| 1 | 落葉亂流噪音場改在 CPU 算（`domains/weather/leaf-noise-field.ts`） | 原本用 `NoiseProceduralTexture` 當粒子的噪音來源，粒子系統每幀 `getContent()` 同步 `gl.readPixels`，CPU 停下來等 GPU 畫完整幀（CPU profile：worker 主執行緒 62% 時間在 `readPixels`）。它發生在算繪迴圈之後的微任務裡，F3 與 F8 都看不到 | 高畫質 19 → 25 FPS（同一視角各三輪；只拿掉噪音貼圖的對照是 23 FPS），幀 GPU 沒變，是 CPU 與 GPU 不再被迫序列化 |
| 2 | 體積雲行進棋盤式隔幀更新（`INTERLACE_TILE_SIZE`、預設表的 `cloudInterlace`） | 行進一趟 21.4 毫秒，成本與格子數、步數成正比（解析度比 0.3／0.45／0.6／0.75 → 8.0／12.4／21.4／32.0；步數 36／54／72／96 → 10.6／16.0／21.4／28.2） | 高畫質行進 21.4 → 12.0。方塊邊長 8／16／32／64 像素 → 12.7／14.0／12.0／11.5 毫秒，取 32。靜止與轉頭的截圖、連續畫面的閃爍量比對看不出差別 |
| 3 | 陰影分層之間不混合（`cascadeBlendPercentage = 0`） | 開關這一項主畫面不透明那趟 14.3 → 11.1。混合帶換算成畫面只有幾列像素，真正的成本是著色器裡多了一段混合的程式，整支像素著色器都為它多配暫存器 | 高畫質主畫面 -3.2 毫秒、極致 34 → 22 毫秒 |
| 4 | ~~方塊材質凍結~~（已撤回，見下方「上線後才發現的錯」） | CPU profile：`isReadyForSubMesh` 約 16%、`bindForSubMesh` 的外掛事件 6%，每幀對上百份材質重做「準備好了沒」 | 最省 CPU 幀 17.1 → 13.2、標準 21.4 → 15.6 毫秒（交錯 A/B 各三輪）。但凍結讓水面整片變黑，0.3.4 拿掉 |

**上線後才發現的錯：雲一幀跑兩次（0.3.2 極致畫質天空變棋盤）**

- 症狀：極致畫質的天空變成一格有雲、一格沒雲的固定棋盤，靜止、轉頭、走路都有；最省到高看不出來。
- 根因：雲掛在 `scene.onAfterRenderTargetsRenderObservable`，這個事件一幀會發兩次：`scene.render` 畫完自訂算繪目標一次，`_renderForCamera` 畫完鏡頭的算繪目標再一次。第一次發的時候變換矩陣還停在最後一張自訂算繪目標的鏡頭上，極致畫質的體積光陰影圖是一台正交鏡頭，雲就照它的矩陣行進。實測修正前 599 幀跑了 1200 次，修正後 799 幀跑 800 次。
  - 每格每幀都行進時，第二次會整張蓋掉，錯誤被藏住，只是每幀白算一整趟。
  - 改成隔幀只畫一半之後，`frameIndex` 一幀加二，算錯的那次永遠落在同一半的格子上，棋盤就固定下來了。
- 修法：`onBeforeCameraRenderObservable`（在 `_renderForCamera` 更新完矩陣之後發）亮記號，只有記號亮著的那一次才畫。
- 連帶影響：時間原本一幀推進兩次，使用者調過、認可的飄動速度其實是常數的兩倍，所以 `WIND_SPEED` 與三個演變速度都乘二，保住看到的速度。累積權重試過換算成每幀等效的 0.28，但樣本少一半，標準畫質浮出顆粒，所以維持 0.15。修正前後雲面顆粒量（相鄰像素差）1.27 對 1.30，沒有變。
- 效能（720p、出生點、交錯 A/B 兩輪，FPS 中位數）：最省 98 → 106、標準 62 → 77、高 40 → 51、極致 26 → 25（極致第一趟用的是錯的鏡頭，多半落在空中，本來就便宜）。
- 為什麼當初沒抓到：隔幀更新只在出生點平視、高畫質的截圖與閃爍量上驗過，沒有逐級抬頭看天空。之後改雲的時間累積或行進，驗收至少要四個畫質各一張抬頭看天的截圖。

**上線後才發現的錯：材質凍結讓水面變黑（0.3.2 起）**

- 症狀：水鏡池的水整片發黑，只剩很淡的倒影；水的藍色、波紋與岸線都不見了。同一份程式碼只把 `material.freeze()` 拿掉，水面就恢復（水鏡池 `(126, 14, 167)` 往北俯看，截圖對照）。
- 為什麼：凍結的材質在 `isReadyForSubMesh` 一律回「好了」，`bindForSubMesh` 也跳過一部分只有 `!isFrozen` 才走的綁定。水面靠的外掛與貼圖有些是凍結之後才就緒或每幀在變的，凍結把它們停在不完整的狀態；輪流 `markDirty(true)` 重驗也救不回來。
- 處理：整個拿掉（`material-freezer.ts`、`getMaterialList`），最省與標準畫質的 CPU 幀回到原本的水準。凍結動到的是所有方塊材質，風吹、淋濕、雲影這類每幀在變的效果都有同樣的風險，不值得逐項排除。
- 為什麼當初沒抓到：只比對了出生點的截圖與 F4 開關，畫面裡沒有水。改動所有材質的優化，驗收要涵蓋各種材質外掛看得到的地方：水、樹葉、淋雨、雲影、夜裡的燈火。

**量過、沒有採用（或已還原）**

| 項目 | 數字 | 為什麼不用 |
| --- | --- | --- |
| 合併花草的兩片交叉板（同材質同實例矩陣） | 繪製呼叫 528 → 487，FPS 92 → 88（交錯 A/B 三輪，雜訊內） | 看不出收益，已還原 |
| `needDepthPrePass`（不透明材質先畫一趟深度） | 主畫面 14.3 → 24.7 毫秒，繪製 +233 | 純深度那趟照樣跑完整的像素著色器，變成畫兩遍 |
| 雲：薄樣本跳過光線步進並沿用上一個光照 | 行進 12.0 → 12.9（變慢） | 多一次 `exp` 與分支，GPU 分支發散 |
| 雲：光線取樣全用便宜密度（不查細節貼圖） | 12.1 → 11.2 | 只省 0.9 毫秒，光影對比有風險 |
| 雲：單獨拿掉某一段（毫秒） | 光線步進 -5.1（占行進 42%）、細節貼圖 -1.5、遮蔽取樣 -0.6、巨觀貼圖 -0.35、散射倍頻 4 → 2 -0.3、高層雲 -0.2、卷雲 0 | 光線步進才是大頭，但它決定光影，不動 |
| 接觸硬化陰影濾波 `medium` → `low` | 主畫面 -2.7 毫秒（全關 -2.8） | 改了畫質等級的語意，要使用者決定 |
| `scene.autoClear = false` | 主畫面 -0.5 毫秒 | 太小，不值得冒天空罩沒蓋滿就殘影的風險 |
| 快照算繪（snapshot rendering） | — | WebGL 引擎的 `snapshotRendering` 是空操作（`abstractEngine.pure.js`），只有 WebGPU 能用 |

**發現但沒動**

- `pipeline.samples`（多重取樣）完全無效：`DefaultRenderingPipeline` 的 `hdr = false` 且只開影像處理時，`_buildPipeline` 不把影像處理接成後製，管線裡沒有任何後製，`_enableMSAAOnFirstPostProcess` 沒有第一支後製可設；引擎又是 `antialias: false`。實際上場景沒有任何抗鋸齒。畫質預設的 `sampleCount` 換成 `antialiasEnabled`，建引擎時決定畫布要不要多重取樣；原本沒作用的 F4「多重取樣」開關與 `pipeline.samples` 一併拿掉。各級目前都不開：整幀交錯 A/B（720p、出生點、兩輪）開了標準 59 → 54 FPS（GPU 16.4 → 18.2 毫秒）、高 38 → 35（25.9 → 28.3）、極致 25 → 24（39.6 → 41.4）。單看雲行進與主畫面兩段量不出差別，成本在畫布多重取樣的解析與頻寬，要看整幀才看得到。
  - 坑：畫布開了多重取樣之後，WebGL2 不准從它做縮放的 `blitFramebuffer`（來源是多重取樣時，來源與目的矩形必須一樣大，否則 `INVALID_OPERATION`）。自動曝光原本直接把畫布縮成 64×36，開了之後小圖什麼都沒寫進去，曝光安靜地停在舊值。`eye-adaptation.ts` 改成先原尺寸解析到一張普通緩衝區再縮。之後任何直接讀畫布的程式都要照這個做。
- 解析度是 GPU 成本的最大旋鈕：主畫面約 4.5 毫秒是與解析度無關的固定成本，其餘與像素數成正比；雲行進幾乎完全與格子數成正比。`pixelRatioLimit` 1.5 在 1.5 倍以上螢幕上代表 2.25 倍像素，高畫質在 1080p 估計 85 毫秒左右（推算值，沒有實測）。想再提升而不動效果，下一步是依幀時間動態調 `hardwareScalingLevel`，或限制雲目標的像素預算。
- 雲況會讓行進成本漂移：同一組設定，頁面載入後不同時間點的行進差到 12 → 9 毫秒（雲長散）。比較兩組設定要在載入後同一個時間點量。

**量測注意**

- 同一份程式碼在不同時段 FPS 差到 40%（最省畫質 55 與 88），別拿相隔幾分鐘的數字比。要 A/B 就在同一輪裡交錯跑，用 Playwright 的 `context.route` 改寫 dev server 回的模組文字（例如把畫質表裡的欄位換掉、把一行程式換成另一行），不必動原始碼。要小心：dev 回的是轉譯後的 JS，字串比對要用轉譯後的樣子（分號、Tab）。
- 同步讀回與微任務裡的工作不在 `scene.render` 裡，F3 的 CPU 幀看不到；懷疑 CPU 與 GPU 被序列化時，用 CDP 的 `Profiler` 連到 render worker（`/json/list` 裡 `type` 為 `worker` 的目標，兩支 worker 要挑忙的那支）取樣。
- 高畫質以上是 GPU 瓶頸，CPU 端的優化（例如已撤回的材質凍結）看不到 FPS 差；最省與標準畫質是 CPU 瓶頸（約 500 次繪製、每次主畫面約 35 微秒），GPU 端的優化看不到差別。

**極致的太陽光暈：行進光束與螢幕空間光束並存**

- 極致原本只開行進版光束（`volumetric-light.ts`），螢幕空間版（`god-rays.ts`）在程式裡設成互斥。行進版刻意不往天空加光（`SKY_FLOOR`，加了會整片泛白、太陽外圍出現藍黑邊），結果極致的太陽周圍是平的，反而比「高」少了那團越過樹梢往外擴散的光暈。
- 現在極致兩個都開：行進版畫地面上的光柱，螢幕空間版只負責太陽周圍的光暈，曝光打八折（`RAYMARCH_EXPOSURE_RATIO`）。調到 1.0 太陽中央的亮度幾乎不變（已頂到色調映射上限），只會讓地面光柱疊得更重。
- 成本：螢幕空間版只在晨昏、面對太陽時才建遮蔽圖。極致早上面對太陽，交錯量兩輪，25.8 → 24.6 FPS（約 5%）。

### 第二輪：大場景比大廳慢多少、陰影取樣的捷徑（2026-11-28）

起因：有幾座大場景明顯比大廳卡。先量再修，量法同上（本機整合顯卡、ANGLE D3D11、1280×720、高畫質、`dayIndex` 15、正午、關掉日夜循環），每個場景量兩個視角：出生點平視（spawn）、出生點上方十四格往場景中心俯看（over）。

**先講量法上的三個坑**

- 幀率讀數不可靠，比 GPU 毫秒。螢幕進入省電後，無頭 Chrome 的幀率會被壓在 32（垂直同步減半），GPU 毫秒卻只有十幾；而且那段時間顯示卡降頻，同一個畫面的 GPU 毫秒會多兩到四毫秒（大廳 21.7 對 18.0）。所以只拿「同一個時段、幀率上限相同」的場次互比；同一個狀態下，不同場次的 GPU 毫秒重現到 ±0.3。
- 著色器編不過不會報在主控台。Babylon 靜靜退回一支精簡的著色器，畫面看起來只是怪一點，GPU 毫秒卻大降，繪製呼叫也變少，很像優化成功。這一輪遇到兩次（正規式少比對一個分號；全域變數宣告在用到它的函式之後）。每次改著色器都要看頁面右上的錯誤徽章，量測腳本則在結束時讀錯誤清單（`use-error-logger` 的 `entryMap`），不是零就整場作廢。
- 用 `context.route` 改寫模組文字做 A/B 時，比對的是轉譯後的字：`0.5` 會變成 `.5`、單引號變雙引號。

**各場景相對大廳（高畫質，GPU 毫秒，前＝這一輪全部還原、後＝現在；同一時段交錯兩輪的中位數）**

| 場景 | 出生點 前 → 後 | 俯看 前 → 後 | 前：比大廳 | 後：比大廳 | 繪製 前 → 後 |
| --- | --- | --- | --- | --- | --- |
| 蟬雨深林 | 28.7 → 22.7 | 33.1 → 25.4 | +59%／+86% | +31%／+49% | 348 → 340 |
| 松濤林海 | 23.3 → 19.6 | 29.8 → 23.3 | +29%／+67% | +14%／+36% | 337 → 320 |
| 金葉林 | 26.8 → 19.6 | 30.3 → 22.0 | +49%／+70% | +13%／+29% | 279 → 268 |
| 聽雨林 | 24.9 → 18.6 | 31.1 → 22.6 | +38%／+75% | +8%／+32% | 366 → 360 |
| 湖中島 | 21.4 → 20.4 | 19.6 → 18.9 | +19%／+10% | +18%／+11% | 311 → 303 |
| 千蛙沼 | 19.9 → 19.8 | 17.6 → 17.4 | +10%／−1% | +14%／+2% | 249 → 242 |
| 湯煙谷（新） | 21.0 → 19.5 | 17.7 → 17.4 | +17%／−1% | +13%／+2% | 369 → 357 |
| 鐘聲村 | 18.7 → 18.1 | 19.1 → 18.4 | +4%／+8% | +5%／+8% | 532 → 496 |
| 百囀林苑 | 21.9 → 17.5 | 23.5 → 18.5 | +21%／+32% | +1%／+8% | 224 → 221 |
| 大廳 | 18.0 → 17.3 | 17.8 → 17.1 | — | — | 897 → 845 |
| 千頃麥浪 | 21.4 → 17.9 | 17.1 → 16.2 | +19%／−4% | +3%／−5% | 301 → 293 |
| 海中沙島 | 16.5 → 16.1 | 13.6 → 13.1 | −8%／−24% | −7%／−23% | 268 → 260 |
| 溪谷 | 15.3 → 14.6 | 14.5 → 13.1 | −15%／−19% | −16%／−24% | 303 → 296 |
| 風露原 | 14.4 → 13.9 | 13.9 → 13.5 | −20%／−22% | −19%／−21% | 338 → 333 |
| 石殿遺址 | 15.8 → 14.6 | 12.5 → 12.3 | −12%／−30% | −16%／−28% | 180 → 168 |
| 拓荒原 | 17.6 → 14.6 | 13.4 → 12.1 | −2%／−25% | −15%／−29% | 504 → 494 |
| 雪稜 | 14.7 → 14.4 | 11.3 → 11.2 | −18%／−37% | −16%／−35% | 155 → 152 |
| 地底湖窟 | 10.1 → 9.9 | 6.6 → 6.2 | −44%／−63% | −43%／−64% | 150 → 121 |
| 白矇雪原 | 7.7 → 7.5 | 7.8 → 7.6 | −57%／−56% | −57%／−56% | 248 → 235 |

（56 到 60 是幀率上限，卡在上限的場景 GPU 毫秒仍是實際花掉的時間。「前」的大廳在同一輪裡是 18.0／17.8；當天稍早螢幕休眠、幀率被壓在 32 的時候，同樣的畫面是 22.0／21.0，所以這張表不能跟別的時段的數字混著比。）

其他畫質抽查最重的幾座（同樣是前後各開一場、同一時段；極致的「前」另外還原了行進光束那兩項）：

**極致**

| 場景 | 出生點 前 → 後 | 俯看 前 → 後 | 前：比大廳 | 後：比大廳 | 繪製 前 → 後 |
| --- | --- | --- | --- | --- | --- |
| 蟬雨深林 | 54.9 → 41.5 | 63.2 → 42.2 | +48%／+92% | +33%／+37% | 518 → 508 |
| 松濤林海 | 42.4 → 33.6 | 57.8 → 38.9 | +15%／+76% | +8%／+26% | 504 → 481 |
| 湯煙谷（新） | 40.2 → 34.8 | 35.4 → 33.0 | +9%／+8% | +12%／+7% | 539 → 527 |
| 金葉林 | 51.2 → 31.3 | 57.2 → 33.3 | +38%／+74% | +0%／+8% | 414 → 400 |
| 大廳 | 37.0 → 31.2 | 32.9 → 30.8 | — | — | 1323 → 1270 |
| 千頃麥浪 | 42.4 → 30.0 | 33.7 → 29.3 | +15%／+2% | −4%／−5% | 449 → 440 |
| 聽雨林 | 45.7 → 24.9 | 57.9 → 29.4 | +24%／+76% | −20%／−5% | 501 → 420 |

**夜裡（高，時刻 0.92；這一場幀率被壓在 32，毫秒數偏高，只看前後差）**

| 場景 | 出生點 前 → 後 | 俯看 前 → 後 | 前：比大廳 | 後：比大廳 | 繪製 前 → 後 |
| --- | --- | --- | --- | --- | --- |
| 蟬雨深林 | 32.3 → 25.4 | 35.1 → 26.4 | +32%／+72% | +15%／+40% | 347 → 339 |
| 金葉林 | 30.7 → 24.3 | 32.9 → 25.4 | +25%／+61% | +10%／+35% | 278 → 267 |
| 松濤林海 | 25.5 → 21.3 | 31.8 → 24.9 | +4%／+56% | −4%／+32% | 339 → 322 |
| 聽雨林 | 25.6 → 20.9 | 32.2 → 24.3 | +4%／+58% | −5%／+29% | 366 → 360 |
| 湯煙谷（新） | 23.8 → 22.2 | 19.4 → 18.9 | −3%／−5% | +0%／+1% | 369 → 356 |
| 大廳 | 24.5 → 22.1 | 20.4 → 18.8 | — | — | 897 → 845 |
| 千頃麥浪 | 23.2 → 22.0 | 18.2 → 17.8 | −5%／−11% | −0%／−5% | 302 → 295 |

**標準**（前後交錯兩輪）：差在一毫秒以內，沒有變快也沒有變慢（大廳 16.3 → 16.4、蟬雨深林 23.3 → 23.7、松濤林海 19.0 → 20.0、聽雨林 19.2 → 18.6、新湯煙谷 16.9 → 16.9）。標準是單張陰影，這一輪的捷徑改的都是分層的那條路。有樹的場景在標準比大廳慢四到六成（蟬雨深林俯看 27.1、大廳 17.1），樹葉在這一級還在跑接觸硬化。把 `cutout-shading` 的做法補到單張版（`computeShadowWithPCSS16` 那一行換成 `computeShadowWithPCF3`）是下一個最划算的改動，還沒做。

**最省**：GPU 都在 4 到 10 毫秒，前後差在一毫秒以內；繪製呼叫大廳 509 → 459。

**慢在哪（優化前，F8 逐段計時與逐項開關）**

- 差距全部落在主畫面「不透明與鏤空」那一段：大廳 12.8 到 13.8 毫秒，蟬雨深林俯看 31.3、聽雨林 31.8、金葉林 27.1、松濤林海 25.8、千頃麥浪 22.9、舊湯煙谷 28.4。陰影每層 0.4、雲 3 到 5（聽雨林陰天是 0），其餘量不出來。
- 樹葉：把鏤空的整格方塊藏起來，蟬雨深林少 19.1、聽雨林 20.9、松濤林海 15.4（大廳 1.4）。一層層疊起來的葉子，同一個像素要畫好幾層，每一層都跑完整支著色器。
- 接觸硬化陰影（PCSS）：全場換成 PCF，大廳少 2.8、蟬雨深林 6.6、聽雨林 7.8、金葉林 7.1、千頃麥浪 4.3；只讓鏤空方塊不接陰影就拿回其中幾乎全部，也就是 PCSS 的錢大半花在葉子上。
- 背面：方塊材質原本兩面都畫。只剔除不透明方塊的背面，舊湯煙谷少 7.2、千頃麥浪 5.4、鐘聲村 3.7、大廳 2.2。
- 叢集光照的燈：成本是「每個像素 × 罩到它的燈數」。舊湯煙谷的熔岩四格一盞、共 54 盞，出生點周圍四十格內有 48 盞，關掉叢集光照少 15.8 毫秒；大廳 101 盞少 3.6 到 4.5，鐘聲村 43 盞少 7.3。
- 量不出來的：招牌景象、光暈、大氣透視、球諧天光、淋濕、葉片透光（正午）、花草的交叉立板（千頃麥浪 1.8，其餘不到 0.8）。

**做了的**

| # | 項目 | 做法 | 量到的（GPU 毫秒，主畫面） |
| --- | --- | --- | --- |
| 1 | 不透明方塊只畫正面 | `voxel-renderer.ts` 的 `applyFaceCulling`：掛的網格全是封閉盒子（或盒子的一面）的不透明材質開背面剔除。鏤空的不動（從葉縫看到的正是同一顆的背面）；同一份材質只要掛過單片立板就維持兩面 | 大廳 −2.4、舊湯煙谷 −7.4、千頃麥浪 −5.5、蟬雨深林 −3.7、金葉林 −2.5 |
| 2 | 鏤空方塊接陰影改用 PCF | `cutout-shading.ts`：材質外掛把分層 PCSS 那一行換成 `computeShadowWithCSMPCF3`。地面、樹幹、房子照舊是接觸硬化 | 蟬雨深林 −3.2／−5.8、聽雨林 −4.7／−7.3、金葉林 −3.5／−5.0、松濤林海 −2.2／−4.2（出生點／俯看） |
| 3 | 背對太陽的面不算陰影 | `sun-shadow.ts`：`if (index>=0)` 多一個條件。日照本來就是零，算出來也用不到 | 千頃麥浪 −3.2／−1.0、蟬雨深林 −1.9／−1.1、金葉林 −1.0／−0.9、鐘聲村 −0.5／−0.3、大廳 −0.4／−0.2 |
| 4 | 沒有遮蔽物就不做比較取樣 | `sun-shadow.ts`：分層 PCSS 的遮蔽搜尋找不到東西時，跳過後面三十二（極致六十四）次比較取樣。Babylon 原本是全部做完才回傳 1.0 | 鐘聲村 −0.3／−0.6、千頃麥浪 −0.6／−0.3、金葉林 −0.4、蟬雨深林 −0.3／0、大廳 0 |
| 5 | 鏤空方塊提早丟掉透明像素 | `cutout-shading.ts`：貼圖取樣之後就 `discard` 加 `return` | 蟬雨深林 −0.4、松濤林海 −0.1 到 −0.3，其餘量不出來 |
| 6 | 熔岩的真光併成面光源 | `light-source.ts` 的 `collectPointLightList`，見下一節 | 大廳的地獄谷箱庭 7 盞變 1 盞；新湯煙谷見下表 |
| 7 | 鋪在實地上的平板不投影 | `voxel-renderer.ts`：落葉、腐葉、卵石只比頂面高兩公分，在陰影偏移以內，本來就投不出影子；睡蓮照投（影子落在池底） | 繪製呼叫每個場景少 5 到 10，GPU 不變 |
| 8 | 燈火的光暈改成實例 | `lamp-glow.ts`：每一種材質一片圓盤，其餘是 `createInstance` | 繪製呼叫大廳 893 → 844、鐘聲村 525 → 495、地底湖窟 150 → 121；高畫質卡在 GPU，幀時間不變 |
| 9 | 行進光束（極致）：陰影圖跟著後製掛卸、步進改成加法 | `volumetric-shadow.ts` 的 `setActive`、`volumetric-light.ts` 迴圈外先算好起點與位移 | 聽雨林（下雨，後製卸著）極致的繪製呼叫 493 → 420，GPU −0.9／−1.4 毫秒；晴天（大廳、松濤林海，交錯兩輪）四個視角是 −4.7、+0.2、−0.6、+2.1，極致卡在三十幀上下、雜訊比收益大，步進改成加法這一項量不出來 |

第 1、2 項是前一位接手者做的，前後截圖在這一輪補驗：大廳、鐘聲村、風露原、松濤林海、蟬雨深林逐張比對，沒有破洞、黑面或漏光，樹下的葉影看起來一樣。第 3、4 項關掉外掛前後的截圖（大廳早晨、鐘聲村傍晚、千頃麥浪）差異與同一場次連拍兩張的雜訊同量級。

**動態分支與螢幕微分（這一輪最重要的一課）**

「條件成立就跳過一大段」在 Windows 上不一定真的跳過。Chrome 經 ANGLE 把 GLSL 轉成 HLSL 再編，有兩個條件，都沒有任何警告，只能量：

1. 被跳過的那一段裡不能有要算螢幕微分的貼圖取樣。一般的 `texture()` 靠相鄰像素的差挑 mip，HLSL 不准它落在動態分支裡，遇到就把分支攤平成兩邊都算。換成 `textureLod(…, 0.0)`（比較取樣用 `textureGrad(…, vec2(0.), vec2(0.))`，GLSL ES 3.0 的陣列陰影取樣器沒有 `textureLod`）之後分支才是真的。沒有 mip 的貼圖取到的值不變。
2. 要寫成 `if` 把那一段包起來，不能寫成函式中途 `return`。第 4 項一開始照 Babylon 單張版的寫法（搜尋完就 `return 1.0`），連取樣都換過了，各場景還是差在 0.3 毫秒以內；用除錯著色器把成立的像素塗黑，確認正午的沙地幾乎全部成立，才知道問題在寫法。改成 `if (numBlocker>=1.0) { … }` 才量得到。第 5 項的 `discard; return;` 沒辦法改成用 `if` 包住後面整段光照，所以收益很小。

連帶把方塊著色器光照段裡的取樣都改成 `textureLod`：雲影（`cloud-shadow.ts`）、體素全局光（`voxel-gi.ts`）、焦散的水面地圖（`water-caustics.ts`）。這三張圖都沒有 mip。之後在光照段加貼圖取樣要照這個寫法，否則上面幾條捷徑會安靜地失效；焦散那三層「由外往內收」的條件也是靠這個才真的擋得住。

**改寫 Babylon 著色器的正規式，幾條規矩**

- 只能比對單獨一句。Babylon 在外掛改寫之前已經把著色器拆成一句一行，橫跨兩句的正規式永遠比不到，而且是安靜地比不到。
- 外掛要宣告全域變數，放 `CUSTOM_FRAGMENT_BEGIN`；`CUSTOM_FRAGMENT_DEFINITIONS` 排在陰影函式的後面，函式裡用到會編不過。
- 9.20 的 `$n` 代換已經是全部取代（`materialPluginManager` 的 `ReplaceRegExpSubstitutions`），`cloud-shadow.ts` 註解寫的「一個編號只能用一次」是舊版的行為。
- 太陽不一定是零號光：大廳是二號、大場景是一號，正規式要把編號抓出來用。
- `sun-shadow.test.ts` 直接拿套件裡的著色器原文比對每一條正規式，升級 Babylon 後原文改了寫法，測試會先壞。

**量過、沒有採用**

| 項目 | 數字 | 為什麼不用 |
| --- | --- | --- |
| 樹葉也剔除背面 | 有樹的場景 −6 到 −7 | 從葉縫看進去看到的是同一顆的背面，剔掉之後樹冠變稀、透出天空。要保住密度得只留「樹冠最外圈朝內的那一面」，也就是樹葉改成逐面出網格、由 worker 判斷鄰居，工程不小，留著沒做 |
| Babylon 原本的「沒有遮蔽物就提早 `return`」搬到比較取樣之前 | 0 | 見上一段第 2 點 |
| 遮蔽搜尋改成以受光平面為準（receiver-plane depth bias）再提早返回 | 0（當時還是 `return` 的寫法） | 原本以為斜對太陽的地面會把自己算成遮蔽物；用除錯著色器看，正午 Babylon 原本的判斷就已經涵蓋絕大部分曬到太陽的地面，不需要 |
| 鏤空材質深度測試改成 `LESS`（相鄰兩顆葉子共面的那兩層只畫一層） | 0 | 量不出差別 |
| 陰天放大 PCSS 光源讓影子化開、燈帶高光、全局光沿法線偏移取樣、葉片透光乘上陰影 | — | 見「光影：做了與沒做的」 |

**還比大廳慢的，與要怎麼再降**

- 蟬雨深林（+31%／+49%）、松濤林海（+14%／+36%）、金葉林（+13%／+29%）、聽雨林（+8%／+32%）：都是樹葉一層疊一層。剩下最大的一筆是樹葉的背面（−6 到 −7 毫秒），要保住樹冠的密度得改成逐面出網格、只留最外圈朝內的那一面。再來是讓被丟掉的葉縫像素真的不算光照，那要改 Babylon 主著色器的結構（用 `if` 包住整段光照），不是換幾句能做到的。
- 湖中島（+18%／+11%）、千蛙沼（+14%／+2%）：這一輪前後幾乎沒動，代表不是樹葉、陰影或背面。沒有再往下拆，下一步是用 F8 看水面與水鏡那幾段。
- 新湯煙谷（+13%／+2%）：見下一節。
- 其餘十二座都在大廳的 +8% 以內或比大廳快。

### 熔岩的真光：整片液面併成幾盞面光源

- 以前：亮度等級到 0.5 的方塊都進光源清單（`collectLightSourceList`），熔岩每四格見方一顆，清單上每一顆點一盞真光。舊湯煙谷 54 盞，一整座熔岩湖會是幾百盞。
- 現在：真光另外有一份清單 `collectPointLightList(worldState, lightSourceList, { areaLightLimit })`（`domains/world/light-source.ts`），`use-block-lights` 只吃這一份。
  - 燈籠、紙燈、餘燼、火爐：照光源清單一格一盞，與以前相同。
  - 熔岩（`isLavaBlock` 認得的每一種，含 `LAVA_FIELD`）：收集所有「露在外面」的格子（頭上或四周有一格是空的，所以湖面、河面、瀑布的立面都算，沉在液面下的不算），照十六格見方、八格高的磚分群，不到八格的碎片併給十六格內的鄰居；還超過上限就反覆把「併起來最不傷」的兩群併成一群（距離平方乘權重的調和，先併又小又近的）。不丟任何一群，湖再大也沒有哪一段岸邊是暗的。
  - 每一群一盞 `PointLight`：位置取那一群裡離重心最近的一格（不會埋進環形池中間的岩柱），往上抬 `1.5 + 0.4 × 半徑` 格（上限 6，碰到岩頂就停）；亮度是 `sqrt(亮度等級總和 / 10)`，夾在 0.7 到 2.2 倍的火光；照明半徑 `18 + 1.3 × 半徑`，夾在 20 到 36 格。晃動從營火的三成改成一成的慢起伏（一盞代表整片液面，照營火那樣晃，整面岩壁會一起明滅）。
  - 上限預設十二盞（`AREA_LIGHT_LIMIT`），場景可以在 `RealmDefinition.areaLightLimit` 指定（新湯煙谷給 9）。每多一盞罩滿畫面的燈，高畫質約多 0.3 毫秒。
- 光源清單照舊四格一顆，光暈、全局光的種子、環境粒子還是用它。`BlockDef.isListedLightSource: false` 可以讓夠亮的方塊不進清單（熔岩湖用的 `LAVA_FIELD`），與 `lightLevel` 分開：烘進方塊的暖光照多遠由 `lightLevel` 決定，不必為了躲 0.5 的門檻壓低它。
- 「不靠燈也看得出在發光」那條路本來就有三層：熔岩自己的自發光（超過一，ACES 收成橘紅）、chunk worker 烘進周圍方塊的暖光（各級畫質都有）、高與極致的體素全局光種子。
- 大廳的地獄谷箱庭：7 盞併成 1 盞（118, 10.8, 86，亮度 1.48、半徑 24）。夜裡前後截圖（高與最省各一組）箱庭本身看不出差別；光源抬高之後，箱庭外圍的白沙多了一圈淡淡的暖色。
- `light-source.test.ts`：八十格見方的熔岩湖不超過上限、上限可指定、環形池的光不埋進岩柱、瀑布沿高度分段、燈籠與以前一模一樣、大廳的燈一盞不少。

**新湯煙谷（火口與熔岩湖）**：湖面用不進光源清單的 `LAVA_FIELD`，真光是 7 盞燈加 9 盞面光源。高畫質 GPU 毫秒（F8 各段加總，同一場次與大廳交錯）：

| 視角 | 白天 | 夜裡 | 大廳出生點（同一場次） |
| --- | --- | --- | --- |
| 抵達平台（140, 169）往北 | 19.1 | 20.9 | 白天 15 到 16、夜裡約 15.7 |
| 神社平台（140, 9, 122）往北 | 17.1 | 18.5 | 同上 |

逐項藏起來量（`jigoku-lava-surface`、`jigoku-ash-pall`、`jigoku-lava-fall`、`jigoku-far-*`）：每一項都在 0.3 毫秒以內，沒有哪一樣是浪費的。九盞面光源合計 0.6（抵達平台）到 1.5 毫秒（神社平台，九盞都罩得到）。多出來的主要是雲：這個場景的天氣雲量多，雲的行進白天 6.8 到 7.1、夜裡 7.6 到 8.4 毫秒，大廳同時段是 4.4 到 6.0。舊湯煙谷（54 盞熔岩燈）當天稍早的基準是出生點 35.3、俯看 26.9（同時段大廳 19.4）。

### 光影：做了與沒做的（2026-11-28）

依一份唯讀的光影研究排了第一批：五項「畫面不變、純省」與四項「幾乎不花錢、看圖決定」。逐項實作、確認著色器零錯誤、量、截圖比對之後：

| 項目 | 結果 | 依據 |
| --- | --- | --- |
| 分層 PCSS 沒有遮蔽物就不做比較取樣 | 留，但收益比預估小得多 | 預估高 −1.5 到 3 毫秒，實測 0 到 −0.6。預估漏了兩件事：樹葉已經改走 PCF、背面已經不畫，剩下會走到 PCSS 的像素沒那麼多；寫法要對才省得到（見上） |
| 行進光束的陰影圖跟著後製掛卸、步進改成加法 | 留。掛卸那一項在雨天量得到；步進那一項量不出差別，畫面相同、每步少兩次矩陣乘法，留著無害 | 聽雨林（下雨，後製卸著）極致的繪製呼叫 493 → 420，GPU −0.9／−1.4 毫秒；晴天（大廳、松濤林海，交錯兩輪）四個視角是 −4.7、+0.2、−0.6、+2.1，極致卡在三十幀上下、雜訊比收益大，步進改成加法這一項量不出來 |
| 平鋪裝飾退出投影 | 留 | 繪製呼叫少 5 到 10，畫面不變 |
| 光暈改成實例 | 留 | 繪製呼叫大廳少 49、鐘聲村 30、地底湖窟 29，畫面不變 |
| 葉片透光乘上陽光的陰影 | 不做 | 會透光的是背對太陽的那幾面，而那幾面永遠落在自己那顆方塊的影子裡（現在背光面連陰影都不算了），乘上去等於把透光整個關掉。正確的做法是往太陽的方向推一格再查一次陰影，需要每一層的深度範圍，Babylon 沒有交給片元著色器；樹冠深處的葉子本來就靠烘進實例色的遮蔽壓暗 |
| 分層陰影盡頭淡出 | 不做 | 雪稜從四十五格高往遠處看，一百六十格外是霧與雲海，看不到那條線 |
| 全局光沿法線往外推半個粗格取樣 | 做了又拿掉 | 白天陰影處整體亮百分之五（岩響窟洞口平均亮度 134.6 → 141.5），動到調好的曝光；夜裡聽雨林燈籠旁的整片樹冠被洗亮，葉片之間的明暗層次不見了 |
| 陰天放大 PCSS 光源（0.05 → 最大 0.14），影子邊緣化開 | 做了又拿掉 | 千蛙沼箱庭、聽雨林、石殿遺址前後截圖看不出差別：陰天與雨天日照本來就只剩一兩成，再加上霧，影子已經淡到看不出邊緣 |
| 燈帶高光（燈色的一半） | 做了又拿掉 | 大廳雨庭與聽雨林夜裡前後看不出差別：燈籠腳下是草、木板、榻榻米，沒有夠平夠亮的濕石面接那道反光 |

研究裡沒排進第一批的（全局光拆成陽光與燈火兩份響應不再重烘、整格方塊逐面遮蔽、行進光束半解析度、花草接陰影、擺動的樹葉影子跟著動）都沒動。

## Minespace 神遊（Drift）介面端

設計見 `docs/plans/2026-11-27-minespace-drift-design.md`，這裡只記主執行緒這一側的決定。

- **入口**：開始畫面「神遊」→ `components/drift-realm-picker.vue`（`REALM_LIST` 去掉大廳，卡片含圖示、名稱、描述，手機兩欄）→ `handlePickDrift`：走與開始漫遊同一條流程，`switch-realm` 後用 VueUse `until(realmId)` 等 `realm-changed`（逾時 20 秒放棄）才送 `start-drift`。選單的「神遊」只在大場景顯示（渲染端不支援大廳），關選單後直接 `start-drift`。
- **離開**：神遊中按 WASD、方向鍵、Space、Esc 送 `stop-drift`；手機碰左半邊（搖桿 `joystickActive`）也離開，右半邊拖曳轉頭照常。桌機 Esc 是瀏覽器解除指標鎖定，擋不下來、選單必定跳出，所以 `isPaused` 變 true 時一併 `stop-drift`，不留下「選單後面鏡頭還在走」。手機按選單鈕只暫停，關掉選單繼續神遊。
- **介面淡出**：`useIdle(4000)`（加上 touchmove）；神遊中且閒置時，右上狀態、左上音景面板、錯誤徽章與提示 `.hud-faded`（opacity 0、pointer-events none），動一下 0.8 秒淡回。手機神遊中收起搖桿與衝刺、跳躍鈕，只留選單鈕。
- **換畫質重載**：交接資料帶 `isDrifting`，`useRenderHost` 回傳 `shouldResumeDrift`，按下開始（`handleStart`）送 `start` 後接著送 `start-drift`。

## Minespace：神遊模式（引擎端）

模組在 `content/aquarium/minespace/domains/drift/`，介面端見上一節。設計見 `docs/plans/2026-11-27-minespace-drift-design.md`。

### 架構

- **整條都是預先算好的曲線，不經過漫遊控制器**。使用者要「移動自然且舒服」，散步與飛行都是鏡頭沿一排等間距（0.5 格）的點走：`drift-track.ts` 的 `DriftTrack`（x、z、鏡頭高度、俯仰、前進方向、轉彎與爬升的速度倍率），每幀只用走過的距離查表（O(1)）。控制器用 `setSuspended(true)` 暫停物理與輸入，仍每幀跑霧、環境光與洞穴程度，所以 `use-drift` 每幀把 `controller.position` 寫成「鏡頭腳下」。結束時 `teleport` 回去（空中先 settle 落到正下方）。
- **`drift-grid.ts`**：把方塊資料整理成「站立面」（每格柱掃一次、快取）：腳下實心且不是樹葉／細長裝飾、頭上三格無障礙（低矮通道不走）、水深 ≤ 1（涉水）、無熔岩；範圍在邊界減速線內縮三格；傳送門周圍 3.5 格當障礙。**上階與下階上限都是一格**（刻意對稱，見下面踩坑）。
- **`drift-path.ts`**：A*（節點上限 9000，沿地面飛行的路線 30000）→ 拉直 → Catmull-Rom（Babylon `Curve3`）→ 逐點對回格子驗證（中心與身體四角 ±0.3）→ 驗證不過就退回轉折點更多的版本，最後退回 A* 原始格子；腳底高度低通（半徑 6 取樣點 × 2 次）後補下限（不低於地面 0.35 格）。`collectReachableSet` 從起點 BFS，剔除走不到的停留點。
- **`drift-job.ts` ／ `drift-solid.ts`**：分幀工作（generator + 每幀時間預算的佇列，重的事做一小段就讓出）與「擋不擋」查表；`drift-grid`、`drift-path`、`drift-point`、`drift-flight`、`drift-track`、`drift-framing` 的重函式都有 `*Steps` 分段版，一口氣跑完的同名版本包著它。見「第二輪審查：效能與卡頓」。
- **`drift-point.ts`**：停留點 = 音源（標題去重，每個標題最多兩個代表點）、傳送門前、抵達點、場景 `driftViewpointList`、地形找出的水邊與空地；彼此至少隔 16 格。
- **`drift-flight.ts` ／ `drift-flight-config.ts`**：飛行路線（自由路線：場景範圍內取空中轉折點，落在最近的露天停留點；溪谷用 `ground`：沿散步路線飛）＋高度（兩側最高障礙 → 斜率錐膨脹 → 平滑 → 加起伏的餘裕）。起降是垂直的：先原地升到接下來十公尺路徑的障礙之上再走曲線，降落反過來。各場景設定集中在 `DRIFT_FLIGHT_MAP`（場景定義上的 `driftFlight` 優先）。
- **`drift-shot.ts`**：運鏡，見設計文件「運鏡」一節；鏡位表 `SHOT_TABLE`、視線轉動上限 `GAZE_LIMIT_MAP`、視線與速度的三階追隨（`followAngle`、`followSpeed`、`softMin`）都在這裡。**沒有手持晃動**（使用者決定整個拿掉，程式與常數都已刪除，不要加回來）。
- **`drift-framing.ts`**：構圖量測。沿視線在體素格上逐半格探射線（含實際俯仰的 `probeViewDistance3D`、到有高度景物的 `isSightlineClear3D`），量前景疏密、被擋比例、周圍開闊程度（含上仰射線）、一路看著景物時的可見度（`measureSubjectVisibility`），並挑「看得到的方向」（`chooseLookYaw`：縱深用三束射線平均、門檻相對於附近最長視線）；鏡位候選與環顧方向都靠它，只在每段鏡位開始時算一次。
- **特色主體（`driftFeatureList`）**：`drift-point.ts` 為每個主體安排觀賞站位當停留點（作者給的 `viewpointList`，或繞主體在適合距離上找看得到它的地方）；路線偏好這些站位，`dollyIn` 看的是主體不是站位，視差與環顧以主體為主要目標，線狀主體（`pathList`）用橫搖沿著掃。欄位沒填也能運作。
- **`use-drift.ts`**：狀態機 walk → linger → walk／fly；`render-runtime` 在 `buildWorld` 建立它、`start-drift` ／ `stop-drift` 指令呼叫它。輸入：神遊中 `input` 訊息的轉頭位移交給 `applyLook`（疊加在系統視線上，4 秒沒輸入轉回），按鍵狀態仍交給控制器記著，結束時才不會漏掉按住的鍵。換場景（`switchRealm`）與 `dispose` 先 `abort()`，觀察者一定移除。`request-handoff` 帶 `isDrifting`。

### 踩過的坑

- **上階與下階上限要相等**：原本下階給兩格、上階一格，BFS 可達但回不來，溪谷谷底的停留點彼此走不到、飛行路線全失敗。
- **A* 終點要同一高度層**：只看水平距離一格半，會在斷崖下方停住，抵達後 `blockY` 與位置對不上，下一趟尋路起點格查不到（永遠 linger）。路線與繞弧可能一路上下坡，每次位置換了就 `syncBlockY` 重找高度層。
- **下一趟要在位置確定後才算**：繞弧鏡位會移動位置，繞完要重算下一站，否則起步會瞬移回原點。
- **軌道取樣要等間距**：速度曲線是「每秒走幾格取樣點」，取樣點之間的實際距離不一致，鏡頭速度就忽快忽慢。飛行起降原本用 S 曲線排垂直段（兩頭密）、再直角接水平段：垂直段尾端實際速度趨近零、接上水平段又跳回全速，量到 17～27 格／秒² 的加速度尖峰（設計值 1.2）。現在垂直段等間距、轉角磨圓，所有軌道最後沿弧長重排（`resampleUniform`）；散步軌道也要（重新取樣留下的短尾巴會讓終點前速度突然掉下去）。
- **速度上限不能填無限大**：`speedCapList` 沒有限制的地方填 99，不要 `Infinity`——相鄰兩點內插是 `∞ + (∞ − ∞) × r = NaN`，目標速度變 NaN，鏡頭在直線路段中途突然停死（`NaN > 0` 為假）。
- **加速度要連起步與終點一起看**：原本速度只有加速度上限、沒有 jerk 上限，起步與到站是加速度瞬間跳階；到站用 `√(2ad) + 0.12` 的上限，終點速度 0.3 格／秒然後瞬間歸零。現在速度與視線都是三階追隨，到站用 `softMin` 圓角收到 0.05 格／秒。
- **起步的高度落差不能用指數收**：`x += (target − x) × k` 的第一幀速度就是落差除以時間常數，起步像被拉了一把；改成 S 曲線（`heightOffsetSecond`）。
- **峽谷裡「一直看山壁」的幾個原因**（用真實溪谷資料量到的）：①水平射線穿過斜坡上方，誤判成開闊，看向「看得到的主體」其實被坡面擋住——一律改三維射線；②「開闊」用固定的小門檻（十二格），峽谷裡二三十格外的山壁也算開闊——改成相對於附近最長視線；③側移與視差在窄谷裡看的就是側面山壁——用三維射線量，兩側都不開就不選，改看前方的瀑布、溪彎、木橋；④一路看著某個主體的鏡位，走過彎道後主體被山壁擋住、視線還對著——要求這一段至少七成取樣看得到；⑤橫搖的中心（太陽那一側、溪流）沒檢查縱深，掃進牆；⑥站在山壁下的小凹處停留十幾秒——被圍住就縮成三秒、之後少來；⑦停留開頭從上一段的方向轉到有東西的方向，轉速太慢整段都在掃過山壁（停留的角速度上限放寬到約 11 度／秒）；⑧有高度的主體（溪面在視線下方）沒把俯仰對準，水平看出去只看到岸邊。
- **視線目標不能直接瞄音源**：實測 70% 的停留開頭，最響的音源是「被擋住或不到八格」（藏在岩石、水底、樹冠背後）。視線一律經過 `chooseLookYaw`（射線探縱深）。
- **垂直段的速度要另外限**：原地升降的樣本水平不動，沿軌道走一格其實是升降好幾格，要照實際高度變化限速並提前減速（`curveScaleList`）。
- **停止偵測要用三維位移**：飛行起頭的垂直段水平不動，只看水平會被誤判卡住而半空中放棄。
- **`noUncheckedIndexedAccess`**：陣列取值一律走 `drift-util.ts` 的 `itemAt`。ESLint `--fix` 會把 `;[a, b] = [b, a]` 改寫成容易出事的形狀，交換用暫存變數。
- 響度：音景在主執行緒，渲染端拿不到「此刻聽到什麼」。環顧與繞弧偏向的音源用音源資料的線性衰減（與音景同公式）估算，白天／夜晚音源依 `dayRatio` 過濾；下雨噤聲沒有算進去。

### 驗證（不開瀏覽器）

用 `vite-node` 在 Node 裡生成各場景的地形，跑完整引擎（假的 scene、camera、controller）模擬 15 分鐘：
`npx vite-node --root . <script>`，腳本在 scratchpad 的 `realms/drift/`（不進版控）：

- `test-drift.ts`：安全檢查。路徑取樣點的頭部高度與身體四角不撞方塊、鏡頭不在方塊裡、飛行不出邊界、鏡頭每幀位移與垂直速度（散步 ≤ 1、飛行 ≤ 2.5、垂直 ≤ 1.5 格／秒）、視線角速度不超過上限、離開後控制器位置不與方塊重疊。
- `metrics-drift.ts`：運鏡舒適度。長時間模擬（`SIM=1800 SEEDS=2`），逐鏡位統計位移與視線的速度、加速度、jerk、構圖偏離與重複，另有移動段平均時長、轉動方向反轉次數、正前方被擋住的時間比例、俯仰越界比例、特色主體在畫面內的時間比例（`FAKE_FEATURES=1` 用音源與傳送門當假的主體測路徑）。
- `diag-river.ts`（`REALM=river|alpine`、`LOG=1` 每秒一行記錄）：逐秒記錄鏡位、階段、看的目標種類、視線相對谷軸與離開中心的方向、三維視線深度、有沒有主體在畫面內，彙整哪些鏡位看到山壁（`BEFORE=1` 把雪稜的資料與偏好還原成舊的）。
- `metrics-fps.ts`：幀率獨立。同一場景用 30／60／144 fps 與變動幀時間（含卡頓尖峰）各跑一遍，以真實時間為軸量位移與視線的速度、加速度、jerk，並看階段交界前後的最大加速度。
- `test-adv.ts`：對抗式驗證（正確性與穩健性）。`SCEN=start,stop,rapid,switch,spike,fault,long`、`LONG=3600`、`CLIPR`（鏡頭離方塊多近算擦到，預設 0.06）。`stop`：在走、停留、飛、繞弧、升降各階段離開，驗證交還後不卡進方塊、控制器沒被留在暫停、觀察者移除、能立刻再開始；`rapid`：連按開始與離開、重複 stop／abort；`switch`：飛到一半換場景再開始、大廳拒絕；`spike`：幀時間尖峰（零、極小、0.2、60 秒、負值）；`fault`：注入例外與 NaN；`long`：一小時，量每幀耗時。`NODE_OPTIONS=--expose-gc` 搭 `test-heap.ts` 量堆積（四十場、四百分鐘，堆積持平）。

### 第一輪審查：正確性與穩健性

- **開始畫面挑大場景神遊開不起來**：主執行緒在 `realm-changed` 一到就送 `start-drift`，但那則訊息是 `switchRealm` 送的，旅程（`travelToRealm`）還有兩秒的霧要散，`isTraveling` 仍是真，指令被丟掉。現在轉場途中收到就記下 `isDriftPending`，旅程走到世界建好、霧開始散的那一刻才開始；`stop-drift` 會清掉它。
- **交還時身體卡進方塊**：路徑只驗「身體四角各有站得住的格子」，那一格可以比腳下高一格，貼著一格高的台階走時腳底方框會削進台階側面（約一成的離開會這樣）。`finishStop` 用 `checkOverlap` 確認，重疊就往格子中心退（0.4、0.7、整個退到中心），中心上方三格是空的一定放得下。
- **飛行中離開穿過樹冠、橫衝**：降落原本直接落在正下方，樹冠底下的地面會讓鏡頭穿過樹葉與樹幹。現在先找頭上開闊的落點（`findReachableSpot` 加了 `isOpenSkyRequired`），落在格子中心；要橫移就先橫移再降（水平段佔前 65%、高度從 30% 才開始降），時間依橫移距離拉長（2.2 格／秒）。
- **走了一段坡之後離開被當成在空中**：`blockY` 只在抵達時更新，一路上下坡走過來離開時查不到腳下，白白降落一趟。`stop()` 在地面階段先 `syncBlockY`。
- **露天要一路空到世界頂**：原本只看頭上十二格，蟬鳴林的樹冠高過十六格，垂直起降從樹葉裡穿過去。`isOpenSky` 現在看到世界頂；密林可能因此一個露天停留點都沒有，起飛前找不到就用 `addSkyPoint` 就近補一塊（最多四個、半徑六十格），不然一小時內零趟飛行的機率會從 8% 升到 25%。起飛前也檢查身體左右各 0.3 格碰到的格子是否露天（繞弧停在格子邊緣時會貼著隔壁的樹葉升空）。
- **神遊自己出錯不能卡住算繪**：每幀觀察者排在最前面，例外丟出去整個畫面就停了。現在 `updateSession` 包 try/catch、位置不是有限數字也算出錯，都走 `bailOut`：記錄、交還控制器、回報狀態，位置用上一幀確認過的。`start()` 中途出錯同樣收乾淨並回傳 false。
- **確認過沒問題的**：A* 找不到時的退路、斜走貼角（要兩側直鄰格都走得通）、地面高度低通不會比地面低超過 0.35 格、飛行軌道本身（各場景各六十條）不穿方塊、LAKE_BED 隱形地面從出生點走不到（河谷與地獄谷的谷壁外有大片，只有直接站上去才會進去）、幀時間尖峰與一小時模擬沒有 NaN、停留點與最近去過清單有上限、一場景最慢的一幀（規劃路徑）約 14 毫秒。
- **已知的小問題（不修）**：沿著一格高的台階邊走，鏡頭會貼到台階側面（水平距離 0 到 0.1，低於近裁剪面 0.1 的邊緣）。要修得讓路徑驗證對「中心比角落低」更嚴，會砍掉所有一格高的台階通道，不值得。

### 第二輪審查：各場景構圖（B 角度）

量測腳本（scratchpad `realms/drift/`，不進版控）：

- `framing-report.ts`：十八座場景各跑 `SIM=1800 SEEDS=4`，逐秒量三維視線深度 < 10 格、近牆且畫面中央沒有主體（附「可避免」：附近其他方向有十四格縱深）、特色主體在畫面內且三維看得到、畫面正中對準主體、朝外比例（走／停／飛）、平均俯仰、盯天（仰超過 17 度）與盯地（俯超過 23 度）、鏡位組成、停留點是不是凹處或整段看牆、飛行降落的垂直速度；`DETAIL=1` 逐鏡位。依構圖最差排名。
- `feature-audit.ts`：逐個特色主體查「作者給的站點站不站得住、看不看得到」與「適合距離的環上有幾成站點看得到它」。
- `dbg-look.ts`：單座場景逐秒印視線相對前進方向、深度與留白偏角。

結果（近牆無主體％，前→後；主體在框％；朝外％；前者 SEEDS=2、後者 SEEDS=4，數字有幾個百分點的雜訊）：

| 場景 | 近牆無主 | 主體在框 | 朝外 |
|---|---|---|---|
| rainvale | 20→16 | 31→34 | 27→30 |
| forest | 17→14 | 41→46 | 28→31 |
| cicada | 17→12 | 42→43 | 30→29 |
| meadow | 12→8 | 70→71 | 32→30 |
| cave | 11→8 | 76→79 | 30→28 |
| alpine | 11→12 | 58→60 | 50→70 |
| river | 10→10 | 54→61 | 31→28 |
| songbird | 10→10 | 50→46 | 27→30 |
| blizzard | 10→7 | 56→62 | 35→29 |
| 其餘（village、autumn、ruins、campfire、coast、swamp、jigoku、lake、wheatfield） | 1～11，與之前持平 | | |

做的事：

- **雪稜只有 46% 朝外**：根因是 `follow` 看路徑切線、飛行挑任意空中點。①新增 `radial` 視線（`drift-shot.ts`），偏好側移用它，繞外緣時一路朝外；②`driftLookBias: 'outward'` 的場景飛行改 `rim` 路線（`drift-flight.ts`，半徑 0.8、單一方向）；③radial 側移可連用（其他鏡位不能連用）；④停留尾聲轉向下一段路時也套偏好。結果朝外走 59、停 80、飛 88。
- **`follow` 純看切線**：新增留白（`chooseLookRoom`），見設計文件。林子裡實測「附近總有一個方向縱深夠」（近牆畫面幾乎都是可避免的），但緊貼樹幹的小徑上每個偏角的縱深都在七八格上下，所以密林的近牆比例降幅有限（rainvale、forest 仍在 14～16%）；樹幹四五格外不算山壁，這是密林的底線。
- **`chooseLookYaw` 縱深被上下兩束射線抬高**：正前方一格外就是樹幹，上下兩束越過它，平均還是很深。現在縱深上限是正前方距離的 1.8 倍。
- **看向目的地、側移的門檻**：目的地正前方被擋比例上限 0.5→0.35，且權重乘 (1−被擋比例)；側移權重乘 (1−被擋比例×4)。河谷的 dollyIn 與 truck 近牆比例下降。
- **停留尾聲轉向下一段路的方向**：路徑起點常貼著樹幹、山壁，現在在前進方向左右各五十七度內挑縱深最好的（略偏向原方向、符合場景視線偏好的）。
- **作者給的站點要真的看得到主體**：雪稜四個雲海 vista 的雪原邊緣站點，八個裡有四個被雪原邊緣的岩稜擋住（站上去只看到石頭）。`findFeatureStandList` 現在先濾掉看不到主體的站點，一個都不剩才退回自己繞圈找。其餘場景的特色座標用 `feature-audit.ts` 查過，中心與站點沒有錯位；東北融雪池（雪稜）環上只有 4/28 站點看得到，因為它在雪窪裡，只能近看或從上方看，權重已經不高，沒動。
- **離開時從飛行降落太快**：降落時間原本只依落差的平方根、最長 3.2 秒，二十格落差垂直速度三到六格／秒。現在垂直速度上限每秒 1.5 格，頭尾各三秒的緩起緩停（速度是 S 曲線，加速度連續），沒有巡航段的短落差用整段 S 曲線；落差大就拉長時間（二十格約十六秒，量到最長八到十秒）。橫移在前、降落排在橫移走到三成五之後，橫移 S 曲線峰值速度 2 格／秒。
- **驗證腳本的上限要跟著放寬**：`test-adv.ts` 的降落等待上限原本十到十五秒，改成四十五秒；放寬前蟬鳴林「注入 NaN 之後停止」會因為等不到降落完成誤報洩漏。
- **沒有改的**：海岸、湖的 `driftLookBias`（近牆只有 2～5%，打開沒有明顯好處）；洞穴的向上仰看洞頂（平均俯仰已是 −4 度）；樹葉穿越（使用者說不用管）。

已知底線：密林（rainvale、forest、cicada、songbird）近牆 10～16%，停留點選在林間小空地時還是會有一兩棵樹貼近；`test-adv.ts` 的 `eyeClip`（貼著一格高台階走）與起步高度落差的 `fastV` 是第一輪就有的已知項目。

### 第二輪審查：效能與卡頓（A 角度）

鏡頭每幀都在 render worker 裡更新，任何一幀頓一下，畫面上就是運鏡卡了一格。量測（`perf-drift.ts`：十八座場景各六十幀每秒跑十五分鐘，逐幀量神遊更新的耗時）：

- **一般幀只要約兩微秒**（查表走軌道、三階追隨），問題全在離散事件：抵達時規劃下一趟（散步 A* 一點五到八毫秒、飛行軌道兩到十三毫秒）、換鏡位時量構圖（兩點四到五毫秒）、停留的鏡位（零點七到一點五毫秒）、`start()` 的連通區塊與停留點（十九到一百七十八毫秒）。每座場景每十五分鐘有十二到二十八幀超過一毫秒、二到十六幀超過兩毫秒，最慢一幀十二毫秒。

做法分三層，**不改任何行為**：

1. **核心更快，結果逐項相同**
   - `drift-solid.ts`：「這格擋不擋」查一張 `Uint8Array` 表（碰撞模組的 `isBlockSolid` 每次去 `BLOCK_DEFS` 物件查，約八十奈秒，表只要三到六奈秒）。構圖射線與格子掃描都改用它，語意與 `isBlockSolid` 完全一樣（界外是白沙地）。
   - `drift-grid.ts`：一柱只掃一次，方塊 id 讀進暫存、全用查表；「頭上是不是露天」由「這一格是不是這一柱最高的實心方塊」判斷，不再每個站立面往上掃四十格。柱子快取由 `Map` 改成 `Int32Array` 索引；每個站立面有編號（`DriftCell.id`）。逐格比對全部十八座場景（含界外）與舊版相同。
   - `drift-path.ts`：A* 的節點池改成 typed array（以節點編號為下標，掛在格子上重複使用，一次搜尋不配置新物件；比較方式與舊版的物件堆積相同，所以走出同一條路），鄰格查詢不再為每個節點開 `Map`，可達集合改成 `ReachedSet`（以站立面編號標記）。`planArcPath` 原本每多一點就從頭驗整串（平方級），改成逐點驗證。拉直路徑的候選曲線改成用到才算（舊版四條曲線都先算）。
   - 同樣的路徑、停留點雜湊在八座場景上與舊版逐項相同（`bench-path.ts` 比對路徑與停留點的雜湊）。
2. **分幀工作**：`drift-job.ts` 的 `createJobQueue`。重的事都寫成 generator（`function*`），做一小段就 `yield`，由佇列每幀只給 `JOB_BUDGET_MS`（零點三毫秒）往下跑，做不完留到下一幀。每個 yield 之間的工作量約幾十微秒（A* 每展開三十二格或掃八個沒掃過的柱子、量構圖每兩個取樣點、環顧每三個方向…），所以一幀最多是「預算加一小段」。同一組工作不論分成幾幀跑完，答案都一樣。
   - 排成分幀工作的事（都在停留的開頭或走到切點時，有八秒以上的時間可以慢慢算）：`start()` 的完整連通範圍與停留點（`collectReachableSetSteps`、`collectDriftPointSteps`）、規劃下一趟（`planNext`：散步 `planWalkPathSteps`、飛行 `buildFlightTrackSteps`，含軌道組裝 `createWalkTrackSteps`、`createDriftTrackSteps` 的各階段）、停留的鏡位（`planLingerShot`：縱深、繞弧、升降、橫搖、環顧）、走路的鏡位（`beginTrackShot`：側移、視差、拉遠、留白，每個 `measure*Steps` 之間都讓出）。
   - 順序：停留開頭先排「（開始時才有）停留點 → 規劃下一趟 → 停留的鏡位」，與舊版同樣先算路徑再決定鏡位。算好之前鏡頭維持原來的視線（停留是定格，看不出來）；停留時間到了還沒算好就多停一會兒（`isPlanning`），算好就出發。
   - `start()` 同步只做「起點格 + 連通區塊夠不夠大」（數到四百格就停，約一到五毫秒，不到兩毫秒是常態），整片地圖的連通範圍與停留點排進分幀工作，所以開始神遊的頭一兩秒鏡頭在原地定格（本來就有四到七秒的開場停留）。
   - 預算是 `useDrift({ jobBudgetMs })` 的選填參數；傳 `Infinity` 就是「當場跑完」，驗證用。
3. **丟棄與重排的規則**：佇列裡的工作都屬於「現在這個脈絡」，換脈絡就清空：`startLinger`（抵達、卡住自救、重算）、`startTrack` 與換鏡位的切點、繞弧走完要重算、`stop()`、`release()`（abort、bailOut、finishStop）。被清掉的 generator 會呼叫 `return()` 讓 `finally` 歸還借用的節點池。

### 效能的坑

- **工作可能在停留開始之後才算好**：繞弧與升降的時程是「停留經過的秒數」（絕對時間），算好得晚（機器忙、冷的程式碼慢）就會從一半的地方跳出來：在機器很忙的那一次整套測試曾量到垂直速度二點二七（上限一點五）、再也沒重現，推論是這個原因。現在 `planLingerShot` 一開始記下 `startElapsed`，繞弧起點、升降起點與可用時間都以它為起點；剛抵達就算好時它是零，與舊版相同。
- **`measureMaxDepth`、`chooseLookYaw`、`measureView`、`measureSubjectVisibility`、`measureOpenness`、`planWalkPath`、`collectDriftPoint`、`buildFlightTrack`、`createWalkTrack` 都留著同步版本**（`runStepsSync` 包分段版），離開時的落點搜尋、驗證腳本、其他呼叫端不用改；新的呼叫要在分幀工作裡用 `yield* xxxSteps`。
- **yield 的間隔看「做了多少事」，不是看展開幾格**：在沒掃過的荒地一格要十幾微秒、掃過的地方不到一微秒；A* 與廣度優先因此同時看展開數與「新掃了幾柱」（`grid.getScanCount()`），沒有站立面的柱子（水、實心）不增加站立面編號，光看編號會漏掉它們的掃描成本。
- **冷的程式碼比熱的慢很多**：每個函式一趟只呼叫幾次，V8 還沒最佳化，同樣的一段在 Node 裡第一次要零點七到零點九毫秒、熱了以後不到零點一。所以每段切到最細（開發模式下單段超過兩毫秒會 `console.warn` 「分幀工作「…」單段耗時」，整幀超過三毫秒也會警告「這一幀神遊更新花了…」，使用者實測可以直接看 console）。
- **剩下的幾毫秒尖峰是 GC，不是神遊**：用 `PerformanceObserver('gc')` 對照，超過一毫秒的幀都與 Node 的 scavenge 重疊（驗證腳本一個程序裡連續生成十八座場景的地形，新生代很髒）；神遊自己配置的東西很少（六座場景各十五分鐘，合計只觸發四十次 GC）。

### 效能驗證結果

腳本在 scratchpad 的 `realms/drift/`（不進版控）：`perf-drift.ts`（環境變數 `INLINE=1` 當場跑完、`BUDGET` 預算毫秒、`GCEVERY` 每幾幀強制 GC、`GCREPORT=1` 對照 GC 事件、`TRAJ` 輸出鏡頭軌跡）、`cmp-traj.mjs`（比對兩份軌跡）、`bench-path.ts`（路徑與停留點雜湊）、`test-grid-eq.ts`（新舊格子逐格比對）、`stop-cost.ts`、`latency.ts`（規劃完成要幾幀）、`heap-long.ts`。

量測（Node，一般桌機；`perf-drift.ts`，十八座場景各十五分鐘、六十幀每秒；前→後）：

| 場景 | `start()` 毫秒 | p99.9 毫秒 | 最大毫秒（括號：每五秒強制 GC 後） | >1 ms 幀數 | >2 ms 幀數 | >4 ms 幀數 |
|---|---|---|---|---|---|---|
| lake | 33→4.0 | 0.040→0.330 | 3.5→0.9（0.8） | 20→0 | 9→0 | 0→0 |
| coast | 19→1.1 | 0.025→0.316 | 3.7→0.7（0.7） | 17→0 | 5→0 | 0→0 |
| forest | 52→1.0 | 0.043→0.325 | 4.3→0.7（0.7） | 14→0 | 8→0 | 1→0 |
| autumn | 56→0.9 | 0.029→0.313 | 3.5→0.9（0.5） | 21→0 | 7→0 | 0→0 |
| swamp | 76→1.9 | 0.019→0.316 | 4.8→0.6（0.7） | 18→0 | 10→0 | 3→0 |
| village | 141→1.1 | 0.011→0.322 | 3.7→1.1（0.7） | 18→2 | 12→0 | 0→0 |
| cave | 73→2.3 | 0.008→0.316 | 6.1→0.8（0.6） | 12→0 | 4→0 | 1→0 |
| alpine | 79→1.0 | 0.010→0.317 | 4.5→5.9（0.6） | 20→1 | 10→1 | 3→1 |
| river | 66→1.0 | 0.009→0.319 | 12.1→3.1（1.3） | 15→2 | 7→1 | 4→0 |
| wheatfield | 172→1.7 | 0.023→0.323 | 4.2→1.1（0.6） | 23→1 | 13→0 | 1→0 |
| meadow | 161→1.1 | 0.007→0.317 | 4.6→1.0（0.7） | 18→1 | 9→0 | 1→0 |
| rainvale | 49→1.8 | 0.009→0.310 | 4.2→0.7（0.6） | 12→0 | 7→0 | 1→0 |
| blizzard | 60→0.9 | 0.010→0.311 | 4.4→0.7（0.6） | 18→0 | 8→0 | 1→0 |
| campfire | 178→0.9 | 0.014→0.316 | 4.4→0.7（0.7） | 21→0 | 8→0 | 1→0 |
| ruins | 138→0.9 | 0.092→0.315 | 8.4→0.8（0.9） | 28→0 | 16→0 | 4→0 |
| jigoku | 94→1.0 | 0.023→0.316 | 8.2→0.7（0.8） | 18→0 | 13→0 | 2→0 |
| songbird | 50→2.1 | 0.037→0.326 | 4.0→0.7（0.7） | 22→0 | 12→0 | 0→0 |
| cicada | 56→1.0 | 0.037→0.313 | 2.4→1.1（0.6） | 19→1 | 2→0 | 0→0 |

總計：>1 ms 的幀 334→8、>2 ms 的幀 160→2、>4 ms 的幀 23→1。p99 前後都是 0.002～0.007 毫秒（一般幀沒變）；p99.9 從零點零零七～零點零九升到零點三一～零點三三，那是預算本身：只有規劃進行中的那一成不到的幀多花零點三毫秒，換掉了一幀四毫秒的尖峰。`start()` 同步部分最慢 4.0 毫秒（開機後第一座場景，冷的程式碼）。`alpine` 的 5.9 與 `river` 的 3.1 都對到 Node 的 scavenge（四點一毫秒的 GC），強制 GC 後最大一點三毫秒。離開（`stop()`）最慢零點三三毫秒，之後每幀不到零點零一毫秒。

行為相同的證明：`perf-drift.ts INLINE=1`（預算無限大，工作當場跑完）、固定亂數種子，十八座場景各十五分鐘每十分之一秒取一次鏡頭位置與轉向，與改動前的舊版（同一組核心、依序呼叫）逐項比對：**全部相同**。分幀只改變「哪一幀做」，沒有改變「做什麼」。另外 `test-drift.ts`（安全檢查）、`test-adv.ts`（`SCEN=start,stop,rapid,switch,spike,fault,long LONG=3600`）失敗項與舊版同一批（`eyeClip` 貼台階邊、`walkOnHiddenFloor`、`handbackOverlap`、`cave` 的 `refused`；見第一輪「已知的小問題」），多跑幾次出現的種類一樣。把預算壓到一幀只做一小段、又只有十五幀每秒（`BUDGET=0.0001 FPS=15`，模擬機器很慢）：鏡頭水平速度最大一點九、垂直零點九八、視線角速度零點一六，都在限制內，沒有瞬移。

記憶體：`test-heap.ts`（四十場、四百分鐘，`--expose-gc`）堆積持平九十九點六～一百點零 MB（森林、河谷、洞穴）；`heap-long.ts` 連續三小時一場，每三十分鐘強制 GC 後的堆積完全平的（wheatfield 103.9、cave 100.7、river 101.1 MB），中止後回到起點（wheatfield 多一點四 MB 與舊版相同）。一場神遊占的 JS 堆積約二到六 MB（與舊版相同）加零點五到零點七 MB 的 typed array（柱子索引、可達旗標、搜尋池，隨格子一起放掉）。

### 還沒驗證的、剩下的風險

- **真實瀏覽器與 worker 的數字沒有量**（使用者規定不開瀏覽器）：Node 的毫秒只是代理。中階機器大約慢兩到三倍；因為是依時間（不是依工作量）切，一幀的上限仍是「預算加一小段」，冷的程式碼第一次的單段可能到一到兩毫秒（開發模式的警告會直接顯示）。
- **開始神遊的那一幀**同步做起點格與連通區塊檢查（零點九到四毫秒，常態一到兩毫秒），沒有排進分幀；要再壓掉得讓起點可以事後搬動（孤立平台的罕見情況會看到瞬移），沒有做。
- 工作的完成時間依機器忙碌程度而變：Node 六十幀每秒下，抵達之後規劃好下一趟要一到二十三幀（最多零點四秒，`latency.ts`）；開始神遊的完整準備（連通範圍、停留點、第一趟路徑）零點三到二點一秒（最慢是 wheatfield，連通範圍一萬五千格）。機器很慢時停留會延長：預算壓到一幀只做一小段（`BUDGET=0.0001`）時，river 一千八百秒裡的停留從九十八秒增加到一百五十二秒。
- 一次三千六百秒的 `test-adv.ts long` 在八個程序同時搶 CPU 時出現過一次河谷停留佔七成的結果（`stuck5minWindows=8`），之後單獨與四個同時各重跑多次都正常，沒能重現；懷疑是當時的負載，若使用者實測河谷常常原地停很久，先看 console 有沒有「規劃下一趟」的警告。（第三輪找到真正的原因，見下一節「河谷停在半空」。）

### 第三輪：運鏡強化（導演、低飛、除錯面板）

設計見 `docs/plans/2026-11-27-minespace-drift-design.md` 的「導演」「視野呼吸」「無人機」「開發模式的除錯面板」。

新模組（都在 `domains/drift/`）：

- **`drift-direction.ts`**：導演的資料表。`FEATURE_DIRECTION_MAP`（每種特色主體的時段權重、造訪計畫候選、置中與否、推近幅度、升降高度、能不能繞飛）、`DAY_PACE_MAP`（時段的速度與停留倍率）、`createCoverageLedger`（涵蓋紀錄：哪個主體、哪個方位、哪種計畫、什麼時候）。純資料與純函式。
- **`drift-glide.ts`**：低飛。把散步路徑的腳底墊高（沿路量頭頂的空間、坡度上限、平滑），交給 `createWalkTrack`；軌道種類仍是 `walk`（階段回報是 walk），`NextPlan.isGlide` 標記，速度乘一點七。
- **`drift-debug.ts`**：除錯快照的型別與文字格式；快照由 `use-drift` 的 `getDebugSnapshot()` 產生。
- `drift-shot.ts` 多了鏡位 `lead`、`arc`、`tilt`，視線種類 `tilt`、`path`，與視野呼吸的常數；`drift-flight.ts` 多了 `orbit` 路線；`drift-flight-config.ts` 多了各場景的低飛比例與霧的高度上限；`drift-point.ts` 的觀賞站位改成角度拉開的最多三個。
- `use-drift.ts`：`planFeatureVisit`（造訪計畫）、`findVisitSubject`、`findRevealSubject`（升起揭露）、`pickArcSubject`（繞飛）、`findLeadPath`（沿線跟拍）、`updateZoom`／`writeFov`（視野呼吸）、`getDirectorState()`（驗證用）。

#### 神遊除錯面板怎麼用（開發模式）

- **F10** 開關（左下角；開著時不跟著其他介面淡出），**F2** 或面板上的「複製」把文字複製到剪貼簿。F3、F4、F6～F9 已經有別的用途。
- 複製出來的第一行是現在這一刻，`# history` 之後是最近二十秒每秒一行（舊到新），`# shot changes` 之後是最近十次換鏡位（階段、段落、鏡位或視線對象變了）那一刻。每次換鏡位也會印到 console（`[DriftDebug] …`），並寫進 F6 匯出的執行時狀態（名目「神遊換鏡位 0～9」）。
- 一行的格式固定：`drift/1` 開頭（一是格式版本），之後每欄 `鍵=值`、一個空白分隔，沒有值是 `-`：

  `drift/1 sid=hj5v t=300.6 realm=rainvale tod=0.921 slot=night pos=150.0,12.1,126.0 yaw=135.0 pitch=7.4 fov=60.2 zoom=1.00 phase=linger seq=visit:crane shot=crane shotT=0/22 trip=- stay=0/40 beat=crane look=feature target=北林的小亭 kind=structure dist=17 vis=1 depth=13.0 wall=0 speed=0.00 alt=1.6 glide=0 dest=feature-4-2(南林的小亭) user=0`

  | 欄位 | 意思 |
  |---|---|
  | `sid`、`t` | 這一場神遊的代號（每次開始重抽）、已經過幾秒 |
  | `realm`、`tod`、`slot` | 場景、時刻（零到一）、時段（day、noon、golden、blue、night） |
  | `pos`、`alt` | 鏡頭位置（眼睛）、離正下方地面（或樹冠、屋頂）多高 |
  | `yaw`、`pitch`、`fov`、`zoom`、`user` | 朝向（度；偏航零是 +Z、順著 +X 遞增，俯仰正值往下）、視野（度）、視野相對於設定的比例、使用者拖曳的偏航偏移（度） |
  | `phase`、`seq`、`shot`、`shotT` | 階段、段落（travel、approach、glide、pathFollow、aerialOrbit、scenery、reveal、`visit:計畫`）、鏡位、這個鏡位已過／預計幾秒（估計） |
  | `trip`、`stay`、`beat` | 這一趟走了幾成；停留已過／預計幾秒與現在這一段（hold、pan、orbit、crane、tilt、anticipate） |
  | `look` | 視線對著什麼：`path-tangent`（前進方向）、`path-tangent+room`（加留白偏角）、`feature`、`destination`、`origin`（回頭看來處）、`side-subject`、`sound-source`、`path-lead`、`outward`／`inward`、`locked-direction`（側移）、`pan`、`sky`（太陽或月亮）、`next-path`（轉向下一段路）、`locked-hold`（開場運動做完鎖住）、`fallback:open-direction`（沒有主體，看縱深最長的方向）、`fallback:keep` |
  | `target`、`kind`、`dist`、`vis` | 對著的特色主體的名字與種類、水平距離、三維視線通不通（一是看得到） |
  | `depth`、`wall` | 畫面正中央那一束視線打到東西的距離（最遠五十）、是不是近牆（不到十格） |
  | `speed`、`glide`、`dest` | 沿軌道的速度、是不是低飛、這一趟的目的地（停留點編號，觀賞站位附主體名字） |

- 欄位有增減要把 `DRIFT_DEBUG_FORMAT_VERSION` 加一。協定：指令 `set-drift-debug`、上行訊息 `drift-debug`（`render-host/protocol.ts`），渲染端只在面板開著時每四分之一秒算一次快照（兩束射線），正式版的 `setDriftDebug` 不會啟動計時器、面板也不掛。
- 用這份紀錄查「看牆」：找 `wall=1` 的行，看 `look`——是 `path-tangent`（跟拍，路貼著牆）、`feature` 而 `vis=0`（主體被擋住）、還是 `fallback`（沒有主體可看）。面板第一次用就抓到三個問題（下面「除錯紀錄抓到的」）。

#### 踩到的坑與修掉的問題

- **河谷停在半空（舊問題）**：卡住偵測比的是六秒前後的位置。溪谷沿地面飛的路線在落點前會繞一小圈（跟著散步路徑折返），六秒前後位置幾乎相同，就被當成卡住、在半空放棄這一趟；之後從空中找不到路，一直停在那裡（實測兩場裡有一場、一停就是後半小時，量測裡表現為河谷停留佔四成七）。改成比「沿軌道前進了多少」；飛行中真的走不動（不該發生）就結束神遊、平順降落，不在半空放棄。
- **繞圈找的站位不能加到作者給的站位上**：為了「每個主體兩個角度」曾經在作者的站位之外再繞圈補站位，河谷的鏡頭被帶到峽谷邊緣的平台上，主體在框從七成掉到五成、近牆從四趴升到一成二。作者給了站點的主體只用作者的；沒給的才繞圈找，而且挑角度差最大的（以前取頭兩個看得到的，相鄰只差三十度，常被十六格的間距規則剔掉）。
- **「看得到主體」不等於畫面裡有主體**（除錯紀錄抓到的）：視線檢查容許主體周圍半個尺寸的誤差，中間夾一根樹幹照樣算看得到；加上三分線的偏角，畫面正中央可能是五格外的樹幹。造訪主體、停留時朝景物看、繞弧的中點與終點、仰搖的頂與底，現在都另外量「畫面正中央那一束」的縱深。
- **開場運動做完不能鎖死方向**（除錯紀錄抓到的）：繞弧走完位置換了、升降降回來高度換了，鎖住當下的方向常常正對著一根樹幹再看十幾秒。造訪主體時改成視線留在主體上。
- **有視線偏好的場景，造訪要跟著偏好**：雪稜的主體有一半在場景裡面（峰、鳥居、融雪池），每次停留都去拍它們，朝外的比例從六成六掉到五成三。主體的方位不合偏好（合的程度不到零點五）就不造訪，也不繞飛；修完回到六成七到七成一。
- **低飛的高度要平滑到底**：墊高的量曾經在平滑之後與「容許的高度」取較低的，折角回來了，垂直加速度尖峰一點六格／秒²（別處不到零點五）。現在平滑兩次不再取低，多出來的高度由頭頂的餘裕（一格）吸收。
- **濕地的蘆葦**：量頭頂空間原本把所有不是空氣的方塊都算障礙，蘆葦長到視線高度，整片濕地墊不起來。改用構圖射線同一張「擋不擋」的表（樹葉、樹幹、岩石算，草與蘆葦不算）。
- **視野的復原**：離開神遊時視野可能還收著。在地面按鍵離開是當場交還，所以另外掛一個零點八秒的觀察者把視野放回去（途中使用者改了視野設定就不再碰；換場景、重新開始神遊、dispose 時直接放到終點）。驗證腳本的假鏡頭沒有 `fov` 時整個視野呼吸不做。
- **驗證腳本的上限**：`test-adv.ts` 的 spike 情境在離開後只等四百幀（六點七秒）就檢查有沒有放開，從二十格高的飛行降落要十六秒，舊版也偶爾誤報（`spike-stop` 一組）；升降變高之後更常見。加了 `fov` 與四十五秒等待的版本是 scratchpad 的 `enh/test-adv-fov.ts`。

#### 量測（Node，不開瀏覽器）

腳本在 scratchpad 的 `realms/drift/`：`coverage-drift.ts`（十八座場景各六十分鐘 × 兩場、一天十分鐘；`BEFORE=1` 改跑舊版副本——先把 scratchpad 的 `enh/drift-before/` 複製到專案根目錄的 `.cache/drift-before/`，跑完刪掉（放在專案外面的話 `@babylonjs/core` 解析不到，匯入會無聲無息卡住）；`OUT` 輸出 JSON，`enh/mk-table.py` 排成下表）、`enh/framing-ab.ts`（原本的構圖報告加上舊版開關）、`enh/dbg-snapshot.ts`（把除錯快照逐次換鏡位印出來）、`enh/dbg-stuck.ts`（逐階段的時間與位置）。

「專業運鏡」是升降、繞弧、仰搖、繞飛、沿線跟拍的秒數；「空中」是升空加低飛，「看得到東西」是畫面正中央在霧吃掉大半之前（霧起點加六成霧帶）打得到方塊、或有主體在框內且在那個距離內。前→後：

| 場景 | 主體在框％ | 正中主體％ | 近牆無主％ | 專業運鏡（秒／時） | 定格％ | 空中占比％（其中低飛） | 空中看得到東西％ | 空中離地（格） | 光源正中 夜:日（秒／時） |
|---|---|---|---|---|---|---|---|---|---|
| lake | 77→84 | 58→71 | 1→2 | 29→997 | 11→14 | 47→40（5） | 89→94 | 10.4→9.4 | 228:387→467:364 |
| coast | 75→81 | 55→65 | 3→4 | 10→687 | 14→20 | 46→31（0） | 88→95 | 9.5→9.5 | 140:145→250:194 |
| forest | 46→51 | 30→38 | 13→18 | 0→390 | 8→15 | 49→33（21） | 67→85 | 12.5→7.9 | 66:44→40:81 |
| autumn | 60→64 | 45→52 | 7→8 | 0→1080 | 9→15 | 54→47（0） | 79→87 | 12.6→11.9 | 276:147→402:209 |
| swamp | 77→80 | 62→71 | 3→4 | 10→502 | 8→15 | 47→26（100） | 73→99 | 10.6→2.8 | 56:54→127:110 |
| village | 53→54 | 37→40 | 7→6 | 32→345 | 7→10 | 48→49（0） | 85→88 | 12.3→11.4 | 68:72→102:112 |
| cave | 78→83 | 65→71 | 10→9 | 0→546 | 9→14 | 0→26（100） | –→98 | –→2.9 | 717:958→782:713 |
| alpine | 61→58 | 39→38 | 10→13 | 16→268 | 8→10 | 50→50（0） | 83→80 | 12.1→12.0 | – |
| river | 64→64 | 47→52 | 7→8 | 10→348 | 6→11 | 49→41（29） | 100→100 | 9.1→6.9 | – |
| wheatfield | 86→90 | 71→79 | 1→1 | 0→724 | 9→12 | 43→43（0） | 97→98 | 9.1→9.0 | 142:181→304:180 |
| meadow | 79→79 | 64→66 | 7→6 | 14→753 | 8→9 | 43→46（0） | 98→98 | 10.2→10.3 | – |
| campfire | 77→81 | 66→72 | 3→2 | 10→923 | 9→11 | 44→38（8） | 96→98 | 10.1→8.4 | 180:152→196:171 |
| ruins | 63→73 | 48→60 | 5→4 | 0→690 | 9→13 | 43→39（18） | 93→96 | 10.4→8.3 | – |
| jigoku | 82→86 | 73→77 | 5→4 | 0→1137 | 7→11 | 44→40（49） | 79→91 | 10.3→5.7 | 441:368→514:288 |
| songbird | 44→66 | 30→54 | 9→11 | 21→733 | 10→16 | 46→33（29） | 86→98 | 11.8→7.5 | – |
| cicada | 43→45 | 30→32 | 14→17 | 0→232 | 8→18 | 54→23（77） | 66→91 | 13.4→4.7 | 67:128→222:189 |
| rainvale | 27→33 | 19→23 | 18→23 | 10→94 | 9→14 | 40→20（100） | 28→99 | 11.3→2.3 | – |
| blizzard | 60→63 | 48→53 | 6→9 | 0→476 | 10→17 | 45→20（100） | 47→82 | 8.9→2.8 | 302:382→487:412 |

合計：主體在框 64→69%，正中 49→56%，近牆無主 7→8%；專業運鏡合計 326→21854 秒（三十六場小時）；空中的時間 44→36%，其中看得到東西 80→93%；光源在畫面正中的時間 夜:日 5363:6031→7787:6049；視野有在變的時間 0→8%；同一個主體用同一種計畫十分鐘內重複不到一成。段落組成（後）：travel 48.5%、approach 13.1%、glide 6.9%、aerialOrbit 5.5%、造訪（推近 5.2、升降 3.8、繞弧 3.6、定格 2.9、仰搖 2.4、沿線橫搖 0.8）、pathFollow 3.5%、reveal 2.4%、scenery 1.6%。

讀這張表要注意的：

- **近牆沒有降，密林還升了**（rainvale 18→23、forest 13→18、cicada 14→17）。原因是時間的分配變了：以前四到五成的時間在樹冠上方飛，畫面正中央是四十格外的霧（不算近牆、但也沒有東西看）；現在那些時間在林下走與低飛，樹幹就在七八格外。逐鏡位看，走路跟拍的近牆比例前後一樣（rainvale 23→25%）。密林的近牆底線沒有變，要再降得靠場景資料（林間多留幾條視線通的走廊、多標幾個主體）。
- **停留的比例升了**（約一成三→兩成五，其中定格 9→14%）：造訪有開場運動加細看。嫌停太久調 `VISIT_DETAIL_SECOND_RANGE`、`VISIT_PASSING_CHANCE`。
- **日出日落太陽入鏡沒有變**（29→24～29%，在雜訊內）：太陽放三分線只作用在沒有主體的停留；日出日落觸發的那一趟飛行沒有特地朝太陽。
- 前後兩次跑的場景資料不完全相同（其他人同時在加特色主體，主體總數 200→219），數字有幾個百分點的雜訊；分幀工作依時間切，同一個種子兩次跑也不會逐幀相同。
- 還有幾個主體六十分鐘內沒被拍到：村落的水車小屋與旅籠、石廊跡的北端石室／石室滲水／遠方階梯塔、雪稜的東北融雪池、聽雨森林的「雨霧裡的林牆」。前後都一樣，是站位走不到或從站位看不到（`feature-audit.ts` 可查），不是路線的問題。

舒適度與安全（都與舊版同級）：

- `metrics-fps.ts`（wheatfield、forest、alpine、rainvale、lake；30／60／144 fps 與變動幀時間）：四種模式的數字相同（幀率獨立）。位移加速度 p99 0.30～0.40 格／秒²，轉速 p99 11.5 度／秒、角加速度 p99 0.07，與舊版相同；最大值的尖峰（lake 1.7、舊版 1.2～1.3）是舊有的飛行轉角。低飛的垂直加速度修正後 rainvale 最大 0.40。
- `coverage-drift.ts` 逐幀：偏航最快 11.7 度／秒、俯仰 4.6、水平 2.50 格／秒、垂直 1.36（前 11.9／4.6／2.50／1.38）；視野變化最快每秒 1.63 度（放開時），收窄時每秒 0.7 度。
- `test-drift.ts`：十八座場景 `eyeInBlock=0`、`flyInBlock=0`、`cameraInsideBlock=0`、`outsideBoundary=0`；`walkBodyHit`（貼著一格高台階走）與舊版同級。
- `enh/test-adv-fov.ts`（`SCEN=start,stop,rapid,switch,spike,fault,long LONG=1800`，鏡頭帶 `fov`）：失敗項與舊版同一批（`eyeClip`、`handbackOverlap:fault`、`walkOnHiddenFloor`、`cave` 的 `refused`），沒有觀察者洩漏、沒有視野沒放回（`fovNotRestored`）。
- `perf-drift.ts`（十五分鐘、六十幀每秒）：一般幀 p50 0.002→0.003 毫秒、p99 0.006→0.007、p99.9 0.31～0.33→0.32～0.36（預算本身）；超過一毫秒的幀十八座合計 7→14（都在一點零到一點四毫秒），超過兩毫秒 2→1（alpine 六毫秒，對到 GC，舊版七點二）。新的規劃（造訪、揭露、沿線、低飛）都在分幀工作裡。
- `vue-tsc`：minespace 仍是既有的 86 個 TS4114，沒有新的。

#### 還沒驗證的

- 沒開瀏覽器：除錯面板的版面、F10／F2、剪貼簿、視野呼吸實際看起來的幅度、低飛穿過林子的觀感、繞飛的構圖，都只有數字。
- 低飛平均只比走路的視線高約一格（離地二點三到二點九格）：樹冠底通常在四到六格，扣掉一格餘裕與坡度上限就只剩這些。要更高得放寬 `HEAD_MARGIN` 或 `LIFT_SLOPE`。
- 低飛不檢查「穿得過去」的方塊（藤、蘆葦、草）：從它們中間穿過去時畫面會有東西貼臉掠過。
- `activeAt` 目前沒有任何場景資料用到，只驗過型別與邏輯路徑。

## Minespace：環境粒子（每座場景自己的日夜粒子）（2026-11）

設計見 `docs/plans/2026-11-27-minespace-realms-design.md` 的「環境粒子」。程式在 `domains/weather/ambient/`，資料在 `domains/realm/realm-ambient-table.ts`，各場景定義檔只掛一行 `ambientParticleList`。

### 結構

- `ambient-kind-spec.ts`：23 種粒子各自的外型與動法預設（純資料）。新增一種：先在 `realm-definition.ts` 的 `AMBIENT_PARTICLE_KIND_LIST` 加名字，再補 spec（`Record` 型別會逼你補），貼圖圖樣加在 `ambient-shape.ts`。
- `ambient-layer.ts`：一層一個 `ParticleSystem`。出生位置（`startPositionFunction`）與初速（`startDirectionFunction`）自己給，系統更新之後再逐顆改速度（轉彎、順風、上浮下沉）。
- `ambient-anchor.ts` 與 `ambient-spot.ts`：錨點索引與落腳點，不碰 Babylon，Node 端可以直接餵真的世界資料。
- `realm-ambient.ts`：管理端。天氣系統整個工作階段只建一份，場景卻會換，所以每幀比對 `getAmbientWorldSource()` 回傳的世界（`worldState` 與 `realmId`），變了就整批拆掉重建；世界層是 null（換場景的空檔）就全部收掉。粒子的設定看世界層自己的 `realm.id`，不看 `activeRealmState`，兩者在換場景的空檔會差一下。
- `use-weather.ts`：每幀呼叫 `realmAmbient.update`，有設定的場景把通用空氣顆粒（`air-motes`）整組關掉（`visibleRatio` 給零，不折進 `dayRatio`，理由同空氣顆粒的註解）。
- `render-runtime.ts`、`world-layer.ts`：新增 `getAmbientWorldSource`，世界層多交出 `lightSourceList`（原本只有燈池與光暈在用）。

### 踩過的坑與刻意的取捨

- **`updateSpeed` 設成 1/60**：Babylon 粒子的位移、壽命、發射率都乘上 `updateSpeed × 動畫比例`，原本各系統用 0.01、0.02，數字要換算成秒。環境粒子統一設成一幀的長度，種類表裡的壽命是真實秒、速度是格／秒、重力是格／秒²、`emitRate` 是每秒幾顆。
- **每顆粒子的初速不能靠 `direction1 / direction2`**：盒狀發射的方向是兩個向量之間的均勻隨機，水平速度會抽到接近零，蝴蝶就停在原地、轉向（旋轉零向量）也沒用。改用 `startDirectionFunction` 直接給「水平速率、垂直速率、朝向」。`minEmitPower` 與 `maxEmitPower` 設成一。
- **粒子系統 `dispose()` 預設連貼圖一起釋放**：所以每層自己建貼圖、不共用。共用貼圖要自己管引用計數，幾十個像素的貼圖不值得。
- **拍翅用精靈圖**：`spriteCellChangeSpeed` 是「一生走幾輪」，不是頻率；每秒拍幾下 = `spriteCellChangeSpeed ÷ 壽命`，所以建立時乘上平均壽命（壽命有隨機，拍速因此有 ±兩成的自然差異）。
- **沿速度拉長的粒子**（吹雪、水珠）用 `BILLBOARDMODE_STRETCHED`：四邊形的長邊是 Y 軸，拉長是 `minScaleY`，寬度是 `minScaleX`，與雨絲一樣。
- **尺寸梯度給的是絕對值**，不是倍率：煙霧越冒越大的種類要自己把 `size` 範圍乘上去。
- **世界換好才掃錨點**：方塊類的錨點（花、草、蘆葦、蘑菇、麥）掃三百萬格，約十毫秒量級；只掃這座場景用得到的種類，大廳不掃。
- **洞穴與屋簷底下**：不是地底的場景，`caveRatio` 收掉六成（走進屋簷下蝴蝶不該漫天飛）；地底場景整個在洞裡，不收。
- **螢火不再是每座場景都有**：風露原的 `weatherParticle.fireflyDensity` 只對沒有環境粒子清單的場景有用，現在沒有任何場景用到，留著當舊資料。

### 驗證（不開瀏覽器）

- `ambient-profile.test.ts`、`realm-ambient.test.ts`（`npx vitest run --project unit content/aquarium/minespace/domains/weather/ambient`）。後者用 `NullEngine`：沒有著色器可編譯，粒子系統永遠 `isReady() === false` 而不更新，測試裡把 `ParticleSystem.prototype.isReady` 換成永遠為真；`DynamicTexture` 要畫布，改成假的 `RawTexture`。換世界的洩漏檢查是數 `scene.particleSystems` 與 `scene.textures`。
- 真世界覆蓋率：對每座場景生成地形（約六秒跑完十九座），在可走範圍的格點（半徑 ≤ 70，洞窟 100，站立位置用 `findSafeStandingPosition`）上，用同一支 `collectAmbientSpot` 數每一層找得到落腳點的比例。結果（百分比）：湖、海、林海、金葉林、沼澤、麥田、風露原、百囀林苑的各層都是 100 或接近；村落的蛾 73（只在有燈的一帶）、炊煙 21（只有一座灶）；溪谷的蝴蝶 43、蜻蜓 30、螢火 32（溪邊）；拓荒原的火星 45、蛾 70；湯煙谷的火星 46、水汽 31；洞窟的孢子 23、水面涼霧 7（只在地底湖邊）；海中沙島的風沙 58（海中沒有地面）。
- Node 端單幀成本（NullEngine，含系統更新、不含 GPU）：各場景四個時段穩態 0.002～0.14 毫秒，同時最多 133 顆。

### 沒有驗證的

- 所有視覺：形狀、大小、顏色、亮度、密度、飛行路徑，全都沒有實際看過。數字是照既有粒子（空氣顆粒、落葉、雪）的尺度定的，使用者看完預期要調。
- GPU 成本與真實 FPS（加法混合的點、柔邊的煙霧片的填充率）。
- 精靈圖的拍翅頻率、拉長粒子在畫面上的長寬比、`BILLBOARDMODE_STRETCHED` 在粒子幾乎垂直時的樣子。
- 畫質各級（`particleRatio`）下的疏密；`count` 乘倍率後最少兩顆。

### Minespace：受光的草比陰影裡的灰

- 原因是 ACES 色調映射越亮越往灰白壓。草地染色 `[0.55, 0.75, 0.36]` 乘上不同光照後過 ACES 的飽和度：陰影 0.62、一般日照 0.43、強烈日照 0.32、很亮 0.24。貼圖偏亮的材質包更明顯。
- 處理：不換色調映射（雲、天空、夕陽都是在 ACES 下調的），在色調曲線補中間調與亮部的飽和度（`use-babylon-scene.ts` 的 `HIGHLIGHT_SATURATION_RESTORE`，中間調 12、亮部 32）。整體那一組歸日夜循環、暗部那一組歸眼睛適應，各管各的。
- 補不夠才考慮換 Khronos PBR Neutral 色調映射，但那要連天空與雲重調一輪。

### Minespace：布景地面只鋪在不畫的地面上

- 布景的底層平面（`backdrop.floor`）原本整片鋪滿世界，出過兩種事：平面比水面高，林子裡每一窪水被蓋成草綠（聽雨林、百囀林苑，林海也有 19 格）；平面擺在谷壁頂，神遊飛高過谷壁後整座山谷被一大片地面蓋住（拓荒原、石殿遺址、湯煙谷）。
- 現在一律只鋪在格柱裡有 `LAKE_BED` 的地方與世界範圍之外（`backdrop.ts` 的 `createMaskedFloorMesh`，逐列把連續的格柱併成長方形）。十五座有布景地面的場景都驗過：沒有任何一座靠平面補「有方塊在畫」的格柱。
- 新場景仍要注意：深水底下的 `LAKE_BED` 格柱，平面高度要低於水面。檢查腳本在 scratchpad 的 `realms/floor/check-floor.ts`。

## Minespace：招牌景象（每座場景自己的那個時刻）（2026-11）

設計與各場景一覽見 `docs/plans/2026-11-27-minespace-realms-design.md` 的「招牌景象」。

### 結構

- `domains/realm/realm-signature-kit.ts`：共用零件。`createSignatureLayer` 建材質、掛每幀觀察者、寫 `time` 與 `strength`、亮度低於 0.002 就停用網格、收尾時釋放觀察者、網格與材質。`SignatureFrame` 是此刻的條件（`nightRatio`、`dayRatio`、`twilightRatio`、`darkRatio`、`clearRatio`、`outdoorRatio`、`detailRatio`），全部從 `AtmosphereState` 算。另有三種網格（一疊方片、格子帶、釘在世界座標上的方片）與幾段 GLSL（雜湊與噪音、天球方向、天球方片、繞地平線的帶子）。
- `domains/realm/realm-signature-direction.ts`：固定方位的景象掛在天上哪裡（純資料，不引用 Babylon）。渲染端與神遊的 `<id>-drift-features.ts` 讀同一份。
- 各場景資料夾一個檔：`lake-moon-path`、`coast-sea-sparkle`、`forest-fox-procession`、`autumn-geese`、`swamp-moon-halo`、`village-sky-lanterns`、`waterfall-rainbow`、`wheatfield-galaxy`、`meadow-meteors`、`campfire-comet`、`ruins-ringed-moon`、`jigoku-sky-glow`、`songbird-murmuration`、`cicada-cloud-tower`、`rainvale-sheet-lightning`、`blizzard-light-pillars`。
- `realm-decoration.ts` 多一張 `REALM_SIGNATURE_MAP`，與原本的 `REALM_DECORATION_MAP` 分開（湯煙谷、石殿遺址、拓荒原兩邊都有），`createRealmDecoration` 把兩邊的結果組在一起。參數多了 `lightSourceList`（世界層已經掃過，白矇雪原的光柱直接用）。
- 除錯開關 `realmSignature`（F4 面板的「場景招牌景象」）。

新增一個景象：在場景資料夾寫一個 `create…`（呼叫 `createSignatureLayer`），到 `REALM_SIGNATURE_MAP` 加一行，測試的 `CASE_LIST` 加一筆。

### 踩過的坑與刻意的取捨

- **日夜條件自己算，不讀星空材質**：極光是讀 `getStarFieldMaterial` 的自發光。那一支在 `use-babylon-scene.ts`，引用它等於把整個渲染環境拉進測試。`updateSignatureFrame` 改照 `sampleDayNight` 的門檻由 `atmosphere.sunDirection.y` 算（星空 `smoothRange(-h, 0.02, 0.24)`、太陽 `smoothRange(h, -0.05, 0.06)`），再乘 `skyBodyFade`。日夜循環的門檻改了，這裡要跟著改。
- **分不出日出與日落**：`AtmosphereState` 沒有時刻，只有太陽方向。雁行與椋鳥因此晨昏都出現。要只在黃昏出現，得把 `timeOfDay` 加進 `AtmosphereState`。
- **月亮永遠在太陽正對面**（`moonPosition = -sunPosition`），月光路與月暈直接取反，不去找月亮的網格。
- **日出方位每天挪九度**：跟著日月的景象每天方位不同。溪谷彩虹要太陽在東邊才鮮明，約四分之一的日子整天都不夠東，那幾天只有兩成半的亮度。
- **世界座標上的發光體畫在天氣層**：預設層裡半透明的水面是後畫的，會把水面上方的相加混合蓋掉。天氣層不清深度，地形照樣擋。
- **雲裡的光也畫在天氣層**：聽雨林的陰天罩永遠蓋著，閃電留在預設層會整片被吃掉。
- **`flat`、`active`、`sample`、`input`、`output` 是 GLSL ES 3.00 的保留字**，不能當變數名。光柱的水平距離叫 `planar`，流星的開關叫 `isVisible`。
- **梯形不要靠內插的 UV**：月光路近窄遠寬，兩個三角形內插出來的座標會沿對角線折一下。片段改由世界座標反推自己在路上的位置。
- **沿圓周取噪音要在圓上取樣**：`valueNoise(vec2(cos(a), sin(a)) * n)` 繞一圈接得起來；直接拿方位或 `atan` 的結果去取，會在接頭留一道縫（月暈的濃淡改用整數倍的正弦）。
- **面向鏡頭的方片在正頭頂會退化**：`cross(up, toEye)` 是零向量，`normalize` 出 NaN。天燈與狐火遇到這種情況給一個固定的右。
- **`Observable.remove` 是延後的**：Babylon 先標記 `_willBeUnregistered`，下一個 tick 才真的從陣列拿掉。測試數觀察者要濾掉標記過的。
- **透明材質不進深度圖**：這些材質都是 `needAlphaBlending`，`DepthRenderer` 預設只畫不透明與 alpha test 的網格，所以水面岸線與體積光的深度圖不受影響；陰影與水鏡用的是明列的清單，也不會畫到。

### 不開瀏覽器驗證著色器

Node 裡沒有 WebGL，但 glslang 有 wasm 版（`@webgpu/glslang`，裝在 scratchpad，不進專案）。它照 Vulkan 的規則編，所以先轉寫：

- `attribute T name;` 改成 `layout(location=N) in T name;`
- `varying T name;` 在頂點改成 `layout(location=N) out`，在片段改成 `in`
- 所有 `uniform T name;` 收進一個 `layout(set=0,binding=0) uniform Block { … };`
- `gl_FragColor` 換成自己宣告的 `layout(location=0) out vec4 fragColor;`
- 開頭加 `#version 310 es`（比 3.00 多一點功能，規則一樣嚴：沒有隱含的整數轉浮點、保留字照 ES 的算）

原始碼從 `Effect.ShadersStore` 拿：用 vitest 在 NullEngine 下把十六個景象各建一次，把 `minespace` 開頭的項目寫成 JSON，再用一支 node 腳本編。glslang 的 wasm 在 vitest 裡載入會卡住，所以分兩步。同一支腳本順便核對頂點與片段的 varying 一致、著色器裡的每個 uniform 與 attribute 都列在 `ShaderMaterial` 的選項裡（沒列的 uniform Babylon 不會去找位置，`setFloat` 寫了也沒用）。

這只證明語法、型別與介面對得上；Babylon 自己的 WebGL2 轉寫（`attribute`、`varying`、`gl_FragColor`）沒有驗到，顯示卡驅動的差異也沒有。

### 驗證

- `npx vitest run --project unit content/aquarium/minespace/domains/realm/realm-signature.test.ts`：十八項全過。
- glslang：三十二支全過，varying、uniform、attribute 核對零錯。
- eslint 與 vue-tsc。

### 沒有驗證的

- 所有視覺：形狀、大小、亮度、顏色、速度，全都沒有實際看過。亮度是照極光（峰值 0.62）與月亮（0.86，泛光門檻之下）的尺度定的，過了 ACES 之後的樣子預期要調。
- 方位：坐像與門闕是否真的夾住環月、積雨雲是否被體積雲或林稜蓋掉太多、彗星與銀河有沒有落在遠山後面。
- 貼水面的兩個（月光路抬高 0.04 格、藍眼淚 0.05 格）會不會與水面搶深度，藍眼淚的內緣是否真的被灘地擋住。
- 狐火的高度是 `FOREST_GROUND_Y + 2.3`，密林那一圈的地面若有起伏，可能埋進土裡或浮在空中。
- 天燈的起飛點是 `TERRACE_GROUND_Y + 2.5`，假設廣場在台地那一層。
- 彩虹的方片在瀑布落點下游四格，可能切到水幕或突出的岩。
- GPU 成本與真實 FPS，尤其湯煙谷與聽雨林那兩條繞一圈的帶子。
- 四級畫質下的數量、worker 算繪路徑（程式沒有碰 DOM，但沒有實際跑過）。

## Minespace：大場景細節強化，第一組（湖、海、林、秋、沼、村、窟、雪稜、溪谷）（2026-11）

地形、樹與主要造景蓋完之後再補一層細節：成叢的地被、碎石、倒木、疊石、被人忘在路邊的小物，每座場景另外加一到三處新的看點並登記進神遊的特色清單。原則照設計文件：每一樣都是那座箱庭本來就有的東西再多長一點，不引進箱庭沒有的大東西（雪稜與溪谷照樣沒有小屋）。

### 結構

- `domains/realm/realm-detail-kit.ts`：這一層共用的小工具。`createDetailContext` 從場景定義自動算禁區（門、出生點、神遊的站點與路徑點），`findDetailGround` 只認「整格實心、頂上是空的」地面（樹葉、半磚、薄層都不算），`scatterDetailCluster` 用低頻噪音成叢地撒，另有倒木、疊石、大石、長椅、路標、柴堆幾種零件。`replaceableSet` 給地面本來就鋪滿的場景用（金葉林）：列進去的地被當成空的，細節是「換」不是「加」。
- 每座場景一支 `<id>/<id>-detail.ts`，在 `<id>-terrain.ts` 掛一到兩個呼叫：造景零件排在撒花草之前（位置才是空的），地被排在花草之後。
- 新看點的座標寫在 `<id>-layout.ts`，不寫在 detail 檔：特色清單要讀，而 detail 檔引用場景定義，特色清單再引用它會繞成一圈（`<id>-realm` → 特色清單 → detail → `<id>-realm`，載入時直接是 TDZ 錯誤，整個地形 worker 跟著掛）。

### 新方塊

都加在 `BlockId` 最後，全是既有外型換貼圖，沒有新增圖檔、沒有會發光的。新的貼圖 key（`pebbles`、`fishingNet`、`cattail`、`twigs`、`icicle`、`toolHoe`、`toolAxe`、`toolPickaxe`）只寫在迷你像素那一份對照表；其他材質包沒有對應，`resolveTexture` 會退回迷你像素那一張（八格見方的小圖出現在高解析度的材質包裡，刻意接受）。

| 方塊 | 外型 | 貼圖 |
| --- | --- | --- |
| `PEBBLES` 碎石、`SEASHELLS` 貝殼 | flat | `pebbles`（`default_mineral_tin`，礦點那張只有幾顆點的圖），貝殼另外染成米白 |
| `GROUND_IVY` 地錦 | flat | 既有的 `ivy` 躺平 |
| `FISHING_NET` 漁網 | flat | `fishingNet`（`xdecor_chainlink`）染成麻繩色 |
| `LOTUS` 蓮 | flat、浮在水面 | 既有的 `lilyPad` 以目標色染成粉紅 |
| `MOSS_CARPET` 苔毯 | layer（十六分之一格） | 既有的 `grassTop`，比草地暗、黃一點 |
| `CATTAIL` 香蒲、`TWIGS` 枯枝 | cross | `cattail`（`moreplants_eyeweed`）、`twigs`（`default_bush_stem`） |
| `ICICLE` 冰柱、`STALACTITE` 鐘乳石尖 | cross、不擺動 | `icicle`（`xdecor_curtain_open`，上寬下窄垂下來的那張），各染成冰藍與岩灰 |
| `SMALL_ROCK` 小石、`BASKET` 竹簍 | pot（不帶植物的花盆，四成大的小方塊） | 既有的 `cobblestone`、`hay` |
| `TOOL_HOE`、`TOOL_AXE`、`TOOL_PICKAXE` | flat | 道具圖示 `farming_tool_woodhoe`、`default_tool_steelaxe`、`default_tool_stonepick` |

### 各場景加了什麼

- **湖中島**：池畔一張朝東的長椅與竹簍、東岸一條半磚短棧繫著小舟（棧根有竹簍與漁網）、西南淺灘三顆出水的石（一高一中一低）、南灘一座疊石與漂流木；沙灘貼水的那一圈成段換成礫石，岸邊香蒲、睡蓮叢裡換幾朵蓮，草地上成片的白花與地錦，沙上的碎石與枯枝，立石腳邊一圈碎石。
- **海中沙島**：西北外海一座出水的礁岩（頂上有一格潮池）、西南灘上晾網的矮籬與漁具、沙丘腳下一圈熄了的營火（燒黑的木頭，不發光）、小舟旁的沙堡；灘上成片的貝殼、潮池底的珊瑚骨、貼海的碎石與枯枝、沙丘上的濱藤（地錦）與丘頂的乾草叢。
- **林海**：小徑西邊一窪苔石圍著的林間泉（從小徑有飛石引過去）、東邊林子深處的苔巖，兩處都加進 `isOpenGround` 不種樹；神社老橡樹前的供石與長椅、落腳空地的柴堆與路標；倒木頂上的苔與菇、林下的樹頭與苔石、成段缺角長苔的老石板、路邊的碎石、橡樹枝下垂的藤、地錦與幾片堇。葉子淨減一百五十格（兩處小空地）。
- **金葉林**：落葉裡踩出來的一線土徑（回程門 → 耙沙南緣 → 鳥居，另一條岔往石碑）、耙沙旁的落葉堆與耙子（三格葉子方塊，全場唯一多出來的）、東北的刻紋石碑與供花、北緣的見晴長椅；倒木、半埋的石、樹腳的菇、枯枝與幾片地錦。地面本來就鋪滿，全部是換掉落葉，方塊總數反而略減。種樹之前什麼都不動：特色清單指著兩棵特定的白楊，樹的亂數序一變就指空了。
- **千蛙沼**：東北大泥灘上捕蛙人的草寮（四根木樁、一片木頂，不放燈）、南側平台外的小舟；泥灘中間成片換成草、貼水處成段換成濕黏土（只換頂面）、水邊香蒲、睡蓮叢裡的蓮、泥上的倒木與苔石、枯木腳邊的紅菇。
- **鐘聲村**：村西田裡的草垛場與稻草人（另外三塊田各一個）、南丘的見晴長椅與疊石、屋旁的柴堆、水道邊的木桶與睡蓮、南北出村的路標；外圍丘陵上的大石、疊石與成片的野花、灌叢。村子裡面本來就滿，沒有動。
- **地底洞窟**：大廳東北燈籠下的礦工舊營地（鋪蓋、木箱木桶、工作檯、一圈熄了的火、鎬）、湖邊浮著的舊舟、湖心三四顆出水的岩；原本的圓石鐘乳石底下接一截尖的、洞頂零星的小鐘乳石（都留三格淨空）、湖邊的苔與褐菇、地上的碎石堆、礦脈底下的鎬（最多四把）。
- **雪稜**：冰柱岩門（兩根岩柱頂一道橫岩，橫岩底下垂冰柱，門洞淨寬二、淨高三）、西南融雪池冰面上的釣洞、稜線上六座疊石、雪原上十來顆積雪的大石、矮松枝下的冰柱、從雪裡露出來的枯枝、露岩上的碎石。補了薄雪的格柱頂上不是空的，細節會自己跳過。
- **溪谷**：橫在溪上的倒木（跌水上游，挑溪最接近東西向的那一排）、靜水池邊的釣點、跌水北岸三座疊石、溪心九顆出水的石；礫石灘的碎石與漂流木、草地上的橡樹倒木、水邊香蒲、靜水處的蓮、谷壁腳下岩階上的苔與蕨、橡樹枝下的藤、成片的白花與地錦。

### 踩過的坑

- **從高處往下找地面會找到樹冠與屋頂。** 樹葉是整格的方塊，只是貼圖鏤空。`findDetailGround` 把 `cutout` 的方塊排除，各場景再把起找的高度壓到樹冠底下（林海是地面上兩格、溪谷與洞窟是三格）；鐘聲村的屋頂沒辦法這樣避，改成每一樣都限定腳下是草。
- **半磚上不能放東西。** 半磚佔格子的下半格，上面那一格的東西從格底開始畫，會浮在半空半格。短棧、平台上都沒有擺小物，改擺在棧根的沙與泥上。
- **倒木只檢查第一格的地面是不夠的。** 金葉林的倒木一度躺到耙沙上。`placeFallenLog` 加了 `groundSet`，整段底下都要是指定的地面。
- **神遊沿溪取的路徑點不能被蓋住。** 溪谷的倒木第一版正好壓在路徑點上，特色檢查直接報「埋在方塊裡」。現在挑的那一段避開每十二格一個的取樣點。
- **木頭只能順著軸躺。** 溪在某些地方彎成南北向，固定順著 Z 軸的倒木會變成沿岸躺而不是跨過去，所以用 `measureStreamZ` 的斜率挑最接近東西向的那一排。
- **泥灘的草要排在花草之後換。** 千蛙沼的花草只認泥（DIRT），先把頂面換成草就長不出來了。

### 驗證（不開瀏覽器）

- 九座場景在 Node（vite-node）裡各生一次：沒有錯誤，出生點不變，走得到的格數變化在百分之一點幾以內（多半是倒木與大石佔掉的那幾格）。
- 特色檢查（`check-features.ts`）零錯誤；警告與改動前逐條相同（另開一份乾淨的工作樹跑過同一支腳本比對）。
- 神遊模擬（`test-drift.ts`，每座三百秒）：路徑零失敗、眼睛不進方塊、不出邊界、飛行不穿方塊。
- 看得到的方塊數（不含被包住的）：湖 +0.05%、海 +0.02%、林 +0.3%、秋 −0.07%、沼 +0.1%、村 +2.1%、窟 +5.0%、雪稜 +1.2%、溪谷 +0.5%。真正的葉子方塊只有金葉林多三格、林海少一百五十格；會點成真光的方塊一顆都沒有多。
- eslint、vue-tsc（minespace 只有原本的 86 個 TS4114）。

### 沒有驗證的

- 所有外觀都沒有實際看過：新方塊的顏色（貝殼的米白、蓮的粉紅、冰柱的藍白、苔毯與草地的差別）、道具圖示貼在地上的大小是否突兀、小方塊（小石、竹簍）在各材質包下的樣子。
- 新的貼圖 key 在其他材質包退回迷你像素那一張，高解析度的材質包裡會是一小塊低解析度的圖。
- 小舟「船底換成木板、船身浮在水面上一格」的做法（湖、沼、窟）從岸上看是否自然。
- 千蛙沼貼水處的濕黏土在迷你像素裡偏淺灰，可能太亮。
- 草寮、岩門、草垛、營地這幾座的比例，以及它們在神遊鏡頭裡的構圖。

## Minespace：大場景細節強化，第二組（麥浪、風露原、拓荒原、遺址、湯煙谷、林苑、蟬林、聽雨林、雪原）（2026-11）

與第一組同一輪、不同人做的另外九座。做法相同（地形蓋完再補一層，每座加幾處新看點並登記進神遊），共用零件各寫各的，沒有互相引用。

### 結構

- `domains/realm/realm-prop-kit.ts`：這九座共用的小工具。`isFreeGround`／`isFreeArea` 問「腳下是指定的地面、這一格只有花草」，`putProp` 先清掉那一株花草（連疊兩格的上半截）再擺，`findFreeSite` 從目標點一圈一圈往外找整片同高的空地（各場景自己記的 `groundTopMap`），另有 `placeCairn`、`placePostWithTop`。
- 每座一支 `<id>/<id>-details.ts`，在 `<id>-terrain.ts` 只掛一個呼叫，排在花草之後、傳送門之前（雪原排在蓋雪之前）。全部用自己的亂數種子（`<id>-detail`），不動原本那幾條序列，既有造景與掃出來的特色座標都不變。
- 新看點的座標寫在 `<id>-layout.ts` 最後一段「細節小景的定點」；特色清單另開一支 `<id>/<id>-detail-features.ts`（只引用 layout），在 `<id>-drift-features.ts` 展開進清單。用 `findFreeSite` 找到的位置（水塔、觀鳥小屋、避難小屋、雪橇）量完之後把常數改寫成實際那一格，之後半徑零就命中。

### 新方塊

加在 `BlockId` 最後，全部用既有的貼圖 key 加 `tint`，每一套材質包都解析得到，不發光。用 `tint` 不用 `pixelTint`：材質包可以把某張圖的 `pixelTint` 設成 null（`paperDoor` 在原版就是），那樣染色會整個消失。

| 方塊 | 外型 | 貼圖 |
| --- | --- | --- |
| `SULPHUR_CRUST` 硫磺華薄殼 | layer（八分之一格） | `sandstone` × (1, 0.9, 0.36) |
| `SULPHUR_LUMP` 硫磺塊 | pot（小方塊，穿得過去） | `sandstone` × (1, 0.86, 0.24) |
| `MOSAIC_TILE` 褪色馬賽克 | cube | `stoneTile` × (0.92, 0.6, 0.44) |
| `PARASOL` 野點傘的傘面 | slab | `woolWhite` × (0.86, 0.2, 0.16) |

另外用了第一組的 `PEBBLES`、`SMALL_ROCK`、`MOSS_CARPET`、`GROUND_IVY`、`TWIGS`、`CATTAIL`、`LOTUS`、`ICICLE`、`BASKET`、`TOOL_HOE`／`TOOL_AXE`／`TOOL_PICKAXE`。

### 各場景加了什麼

- **千頃麥浪**：兩塊收割完的田（東南與西北：麥子拿掉，留兩成麥茬與一排排立著的禾束，各堆兩三座草垛）、東南田邊的板車、西南的蓄水池（圓石岸、木閘、往東一道水渠）、十字路口東北角的田頭小祠、西路北側看田的小寮、北路東側一棵烏鴉歇腳的枯樹；碎石路邊一成踩成土、路邊第一格散碎石。麥子淨減近七百株。第一版兩塊收割田都貼著回程門那條路，一落地兩側全是麥茬，所以北邊那塊換到西北。
- **風露原**：東邊丘腳一道塌了幾處的乾砌石牆（每十一格一個缺口，兩成塌成半磚）、月見草原上的石環（八塊立石、圈心平石、圈內苔與碎石）、石牆背風處的野餐草蓆、小徑北側一段舊牧欄、小徑中心線踩出來的土、七片蒲公英（把原本的草換成同一種花，一片一色）、枯木樁與圓石堆旁邊的倒木、枯枝、小石與苔。全是換或佔掉原本的草，株數略減。
- **拓荒原**：沿車轍路北側五根電報線桿、篷車圈東南的水塔（四根木腿、木桶箍的水櫃）、乾河床南岸淘金人的營地（小帳、洗礦槽、鍋與鎬，河床裡最後一窪水）、路邊被丟下的行李與牛骨、每輛篷車圈外側的水桶與補給、圈裡的擱板桌、木屋邊的劈柴墩、田邊的種子簍、小丘上多兩座墳；三座高的岩丘在第五格夾一道白砂岩、丘腳四格內散落紅岩與碎石、紅土上六副牛骨。
- **石殿遺址**：石碑外一圈殘存的馬賽克（陶紅夾月白，噪音挖掉四成）與石室門前的方毯、門前一立一倒兩尊石像與一對冷火盆、殿裡斷柱旁的柱頭、牆根的地錦與藤、殿基外緣的碎磚、長廊南端長草的石階；東牆在石碑正東塌開三格，石階往東經幾塊殘存的鋪石通到殿外的蓄水池（九格見方、斷緣、睡蓮與蓮、池裡一截倒柱）。**遠景的飛鳥改成像素風**：見下。
- **湯煙谷**：熱泉外四格半、泥池外兩格、噴氣孔四周的硫磺華薄殼與硫磺塊；每池熱泉朝中軸那一側一塊告示木牌與兩根界樁；鳥居前的溫泉蛋小攤（朱紅野點傘、蒸鍋、蛋簍）、西邊大熱泉旁有頂的足湯、東邊木棧南側的賽之河原（十六堆積石與一尊戴笠的石地藏）。場景重做成火口之後這些都搬到南邊的台地上，座標見 `jigoku-layout.ts`。
- **百囀林苑**：串起四口飲水盤的飛石小徑（主線加兩條岔路）、五座餵鳥台、南緣的觀鳥小屋（朝北一道觀察縫、窗台上一本攤開的筆記）、九個綁在樹幹上的巢箱、飲水盤邊的卵石與棲木、倒木與樹樁；每根樹幹腳下一圈把花換成灌叢，花不再整片均勻。
- **蟬雨深林**：緣廊上的書、竹簍與風鈴，廊前的沓脫石、手水缽（竹筧）與木桶，廊後的竹籬；四串從土徑岔出去的飛石；東邊空地的林間小祠與小鳥居、西邊空地的古井（水在井欄那一層）；十二塊苔石、四截倒木、樹腳四成長苔。
- **聽雨林**：每座亭子簷角一條雨鏈落進石缽、兩座亭邊撐開晾著的傘、橫過林心水窪的木板橋、東北水窪邊的野點傘茶席、把亭子串起來的飛石；水邊三成換石緣、兩成卵石、幾叢香蒲，水面睡蓮與蓮（落腳那一池整面是鏡子，不放）；苔石兩格內一半長苔、樹腳兩成，三截倒木。
- **白矇雪原**：東南的避難小屋（屋裡一盞提燈，全場只多這一盞真光）、從雪原正中排過去的四堆疊石路標、木樁路東邊半埋的雪橇、西南一道只剩幾段露出雪面的柵欄、西北結冰的池與伸到冰上的木棧、另外五塊冰殼。`ICE`／`PACKED_ICE` 加進不蓋雪的名單，否則蓋雪那一輪會把冰面整片蓋回去。

### 遺址的飛鳥改成像素風（`ruins-colossi.ts`）

使用者：「遺跡空中的飛鳥目前看起來是三角形，也要走像素風格才對」。原本每隻鳥是四個頂點拼的 V，翼尖在著色器裡上下拉。改成每隻一片永遠正對鏡頭的方片（頂點著色器用 `view` 矩陣取鏡頭的右與上），貼一張二十一乘五的 `DynamicTexture`（三格動畫各七乘五：上舉、攤平、下壓），`NEAREST` 取樣、片段著色器 alpha 低於 0.5 直接丟。拍翅是換格：八拍一輪（2.8 秒），第五拍上舉、第七拍下壓，其餘攤平滑翔。一格像素等於世界一格，鳥在兩三百格外，換到螢幕上一格像素約四五個螢幕像素。仍是一個網格一次繪製，照舊往霧色混；貼圖 `update(false)` 不上下翻轉（同 `ambient-shape.ts`），收尾時連貼圖一起釋放。亂數序列照舊多抽三次，每隻鳥的圈與速度不變。

### 踩過的坑

- **水要比布景地面平面高。** 麥浪、風露原、蟬林、雪原的 `backdrop.floor` 就鋪在最低那層地的頂面，水落在那一層會整片被蓋住（聽雨林踩過）。麥浪的蓄水池挑在地面高一階的地方、蟬林的井把水放在井欄那一層；雪原做不出冰洞，冰面只換方塊不放水。
- **半空的半磚要架在三格高的柱上。** 傘面、鳥居的橫木、足湯與小寮的頂都是半磚（佔那一格的下半）。柱子兩格的話底面離地一格半，人（一格八）走得過去卻幾乎擦到頭，神遊的走路檢查（`wallHit@head`）也會算成撞頭。全部改成三格；石像的手臂與水塔半腰的橫撐同理，拿掉或往上貼著平台。
- **`findFreeSite` 會避開看不到的東西。** 路邊的草束、枯木樁、石頭都是亂數撒的；麥浪的池岸上剛好有一捆草束，池子整座沒蓋出來。定點的東西先蓋、亂數的後蓋，或在蓋之前把擋路的那一樣挪開。
- **地圖上的高度要扣掉花草。** 俯視圖印「最上面那個方塊」的高度時，花草會讓平地看起來高一格；風露原的野餐草蓆因此挑了兩次位置。印地面高度要跳過穿得過去的方塊。
- **特色清單的中心不能六面被包住。** 水塔水櫃正中那一顆木桶六面都是木桶，檢查報「整個埋在實心裡」，改指東側那一排。

### 驗證（不開瀏覽器）

- 九座在 Node（vite-node）各生一次無錯誤；出生點與高度不變，回程門、木牌四周的方塊逐格相同（只有麥浪門南側那一排麥子變成麥茬，是收割田）。
- 特色檢查零錯誤。警告多了「特色數量超過十二」（招牌景象那一輪各加一筆，這一輪再加一到三筆），其餘與改動前相同。
- 神遊模擬每座三百秒：路徑零失敗、眼睛不進方塊、不出邊界、飛行不穿方塊。
- 看得到的方塊（露出來的實心方塊加裝飾）：麥浪 −0.9%、風露原 0%、拓荒原 +0.6%、遺址 +0.6%、湯煙谷 +4.2%、林苑 +0.3%、蟬林 +1.6%、聽雨林 +2.9%、雪原 +0.8%。樹葉只有林苑少十一格（觀鳥小屋的頂蓋掉的），真光只有雪原 23 → 24。
- eslint、vue-tsc（minespace 只有原本的 86 個 TS4114）。

### 沒有驗證的

- 所有外觀都沒有實際看過：四個新方塊的顏色（硫磺的黃、馬賽克的陶紅、傘的朱紅在各材質包下的樣子）、`pot` 外型的硫磺塊大小。
- 像素飛鳥的著色器只確認模組載得起來與圖樣等寬，沒有在瀏覽器裡編譯過；方片大小、拍翅節奏、霧裡的對比都要看。
- 各小景的比例與神遊鏡頭裡的構圖（水塔、觀鳥小屋、足湯、茶席、避難小屋）；收割田與麥浪並排的觀感；聽雨林的苔是否太多。
- 效能沒有量（方塊數的變化都在百分之五以內，聽雨林與湯煙谷多的是貼地的薄層）。

## Minespace：湯煙谷改成火口與熔岩湖（2026-11）

使用者：「湯煙谷我想換成更壯觀的岩漿場景」。第一版（八十格長的熔岩縫、一圈木棧）整座重做，設計見[設計文件](plans/2026-11-27-minespace-realms-design.md)的「湯煙谷」。資料夾 `domains/realm/jigoku/`：`layout`、`terrain`、`details`、`realm`、`sounds`、`drift-features`、`detail-features`、`sky-glow`（招牌景象）之外，渲染端多四支：`jigoku-lava-surface`（湖面）、`jigoku-lava-falls`（熔岩瀑的流幕、落潭、熔岩花）、`jigoku-far-cone`（遠火山）、`jigoku-ash-pall`（煙幕），都由 `jigoku-steam.ts` 的 `createJigokuSteam` 一起建、一起拆，`realm-decoration.ts` 沒動。

**版面**（北是 −Z，座標是 x, z）

```
                       遠火山（布景，北偏東 11 度、離中心 232 格、高 96 格）
      ┌──────────── 稜線 y 34～37，外面是 LAKE_BED ─────────────┐
      │            主瀑 (140, 54) 寬 13 高 27                    │
      │ 西瀑 (61, 88)                    玄武岩柱群 (197, 86) …  │
      │   ╲熔岩河╲黑岩原         湖心島 (140, 92)                │
      │      ╲      ╲          大鳥居 (140, 114)，立在熔岩裡     │
      │  ～～～ 熔岩湖 y 3 ～～～ 祠台 (140, 125) ～～～～～～～  │
      │ 西展望台          　　    ║ 參道 z 133～149     東展望台 │
      │ (60, 116)                 ║ 石階 z 150～167    (220, 116)│
      │   ＼木棧            到著台 (140, 168～180)       木棧／  │
      │     ＼＿＿＿＿＿＿＿＿＿＿＿／＼＿＿＿＿＿＿＿＿＿＿／    │
      │   熱泉、泥池、噴氣孔、足湯、蛋攤、賽之河原、硫磺階地     │
      │                  鳥居 (140, 189)                         │
      │                  回程門 (140, 198)，出生點 (140, 195)    │
      └──────────────────────────────────────────────────────────┘
```

| 常數 | 值 |
| --- | --- |
| `LAKE_Y`／`TERRACE_Y`／`RIM_Y` | 3／13／34（稜線鋸齒到 37） |
| `CRATER_RADIUS_X`／`Z`、`LAKE_CENTER`、`LAKE_RADIUS_X`／`Z`、`ARM_END_Z` | 100／86、(140, 110)、66／58、114 |
| `OVERLOOK_EDGE_Z`、`STAIR_LENGTH`、`CAUSEWAY_START_Z`／`END_Z`、`SHRINE_PLATFORM`、`LAVA_TORII` | 168、18、149／133、(140, 125) 半寬 7、(140, 114) |
| `MAIN_FALL`／`WEST_FALL` | (140, 54) 半寬 6 頂 30／(61, 88) 半寬 3 頂 24 |
| `JIGOKU_PORTAL_POINT`、邊界 | (140, 198)、108／116 |

**數字**（Node 端，`scratchpad/realms/jigoku/map.ts`）

- 光源清單 15 顆（`collectLightSourceList`，光暈、全局光的種子與環境粒子的錨點用它）：`LAVA` 8、石燈籠 4（祠台一對、到著台石階口一對）、回程門 3。第一版是 59。
- 真光 16 盞（`collectPointLightList`）：燈籠與門燈 7，整片熔岩併成的面光源 9（場景定義的 `areaLightLimit`，預設十二盞的話是 19）。
- 看得見的方塊約 5.4 萬（第一版 11.6 萬）：熔岩 1.0 萬、玄武岩 2.2 萬；樹葉零。地形生成 0.25～0.33 秒。
- 從出生點走得到的站立面約 1.29 萬格，其中與熔岩相鄰的是零；到著台、石階、參道、祠台、東西展望台、足湯、蛋攤、賽之河原都走得到。
- 從熔岩湖底出發（跳一格、柵欄當一格高的障礙）走得回出生點：三個起點都過。
- 神遊（`drift/test-drift.ts`，`REALMS=jigoku`）：走路規劃失敗 0、飛行 5／5、鏡頭進方塊 0、最高 27.9（稜線 34）。高度上限與低飛機率寫在場景定義的 `driftFlight`（優先於 `drift-flight-config.ts` 那張表，表裡湯煙谷那一行已經用不到）。
- 型別檢查（`vue-tsc -p .nuxt/tsconfig.app.json`）：Minespace 只有既有的 86 個 TS4114。

**共用檔案的改動**：`block-constants.ts`（三種新方塊、`isLavaBlock` 多認 `LAVA_FIELD`）、`realm-ambient-table.ts`（湯煙谷那一份：火星與暑氣錨在熔岩熱點上，四層）。其餘都在 `domains/realm/jigoku/`。

**看過的畫面**（高畫質、迷你像素材質包，白天 0.45 與入夜 0.92）：出生點、到著台、祠台、東西展望台、石階、湖面高度、空拍。沒看過的：其他材質包與畫質、黃昏與清晨、雨天、神遊的實際運鏡、聲音。

**三種新方塊**（`block-constants.ts`，加在 enum 最後）

- `LAVA_FIELD`：與 `LAVA` 同貼圖、同物理，`lightLevel` 0.45。`light-source.ts` 用 `lightLevel ?? emissive` 判斷進不進光源清單（門檻 0.5），所以它不進；烘進方塊的暖光是七級（`LAVA` 十五級）。`isLavaBlock` 把它算進去（沉浮、燒紅的視野、神遊不走、全局光的反照率都跟著）。
- `BASALT`：`stone` 貼圖乘 `[0.3, 0.29, 0.32]`。
- `MAGMA_ROCK`：`ember` 貼圖乘暗紅、自發光 0.45（低於門檻，不點燈）。餘燼每一格都是一盞燈，撒不了一整片；地上要一片發紅的裂縫就用這個。

**光源的設計**

- 兩份清單分開看。光源清單（四格見方一顆）：熔岩湖全是不進清單的 `LAVA_FIELD`，否則一萬格的湖是六七百顆光暈與全局光種子；`LAVA_LIGHT_POINT_LIST` 列的八個點各換一格真的 `LAVA`（找最近一格露著的熔岩），那裡才有光暈、火星與暑氣。真的 `LAVA` 嵌在 `LAVA_FIELD` 裡沒有接縫：兩種都是液體（面互相剔除），烘進去的光從那一格往外漸層，看起來是一個熱點。
- 真光：效能那一輪在 `light-source.ts` 加了 `collectPointLightList`，所有露在外面的熔岩（`isLavaBlock`，兩種都算）併成幾盞大的面光源。湯煙谷把 `areaLightLimit` 設成 9：一百三十格寬的湖上九盞、每盞照三十六格，到著台、參道、祠台與西展望台都在兩盞以上的範圍裡，東展望台只在邊上。
- 環境粒子的火星與暑氣錨在 `fire`（來自真光清單），所以只在那八格附近有；整片湖面的熔岩花是 `jigoku-lava-falls` 自己的一組粒子。

**渲染端**

- 湖面（`jigoku-lava-surface`）：熔岩方塊的貼圖鋪成上萬格是一整片均勻的亮黃（第一輪截圖就是這樣），所以在熔岩面上 0.06 格蓋一張不透明的面：細胞雜訊切出一片片涼掉的黑殼、殼與殼之間是發亮的縫，整片往南慢慢漂；越熱縫越寬（瀑布落潭、熔岩河、幾處熱點）。「哪一格是熔岩、離岸多遠、多熱」掃方塊資料存成 280 見方的 RGBA 貼圖（最近點取樣）。一個長方形、一次繪製、寫深度。
- 熔岩瀑（`jigoku-lava-falls`）：引擎沒有流動的熔岩方塊，瀑身是一疊 `LAVA_FIELD`；外面貼一層流幕（照 `river/waterfall-curtain`，速度是水的六分之一、取樣切成八分之一格）。流幕的位置掃方塊資料：高過湖面的熔岩格、側面朝空氣的就貼，同一格柱上下併成一片。
- 遠火山（`jigoku-far-cone`）：照 `ruins-colossi` 的做法，布景那一層、自己往霧色混、`veilRatio` 收。噴發的火星與煙拼在同一個網格、用預乘透明度（`ALPHA_PREMULTIPLIED`）一次畫：火星輸出透明度零（只加亮），煙輸出自己的透明度。
- 煙幕（`jigoku-ash-pall`）：氣氛設定只調得到雲量與層雲，天還是藍的；陰天罩只跟著雨雪走。所以自己掛一層灰褐的帶子從地平線蓋到天頂。掛在九百格（火映那一殼是兩百格）：掛近了會蓋掉火山稜與遠火山，掛到它們後面，布景先畫、寫了深度，煙幕只落在真正是天的地方。借 `createSignatureLayer`，但不算招牌景象（`realm-signature.test` 規定一個招牌景象一個網格），所以掛在 `REALM_DECORATION_MAP` 那一邊。

**踩坑**

- `LAVA_FIELD` 的自發光一開始推到 2.3（想補回少掉的方塊光），整片湖洗成亮黃；改回與 `LAVA` 相同的 1.7。
- 黑曜石磚嵌在天然的崖壁上像一塊塊紫色補丁，岩壁只留玄武岩、圓石與石。
- 石階兩側的岩墩與碎石坡在分區上算「岩壁」不算「湖」，到著台的柵欄只看「旁邊是不是湖」的話，石階口兩側會各漏一格、直接通到碎石坡上；改成旁邊不是台地就圍。
- `scratchpad/realms/drift-features/check-features.ts` 的「站點走不到」警告原本每座場景每個站點都會報：`ReachedSet.has` 現在吃站立面物件，腳本還在傳數字鍵。已改成逐層取站立面去問。
- 枯木要避開細節小景：小景排在枯木之後才蓋、只看自己那幾格空不空，枯木種在蛋攤旁邊一格，岔出去的枝插進野點傘裡（神遊的檢查腳本報「走路時身體擦到方塊」才發現）。
- `floor/check-floor.ts` 也過期（還在讀已經拿掉的 `coversHiddenOnly`）：布景地面現在一律只鋪在 `LAKE_BED` 格柱上，湯煙谷的 `LAKE_BED` 只在稜線外。

## Minespace：音景加厚（引擎、擺位、四十五個新音檔）（2026-11）

使用者：「研究每個大景的聲音，讓聲音更豐富、更細緻；可以上網下載新聲音」。**做這一輪的人聽不到聲音**，所有判斷都是量出來、算出來的；好不好聽要實際去聽。設計原則的放寬寫在[設計文件](plans/2026-11-27-minespace-realms-design.md)。

### 引擎多了什麼

| 能力 | 怎麼用 | 在哪 |
| --- | --- | --- |
| 每次播放的音高、音量變化 | 音源的 `variation`：`pitchOffsetCent`（固定偏移）、`pitchRangeCent`、`volumeDropRatio`。不寫就用預設：間歇音每次 ±60 音分、音量掉最多兩成半；循環音每一顆照 id 固定差 ±35 音分。大廳的音源也吃這組預設 | `soundscape/sound-shaping.ts` 的 `pickPlayVariation` |
| 晨昏時段 | `activeAt` 多了 `'dawn'`（天沒亮就起頭、太陽爬高才散）、`'dusk'`（太陽還掛著就起頭、天黑透後一陣子才退）、`'twilight'`（太陽貼著地平線，早晚各一次，與雁行、椋鳥群同一組門檻） | `measureTimeGate` |
| 音量跟著雨雪強弱 | `weatherGain: { source, levelRange, floor }`，把場景的雨勢範圍攤開成 `floor`～1。`floor: 0` 就是「雨夠大才出現的一層」 | `measureWeatherGain`；雨勢經 `frame-status` 的 `rainRatio`／`snowRatio` 送到主執行緒 |
| 聲音越過崖緣 | `canCarryOverEdge: true`：直線被擋時多試一條折線（垂直升到高的那一頭的高度、再水平過去），打五成五 | `soundscape/sound-occlusion.ts` |
| 神遊的耳朵 | 神遊升空時聽者的高度不照鏡頭，改成吊在下面：超出「人站在正下方地面的耳朵」的部分只留三成、最多六格 | `measureDriftListenerY`、`use-soundscape.ts` |
| 有位置的觸發 | `trigger(id, { volume, position })`；渲染端任何地方呼叫 `requestSoundTrigger({ id, volume, position })`。要響的音源照舊種在場景清單裡（`mode: 'trigger'`） | `soundscape/sound-trigger.ts`、`protocol.ts` 的 `RenderSoundMessage.position` |
| 補底的音源 | `isFiller: true`：神遊挑停留點、決定往哪裡看時略過 | `drift/drift-point.ts` 的 `listEmitterDefinition` |
| 聲部讀數（開發模式） | 主控台每二十秒一行 `[Soundscape] 聲部（場景）：此刻載入 N、出聲 M；進場景以來最多⋯`，有變才印 | `use-soundscape.ts` 的 `reportVoiceStat` |

### 踩過的坑

- **Babylon 9.20 的音高是 `sound.pitch`（音分），不是只有 `playbackRate`。** 它接在 `AudioBufferSourceNode.detune` 上，下一個播放實例建立時讀這個值（`webAudioStaticSound.js` 的 `_initSourceNode`）。每次播放的音量走 `sound.play({ volume })`，那是實例自己的增益節點，不會蓋掉音源那一條（遮蔽與日夜的淡入淡出用的 `setVolume`）。兩者都是公開 API。
- **拿 id 湊雜湊要攪過。** 原本的相位雜湊是「乘三十一加字元碼、取餘數」，id 只差結尾編號的音源（`blackbird-0`、`blackbird-1`）算出來只差零點一度：大場景一排七隻鳥各繞各的錨點，卻是同一個節拍在動。測試寫「四十顆要有三十種以上的值」才抓到，新舊都改用 FNV-1a 再攪一輪（`measureIdUnit`）。
- **自動貼地會把屋頂、塔頂、橫樑、船板當成地面。** `getWaterlineY` 只穿過樹葉。聽雨林亭頂的雨（擺到亭頂上面四格，最響 0.05）、村落的鐘（塔頂上方八格）、遺址的鴞（樑上七八格）都是這樣錯的；凡是有頂的東西一律直接給 `y`，而且先用探針腳本看那一柱（下面有指令）。
- **音源落在實心方塊那一格裡不一定有事**（蟬掛在樹枝上，遮蔽取樣不含端點），但覆蓋腳本會列出「埋在方塊裡」，逐一看過比較安心。
- **折線遮蔽只給頭頂開闊的音源。** 洞窟、石室的音源標了，洞頂薄的地方會漏到地面上；測試有一條專門看這個。
- **`weatherGain` 低於範圍時停在 `floor`，不往零掉。** 雨勢讀數為零只會是資料還沒送到（剛進場景的頭一拍、渲染端是舊版），那時整片雨聲歸零反而是錯的。
- **同一座場景的 id 不能重複**：重複的那幾顆永遠不會載入（`activeMap` 以 id 為鍵），不會報錯。風露原新加的夜蟲撞到既有的 `meadow-downs-night-chorus-*`，是 `realm-emitter-map.test.ts` 抓到的。
- **晨昏的窗只有幾十秒到一兩分鐘**（預設流速下）。間歇音載入後六秒內會先響一次，所以窗一開就有聲音；但間隔若寫成三到八分鐘，一個窗裡就只有那一聲。雁群與椋鳥群的間隔因此收到一分鐘上下。
- **短循環（十到十六秒）鋪成一片會聽出週期。** 新音檔的循環都短，鋪成片的（大雨、拂曉合唱、夜雨蛙）每一顆的音高照 id 錯開（播放速度差幾個百分點，就不會齊步）；其餘只當定點的聲音用。
- **神遊的停留點是從音源標題推出來的**（同名取第一顆與離它最遠的一顆）。這一輪新增的音源全部標 `isFiller`，既有音源只改高度、音量、音檔，不動 x、z；`scratchpad/realms/sound/drift-stops.ts` 前後比對完全相同。

### 濾波與殘響（沒做）

Babylon 9.20 的 AudioV2 沒有濾波器與殘響（`node_modules/@babylonjs/core/AudioV2` 裡找不到 `BiquadFilterNode`／`ConvolverNode`）。公開 API 給得到的只有：`CreateAudioEngineAsync({ audioContext })`（用自己建的 AudioContext）、`createBusAsync`（音源的 `outBus` 可以指到自己的匯流排）、`createSoundSourceAsync(name, audioNode)`（把自己的節點包成音源）。缺的是「把匯流排的輸出接到自己的節點」：匯流排的輸出入節點是 `_inNode`／`_outNode`，底線開頭、型別檔標 internal。要做洞窟殘響得把洞裡的音源指到一條專用匯流排，再用 `bus._outNode` 接一顆 `ConvolverNode` 回主匯流排，升級 Babylon 可能就斷；遮蔽的低通更麻煩，每顆音源要各插一顆濾波器。等 Babylon 開出公開的效果鏈再做。

### 量測

`scratchpad/realms/sound/sound-coverage.ts`：Node 端生地形、照神遊的可行走格子找出走得到的地面，每兩格放一個耳朵，用引擎同一組算式（遮蔽、時段、線性衰減）算每顆音源的響度。「無聲」是一顆都不到 0.05。

```
GRID=1 OUT_FILE=<輸出.json> MAP_DIR=<資料夾> MAP_DAY=1 npx vite-node --root . <scratchpad>/realms/sound/sound-coverage.ts [場景 id…]
npx vite-node --root . <scratchpad>/realms/sound/probe.ts <場景 id> x,z [x,z…]     # 看某幾柱裡有什麼方塊
OUT_FILE=<輸出.txt> npx vite-node --root . <scratchpad>/realms/sound/drift-stops.ts   # 神遊從音源挑出的代表點
npx vite-node --root . <scratchpad>/realms/sound/budget.ts <改之前的 cov-all.json> <舊音檔清單>   # 每座場景要下載多少
```

走得到的地面裡無聲的比例（%），改之前 → 改之後：

| 場景 | 白天 | 夜裡 | 神遊巡航 白天 | 神遊巡航 夜裡 |
| --- | --- | --- | --- | --- |
| 湯煙谷 | 77.8 → 0 | 77.8 → 0 | 76.1 → 0 | 76.1 → 0 |
| 石殿遺址 | 50.9 → 0 | 50.1 → 0.4 | 50.5 → 0 | 49.1 → 0.4 |
| 村落 | 24.4 → 0 | 13.7 → 0.1 | 16.7 → 0 | 11.3 → 0 |
| 地底洞窟 | 19.2 → 0 | 19.2 → 0 | （只低飛） | |
| 拓荒原 | 12.0 → 0.4 | 3.2 → 0 | 12.1 → 0.4 | 3.0 → 0 |
| 溪谷 | 8.0 → 2.1 | 7.1 → 1.1 | 12.8 → 9.2 | 11.7 → 8.3 |
| 湖中島 | 4.4 → 0.5 | 20.3 → 0.7 | 5.3 → 0.5 | 31.7 → 0 |
| 百囀林苑 | 0 → 0 | 31.5 → 0 | 0 → 0 | 30.5 → 0 |
| 蟬雨深林 | 0 → 0 | 11.9 → 1.1 | 0 → 0 | 76.1 → 4.1 |
| 金葉林 | 1.9 → 0.6 | 1.4 → 0.6 | 35.6 → 0.6 | 34.3 → 0.5 |

其餘八座原本就在 1% 以下。溪谷神遊剩下的 9% 是谷壁頂上（離瀑布一百格、離溪二十幾格高）。數字只說明「有沒有聲音」：間歇音只要在範圍內就算聽得到，而它大部分時間是安靜的。

### 下載量

每座場景新音檔都在 300 KB 以內（`budget.ts`）。借用其他場景既有音檔的：村落 220 KB（風露原的風、烏鶇）、遺址 206、溪谷 138、拓荒原 70、金葉林 69、蟬林 70。借用只限「同一種東西」（風、蟲、同一種鳥），不拿別種動物的叫聲調音高去充另一種，也不把兩段錄音疊成一種沒錄到的聲音（第一版有熔岩瀑的「轟聲」與草原的「土撥鼠」，都拿掉了）。村落合計 1.2 MB 是最大的一座；音檔是走近才載，白天與夜裡的那幾顆不會同時載。

### 沒有驗證的

- **沒有人聽過。** 音高偏移的數字（熔岩瀑壓低三個半音、泥池調高、郊狼是狼調高三個多半音⋯⋯）都是照「大的東西低而慢」排的。
- 新音檔裡來源不確定的幾個各自成一組、壓小聲、註解寫了「聽了不對整組拿掉」：`cave-bats`、`cave-stream`、`jigoku-steam-vent`、`ruins-wind-howl`、`blizzard-whistle`、兩個郊狼檔、`insect-japan-autumn`、`village-dog`。
- **只收實錄，禁止合成音效**（使用者 11/28 試聽後定的）：合成的竹子敲擊 `river-bamboo-knock`、放魚水花 `lake-fish-splash`、冰裂 `alpine-ice-crack` 三個已經連音源一起刪掉，鹿威、魚躍、冰裂目前沒有聲音。之後找音檔，項目頁寫著合成、設計音效、加了殘響的都跳過，找不到實錄就不放。
- **拿別種動物調音高充數也不行**：拓荒原原本借雪稜的狼調高三個多半音當郊狼，已換成真的郊狼錄音（`beast-coyote-chorus`）。同一種東西調高低（低一點的風、夜裡的潮、薄暮的蟬、熔岩瀑用滾沸聲）使用者同意留著。
- **麥浪田的烏鴉與雲雀留著，但不能蓋過麥浪**：烏鴉 0.28、雲雀 0.14（麥稈是 0.42），之後調音量別超過麥稈。
- **畫面上看不到的東西不配聲音**：海岸外海的浮標鐘已經連音檔刪掉。
- 短循環的接點在瀏覽器裡有沒有頓一下。
- 同時幾顆聲部、主執行緒吃多少：聲部讀數做了，數字要開著開發模式逛一圈才有。沒有設上限。
- 神遊低飛時的聽感（腳本只算巡航高度）；耳朵往下拉之後方位感自不自然。
- 沒開瀏覽器。型別檢查、eslint、vitest（`domains/soundscape/*.test.ts`）過。

## lint 與型別檢查改用 oxc 工具鏈（2026-11）

ESLint（`@antfu/eslint-config`）整套拿掉，lint 改用 oxlint，型別感知規則交給 oxlint-tsgolint，型別檢查仍是 vue-tsc。排版規則全部不要，也不另外裝排版工具（oxfmt、prettier、dprint 都沒有）。

**兩套工具並存（暫時的）**：oxlint 不能檢查 `.vue` 的 `<template>`，所以另外留一份極簡 ESLint，只負責 `.vue` 的 template 規則。決定是「B，未來支援度提升時，再徹底換掉」。script、`.ts`、`.js` 全部歸 oxlint，ESLint 不碰。

**退場條件**：oxlint 支援 Vue template 後（看官方文件的 Vue 相容表與 release notes，原生或穩定的 JS 外掛都算，前提是吃得下 `.vue`），照下面清掉：

1. 刪 `eslint.config.mjs`、`scripts/lint.mjs`。
2. 移除 `eslint`、`eslint-plugin-vue`、`vue-eslint-parser`、`@typescript-eslint/parser` 四個套件（`pnpm remove`）。
3. `package.json` 刪 `lint:vue`，`lint` 改回 `oxlint`、`lint:fix` 改回 `oxlint --fix`、`lint:oxc` 可以一併刪。
4. `.vscode/extensions.json` 拿掉 `dbaeumer.vscode-eslint`，`.vscode/settings.json` 拿掉 `eslint.*` 兩行。
5. 逐條確認 oxlint 有對應規則：`vue/component-name-in-template-casing`（kebab-case、`U` 開頭除外）、`vue/block-order`、`require-v-for-key`、`valid-v-for`、`valid-v-*`、`no-use-v-if-with-v-for`、`no-mutating-props`、`no-unused-vars`（template）、`no-parsing-error`、`no-v-text-v-html-on-component`、`valid-template-root`、`require-valid-default-prop` 等。沒有的就列進「拿掉後沒有替代的」。
6. 更新這一節與 `CLAUDE.md` 的 lint 那行。

**指令**

- `npm run lint`：兩邊都跑（`scripts/lint.mjs`，Node 腳本，避開 Windows cmd.exe 不吃 POSIX 語法），兩個都跑完才回報，任一邊有錯誤就回傳非零，警告不擋。整個 repo 約 9 秒（oxlint 約 3 秒、ESLint 約 5 秒）。換過來時是 0 個錯誤：oxlint 228 個警告（未使用的變數 73、`console` 69、沒處理的 Promise 44，其餘各一到五個），ESLint 80 個警告（`vue/component-name-in-template-casing` 69、`vue/no-mutating-props` 4、`vue/no-v-text-v-html-on-component` 2，其餘各 1）。
- `npm run lint:oxc`：只跑 oxlint，含型別感知規則。
- `npm run lint:vue`：只跑 ESLint（`eslint "**/*.vue"`），只檢查 `.vue` template。
- `npm run lint:fix`：兩邊都帶 `--fix`，只套安全的自動修正。主線上有人在改程式時，別對整個 repo 跑，指定檔案就好：`npm run lint:fix -- path/to/a.vue`（檔案參數兩邊都收得到）。
- `npm run typecheck`：`npx vue-tsc --noEmit -p .nuxt/tsconfig.app.json`。既有 196 個錯誤（minespace 86 個 TS4114；原本 217 個，修掉 codstack 模型預覽面板的陣列預設值後，連帶少了 21 個推導不出型別的錯誤），所以目前一定回傳非零，看的是有沒有多出新錯誤。
- VS Code 兩個擴充都要裝：`oxc.oxc-vscode`（用專案裡的 oxlint，型別感知跟著 `.oxlintrc.json` 的 `options.typeAware`）與 `dbaeumer.vscode-eslint`。`.vscode/settings.json` 設 `eslint.validate: ["vue"]`、`eslint.format.enable: false`，ESLint 只看 `.vue`，不格式化，也沒有存檔自動修正。

**設定**（`.oxlintrc.json`）

- 開 correctness 類別，加上原本 antfu 設定裡 oxlint 也有、又跟排版無關的規則（`eqeqeq` smart、`no-var`、`prefer-const`、`no-new`、`no-alert`、`no-restricted-globals` 的 `global`／`self`、`unicorn/prefer-node-protocol`、`import/no-duplicates` 等），選項照舊。
- 專案自己的覆寫照搬：`no-console` 與未使用的變數、import 是警告，`no-use-before-define` 關閉。未使用的 import 由 `no-unused-vars` 一併回報，不需要 unused-imports 外掛。
- `.claude/skills/impeccable/**` 不檢查：外部安裝的 skill，裡面是壓縮過的第三方腳本。
- `app/theme/**` 是從 VitePress 預設主題搬來的，在那裡踩到的幾條規則只提示，其他地方照樣算錯誤。
- 程式裡既有的 `eslint-disable` 註解 oxlint 照樣認；寫的是 oxlint 沒有的規則（`regexp/*`）就直接略過，不會報錯。

**ESLint（只管 template）的設定**（`eslint.config.mjs`）

- 以 `vue/flat/essential` 為底，再關掉 30 條：29 條是 script 區塊的規則（`no-dupe-keys`、`return-in-computed-property`、`valid-define-props`、`no-deprecated-*` 等，oxlint 已有同名規則），加上 `vue/multi-word-component-names`（命名慣例，舊設定本來就關，Nuxt 的 pages 與 `app.vue` 也會誤觸）。`no-ref-as-operand`、`require-valid-default-prop`、`no-use-computed-property-like-method` 雖是 script 端，oxlint 沒有，所以保留。
- 專案原有的兩條照舊：`vue/component-name-in-template-casing`（kebab-case，`registeredComponentsOnly: false`，`U` 開頭的 Nuxt UI 元件除外）與 `vue/block-order`（script、template 在 style 前）。`block-order` 沒有既有違規，維持 error。
- 解析器是 `vue-eslint-parser` 加 `@typescript-eslint/parser`，否則 `<script setup lang="ts">` 與 template 內的 TS 運算式全會變成 `no-parsing-error`。不需要型別資訊，所以沒設 `parserOptions.project`。
- 忽略清單與 `.oxlintrc.json` 一致。`linterOptions.reportUnusedDisableDirectives` 設 `off`：原始碼有 `eslint-disable-next-line no-new` 等註解，是給 oxlint 看的，ESLint 這邊不開那些規則，不關會被當成沒用到的註解。
- 降成警告的只剩 `component-name-in-template-casing`（69 處，多為從 VitePress 搬來的主題裡的 PascalCase 標籤），新寫的不要再增加。
- 其餘 essential 規則全是錯誤。採用時既有程式踩到的十二處已經修掉（2026-11-28），所以沒有任何一條為了遷就舊程式而降級：`require-v-for-key`、`valid-v-for`（主題的大綱與選單群組補 key）、`no-mutating-props`（陀螺對戰的場景元件原本直接改 props 裡運鏡管理器的 ref，改呼叫管理器的 `resetCamera()`）、`require-valid-default-prop`（codstack 的陣列預設值改用函式給）、`no-unused-vars`、`valid-template-root`（元件範本補上預設插槽）、`no-ref-as-operand`（主題側欄的 `hasAside` 少了 `.value`，判斷永遠成立）。
- 唯一的例外寫在設定檔裡：`app/theme/components/VPSidebarItem.vue` 關掉 `no-v-text-v-html-on-component`。那裡的 `<component :is>` 只會是 `p` 或 `h2` 到 `h6`，`v-html` 寫的是原生元素自己的內容。
- 沒裝 `eslint-plugin-oxlint`：它的用途是關掉 oxlint 已涵蓋的 script 規則，這裡本來就只開 template 規則，用不到。

**既有程式踩到、降成警告的（oxlint）**：`no-floating-promises`（44）、`no-meaningless-void-operator`、`no-base-to-string`、`unbound-method`、`no-misused-spread`、`no-implied-eval`、`require-array-sort-compare`（以上型別感知）、`vue/return-in-computed-property`、`vue/no-dupe-keys`、`vue/prefer-import-from-vue`、`no-useless-escape`、`no-control-regex`、`unicorn/no-useless-spread`、`unicorn/no-thenable`（`web/common/remeda.ts` 匯出了 `then`，整個模組被動態 import 時會被當成 Promise）、`unicorn/prefer-string-starts-ends-with`、`import/no-duplicates`、`no-restricted-globals`、`oxc/no-const-enum`、`vitest/no-standalone-expect`。改到那個檔案時順手修掉。

**關掉的**（原本 antfu 沒開，跟寫法偏好有關）

- `jsdoc/require-yields`：只是要求 generator 的註解寫 `@yields`，神遊模組一口氣 34 個。
- `vitest/no-conditional-expect`：測試逐筆跑表格時本來就會在條件裡斷言。
- `vitest/require-mock-type-parameters`、`vitest/require-to-throw-message`：型別與訊息寫不寫是偏好。
- `vitest/valid-expect` 改成允許兩個參數（vitest 的第二個參數是失敗訊息）；`vitest/valid-title` 不檢查 `describe` 標題的型別（`describe(realm.id, …)` 沒有型別資訊會被誤判）。

**拿掉後沒有替代的**

- **排版**：`style/*`、antfu 的換行規則、`perfectionist/*`（import／export 排序）、`jsdoc/multiline-blocks`、`import/newline-after-import`、Vue 模板的縮排與屬性換行，照使用者決定全部不要。`prefer-template`、`object-shorthand`、`yoda`、`consistent-type-definitions`、`method-signature-style` 這類寫法偏好也一起拿掉。`consistent-type-imports` 不需要：tsconfig 開了 `verbatimModuleSyntax`，型別沒加 `type` 匯入時 vue-tsc 會報 TS1484。
- **Vue 模板**：oxlint 只看 `.vue` 的 `<script>`，模板完全不檢查（官方相容表寫明「No template linting yet」；JS 外掛還在 alpha，也不支援 Vue 這種自訂格式），所以這塊由上面那份極簡 ESLint 補回，不算遺失。仍然沒補的：Vue 模板的排版規則（縮排、屬性換行等）、`vue/essential` 以外的 recommended／strongly-recommended 規則（例如 `require-default-prop`、`attributes-order`）。
- **`regexp/*`** 六十條（含 `no-super-linear-backtracking`）、`eslint-comments/*`、`antfu/no-import-dist`、`antfu/no-import-node-modules-by-path`、`node/no-deprecated-api`、`node/process-exit-as-throw`、`jsdoc/check-param-names`、`jsdoc/require-returns-check`：oxlint 沒有。
- **Markdown 裡的程式碼區塊、JSON**：antfu 會檢查文章裡的 ```ts 區塊與 JSON 檔，oxlint 不看這兩種，原本那兩段例外設定也就不需要了。

**為什麼 TypeScript 不升 7**

- `typescript@7` 套件只剩原生執行檔的啟動器，`require('typescript')` 只拿得到 `version`，`typescript/lib/tsc` 也不在 exports 裡。實測 vue-tsc 3.3.14 搭 TS 7.0.2 一啟動就丟 `ERR_PACKAGE_PATH_NOT_EXPORTED`；Vue 編譯器解析 `defineProps<匯入的型別>()` 也要用 TS 的 JS API。
- oxlint-tsgolint 自帶 TS 7 的 Go 實作，不必另裝 `@typescript/native-preview`，所以專案的 `typescript` 維持 5.7.3。
- 沒有開 `--type-check`（`options.typeCheck`）：tsgolint 不懂 `.vue`，每個 `import X from './x.vue'` 都會報 TS2307，`.vue` 裡的錯誤也看不到，跟 vue-tsc 重疊又不完整。

**踩過的坑**

- **`npx vue-tsc` 跑的不是專案裝的 TypeScript**：專案沒有直接裝 vue-tsc，`npx` 用的是 npm 快取裡的 vue-tsc 3.3.14，連帶用快取裡的 TS 6.0.3（`npx vue-tsc --version` 印 6.0.3）。改裝成專案的 devDependency、改用 5.7.3 時，結果從 217 變 219：多一個 `TS5023 Unknown compiler option 'libReplacement'`（Nuxt 4.7 產生的 tsconfig 要 TS 5.8 以上），以及 `text-item.vue` 多一個 TS2322。為了讓錯誤基準不變，這次維持 `npx`。之後要把 vue-tsc 與 TypeScript 釘進專案，兩個一起升（TS 至少 5.8，最好直接 6.0.3），再重新記錄基準。
- tsgolint 依各檔案最近的 `tsconfig.json` 找專案，根目錄的 references 會一路接到 `.nuxt/tsconfig.*.json`，所以要先有 `nuxt prepare` 產生的 `.nuxt/`（`postinstall` 會跑）。
