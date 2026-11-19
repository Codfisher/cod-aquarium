import { useData } from '#vp'
import { useHead } from 'nuxt/app'
import { computed } from 'vue'
import { createTitle } from './shared'

/** 每頁的 <title> 與 description，規則同 VitePress：
 * - 標題依 createTitle 組成「頁面標題 | 站名」
 * - 描述取頁面 description，沒有則用站台描述
 *
 * 標題已含站名，nuxt-seo-utils 的 titleTemplate（%s %separator %siteName）須維持關閉（nuxt.config 的 seo.automaticDefaults），
 * 否則站名會重複。canonical、Open Graph、JSON-LD 等其餘 head 只在 SSR 輸出，見 app/plugins/site-seo.server.ts
 */
export function usePageHead() {
  const { site, page } = useData()

  useHead({
    title: computed(() => createTitle(site.value, page.value)),
    meta: [
      {
        name: 'description',
        content: computed(() => page.value.description || site.value.description),
      },
    ],
  })
}
