import type { Theme } from 'vitepress'
import ui from '@nuxt/ui/vue-plugin'
import { createPinia } from 'pinia'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import BaseImg from '../../web/components/base-img.vue'
import StackBlitzEmbed from '../../web/components/stackblitz-embed.vue'
// import VConsole from 'vconsole'
import Layout from './layout.vue'
import '../ssr-guard'
import './style.css'
import './tailwind.css'

// const vConsole = new VConsole()

export default {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp({ app, router, siteData }) {
    app.component('BaseImg', BaseImg)
    app.component('StackBlitzEmbed', StackBlitzEmbed)
    app.use(createPinia())

    // 避免因為使用 window 導致 SSR 錯誤
    if (!import.meta.env.SSR) {
      app.use(ui)
    }
  },
} satisfies Theme
