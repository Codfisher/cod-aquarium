# 範例測試與性質測試：實驗報告

本文是文章〈測試案例都是自己想的，那沒想到的呢？〉「質疑四」與「突變測試」兩節的完整資料，另附文中其他量測（產生器偏差、罕見 bug 偵測率、Stryker 相容性）的做法。

實驗日期：2026-09-24。

## 結論

**預先登記的主要假說不成立。** 同一個 AI、同樣的規格與正確實作，只准寫範例測試的 E 組平均擋下 14.67 個錯誤版本（共 16 個），只准寫性質測試的 P 組平均 14.37 個，差距在事先訂的 1 個版本以內，判定量不出差別。

**兩組漏掉的錯誤版本幾乎不重疊。** E 組漏的全在 `splitPayment`，都要剛好挑中某些金額才會出現；P 組的漏失幾乎全來自 P2，原因都在產生器。E 與 P 各取一份做聯集，平均擋下 15.98 個。

**性質測試的成績取決於產生器。** P1、P3 刻意加重逗號與反斜線、時段只開幾十到一百多分鐘，都擋下 15.95 個；P2 用 `unit: 'binary'` 與正負 21 億的值域，只擋下 11.2 個。

**突變分數跟錯誤版本偵測不同步。** E1 突變分數 100%，仍漏掉 2 個錯誤版本；P2 突變分數 87.3%，存活的 10 個突變體恰好落在它漏掉錯誤版本的那兩處。

## 設計

### 問題

同一個 AI、同一份規格與正確實作，只准寫範例測試（E 組）或只准寫性質測試（P 組），哪一組擋得住更多「之後才被改壞」的 bug？

### 受測函式

四支函式，JSDoc 即規格，完整程式碼見附錄。開跑前用 20000 次性質檢查確認參考實作符合規格。

| 函式 | 規格重點 | 適合的性質 |
|---|---|---|
| `splitPayment(total, count)` | 最多兩位小數的金額拆成 `count` 筆，加總不差一分，任兩筆相差不超過 0.01，大的排前面 | 不變量 |
| `truncateText(text, maxLength)` | 以 code point 計字數，不超過原樣回傳，超過保留 `maxLength - 1` 字再接「…」 | 不變量、前綴 |
| `mergeTimeRanges(rangeList)` | 合併重疊或相接的 `[start, end)` 時段，依 start 排序，不可修改輸入 | 對照組、冪等 |
| `encodeTagList`／`decodeTagList` | 標籤清單與逗號分隔字串互轉，反斜線跳脫，必須完整還原 | 來回轉換 |

### 錯誤版本

由一個獨立的 Claude Sonnet 5 session 產生，指示是「開發者從零實作或日後修改這份規格時，真的可能犯的錯」，每支函式 4 個、類型互不相同，而且必須通過 JSDoc 的 `@example`。它看得到規格與正確實作，當時還沒有任何測試。

我另外用 50000 次性質檢查複核，16 個版本全部通過 `@example`，也全部找得到違反規格的合法輸入，沒有等價版本。定案時間 2026-09-24 17:25（+08:00），早於任何受試者開始寫測試，雜湊值記在預先登記的附錄。

