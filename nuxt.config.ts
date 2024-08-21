import colors from 'tailwindcss/colors'

export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',
  nitro: {
    prerender: {
      autoSubfolderIndex: false
    }
  },
  modules: [
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    'nuxt-gtag',
    "@nuxtjs/sitemap"
  ],
  css: [
    '/styles/main.sass',
  ],
  compatibilityDate: '2024-08-08',

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