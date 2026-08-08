/// <reference types="vite/client" />

declare module 'virtual:seo-meme-list' {
  import type { MemeItem } from './content/aquarium/meme-cache/meme-seo'

  /** 供 SEO 靜態內容使用的最新迷因清單，由 vite-seo-meme-list plugin 於 build 時產生 */
  export const seoMemeList: MemeItem[]

  /** 有專屬著陸頁的關鍵字與其迷因數量 */
  export const seoKeywordList: { keyword: string; count: number }[]
}
