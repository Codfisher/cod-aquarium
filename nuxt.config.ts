import colors from 'tailwindcss/colors'

export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',
  modules: [
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    'nuxt-gtag',
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
    '/blog-ocean-world/**': { prerender: true },
    '/blog-program/**': { prerender: true },
    '/blog-vue/**': { prerender: true },
  },
  compatibilityDate: '2024-08-08',

  app: {
    head: {
      htmlAttrs: {
        lang: 'zh-hant',
      }
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