# 開發疑難排解

記錄踩過的坑與處理方式，避免重蹈覆轍。

## 不要在 dev server 執行中跑 build

`npm run build` 與 dev server 共用 `.vitepress/cache`。build 會打斷 Vite 的依賴預先建置，在 cache 留下 `deps_temp_*` 殘骸，dev server 因此遲遲不開埠，瀏覽器看起來像「頁面一直卡在讀取中」。

此專案 build 本身也很慢：`buildEnd` 會執行 `generateImages()` 重建近千張迷因圖，實測 30 分鐘仍未結束。

**處理方式**

1. 用 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 找出 `vitepress build` 行程，`Stop-Process -Force` 終止。dev server 通常數秒內即恢復監聽。
2. 清掉 `.vitepress/cache/deps_temp_*` 殘骸，再重啟 dev server。

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
