import type { Theme } from 'vitepress'
import ui from '@nuxt/ui/vue-plugin'
import { createPinia } from 'pinia'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { defineAsyncComponent, h, hydrateOnVisible } from 'vue'
import BaseImg from '../../web/components/base-img.vue'
import StackBlitzEmbed from '../../web/components/stackblitz-embed.vue'
import TermTip from '../../web/components/term-tip.vue'
// import VConsole from 'vconsole'
import Layout from './layout.vue'
import '../ssr-guard'
import './style.css'
import './tailwind.css'
import './nuxt-ui-colors.css'

// const vConsole = new VConsole()

export default {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp({ app }) {
    app.component('BaseImg', BaseImg)
    app.component('StackBlitzEmbed', StackBlitzEmbed)
    app.component('TermTip', TermTip)
    // 箱庭場景供 index.md 內嵌使用；lazy import 拆 chunk，其他頁面不載入
    // 場景位於首頁底部，捲到附近才下載並 hydrate，避免 Babylon（1 MB 以上）在首屏搶主執行緒
    app.component('FishDiorama', defineAsyncComponent({
      loader: () => import('../../web/components/fish-diorama/fish-diorama.vue'),
      hydrate: hydrateOnVisible({ rootMargin: '400px' }),
    }))
    app.use(createPinia())

    // 避免因為使用 window 導致 SSR 錯誤
    if (!import.meta.env.SSR) {
      app.use(ui)
    }
  },
} satisfies Theme
