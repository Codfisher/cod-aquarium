export default defineNuxtConfig({
  extends: '@nuxt-themes/docus',

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2024-08-08',
  modules: ["@nuxt/image"]
})