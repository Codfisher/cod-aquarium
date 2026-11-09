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

**處理方式**：兩個目錄加進 `resize-images.ts` 的 `IGNORE_PATH_LIST`。之後新增會隨迷因數量成長的圖片目錄時，記得一併排除，否則 build 時間會跟著圖庫線性變長。

## Cloudflare Pages 的 npm ci 報「Missing: … from lock file」

Cloudflare Pages v3 build image 預設是 Node 22 + npm 10，本機是 Node 24 + npm 11。npm 11 重產的 `package-lock.json`，npm 10 解析 peer dependency 的結果不同（例如 `@tiptap/core` 的版本衝突），會判定 lock 與 `package.json` 不同步而拒絕安裝。本機 `npm ci` 照樣通過，所以只有部署時才會爆。

**處理方式**：根目錄的 `.node-version` 釘選 Node 24，讓 Cloudflare 跟本機用同一代 npm。之後本機升 Node 主版本時要一併更新這個檔案。要在本機重現 Cloudflare 的檢查，可以跑 `npx npm@<版本> ci --dry-run --ignore-scripts`。

## Cloudflare Pages 的 npm ci 卡在 onnxruntime-node 下載 GPU 函式庫

2026-11-09 連續兩次部署在 `npm ci` 失敗，都還沒跑到 build：第一次是 `onnxruntime-node` 安裝腳本從 GitHub Releases 下載 `onnxruntime-linux-x64-gpu-*.tgz` 時遇到 504；重試那次沒能還原相依快取，全部重新下載時大量 tarball 被判為損壞，最後 wrangler 底下的 esbuild 版本驗證不過。

**原因**：`onnxruntime-node` 由 devDependency `@huggingface/transformers` 帶入，只有本機的梗圖處理腳本用到。它在 Linux x64 安裝時會自動下載 CUDA 函式庫，Cloudflare 每次都是全新安裝，等於每次 build 都依賴 GitHub 下載一大包網站用不到的檔案。

