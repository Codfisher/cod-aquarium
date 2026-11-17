/// <reference types="vite/client" />

/** 有暗色版（`-dark.webp`）的圖片原圖路徑，由 .vitepress/config.mts 於啟動時掃描 public 產生 */
declare const __DARK_IMAGE_LIST__: string[]

declare module 'virtual:seo-meme-list' {
  // ambient module 內不能用相對路徑的 import 宣告（TS2439，型別會退化成 any），改用 import() 型別
  /** 供 SEO 靜態內容使用的最新迷因清單，由 vite-seo-meme-list plugin 於 build 時產生 */
  export const seoMemeList: import('./content/aquarium/meme-cache/meme-seo').MemeItem[]

  /** 圖庫的迷因總數 */
  export const seoMemeTotal: number

  /** 各情緒分類的張數與分類頁網址，供頁面互相連結 */
  export const seoEmotionSummaryList: import('./content/aquarium/meme-cache/meme-seo').EmotionSummary[]
}

declare module 'gifenc' {
  interface WriteFrameOptions {
    palette?: number[][];
    /** 影格顯示毫秒數 */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number;
    /** LZW 起始碼長度，配合色盤大小調小可讓壓縮更緊 */
    colorDepth?: number;
    dispose?: number;
  }

  interface GifEncoderInstance {
    writeFrame: (index: Uint8Array, width: number, height: number, options?: WriteFrameOptions) => void;
    finish: () => void;
    bytes: () => Uint8Array<ArrayBuffer>;
    reset: () => void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderInstance
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: string; oneBitAlpha?: boolean; clearAlpha?: boolean }): number[][]
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array
}
