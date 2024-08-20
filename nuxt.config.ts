import colors from 'tailwindcss/colors'

export default defineNuxtConfig({
  nitro: {
    prerender: {
      autoSubfolderIndex: false
    }
  },

  extends: '@nuxt-themes/docus',

  compatibilityDate: '2024-08-08',
  modules: [
    '@vueuse/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    'nuxt-gtag',
  ],

  css: [
    '/styles/main.sass',
  ],

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
    }
  },
})