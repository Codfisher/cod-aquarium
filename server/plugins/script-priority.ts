/** 文章頁的 JS 改為低優先，讓 render-blocking 的 CSS 與封面先拿到頻寬。
 *
 * 沿用原 VitePress 設定（.vitepress/config.mts 的 transformHtml）：
 * 原本 CSS 與約 300 KB 的 modulepreload 同時下載，慢速 4G 下 CSS 要 1.7 秒才到；
 * 鏡像代理實測 FCP 2.45 → 1.57 秒、LCP 3.45 → 2.86 秒，app.js 只晚約 0.1 秒。
 * 直接拿掉 modulepreload 反而讓 LCP 變慢，不要這樣做。
 * aquarium 的畫面由 JS 繪製，LCP 取決於 JS，維持原優先權
 */
const MODULE_PRELOAD_RE = /<link(?=[^>]*\srel="modulepreload")(?![^>]*\sfetchpriority=)/g
const MODULE_SCRIPT_RE = /<script(?=[^>]*\stype="module")(?=[^>]*\ssrc=)(?![^>]*\sfetchpriority=)/g

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const urlPath = (event.path || '/').split('?')[0] ?? '/'
    if (urlPath.startsWith('/aquarium/'))
      return

    html.head = html.head.map((chunk) => chunk
      .replace(MODULE_PRELOAD_RE, '<link fetchpriority="low"')
      .replace(MODULE_SCRIPT_RE, '<script fetchpriority="low"'))
  })
})
