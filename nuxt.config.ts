import colors from 'tailwindcss/colors'

export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',
  modules: [
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    'nuxt-gtag',
    '@nuxtjs/google-fonts',
    // 會破壞 dark mode 樣式，暫時不使用
    '@nuxtjs/critters',
  ],
  css: [
    '/styles/main.sass',
  ],
  nitro: {
    prerender: {
      ignore: ['/article-overview'],
      crawlLinks: true,
    },
    compressPublicAssets: true,
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
      meta: [
        {
          name: 'author',
          content: 'Cod Lin',
        },
        {
          name: 'keywords',
          content: '鱈魚, 程式設計, 網頁設計, Vue, Nest, Full Stack',
        },
      ],
      link: [
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
      ],
    }
  },
  googleFonts: {
    families: {
      'Noto+Sans+TC': '100..900',
    }
  },
  gtag: {
    id: 'G-WL47JJHL0R',
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
  critters: {
    config: {
      pruneSource: true,
    },
  },
})