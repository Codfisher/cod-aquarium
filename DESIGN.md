---
name: 鱈魚的魚缸
description: 一個人經營的技術部落格與互動作品水族館；文章頁以「圖版對開」呈現，每篇是一張水彩鱈魚圖版。
colors:
  brand-teal: "oklch(0.50 0.13 175)"
  brand-teal-mid: "oklch(0.65 0.13 175)"
  brand-teal-bright: "oklch(0.75 0.12 175)"
  brand-teal-soft: "oklch(0.92 0.04 175)"
  plate-ink: "oklch(0.42 0.09 178)"
  plate-line: "oklch(0.55 0.05 178 / 0.45)"
  tide-white: "oklch(0.985 0.005 175)"
  ink-text: "oklch(0.28 0.01 175 / 0.9)"
  ink-text-muted: "oklch(0.50 0.012 175)"
  night-brand-teal: "oklch(0.82 0.12 175)"
  night-brand-soft: "oklch(0.28 0.04 175)"
  night-plate-ink: "oklch(0.84 0.11 178)"
  night-plate-line: "oklch(0.80 0.05 178 / 0.32)"
  night-ground: "oklch(0.17 0.02 190)"
  night-text: "oklch(0.95 0.005 175 / 0.86)"
  night-text-muted: "oklch(0.72 0.01 175)"
  code-block: "#24292e"
typography:
  display:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "72px"
    fontWeight: 700
    lineHeight: 0.85
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "clamp(1.75rem, 1.5rem + 1.2vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "clamp(1.25rem, 1rem + 0.8vw, 1.75rem)"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "clamp(1.1rem, 1rem + 0.4vw, 1.35rem)"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 2
  series-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "18px"
    fontWeight: 700
  label:
    fontFamily: "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.12em"
rounded:
  plate: "0px"
  focus: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "48px"
components:
  plate:
    backgroundColor: "{colors.tide-white}"
    rounded: "{rounded.plate}"
    width: "84px"
  plate-current:
    backgroundColor: "{colors.tide-white}"
    rounded: "{rounded.plate}"
    width: "200px"
  plate-number-band:
    textColor: "{colors.ink-text-muted}"
    typography: "{typography.label}"
  plate-number-band-current:
    textColor: "{colors.plate-ink}"
    typography: "{typography.label}"
  plate-number-caption:
    textColor: "{colors.plate-ink}"
    typography: "{typography.display}"
  caption-row:
    textColor: "{colors.ink-text}"
    typography: "{typography.caption}"
    padding: "10px 0"
  section-numeral:
    textColor: "{colors.plate-ink}"
    typography: "{typography.title}"
---

# Design System: 鱈魚的魚缸

## Overview

**Creative North Star: "圖版對開"（Botanical Folio，以品牌青綠重新上色）**

每篇文章是一張圖版。同一主題或專欄的文章沿同一條 1px 基線排成一列圖版帶，正在讀的那張放大、加雙框、標出版號；下方像植物圖鑑的對開頁，左欄是大字版號與圖說，中欄是閱讀欄，右欄是以 01、02、03 編號的本篇章節。整個世界靠細刻線、與全站圖片一致的圓角圖版框與深青墨色版號撐起秩序，裝飾只有水彩鱈魚封面本身。

色彩只用品牌青綠一個色相家族：頁底是帶極淡青色調的中性白（不是米黃、沒有紙紋），版號用深青墨，框線與分隔用半透明淡青刻線。暗色是另行設計的「夜間圖版」：深海青黑底、淡青刻線、亮青版號，不是亮色版直接反轉。密度偏鬆，留白服務閱讀；平常的動作只有框線轉墨、縮圖恢復飽和這類 0.25 秒的狀態回饋，圖版站在基線上不位移；換頁時是唯一的例外，放大的那張依迪士尼動畫原則蹲下、彈起、落地晃穩（預備動作、擠壓與伸展、跟隨動作，方向與幅度隨機），縮回的那張被壓一下，鄰居被擠得往外歪。

這個世界源自挑戰者方向 seed:8e39267002b14b12，應使用者要求把原本的綠與紅換成品牌青綠。**文章頁（主題與專欄文章）、首頁與文章總覽已以這個世界重建。** 首頁區塊用圓角刻線卡片加 icon 浮水印；文章總覽是依年份分組、條目間以刻線分隔的目錄，不用卡片框，避免一頁全是框。404 與各 aquarium 作品頁仍沿用移植自 VitePress 的舊外觀，新畫面不要以它們為範本。

