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