**處理方式**：根目錄 `.npmrc` 設 `onnxruntime-node-install-cuda=skip`，npm 會以 `npm_config_onnxruntime_node_install_cuda` 傳給安裝腳本。代價是每個 npm 指令都會印 `Unknown project config` 警告，npm 下一個主版本若不再傳遞自訂設定，改在 Cloudflare 設環境變數 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`。之後若又遇到 tarball 損壞，多半是 build 機器當下網路不穩，先重試，仍失敗再到 Pages 設定清除 build cache。

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

## 網頁效能：別讓首屏背上不必要的負擔

2026-11 用 Lighthouse 12（手機模擬）量正式站，瓶頸依序是中文網頁字型、第三方腳本、首頁的 YouTube 與 Babylon，VitePress 本身的 hydration 只佔約 400 ms。相關規則：

- **不要再從 Google Fonts 載入中文字型給全站用。** Noto Sans TC 一頁要拆 29～50 個切片，每片到達都觸發整頁中文重排，拿掉後文章頁 LCP 由 10.5 s 降到 4.0 s。內文一律走 `--vp-font-family-base` 的系統字型；個別功能真的需要（例如迷因編輯器的字型選單），在該功能內按需載入。
- **嵌入 YouTube 等 iframe 加 `loading="lazy"`。** 首頁 12 個影片沒加時，播放器 JS 就超過 900 KB。
- **首屏以外的重型元件用 lazy hydration。** `defineAsyncComponent` 只是拆 chunk，hydration 時照樣立刻下載；要搭配 `hydrate: hydrateOnVisible()` 才會捲到附近才載入，範例見 `.vitepress/theme/index.ts` 的 `FishDiorama`。
- **圖片要優先載入，就在 md 明確寫 `loading="eager" fetchpriority="high"`。** `BaseImg` 只自動判斷 `cover` class，明確寫出的屬性會優先採用。
- **捲動或非同步更新時移動版面，一律用 `transform`。** CLS 只豁免輸入後 500 ms 內的位移，捲動不算輸入。meme-cache 曾因此在 Clarity 拿到 CLS 2.8：VueUse `useVirtualList` 的 `wrapperProps` 用 `marginTop` 推移，捲一下就被算一次位移；改用 `translateY` 後歸零，見 `img-list.vue` 的 `wrapperStyle`。
- **量測尺寸的 ref 不要掛在會被 `<transition mode="out-in">` 替換的元素上。** 新舊元素交接的空檔裡 ref 是 null、量到的高度歸零，依賴它的版面會先跳走再落回。
- **新增 `public/` 底下的資料檔，先確認 Cloudflare 有壓縮。** 只有名單內的 Content-Type 才會壓縮，副檔名認不得的會回 `application/octet-stream` 並原封傳輸（meme-cache 的 ndjson 就因此多傳約 380 KB）。在 `content/public/_headers` 覆寫 Content-Type，部署後用 `curl -sI -H "Accept-Encoding: br" <url>` 確認有 `content-encoding`。
- **藏起來的 lazy 圖片照樣會下載。** Chrome 在慢速網路會預載距視窗 2500px 內的 lazy 圖片，被 fixed 元素蓋住、或只是推到兩個螢幕高以外都不夠。
- **LCP 元素要等資料才知道是哪張圖時，在 `transformHead` 預載那份資料**（`as: 'fetch'`、`crossorigin: 'anonymous'`），且 fetch 不要帶自訂 header，否則預載結果無法沿用。
- **串流資料別邊讀邊觸發整份清單重算。** meme-cache 原本每 500ms 觸發一次，無關鍵字時每次都重新洗牌、整份重繪；主執行緒一忙串流就讀得更慢、觸發更多次，4 倍 CPU 降速下會從 4 次膨脹到 30 次，前 15 秒長任務多達 27 秒。改為讀完才通知一次後，長任務降到 3 秒左右。
- **圖片的暗色版（`xxx-dark.webp`）放進 `content/public` 即可，不必另外登記。** `config.mts` 啟動時掃描出有暗色版的圖，以 `__DARK_IMAGE_LIST__` 傳給 `BaseImg`，只對名單內的圖切換。過去一律嘗試載入暗色版，暗色模式下幾乎每篇封面都在 hydration 後多一次 404 再換回亮色，LCP 慢約 0.4 秒且封面會閃。新增暗色版後要重開 dev server 才會生效。
- **文章頁的 FCP 主要卡在全站共用的 style.css。** VitePress 把所有元件（含各 aquarium app）的樣式合成一支，2026-11 時解壓後 394 KB，文章頁只用到 46%；它是 render-blocking，還跟 JS 搶頻寬。理想上只留用到的規則，慢速 4G 下 FCP 可快約 1 秒、LCP 快約 1.7 秒。VitePress 寫死 `cssCodeSplit: false`，產 HTML 時也只連結第一支 CSS，硬拆會讓 SSR 畫面在 JS 到之前沒有樣式。
- **文章頁的 JS 一律低優先下載。** `config.mts` 的 `transformHtml` 會替 modulepreload 與 app.js 加 `fetchpriority="low"`，讓 style.css 與封面先拿到頻寬（鏡像代理實測 FCP 2.45 → 1.57 秒、LCP 3.45 → 2.86 秒）。直接拿掉 modulepreload 會讓 LCP 變慢。aquarium 頁的畫面靠 JS 繪製，不套用。
- **載入後不要動態插入或移除 `<style>`。** 每插入、移除一次都會讓整頁重算樣式，CSS 越大越貴，文章頁 4 倍降速下一次 300～800 ms。曾有三個來源，合計約 2 秒：VueUse `useDark` 預設 `disableTransition`，初始化時即使外觀沒變也會插入再移除停用轉場的樣式（VitePress 本身與 Nuxt UI 各一個實例）；Nuxt UI 的顏色變數在 Vue 版沒有 SSR，會插暫時版、正式版再移除暫時版。現已分別以 `appearance: { disableTransition: false }`、`ui({ colorMode: false })`、`theme/nuxt-ui-colors.css` 靜態化處理。追查方式：trace 開 `disabled-by-default-devtools.timeline.invalidationTracking`，看每次 `UpdateLayoutTree` 的元素數與失效原因。
- **`<source>`、`<img>` 的 `sizes` 不要個別綁定。** Vue 3.5 hydration 會把個別綁定的屬性重設一次，只略過值沒變的 src、srcset，不含 sizes；瀏覽器收到 sizes 就重新選圖、重新載入，LCP 被推到 hydration 之後。改用 `v-bind` 物件即可，見 `base-img.vue` 的 `getSourceProps`。這兩項加起來讓文章頁 LCP 從約 4.3 秒降到約 2.2 秒（鏡像代理、慢速 4G、CPU 4 倍）。
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