**Key Characteristics:**
- 一條共用基線串起整個系列的圖版，目前這張以尺寸與雙框（形狀）區分，不只靠顏色。
- 版號是主角：Figtree 700、等寬數字、深青墨色，兩位數補零（01、02…12）。
- 1px 細框、與全站圖片一致的圓角（小圖版 10px、目前這張與一般圖片 1rem）、無陰影；深度只靠框線、外框與飽和度。
- 單一色相（青綠 175–190），亮暗兩套各自調校。
- 系統中文黑體負責內文，Figtree 只用在版號、編號與標題。

## Colors

全站只有一個色相家族：品牌青綠，從連結色、版號墨色到刻線與頁底都落在 oklch 色相 175–190。

### Primary
- **鱈魚青（brand-teal）**：連結文字與焦點外框。亮度壓在 0.50 才達 WCAG AA（約 5.2:1）；內文連結底線用它的 40% 混色，滑過才轉實色。
- **中段青（brand-teal-mid）／亮青（brand-teal-bright）**：VitePress 品牌按鈕的底色與滑過色，沿用既有對應。
- **淺青霧（brand-teal-soft）**：引言區塊、tip 區塊與選取反白的底色，一律再以 35%–80% 混色淡化使用。

### Secondary
- **圖版墨（plate-ink）**：圖版世界專屬的深青墨。只用於版號、目前圖版的外框與「閱讀中」、下一版預告標籤、右欄章節清單的 01、02 編號。比鱈魚青更深更沉，是「印刷墨」而不是「互動色」。
- **圖版刻線（plate-line）**：半透明淡青。圖版框、基線、圖版帶底線、h2 上方刻線、圖說各列分隔、雙框的外圈都用它，捲軸也染成這個顏色。

### Neutral
- **潮白（tide-white）**：頁底，帶極淡青調的中性白。
- **墨字（ink-text）**：主要文字，帶品牌色調的 90% 深墨，避免純灰。
- **淡墨字（ink-text-muted）**：次要文字（系列說明、未讀圖版的版號、圖說標題欄、預告文字）。刻意用實色而非半透明，任何底色上都維持約 5.7:1。
- **程式碼底（code-block）**：程式碼區塊在亮暗模式都固定暗底。

### 夜間圖版（暗色）
- **夜海底（night-ground）**：深青黑，色相偏向 190 的深海青，不是中性黑。
- **夜間版號（night-plate-ink）**：亮青，取代深青墨。
- **夜間刻線（night-plate-line）**：淡青 32% 透明。
- **夜間鱈魚青（night-brand-teal）／夜間淺青（night-brand-soft）**：暗色的連結色與淡底。
- **夜間墨字（night-text）／夜間淡墨字（night-text-muted）**：暗色主要與次要文字。

### Named Rules
**The 一墨一線 Rule.** 圖版世界只有兩個專屬顏色：圖版墨標記「這是哪一版、哪一節」，圖版刻線畫出框與分隔。新增的圖版元素一律從這兩者取色，不另開新色。

**The 墨不是按鈕 Rule.** 圖版墨不當互動底色、不填滿大面積；互動狀態（連結、焦點）用鱈魚青，版號與編號用圖版墨，兩者職責不混。

**The 兩種光線 Rule.** 每個顏色都要有亮暗兩個值，暗色另行調校（底色換色相、刻線降透明度、墨色提亮），不能只靠反轉或 `color-mix` 推出來。

## Typography

**Display Font:** Figtree（700／800，Google Fonts 非阻塞載入，fallback 為系統字型）
**Body Font:** 系統字型堆疊（-apple-system、Segoe UI、Roboto，中文落到 PingFang TC、Microsoft JhengHei、Noto Sans TC）
**Label/Mono Font:** Figtree 700 搭配 `font-variant-numeric: tabular-nums`，不另載等寬字型

**Character:** 幾何感的 Figtree 刻出版號與編號，像圖鑑上壓印的版次；中文內文交給各平台內建黑體，零下載、讀起來就是讀者熟悉的字。

