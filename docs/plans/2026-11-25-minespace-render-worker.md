# Minespace：Babylon 場景遷移到 Worker + OffscreenCanvas

> 實作狀態：五個階段已完成，架構說明與踩坑見 [development-notes.md](../development-notes.md) 的「Minespace：渲染搬進 Worker」。

## 目標

主執行緒只留 Vue UI、輸入擷取與音訊；Babylon Engine、世界生成與所有每幀邏輯移到一支 Dedicated Worker，畫在 `canvas.transferControlToOffscreen()` 交過去的 OffscreenCanvas 上。主執行緒因此不再被渲染卡住：UI、輸入與音訊在掉幀時仍然順暢。

## 執行緒分工

| 主執行緒（`main-scene.vue`） | 渲染 worker |
| --- | --- |
| Vue 元件、選單、HUD | Babylon Engine／Scene／Camera |
| pointer lock、鍵盤、滑鼠、滾輪、觸控搖桿 | `use-fps-controller` 的移動、碰撞、視角（吃轉發來的輸入） |
| 音景（Web Audio，worker 沒有 AudioContext） | 世界生成（巢狀 worker：地形、區塊、全局光、雲雜訊） |
| `localStorage`／`sessionStorage`（設定、重新整理交接） | 日夜、天氣、體積雲、所有渲染效果 |
| F6 匯出錯誤紀錄（要建立下載連結） | 效能探針、診斷紀錄的收集 |

## 傳輸層

- 定義型別化的訊息協定（`domains/render-host/protocol.ts`）：
  - 下行（主 → worker）：`init`（OffscreenCanvas、尺寸、devicePixelRatio、初始設定、重新整理交接；是否行動裝置由主執行緒判斷，不放進訊息）、`resize`、`settings`（畫質、FOV、日出方位、自動換日、日速、材質包、凹凸、除錯開關）、`input`（按鍵、滑鼠位移、滾輪、行動搖桿狀態）、`command`（開始漫遊、暫停／恢復、傳送、時刻跳轉與撥動〔`set-time`／`add-time`〕、F3 探針、F7 除錯模式、頁面可見性）、`dispose`
  - 上行（worker → 主）：`loaded`（入口載入完）、`probe-result`、`ready`、`init-error`、`context-lost`／`context-restored`、`frame-status`（約 4 Hz：幀率、時刻、時段、所在箱庭、天氣、是否在地下、探針讀數）、`pose`（最高約 30 Hz，位姿沒變就不送：相機位置與朝向，給音訊聽者）、`sound`（雷聲等觸發）、`log`（錯誤、警告、診斷）、`handoff-snapshot`（畫質切換重新整理前回報位置／視角／時刻）
- 傳輸層抽象成介面，兩種實作：
  1. `WorkerTransport`：真正的 Worker + OffscreenCanvas
  2. `InProcessTransport`：同一份渲染執行期直接跑在主執行緒（用一般 canvas），訊息排進微任務轉交（不同步呼叫，免得兩邊重入）
- 啟動時偵測 `HTMLCanvasElement.prototype.transferControlToOffscreen` 以及 OffscreenCanvas 能不能拿到 `webgl2`；不行就退回 `InProcessTransport`。兩條路跑的是同一份程式碼。

## 渲染端要解開的主執行緒依賴

worker 裡沒有 `window`、`document`、`localStorage`、`matchMedia`。Vue 的響應式（`ref`／`reactive`／`watch`／`computed`／`effectScope`）在 worker 裡可以正常使用；VueUse 碰 DOM 或 storage 的函式不行。