| 版本 | 錯誤 | 複核找到的反例與錯誤輸出 |
|---|---|---|
| split-payment.bug1 | 轉成「分」時用 `Math.floor` 取代 `Math.round` | `splitPayment(19.99, 2)` 得到 `[9.99, 9.99]` |
| split-payment.bug2 | 餘數全部塞給第一筆 | `splitPayment(0.02, 3)` 得到 `[0.02, 0, 0]` |
| split-payment.bug3 | 餘數平均散開，破壞「大的排前面」 | `splitPayment(0.02, 4)` 得到 `[0.01, 0, 0.01, 0]` |
| split-payment.bug4 | 四捨五入算平均，第一筆用減法回推 | `splitPayment(0.02, 3)` 得到 `[0, 0.01, 0.01]` |
| truncate-text.bug1 | 用 `.length`／`.slice()` 算字數 | `truncateText('aaa😀a', 5)` 切出半個 surrogate |
| truncate-text.bug2 | 判斷用 `<` 取代 `<=` | `truncateText('aaaaaaaaa', 9)` 得到 `'aaaaaaaa…'` |
| truncate-text.bug3 | 判斷用 code point，截斷仍用 code unit | `truncateText(' 𐀀  ', 3)` 切出半個 surrogate |
| truncate-text.bug4 | 多加 `Math.max(1, maxLength - 1)` 防禦 | `truncateText('aa', 1)` 得到 `'a…'` |
| merge-time-ranges.bug1 | 重用輸入的時段物件，就地修改呼叫端的陣列 | `[[0, 10], [5, 20]]` 呼叫後輸入變成 `[[0, 20], [5, 20]]` |
| merge-time-ranges.bug2 | 相接判斷用 `<` 取代 `<=` | `[[262, 263], [261, 262]]` 沒有合併 |
| merge-time-ranges.bug3 | 合併時忘了取 `Math.max` | `[[1, 2], [0, 3]]` 得到 `[[0, 2]]` |
| merge-time-ranges.bug4 | 依 end 排序而非 start | `[[0, 3], [1, 2]]` 得到 `[[1, 3]]` |
| tag-list.bug1 | 只跳脫逗號，沒跳脫反斜線 | `['\\']` 還原成 `['']` |
| tag-list.bug2 | 先跳脫逗號、再跳脫反斜線 | `[',']` 還原成 `['\\', '']` |
| tag-list.bug3 | 解碼跳脫字元後忘了多前進一格 | `[',']` 還原成 `[',', '']` |
| tag-list.bug4 | 解碼改用 `split(',')` | `['\\']` 還原成 `['\\\\']` |

### 受試者

六個各自獨立的 Claude Sonnet 5 session（透過 Claude Code 的子代理啟動），各自一份工作區，看得到規格與正確實作。指示除了技術限制那一段以外完全相同：

> 目標：寫出你願意長期依賴的測試。這些函式之後會有人（或 AI）修改，測試要能在它們被改壞時擋下來。

| 組 | 技術限制 |
|---|---|
| E（E1～E3） | 只能寫範例測試，每個案例都是具體輸入對具體期望輸出，可以用 `it.each`，不能用 fast-check、隨機輸入、迴圈或程式大量產生輸入 |
| P（P1～P3） | 只能寫性質測試，使用 fast-check 與 @fast-check/vitest，不能寫固定輸入對固定期望值，使用預設的 `numRuns` |

測試必須在正確實作上全綠，不得修改 `src/`、設定檔，也不得安裝套件。受試者不知道有錯誤版本，也不知道自己在實驗裡。

交卷後逐一檢查：六份都沒有修改 `src/`、`package.json`、`vitest.config.ts`；E 組沒有使用 fast-check、迴圈或亂數產生輸入；P 組沒有設定 `numRuns`、`seed`、`examples`，也沒有寫固定輸入的 `it`。

### 量測

1. **錯誤版本偵測**：把錯誤版本換進 `src/`，整套測試至少一條失敗就算擋下。只收規定的四個測試檔。E 組結果固定，每個版本跑 3 次確認一致；P 組每個版本跑 20 次，記錄擋下的比例。
2. **突變分數**：Stryker 10.0.0 在正確實作上跑，fast-check 的 seed 固定。E 組用 seed 1、2，P 組用 seed 1、2、3 各跑一次，六組再用 seed 4 依序跑一輪計時。
3. **成本**：測試數、非空白行數；在沒有其他評分工作時，逐一在正確實作上跑 10 次 `vitest run` 取中位數。

環境：Windows 11、Node 22.20.0、Vitest 5.0.1、fast-check 4.10.2、@fast-check/vitest 0.5.0、Stryker 10.0.0。突變測試改用 Vitest 4.1.11，原因見「附帶發現」。

## 預先登記

登記時間 2026-09-24 17:07（+08:00），早於錯誤版本與受試測試。

| 編號 | 預測 | 信心 |
|---|---|---|
| H1 | P 組平均擋下的錯誤版本數高於 E 組 | 60% |
| H2 | 突變分數 E 組大於等於 P 組，理由是範例釘死具體值，性質只描述部分行為 | 55% |
| H3 | `truncateText` 若 P 組用預設的 `fc.string()`（只產生 ASCII），會漏掉跟 emoji 有關的錯誤版本，E 組反而擋得下 | 50% |
| H4 | P 組一般執行時間是 E 組的 5 到 50 倍，但每份都在 3 秒內 | 60% |
| H5 | 至少一組（P 組測試，錯誤版本）在 20 次裡有時擋下、有時漏掉 | 85% |

