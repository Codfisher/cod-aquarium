import type { Theme } from 'vitepress'
import messages from '@intlify/unplugin-vue-i18n/messages'
import ui from '@nuxt/ui/vue-plugin'
import { createPinia } from 'pinia'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import { createI18n } from 'vue-i18n'
import BaseImg from '../../web/components/base-img.vue'
// import VConsole from 'vconsole'
import Layout from './layout.vue'
import '../ssr-guard'
import './style.css'
import './tailwind.css'

// const vConsole = new VConsole()

const i18n = createI18n({
  legacy: false,
  locale: 'zh-hant',
  fallbackLocale: 'zh-hant',
  messages,
})

export default {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp({ app, router, siteData }) {
    app.component('BaseImg', BaseImg)
    app.use(createPinia())
    app.use(i18n)

    // 避免因為使用 window 導致 SSR 錯誤
    if (!import.meta.env.SSR) {
      app.use(ui)
    }
  },
} satisfies Theme
