/// <reference types="vite/client" />

declare module 'virtual:seo-meme-list' {
  import type { MemeItem } from './content/aquarium/meme-cache/meme-seo'

  /** 供 SEO 靜態內容使用的最新迷因清單，由 vite-seo-meme-list plugin 於 build 時產生 */
  export const seoMemeList: MemeItem[]

  /** 圖庫的迷因總數 */
  export const seoMemeTotal: number
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
