/** 站內搜尋結果左側的封面縮圖。
 *
 * 顯示 48px，取 96×96 涵蓋 2 倍高解析螢幕。縮圖由 Nuxt Image（ipx）產生，靜態輸出只會有預先渲染時用到的尺寸，
 * 所以 modules/site.ts 把每頁的縮圖網址加進 prerender 清單，VPDoc 再以同一個網址寫進 Pagefind 的 meta。
 * 兩邊共用這支函式，網址才會一致
 */
const SITE_ORIGIN = 'https://codlin.me'

export function getSearchThumbnailPath(image: unknown): string | undefined {
  if (typeof image !== 'string' || !image)
    return undefined

  const url = new URL(image, SITE_ORIGIN)
  // 外部圖片不經過 ipx
  if (url.origin !== SITE_ORIGIN)
    return undefined

  return `/_ipx/q_80&s_96x96${url.pathname}`
}