判定規則：兩組平均擋下數差距不超過 1 個錯誤版本，H1 判定不成立；所有結果都寫進文章，不因結果不利於性質測試而更換函式、錯誤版本或重跑受試者；兩組測試的聯集只當探索性觀察。

### 與登記內容的差異

- E 組每個錯誤版本跑 3 次（登記為 1 次），三次結果完全一致。
- 突變測試改在 Vitest 4.1.11 上跑，避開 Stryker 10.0.0 與 Vitest 5 的相容問題。這個問題在評分任何受試測試之前就發現了。
- 執行時間改用另外量的 10 次中位數。評分時六組同時在跑，機器負載不同，時間不能比。
- P2 的錯誤版本評分第一次跑到一半就停掉重跑，並在評分用的設定加上 `endOnFailure`。原因是 P2 的一條性質在某個錯誤版本上縮小反例，單次執行超過兩分鐘 CPU 時間。`endOnFailure` 只跳過失敗之後的縮小步驟，測試失敗與否在縮小之前就已確定，不影響偵測結果。

## 結果

### 錯誤版本偵測

● 為每次都擋下，· 為每次都漏掉，數字為 20 次裡擋下的比例。

| 錯誤版本 | E1 | E2 | E3 | P1 | P2 | P3 |
|---|---|---|---|---|---|---|
| merge-time-ranges.bug1 | ● | ● | ● | ● | ● | ● |
| merge-time-ranges.bug2 | ● | ● | ● | ● | 0.20 | ● |
| merge-time-ranges.bug3 | ● | ● | ● | ● | ● | ● |
| merge-time-ranges.bug4 | ● | ● | ● | ● | ● | ● |
| split-payment.bug1 | · | · | ● | 0.95 | ● | 0.95 |
| split-payment.bug2 | ● | ● | ● | ● | ● | ● |
| split-payment.bug3 | · | ● | · | ● | ● | ● |
| split-payment.bug4 | ● | ● | ● | ● | ● | ● |
| tag-list.bug1 | ● | ● | ● | ● | · | ● |
| tag-list.bug2 | ● | ● | ● | ● | · | ● |
| tag-list.bug3 | ● | ● | ● | ● | · | ● |
| tag-list.bug4 | ● | ● | ● | ● | · | ● |
| truncate-text.bug1 | ● | ● | ● | ● | ● | ● |
| truncate-text.bug2 | ● | ● | ● | ● | ● | ● |
| truncate-text.bug3 | ● | ● | ● | ● | ● | ● |
| truncate-text.bug4 | ● | ● | ● | ● | ● | ● |
| **合計** | **14** | **15** | **15** | **15.95** | **11.2** | **15.95** |

E 組平均 14.67，P 組平均 14.37。六組在正確實作上都全綠，P 組 20 次沒有任何一次誤報。

各取一份的聯集：E1 加 P1 為 15.95，E2 加 P2 為 16，E3 加 P3 為 16。

### 突變分數

Stryker 在四個檔案共產生 79 個突變體。每一組在不同 seed 下，每個突變體的判定都完全相同。

| | E1 | E2 | E3 | P1 | P2 | P3 |
|---|---|---|---|---|---|---|
| 分數 | 100% | 98.7% | 100% | 98.7% | 87.3% | 98.7% |
| merge-time-ranges | 17/17 | 17/17 | 17/17 | 17/17 | 16/17 | 17/17 |
| split-payment | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 | 12/12 |
| tag-list | 40/40 | 39/40 | 40/40 | 39/40 | 31/40 | 39/40 |
| truncate-text | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |

E2、P1、P3 在 `tag-list` 各有 1 個沒被覆蓋的突變體，位於解碼時「反斜線在字串結尾」的分支。只有傳入非 `encodeTagList` 產生的字串才會走到，E1、E3 替這種輸入寫了範例測試。