### Hierarchy
- **Display**（Figtree 700，寬螢幕 72px／窄螢幕 40px，行高 0.85，字距 -0.02em／-0.03em，等寬數字）：圖說欄的大字版號，後接 16–20px 的「／24」總版數。只用於版號。
- **Headline**（Figtree 800，`clamp(1.75rem, 1.5rem + 1.2vw, 2.5rem)`，行高 1.4，字距 -0.03em）：文章標題 h1。
- **Title**（Figtree 800，`clamp(1.25rem, 1rem + 0.8vw, 1.75rem)`，行高 1.4，字距 -0.02em）：內文 h2，上方以淡色斜體大字 01、02、03 標示章節（使用者指定保留原有樣式）。
- **Subtitle**（Figtree 800，`clamp(1.1rem, 1rem + 0.4vw, 1.35rem)`）：內文 h3。
- **Series title**（系統字型 700，18px）：圖版帶左上的系列名稱。
- **Body**（系統字型 400，16px，行高 2，段距 1.5rem）：閱讀欄內文，欄寬 688px。
- **Label**（Figtree 700，13px，字距 0.02em，等寬數字）：圖版帶下的版號、預告標籤。
- **Caption**（系統字型 13px；寬螢幕的值為 14px、行高 1.6）：圖說的主題、發布日、標籤；標題欄字距 0.12em。

### Named Rules
**The 版號補零 Rule.** 版號一律兩位數補零（01、12、24），以等寬數字排，總版數用全形「／」接在後面。介面寫中文「第 12 版」「下一版 13」「共 24 版」，不用 Pl. 等外文縮寫。

**The 十二像素底線 Rule.** 任何文字（含 SVG `font-size`）不得小於 12px；圖版世界最小字是 13px。空間不夠時縮圖版、改用 icon，不縮字。

**The Figtree 只刻數字與標題 Rule.** Figtree 只出現在版號、編號、標題與導覽列站名；中文內文、圖說、系列名一律走系統字型。只載入 700 與 800 兩個字重，不要寫出其他字重。

## Layout

文章頁是上帶下三欄的對開版面：

- **圖版帶**（全寬，寬螢幕最大 1184px）：系列名與「主題・共 N 版」在左上，可捲動時右上出現前後捲動按鈕（僅限有 hover 的 768px 以上裝置）。圖版沿 `align-items: flex-end` 的同一條基線排開，間距 16px，下方預留 44px 給版號；左右 24px 遮罩淡出提示還有更多。目前這張在首次繪製前就以 body 結尾的同步 script 捲到中央（不等 hydration，也避免裁到 LCP 圖）。帶下一行預告下一版標題，滑過或聚焦其他圖版時換成該版。
- **三欄**（1280px 以上）：`176px | minmax(0, 688px) | 224px`，欄距 48px，置中，總寬 1184px。左欄圖說與右欄章節都以 `sticky` 黏在導覽列下 32px。
- **960–1279px**：圖說收成閱讀欄上方一行（版號 40px 與圖說並排換行），欄寬 752px（含 32px 內距）。
- **768px 以下**：圖版 64px、目前這張 200px，圖版帶下距 32px；768px 以上圖版 84px、目前這張 320px，下距 48px。目前這張放大到足以取代內文封面；圖版帶以零寬支柱固定成目前這張的高度，換頁時一縮一放不會讓下方內容跳動。

間距節奏取自 4 的倍數：4、8、12、16、20、24、32、48；章節之間 h2 上方 4rem 外距、2.5rem 內距加一條刻線。

斷點：768px（圖版放大、出現捲動按鈕）、960px（內容內距）、1280px（三欄對開）。

## Elevation & Depth

圖版世界完全扁平，沒有陰影。深度只來自三件事：1px 刻線框、目前圖版外圈再加一道相距 4px 的刻線外框（雙框），以及未讀圖版降到 55% 飽和度、82% 不透明度往後退。滑過或聚焦時框線轉墨色、縮圖恢復全彩，但位置不動。

### Named Rules
**The 站在基線上 Rule.** 圖版永遠不浮起、不位移、不放大來回應滑過；狀態只改框線顏色與飽和度。尊重 `prefers-reduced-motion` 時連 0.25 秒的過場都關掉。

**The 雙框即目前 Rule.** 「目前這張」以尺寸加雙框表達，形狀先於顏色；其他元素不得借用雙框。

## Shapes

圓角正方形：圖版框圓角與全站圖片一致（小圖版 10px、目前這張 1rem，換頁時隨尺寸一起過渡），框內無內襯；全站 img 預設的邊框與圓角在框內拿掉，避免框中有框。圖片 `object-fit: cover`、不放大裁切，完整呈現封面（多數封面主體貼近邊緣，放大會切掉左右）。焦點外框跟著圖版圓角。分隔一律是 1px 水平刻線（圖版帶底線、h2 上方、圖說每列上下），不用卡片、不用色塊分區。

