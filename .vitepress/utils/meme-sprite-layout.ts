/**
 * 影格長圖的排版規則。
 *
 * 建置端負責產圖、前端負責切格，兩邊算出來的欄數與格子尺寸必須完全一致，
 * 差一格就會整段錯位，故集中在這裡，且不依賴 sharp 才能兩邊共用
 */

/**
 * 長圖的像素面積上限。
 *
 * 行動裝置解過大的圖會自動降採樣，一旦被縮放，用原始座標切出來的格子就會錯位。
 * 實測 61 張動圖全影格排成格狀後最大 15.8M px，取 12M 為上限，
 * 只有極少數超長動圖需要縮小格子
 */
const SPRITE_MAX_AREA = 12_000_000

/**
 * 排版版本。
 *
 * 長圖檔名固定，排版規則一改，瀏覽器可能拿舊快取配新的影格數，
 * 切格會整段錯位且不會報錯。附在網址上當作快取破壞子，改規則時要一起加一
 */
export const SPRITE_LAYOUT_VERSION = 2

export interface SpriteLayout {
  columnCount: number;
  rowCount: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * 影格排成接近正方形的格狀。
 *
 * 單欄直向排列會撞到 webp 單邊 16383px 的上限，
 * 影格數一多就得抽格，動作因此變頓
 */
export function getSpriteColumnCount(frameCount: number) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, frameCount))))
}

/** 依影格數與單格尺寸算出長圖排版，面積超標時等比縮小格子 */
export function getSpriteLayout(frameCount: number, frameWidth: number, frameHeight: number): SpriteLayout {
  const columnCount = getSpriteColumnCount(frameCount)
  const rowCount = Math.ceil(Math.max(1, frameCount) / columnCount)

  const area = columnCount * frameWidth * rowCount * frameHeight
  const scale = Math.min(1, Math.sqrt(SPRITE_MAX_AREA / Math.max(1, area)))

  return {
    columnCount,
    rowCount,
    cellWidth: Math.max(1, Math.round(frameWidth * scale)),
    cellHeight: Math.max(1, Math.round(frameHeight * scale)),
  }
}