P2 的 10 個存活突變體：9 個在 `tag-list` 的跳脫邏輯（`replaceAll` 的字串、`char === '\\'` 分支與其內容），1 個是 `mergeTimeRanges` 相接判斷的 `<=` 改成 `<`，與 merge-time-ranges.bug2 相同。

Stryker 替 `splitPayment` 產生的 12 個突變體裡，沒有任何一個把 `Math.round` 換成 `Math.floor`，所以 E1 的 100% 與它漏掉 split-payment.bug1 並不衝突。

各取一份的聯集：E1 加 P1 擊殺 79 個，E2 加 P2 擊殺 78 個，E3 加 P3 擊殺 79 個。

### 成本

| | E1 | E2 | E3 | P1 | P2 | P3 |
|---|---|---|---|---|---|---|
| 測試數 | 52 | 57 | 51 | 15 | 19 | 16 |
| 非空白行數 | 321 | 239 | 352 | 157 | 237 | 245 |
| `vitest run` 整體（中位數） | 0.69 秒 | 0.69 秒 | 0.67 秒 | 1.52 秒 | 2.90 秒 | 1.67 秒 |
| 純測試時間（中位數） | 23 毫秒 | 23 毫秒 | 19 毫秒 | 774 毫秒 | 1700 毫秒 | 527 毫秒 |
| Stryker 一輪（seed 4） | 9.1 秒 | 9.0 秒 | 9.0 秒 | 53.7 秒 | 60.3 秒 | 75.4 秒 |

P 組的測試時間大多花在 `splitPayment`：P1 691 毫秒、P2 1343 毫秒、P3 435 毫秒。三組都把 `count` 開到 500 或 1000，每條性質要拆出上百筆金額、重複 100 次。

量測時機器上另有與實驗無關的開發伺服器在跑，六組在同樣條件下量，比例可以參考，絕對值會隨機器變動。

### 假說判定

| 編號 | 判定 | 依據 |
|---|---|---|
| H1 | 不成立 | E 組 14.67，P 組 14.37，差距在 1 個版本以內 |
| H2 | 成立 | E 組平均 99.6%，P 組平均 94.9% |
| H3 | 不成立 | 三位 P 組受試者的 `truncateText` 都用了 `unit: 'binary'`，四個錯誤版本全數擋下。同類的產生器盲點反而出現在 P2 的 `tag-list`，方向相反：`'binary'` 幾乎不產生 ASCII 符號 |
| H4 | 部分成立 | 整體執行時間只慢 2.2 到 4.3 倍，低於預測下限；純測試時間慢 24 到 78 倍，P2 超過預測上限；每份都在 3 秒內 |
| H5 | 成立 | P1、P3 對 split-payment.bug1 各為 19/20，P2 對 merge-time-ranges.bug2 為 4/20 |

## 受試者的測試寫法

| | 重點 |
|---|---|
| E1 | 以 `it.each` 表格為主，`tag-list` 另外測了不合法字串的解碼行為。特地寫了一條「`29.99 * 100 !== 2999`」的浮點數測試，但 `29.99 * 100` 在 JavaScript 剛好等於 2999，這條擋不住 bug1 |
| E2 | `splitPayment` 用 `1 / 7` 這類案例鎖住餘數分配順序，因此擋下 bug3。自述用 node 腳本驗算期望值 |
| E3 | 刻意防浮點數的案例是 `0.3 / 3`，擋不住 bug1；真正擋下 bug1 的是另一條以 19.99 測「餘數給第一筆」的案例 |
| P1 | 五條 `splitPayment` 性質對應 JSDoc 五條規格；標籤字元用 `fc.oneof(fc.constantFrom(',', '\\'), 任意 code point)`；時段起點 -20 到 80；用 `Object.freeze` 深度凍結輸入驗證不可修改 |
| P2 | 同樣五條 `splitPayment` 性質；標籤用 `fc.string({ unit: 'binary' })`；時段起點用 `fc.integer()`、長度 1 到 100 萬，只有「涵蓋分鐘相同」那條限制在 0 到 120 |
| P3 | 同樣五條 `splitPayment` 性質；標籤混合 `fc.constantFrom('a', 'b', ',', '\\', '\n', ' ', '0', '😀')` 與 `'binary'`；時段限制在 0 到 30。自述另外寫了四個故意改壞的版本驗證測試，跑完後刪除 |

