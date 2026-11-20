---
version: 1
slug: "app-theme-components-vpdoc-vue"
primary_target: "app/theme/components/VPDoc.vue"
related_targets: ["app/theme/Layout.vue"]
---

## Direction contract

THESIS: 每篇文章是一張圖版，同主題或專欄的文章沿同一條基線排成一列圖版帶，正在讀的那張放大並標出版號。拒絕的預設：VitePress 文件站那種無個性的灰側欄加一條清單。

OWN-WORLD: 圖版世界改用品牌青綠（使用者指定保留原本 teal，oklch 0.55 0.14 175）：青綠取代原圖版的綠與紅，版號用深青墨色大字，細 1px 圖版框線與基線、刻線分隔；頁底是帶極淡青色調的中性白（不是米黃、不是紙紋）。暗色是另行設計的「夜間圖版」：深青黑底、淡青刻線、版號改亮青。封面水彩鱈魚就是圖版本身：固定 1:1（封面原圖即為正方形，這是產品事實），細框、無內襯，放大裁掉封面燒進去的圓角磚底，讓水彩鋪滿整格。字型維持系統中文黑體，版號與小標用 Figtree／等寬數字。

STORY: 讀者從搜尋進來，第一眼看到這篇在系列中的位置（第幾版、前後是哪幾版），讀完後沿圖版帶點下一張，持續讀同系列。

FIRST VIEWPORT: 頂部導覽列（原有）。文章上方一條圖版帶：同側欄群組的文章封面縮圖沿基線排開，目前這張放大加雙框，帶左側寫系列名與共幾版，可水平捲動；帶下一行預告下一版標題（滑過或聚焦時換成該版），首次繪製前就捲到目前這張。下方三欄：左欄大字版號（「12／24」，介面文字須為中文，不用 Pl. 縮寫）加圖說（主題、發布日、標籤），中欄閱讀欄標題與開場，右欄本篇章節以 01、02 編號，與內文 h2 原有的 01、02、03 一致（使用者指定保留）。手機：圖版帶水平捲動，版號縮為標題上方一行。

FORM: 圖版對開（botanical folio），挑戰者，非我排序清單內；seed:8e39267002b14b12

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
