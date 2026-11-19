import { defineNuxtPlugin } from 'nuxt/app'
import { createPinia } from 'pinia'
import { defineAsyncComponent, hydrateOnVisible } from 'vue'
import BaseImg from '../../web/components/base-img.vue'
import MermaidDiagram from '../../web/components/mermaid-diagram.vue'
import StackBlitzEmbed from '../../web/components/stackblitz-embed.vue'
import TermTip from '../../web/components/term-tip.vue'
import VPBadge from '../theme/components/VPBadge.vue'

/** md 編譯出的 Vue 元件不經 Nuxt 的元件自動匯入，文章內直接使用的元件在此全域註冊。
 *
 * Nuxt UI 由 @nuxt/ui 模組提供，不需再 app.use
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { vueApp } = nuxtApp

  vueApp.component('BaseImg', BaseImg)
  vueApp.component('StackBlitzEmbed', StackBlitzEmbed)
  vueApp.component('TermTip', TermTip)
  vueApp.component('MermaidDiagram', MermaidDiagram)
  // VitePress 預設主題會全域註冊 Badge，文章總覽的標籤沿用
  vueApp.component('Badge', VPBadge)
  // 箱庭場景供 index.md 內嵌使用；lazy import 拆 chunk，其他頁面不載入
  // 場景位於首頁底部，捲到附近才下載並 hydrate，避免 Babylon（1 MB 以上）在首屏搶主執行緒
  vueApp.component('FishDiorama', defineAsyncComponent({
    loader: () => import('../../web/components/fish-diorama/fish-diorama.vue'),
    hydrate: hydrateOnVisible({ rootMargin: '400px' }),
  }))

  // aquarium 子專案的 store 都靠全域 active pinia
  vueApp.use(createPinia())
})