三位 P 組受試者寫出的 `splitPayment` 性質幾乎相同，都是把 JSDoc 的五條條列逐條翻成性質。

## 附帶發現

### P2 為什麼漏掉跳脫與相接

`fc.string({ unit: 'binary' })` 從 0 到 0x10FFFF 的 code point 裡抽字元。以 seed 1 到 1000 各跑 100 次，共 10 萬個字串：

| 產生器 | 含反斜線 | 含逗號 |
|---|---|---|
| `fc.string({ minLength: 1, unit: 'binary' })` | 0 | 1 |
| `fc.string({ minLength: 1 })`（預設 ASCII） | 5186 | 5215 |

P2 的 `fc.array(fc.string({ minLength: 1, unit: 'binary' }))`，一輪 100 次裡至少出現一次反斜線的比例是 0.3%。

相接的部分，把 P2「回傳的時段依 start 遞增排序，且任兩段既不重疊也不相接」這條性質單獨拿出來，對 merge-time-ranges.bug2 各跑 1000 個 seed，只換起點與長度的範圍：

| 起點與長度 | 一輪抓到的比例 |
|---|---|
| `fc.integer()`，長度 1 到 100 萬（P2 的寫法） | 6.7% |
| 0 到 1440，長度 1 到 180 | 76.5% |
| 0 到 30，長度 1 到 10 | 100% |

P2 另一條在 0 到 120 範圍跑的「涵蓋分鐘相同」性質，對 bug2 無感，因為相接的兩段不合併，涵蓋的分鐘也一樣。

### Stryker 與 @fast-check/vitest：seed 寫在測試名稱裡

`@fast-check/vitest` 0.3.0 與 0.5.0 的 `test.prop` 都把測試註冊成 `` `${label} (with seed=${seed})` ``。以 0.5.0 為例，參數與 `fc.configureGlobal` 都沒有指定 seed 時，seed 取 `Date.now() ^ (Math.random() * 4294967296)`。

Stryker 的 vitest runner 在 dry run 記下測試名稱，測每個突變體時把名稱組成 `testNamePattern`。每次重新收集測試時 seed 都會重抽，名稱對不上，Vitest 一條測試都不跑，突變體因此判為存活。`coverageAnalysis: 'off'` 同樣受影響。

在 fast-check 與 stryker-js 的 issue 裡沒有找到相關回報。fast-check 有兩個相關提案（#6481、#6702，讓 `@fast-check/vitest` 改用 Vitest 的 `sequence.seed`），都已關閉、沒有合併。

### Stryker 10.0.0 與 Vitest 5：describe 裡的測試對不上