## Components

### 圖版帶（DocPlateBand）
同系列的目錄，本身就是導覽（`<nav>` 包一個 `<ol>`）。
- **圖版：** 正方形，1px 刻線框，未讀時降飽和；滑過／聚焦時框線轉圖版墨、恢復全彩。焦點外框為 2px 鱈魚青、外推 6px。
- **目前圖版：** 放大到 320px（手機 200px），框線為圖版墨，外加刻線雙框；`aria-current="page"`，版號旁標「閱讀中」。這張就是本篇封面，沿用封面的響應式 srcset 與 `fetchpriority="high"`，命中 head 的 LCP preload；內文原本的封面不再渲染。
- **基線：** 每張圖版底緣往左右延伸半個間距，接成一條隨捲動移動的 1px 刻線。
- **版號：** 掛在圖版下方 10px，Label 字級；目前這張轉圖版墨。
- **捲動按鈕：** Nuxt UI `UButton`（neutral／ghost／sm，Material Symbols 圓角箭頭），到底時停用，一次捲約八成可視寬度。
- **預告列：** 「下一版 13」標籤用圖版墨 Figtree，標題用墨字並以省略號截斷；`aria-hidden`，圖版標題另以 sr-only 提供給輔助技術。

### 圖說（DocPlateCaption）
- **寬螢幕：** 左欄 sticky，大字版號（Display）＋「／24」，下方以 `<dl>` 列主題、發布、標籤，每列上下各一條刻線，標題欄在上、值在下。
- **窄螢幕：** 版號 40px 與三組圖說並排換行，無刻線。
- 整塊以 `role="note"` 與完整的「Vue第 12 版，共 24 版」朗讀標籤提供給輔助技術，視覺數字設 `aria-hidden`。

### 章節編號
內文 h2 維持原有的淡色斜體大字 01、02、03（使用者指定）；右欄章節清單的第一層以同樣的 01、02 編號（Figtree 700、圖版墨），且常駐不透明，不必等滑鼠移入。兩邊的編號必須一致。

### 按鈕與其他互動元件
沿用 Nuxt UI 元件（`UButton` 等），以品牌色映射到 Nuxt UI 的 primary；不為圖版世界另做原生按鈕。

## Do's and Don'ts

### Do:
- **Do** 讓同系列的所有圖版站在同一條 1px 圖版刻線基線上，目前這張以尺寸加雙框（外推 4px 的刻線外框）標出。
- **Do** 版號用 Figtree 700、等寬數字、兩位數補零，顏色用圖版墨；介面文字寫中文「第 12 版」「共 24 版」「下一版 13」。
- **Do** 圖版框維持圓角正方形（圓角與全站圖片一致）、1px 刻線、無內襯，封面完整呈現、不放大裁切。
- **Do** 每個新顏色同時給出亮色與夜間圖版兩個值，暗色另行調校。
- **Do** 狀態回饋只改框線顏色與飽和度（0.25 秒），並在 `prefers-reduced-motion` 時關掉過場。
- **Do** 互動元件優先用 Nuxt UI；文字最小 12px（圖版世界實際最小 13px）。
- **Do** 介面文字（含 aria-label 與狀態標籤）一律正體中文；亮色與夜間圖版都要逐畫面檢查，兩者同為一等公民。
- **Do** 圖版帶上目前那張承接封面的 LCP 角色：同一張圖、同一組 srcset 與 sizes、`fetchpriority="high"`，並在首次繪製前捲到中央。

### Don't:
- **Don't** 讓圖版浮起、位移或放大來回應滑過；不要加陰影。
- **Don't** 在圖版世界引入第二個色相或米黃、紙紋底；只用青綠家族的潮白與夜海底。
- **Don't** 用 Pl.、No. 等外文縮寫標版號，也不要把版號做成儀表板式的大數字卡片。
- **Don't** 把圖版墨當按鈕底色或大面積填色；互動色是鱈魚青。
- **Don't** 寫 Figtree 700／800 以外的字重，也不要為了版號另載等寬字型。
- **Don't** 以首頁、文章總覽、404 或 aquarium 作品頁的現況為範本；它們尚未改版。
