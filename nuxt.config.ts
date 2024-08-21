import colors from 'tailwindcss/colors'

export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',
  modules: [
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    'nuxt-gtag',
    "@nuxtjs/google-fonts"
  ],
  css: [
    '/styles/main.sass',
  ],
  nitro: {
    prerender: {
      ignore: ['/article-overview'],
      crawlLinks: true,
    }
  },
  routeRules: {
    '/': { prerender: true },
    '/sitemap.xml': { prerender: true },
    '/blog-ocean-world/**': { isr: true },
    '/blog-program/**': { isr: true },
    '/blog-vue/**': { isr: true },
  },
  compatibilityDate: '2024-08-08',

  app: {
    head: {
      htmlAttrs: {
        lang: 'zh-hant',
      },
    }
  },
  googleFonts: {
    families: {
      'Noto+Sans+TC': '100..900',
    }
  },
  gtag: {
    id: 'G-WL47JJHL0R'
  },
  tailwindcss: {
    config: {
      theme: {
        colors: {
          primary: colors.teal
        }
      }
    },
  },
})