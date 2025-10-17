import type { Theme } from 'vitepress'
import ui from '@nuxt/ui/vue-plugin'
import { createPinia } from 'pinia'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import BaseImg from '../../web/components/base-img.vue'
import DonateSection from '../../web/components/donate-section.vue'
import './style.css'
import './tailwind.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      'doc-footer-before': () => h(DonateSection),
    })
  },
  enhanceApp({ app, router, siteData }) {
    app.component('BaseImg', BaseImg)
    app.use(createPinia())
    app.use(ui)
  },
} satisfies Theme
