import { defineNuxtPlugin } from 'nuxt/app'
import { createPinia } from 'pinia'
import { defineAsyncComponent, hydrateOnVisible } from 'vue'
import MailLink from '../../web/components/mail-link.vue'
import MermaidDiagram from '../../web/components/mermaid-diagram.vue'
import StackBlitzEmbed from '../../web/components/stackblitz-embed.vue'
import TermTip from '../../web/components/term-tip.vue'
import ThemeImage from '../../web/components/theme-image.vue'
import YoutubeFacade from '../../web/components/youtube-facade.vue'
import VPBadge from '../theme/components/VPBadge.vue'

/** md 編譯出的 Vue 元件不經 Nuxt 的元件自動匯入，文章內直接使用的元件在此全域註冊。
 *
 * Nuxt UI 由 @nuxt/ui 模組提供，不需再 app.use
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { vueApp } = nuxtApp

  // md 圖片轉成的元件（見 site/plugins/markdown-it-theme-image.ts）
  vueApp.component('ThemeImage', ThemeImage)
  // 站長信箱連結：HTML 不含明文信箱，避免 Cloudflare 注入 email-decode.min.js
  vueApp.component('MailLink', MailLink)
  vueApp.component('StackBlitzEmbed', StackBlitzEmbed)
  vueApp.component('TermTip', TermTip)
  vueApp.component('MermaidDiagram', MermaidDiagram)
  // 首頁作品影片：先顯示縮圖，點了才載入 YouTube 播放器
  vueApp.component('YoutubeFacade', YoutubeFacade)
  // 首頁專用元件：只在 index.md 用到，拆 chunk 不進其他頁面
  vueApp.component('HomeLatestPlates', defineAsyncComponent(() => import('../../web/components/home-latest-plates.vue')))
  vueApp.component('HomeTopicList', defineAsyncComponent(() => import('../../web/components/home-topic-list.vue')))
  // 作品區的連結按鈕：純連結沒有互動，不需要急著 hydrate
  vueApp.component('WorkLink', defineAsyncComponent({
    loader: () => import('../../web/components/work-link.vue'),
    hydrate: hydrateOnVisible({ rootMargin: '400px' }),
  }))
  // 出版書籍與鐵人賽在首屏之外，捲到附近才 hydrate
  vueApp.component('HomeBookList', defineAsyncComponent({
    loader: () => import('../../web/components/home-book-list.vue'),
    hydrate: hydrateOnVisible({ rootMargin: '400px' }),
  }))
  vueApp.component('HomeIronmanList', defineAsyncComponent({
    loader: () => import('../../web/components/home-ironman-list.vue'),
    hydrate: hydrateOnVisible({ rootMargin: '400px' }),
  }))
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