Vitest 5 比對 `testNamePattern` 時會用 `' > '` 串接 describe 與測試名稱，Stryker 10.0.0 的 vitest runner 仍用空白串接，包在 `describe` 裡的測試全部對不上。已有回報：[stryker-js #6210](https://github.com/stryker-mutator/stryker-js/issues/6210)，修正 PR #6214 撰寫本文時尚未合併。

兩個問題的探測，同一支 `splitPayment`、12 個突變體：

| 寫法 | Vitest 4.1.11 | Vitest 5.0.1 |
|---|---|---|
| `test.prop`，seed 隨機，最上層 | 0% | 0% |
| `test.prop`，固定 seed，最上層 | 100% | 100% |
| 原生 `it` 包 `fc.assert`，最上層 | 100% | 100% |
| 原生 `it` 包 `fc.assert`，包在 `describe` 裡 | 100% | 0% |
| 範例測試，包在 `describe` 裡 | 100% | 0% |
| `test.prop`，固定 seed，包在 `describe` 裡 | 100% | 0% |

### 產生器偏差

以 seed 1 到 1000 各跑一輪 `fc.check`（預設 100 次），收集 10 萬個 `fc.integer()` 的值：

| 值 | 出現比例 | 均勻亂數 |
|---|---|---|
| 0 | 0.38% | 約 2.3 × 10⁻⁸ % |
| 1 或 -1 | 0.78% | 約 4.7 × 10⁻⁸ % |
| 2147483647 | 0.19% | 約 2.3 × 10⁻⁸ % |
| -2147483648 | 0.16% | 約 2.3 × 10⁻⁸ % |
| 絕對值不超過 10 | 7.85% | 約 4.9 × 10⁻⁷ % |
| 絕對值不超過 1000 | 23.08% | 約 4.7 × 10⁻⁵ % |
| 距離最大值或最小值 10 以內 | 4.05% | 約 4.9 × 10⁻⁷ % |

預設的 `fc.string()` 產生的 10 萬個字串：空字串 10966 個、最長 10 個字元、中位數 4 個字元，不含 emoji 與中文。`unit: 'grapheme'` 有 72.8% 含 astral 字元，含中文的只有 27 個；`unit: 'binary'` 有 81.9% 含 astral 字元，6990 個含中文。

`fc.array` 預設最長 10 個元素。長度上限由 `size` 決定，預設 `'small'` 為 `2 × minLength + 10`；只設 `maxLength: 50` 時最長仍是 10，要加上 `size: 'max'` 才會到 50，`size: 'medium'` 最長 100。

### 罕見 bug 的偵測率

每個條件以 seed 1 到 1000 各跑一輪（預設 100 次），計算抓到的比例。均勻亂數的理論值以 1 − (1 − p)¹⁰⁰ 計算。

| bug 出現的條件 | 抓到的比例 | 均勻亂數理論值 |
|---|---|---|
| `fc.integer()` 剛好是 0 | 31.3% | 約 2.3 × 10⁻⁶ % |
| `fc.integer()` 剛好是 2147483647 | 17.8% | 約 2.3 × 10⁻⁶ % |
| `fc.integer()` 剛好是 123456 | 0% | 約 2.3 × 10⁻⁶ % |
| `fc.integer()` 除以 1000 餘 7 | 36.0% | 9.5% |
| `fc.integer()` 除以 100 餘 7 | 63.7% | 63% |
| 兩個 `fc.integer()` 相等 | 10.9% | 約 2.3 × 10⁻⁶ % |
| `fc.integer()` 小於等於 0 | 100% | 接近 100% |
| `fc.array(fc.integer())` 有重複值 | 33.4% | 不適用 |
| `fc.array(fc.integer())` 超過 10 個元素 | 0% | 不適用 |
| 預設 `fc.string()` 含逗號 | 97.9% | 不適用 |
| 預設 `fc.string()` 含 emoji | 0% | 不適用 |
| `unit: 'grapheme'` 含 emoji | 100% | 不適用 |
| `unit: 'grapheme'` 含中文 | 2.7% | 不適用 |
| `unit: 'binary'` 含中文 | 100% | 不適用 |
| `fc.nat()` 剛好是 0 | 54.0% | 不適用 |
| `fc.integer({ min: 0, max: 1000 })` 剛好是 0 | 91.5% | 不適用 |
| `fc.integer()` 跑 1000 次，剛好是 0 | 94.3% | 不適用 |

### 退款 bug

沿用〈測試都加了還是出包？是不是少了流程測試？〉的 `checkRefund` 與 `submitRefund`（拿掉金流呼叫），性質為「依序送出任意筆退款後，累計退款不超過訂單金額」，訂單金額與每筆退款都是 1 到 10 萬的整數。

以 seed 1 到 1000 各跑一輪：1000 輪全部失敗；失敗前試過的輸入數中位數 3、最多 21；縮小後的反例 995 輪是「先退 1 元，再退全額」，5 輪是「先退全額，再退 1 元」。seed 3 的縮小步數高達 30514 次。

### 分帳錯誤的觸發比例

`Math.floor(cents / 100 * 100) !== cents` 的比例：0 到 100.00 元為 5.73%，0 到 10000.00 元為 6.56%。前幾個會出錯的金額是 0.29、0.57、0.58、1.13、1.14、1.15、1.16、2.01。常見的範例值 100、0.01、1999.99、29.99、99.99、0.3 都不會出錯，19.99 會。

## 限制

- **樣本小。** 4 支函式、16 個錯誤版本、每組 3 位受試者，E 與 P 的差距小於一個錯誤版本，任何一位受試者換人都可能翻轉結論。
- **錯誤版本由 AI 產生。** 類型偏向 AI 想得到的錯，而受試者也是同一個模型家族，E 組可能因此更容易想到同類的邊界。
- **受試者看得到正確實作。** 範例測試可以直接執行實作取得期望值，E1、E2 都自述這樣做過。
- **P3 自我驗證。** P3 寫了四個故意改壞的版本檢查自己的測試，類型與實驗的錯誤版本部分重疊，這在指示允許範圍內，可能讓 P3 的成績偏高。
- **只測單一模型。** 受試者與錯誤版本產生者都是 Claude Sonnet 5。
- **突變測試環境不同。** 錯誤版本偵測在 Vitest 5.0.1 上跑，突變測試在 Vitest 4.1.11 上跑。

## 附錄：受測函式

`split-payment.ts`

```ts
/**
 * 把一筆金額平均拆成多筆，用在信用卡分期、多人分帳等地方。
 *
 * - `total`：總金額，非負數，最多兩位小數，例如 `1999.99`
 * - `count`：要拆成幾筆，正整數
 *
 * 回傳長度為 `count` 的陣列，並且滿足：
 * - 每筆金額都是非負數，最多兩位小數
 * - 加總剛好等於 `total`，以「分」為單位計算，不能多一分也不能少一分
 * - 任兩筆相差不超過 0.01
 * - 金額較大的排在前面
 *
 * @example
 * splitPayment(100, 3) // [33.34, 33.33, 33.33]
 */
export function splitPayment(total: number, count: number): number[] {
  const totalCents = Math.round(total * 100)
  const baseCents = Math.floor(totalCents / count)
  const remainderCents = totalCents % count

  return Array.from({ length: count }, (_, index) => {
    const cents = index < remainderCents ? baseCents + 1 : baseCents
    return cents / 100
  })
}
```

`truncate-text.ts`

```ts
/**
 * 截斷過長的文字，用在卡片預覽、通知摘要等地方。
 *
 * - 字數以 Unicode code point 計算，例如「😀」算一個字
 * - `maxLength`：正整數
 * - 字數不超過 `maxLength` 時原樣回傳
 * - 超過時保留前 `maxLength - 1` 個字，再接上「…」，結果剛好 `maxLength` 個字
 *
 * @example
 * truncateText('今天天氣真好', 4) // '今天天…'
 */
export function truncateText(text: string, maxLength: number): string {
  const charList = Array.from(text)
  if (charList.length <= maxLength) {
    return text
  }

  return `${charList.slice(0, maxLength - 1).join('')}…`
}
```

`merge-time-ranges.ts`

```ts
export type TimeRange = [start: number, end: number]

/**
 * 合併重疊或相接的時段，用在排班、會議室預約等地方。
 *
 * - 每個時段是 `[start, end]`，單位為分鐘，都是整數且 `start < end`，
 *   涵蓋 start 到 end 之間的時間（包含 start，不包含 end）
 * - 輸入順序不拘，不可修改傳入的陣列或其中的時段
 * - 重疊或相接（前一段的 end 等於後一段的 start）的時段要合併成一段
 * - 回傳的時段依 start 由小到大排序，任兩段既不重疊也不相接
 *
 * @example
 * mergeTimeRanges([[60, 120], [0, 30], [90, 150]]) // [[0, 30], [60, 150]]
 */
export function mergeTimeRanges(rangeList: TimeRange[]): TimeRange[] {
  const sortedList = [...rangeList].sort((a, b) => a[0] - b[0])
  const resultList: TimeRange[] = []

  for (const [start, end] of sortedList) {
    const last = resultList.at(-1)
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
      continue
    }

    resultList.push([start, end])
  }

  return resultList
}
```

`tag-list.ts`

```ts
/**
 * 把標籤清單編碼成一個字串，放進網址的 query，例如 `?tags=vue,react`，也能解碼回來。
 *
 * - 標籤是非空字串，可以包含任何字元
 * - 編碼後以逗號分隔各個標籤
 * - `decodeTagList(encodeTagList(tagList))` 必須還原出完全相同的清單，包含順序
 * - 空清單編碼成空字串，空字串解碼成空清單
 *
 * @example
 * encodeTagList(['vue', 'react']) // 'vue,react'
 * decodeTagList('vue,react') // ['vue', 'react']
 */
export function encodeTagList(tagList: string[]): string {
  return tagList
    .map((tag) => tag.replaceAll('\\', '\\\\').replaceAll(',', '\\,'))
    .join(',')
}

export function decodeTagList(text: string): string[] {
  if (text === '') {
    return []
  }

  const tagList: string[] = []
  let current = ''

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (char === '\\') {
      current += text[index + 1] ?? ''
      index++
      continue
    }

    if (char === ',') {
      tagList.push(current)
      current = ''
      continue
    }

    current += char
  }

  tagList.push(current)
  return tagList
}
```

## 附錄：錯誤版本與正確實作的差異

```diff
=== merge-time-ranges.bug1
-  for (const [start, end] of sortedList) {
+  for (const range of sortedList) {
     const last = resultList.at(-1)
-    if (last && start <= last[1]) {
-      last[1] = Math.max(last[1], end)
+    if (last && range[0] <= last[1]) {
+      last[1] = Math.max(last[1], range[1])
       continue
     }
-    resultList.push([start, end])
+    resultList.push(range)

=== merge-time-ranges.bug2
-    if (last && start <= last[1]) {
+    if (last && start < last[1]) {

=== merge-time-ranges.bug3
-      last[1] = Math.max(last[1], end)
+      last[1] = end

=== merge-time-ranges.bug4
-  const sortedList = [...rangeList].sort((a, b) => a[0] - b[0])
+  const sortedList = [...rangeList].sort((a, b) => a[1] - b[1])

=== split-payment.bug1
-  const totalCents = Math.round(total * 100)
+  const totalCents = Math.floor(total * 100)

=== split-payment.bug2
-    const cents = index < remainderCents ? baseCents + 1 : baseCents
+    const cents = index === 0 ? baseCents + remainderCents : baseCents

=== split-payment.bug3
+  let previousBoundary = 0
+
   return Array.from({ length: count }, (_, index) => {
-    const cents = index < remainderCents ? baseCents + 1 : baseCents
-    return cents / 100
+    const boundary = Math.ceil((remainderCents * (index + 1)) / count)
+    const extra = boundary - previousBoundary
+    previousBoundary = boundary
+    return (baseCents + extra) / 100
   })

=== split-payment.bug4
-  const totalCents = Math.round(total * 100)
-  const baseCents = Math.floor(totalCents / count)
-  const remainderCents = totalCents % count
-
-  return Array.from({ length: count }, (_, index) => {
-    const cents = index < remainderCents ? baseCents + 1 : baseCents
-    return cents / 100
-  })
+  const share = Math.round((total / count) * 100) / 100
+  const amountList = Array.from({ length: count - 1 }, () => share)
+
+  const usedTotal = Math.round(share * (count - 1) * 100) / 100
+  const firstShare = Math.round((total - usedTotal) * 100) / 100
+  amountList.unshift(firstShare)
+
+  return amountList

=== tag-list.bug1
-    .map((tag) => tag.replaceAll('\\', '\\\\').replaceAll(',', '\\,'))
+    .map((tag) => tag.replaceAll(',', '\\,'))

=== tag-list.bug2
-    .map((tag) => tag.replaceAll('\\', '\\\\').replaceAll(',', '\\,'))
+    .map((tag) => tag.replaceAll(',', '\\,').replaceAll('\\', '\\\\'))

=== tag-list.bug3
     if (char === '\\') {
       current += text[index + 1] ?? ''
-      index++
       continue
     }

=== tag-list.bug4（decodeTagList 整支改寫）
+  return text.split(',')

=== truncate-text.bug1
-  const charList = Array.from(text)
-  if (charList.length <= maxLength) {
+  if (text.length <= maxLength) {
     return text
   }
-  return `${charList.slice(0, maxLength - 1).join('')}…`
+  return `${text.slice(0, maxLength - 1)}…`

=== truncate-text.bug2
-  if (charList.length <= maxLength) {
+  if (charList.length < maxLength) {

=== truncate-text.bug3
-  return `${charList.slice(0, maxLength - 1).join('')}…`
+  return `${text.slice(0, maxLength - 1)}…`

=== truncate-text.bug4
-  return `${charList.slice(0, maxLength - 1).join('')}…`
+  const keepLength = Math.max(1, maxLength - 1)
+  return `${charList.slice(0, keepLength).join('')}…`
```
