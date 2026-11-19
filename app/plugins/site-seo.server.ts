import type { PageSeo } from '../../site/seo'
import { useSchemaOrg } from '#imports'
import seoData from '#site/seo-data'
import { defineNuxtPlugin, useHead, useRequestURL, useSeoMeta } from 'nuxt/app'

const seoMap = new Map(Object.entries(seoData.seoMap))

/** 網址查 SEO 資料，容忍尾斜線與 .html 差異（同 server/plugins/site-head.ts） */
function getPageSeo(urlPath: string): PageSeo | undefined {
  let decodedPath = urlPath
  try {
    decodedPath = decodeURI(urlPath)
  }
  catch {}

  return seoMap.get(decodedPath)
    ?? seoMap.get(decodedPath.replace(/\/$/, ''))
    ?? seoMap.get(`${decodedPath}/`)
    ?? seoMap.get(decodedPath.replace(/\.html$/, ''))
}

/** 把 build 期算好的 SEO 資料（site/seo.ts）交給 unhead 與 nuxt-schema-org，只在 SSR／prerender 輸出。
 *
 * - canonical 自己給：nuxt-seo-utils 的自動 canonical 只能全站統一尾斜線，aquarium 目錄頁要帶尾斜線
 * - JSON-LD 走 nuxt-schema-org 的 useSchemaOrg，該模組在正式環境只註冊 server 端外掛
 * - 這些標籤只給爬蟲看，client 換頁不更新，資料也不進 client bundle 或 payload
 *
 * <title> 與 meta description 由 app/theme/use-page-head.ts 負責，client 換頁會跟著更新
 */
export default defineNuxtPlugin({
  name: 'site-seo',
  setup(nuxtApp) {
    /** nuxt-site-config 的外掛在 app:rendered 把站台設定寫進 useState('site-config')，供 client 端還原。
     * 它的 client 外掛已拿掉（modules/seo.ts），這份資料只會讓每頁的 payload 多約 0.3 KB，序列化前刪除。
     * 本外掛晚於它註冊，hook 依註冊順序執行，刪除時資料已寫入
     */
    // dev 時 client 仍有 site-config 外掛要讀這份資料（見 modules/seo.ts），只在正式建置刪除
    if (!import.meta.dev) {
      nuxtApp.hooks.hook('app:rendered', () => {
        delete nuxtApp.payload.state['$ssite-config']
      })
    }

    const pageSeo = getPageSeo(useRequestURL().pathname)
    if (!pageSeo)
      return

    useHead({
      link: [{ rel: 'canonical', href: pageSeo.canonicalUrl }],
    })
    useSeoMeta(pageSeo.seoMeta)

    if (pageSeo.schemaNodeList.length)
      useSchemaOrg(pageSeo.schemaNodeList)
  },
})