- `use-graphics-quality`、`use-dev-toggles`、`use-texture-pack`、`use-day-night`（`isAutoAdvance`、`daySpeedRatio`）：把「狀態從哪來」與「狀態長什麼樣」拆開。主執行緒照舊由 `useStorage` 持久化，再透過 `settings` 訊息推給 worker；worker 端是同一組欄位的 `reactive`，由訊息更新。渲染端讀狀態的介面不變（例如 `preset.value.cloudStepCount`）。
- `useMediaQuery('(pointer: coarse)')`：主執行緒判斷後放進 `init`。
- `use-fps-controller`：輸入監聽（`window` 的 keydown／keyup／mousemove、pointer lock）搬到主執行緒的小模組，事件轉成 `input` 訊息；worker 端控制器改吃這些訊息。pointer lock 狀態（暫停／恢復）由主執行緒決定，以 `command` 通知 worker。
- `use-mobile-controller`：觸控事件留在主執行緒，搖桿狀態與視角位移以 `input` 送下去。
- `use-soundscape`：留在主執行緒；`camera.position` 改吃 `pose` 訊息，`audioEngine.listener.attach(camera)` 改成直接寫聽者的位置與朝向；`getDayRatio` 改吃 `frame-status`。
- `use-error-logger`：worker 端只收集（攔 `self` 的 `error`／`unhandledrejection`、`reportError`、`reportDiagnostic`），透過 `log` 訊息送到主執行緒彙整；下載連結只在主執行緒建立。
- `use-babylon-scene`：`window.resize` 改成主執行緒量尺寸後送 `resize`；`webglcontextlost` 在 worker 端監聽 OffscreenCanvas。
- `reload-handoff`：主執行緒讀寫 sessionStorage，讀到的值放進 `init`；畫質切換時主執行緒向 worker 要一份快照再重新整理。
- `use-font-loader`、DynamicTexture：確認在 worker 可用（Babylon 在 worker 會用 OffscreenCanvas 建 2D 畫布）；若有用到網頁字型，改用 `self.fonts`／`FontFace`，或在主執行緒畫好再以 ImageBitmap 傳下去。
- 巢狀 worker（地形、區塊、全局光、雲雜訊）：在渲染 worker 裡照舊 `new Worker(new URL(...), { type: 'module' })`。

## 分階段

每一階段結束時 App 都要能正常跑，再進下一階段。

1. **協定與狀態拆分**：寫 `protocol.ts` 與傳輸介面；把上面列的設定類 composable 拆成「主執行緒持久化」與「渲染端 reactive」兩半。此時仍在主執行緒、走 `InProcessTransport`。
2. **抽出渲染執行期**：把 `main-scene.vue` 的 `init`、`handleStart` 等渲染流程搬到不依賴 Vue 元件的 `render-runtime.ts`（入口吃一個 transport）。`main-scene.vue` 只負責 UI 與轉發。
3. **輸入與音訊分家**：輸入擷取模組、`pose` 驅動的音景、`frame-status` 驅動的 HUD。
4. **切到 Worker**：`render-worker.ts` 入口、OffscreenCanvas、能力偵測與退路。
5. **驗證與文件**：功能逐項對照（見下）、效能量測、`docs/development-notes.md` 補上架構說明與踩坑紀錄。

## 驗收清單

- 開始畫面、開始漫遊、pointer lock、Esc 選單、Tab 放開滑鼠
- WASD、跳躍、衝刺、滾輪調時刻、傳送、碰撞與地下判定
- 手機觸控搖桿與視角
- 音景隨位置變化、靜音、音量、雷聲
- 日夜、天氣（雨、雪、沼澤、地獄谷霧）、體積雲、雲影、水鏡、光束、全局光
- 畫質切換後重新整理並回到原位
- 材質包切換、F3 探針、F4 除錯面板、F6 匯出、F7 除錯模式
- 視窗縮放、裝置像素比
- 不支援 OffscreenCanvas WebGL 時退回主執行緒仍可用

## 風險

- 巢狀 worker 與 OffscreenCanvas WebGL2 在舊版 Safari 不支援，需要退路
- Babylon 在 worker 裡的資產載入走 `fetch` + `createImageBitmap`；任何 `new Image()` 或 DOM API 都要找出來
- 每幀的輸入延遲：滑鼠位移要累積後每幀送一次，不要逐事件送
- 設定類 composable 被 UI 與渲染端共用，拆分時兩邊的預設值必須一致
