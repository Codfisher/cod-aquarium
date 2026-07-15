# 首頁「乾涸魚缸箱庭」設計文件

日期：2026-07-15

## 概述

在部落格首頁頂部放入與視窗同高的 3D 箱庭場景：固定 45 度角俯視一座乾涸魚缸，
一隻低多邊寫實鱈魚橫躺在沙地上，點擊沙地時鱈魚會彈跳翻滑到點擊位置，
如網頁 RPG 的點擊移動。呼應站名「鱈魚的魚缸」——有缸無水，所以鱈魚只能用跳的。

## 需求決議

| 項目 | 決議 |
| --- | --- |
| 位置 | 首頁頂部 hero，保留現有 cover 圖與內文 |
| 高度 | `calc(100dvh - var(--vp-nav-height))`，滿版寬（breakout） |
| 魚造型 | 程序化低多邊寫實鱈魚（非 bg-flock 卡通魚） |
| 移動表現 | 橫躺彈跳翻滑（離水魚拍地前進），抵達後躺回 idle |
| 場景主題 | 乾涸魚缸小島：沙地、石頭、水草、玻璃缸壁、無水 |
| 渲染技術 | Babylon.js，tree-shaken 子模組 + onMounted 動態 import |

## 元件與掛載

- 新元件群：`web/components/fish-diorama/`
- 掛載點：`.vitepress/theme/layout.vue` 的 `#layout-top` slot，僅在
  `page.relativePath === 'index.md'` 時渲染。
  實作時由 index.md 內嵌改為 layout slot：天然滿版，
  不需 breakout hack，也避開 100vw 捲軸寬度問題
- 高度：手機導覽列佔版面（position relative），hero 為
  `calc(100dvh - var(--vp-nav-height))`；桌機（≥960px）導覽列 fixed 覆蓋，
  hero 直接 100dvh
- SSR 安全：元件僅渲染容器與 canvas，Babylon 邏輯全部在 `onMounted` 後動態 import
- 底部提示文案＋往下捲箭頭，讓訪客知道可互動

## 檔案結構

```
web/components/fish-diorama/
  fish-diorama.vue      掛載點、生命週期、可視暫停、深色模式同步
  diorama-scene.ts      engine / scene / 相機 / 燈光 / 陰影初始化
  tank-environment.ts   乾涸魚缸場景：沙地、玻璃缸壁、石頭、水草、裝飾
  cod-model.ts          程序化低多邊鱈魚網格
  flop-controller.ts    彈跳翻滑移動邏輯（純邏輯，可單元測試）
```

## 相機與場景

- `ArcRotateCamera`：beta 固定 45°、alpha 正對場景、移除所有輸入，
  resize 依畫面比例重算 radius，確保魚缸完整入鏡
- 燈光：`HemisphericLight` 打底＋`DirectionalLight`＋`ShadowGenerator` 投影至沙地
- 乾涸魚缸：半透明玻璃缸壁、沙色地面微起伏、低多邊石頭、
  扁平葉片水草（輕微搖擺）、一件小裝飾（沉船或小城堡）
- 深色模式：背景、沙色、玻璃色跟隨 VitePress `isDark` 切換

## 鱈魚模型

程序化頂點建模、flat shading：

- 魚雷形側扁身體、分叉尾鰭、三片背鰭（鱈魚特徵）、胸鰭、下顎鬚
- 配色取真實鱈魚：背部橄欖褐、腹部乳白
- 初始側躺沙地，idle 時偶爾尾巴抽動、鰓部起伏

## 移動機制（RPG 點擊移動）

1. `pointerdown` → `scene.pick` 沙地 → 目標點（clamp 在缸內範圍）
2. 目標點顯示漣漪光圈標記後淡出
3. `flop-controller` 將路徑切成數段小跳：拋物線弧＋繞長軸小翻滾＋落地擠壓
   （squash & stretch），逐跳轉向目標
4. 移動中再點擊即時改道
5. `prefers-reduced-motion` 時改為低幅度滑行

## 效能與生命週期

- Babylon 子模組動態 import，不進首屏 bundle（Vite code-split）
- `IntersectionObserver`＋視窗失焦偵測：不可見或失焦時 `stopRenderLoop`
- DPR 上限 2；unmount 完整 dispose

## 錯誤處理

- WebGL 不可用或引擎初始化失敗 → hero 整塊收合，首頁退回現狀
- 動態模組載入失敗同樣收合

## 測試

- `flop-controller` 純邏輯（路徑切分、弧線插值、改道）以 vitest 單元測試
- 視覺表現由使用者手動啟動 dev server 驗證
