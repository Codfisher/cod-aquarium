export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',

  compatibilityDate: '2024-08-08',
  modules: ['@vueuse/nuxt', '@nuxtjs/tailwindcss', '@nuxt/image'],

  css: [
    '/styles/main.sass',
  ],
})