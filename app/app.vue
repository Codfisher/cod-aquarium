<script setup lang="ts">
import { useData } from '#vp'
import { useHead } from 'nuxt/app'
import { computed } from 'vue'
import SiteLayout from './theme/custom/site-layout.vue'
import { usePageHead } from './theme/use-page-head'

usePageHead()

const { frontmatter } = useData()

/** layout: false 的頁面（aquarium 各 app）不套部落格版面，由 app 自己包 UApp。
 * 外層再包一層 UApp 會有兩個 Toaster，同一則 toast 會出現兩次
 */
const isStandalone = computed(() => frontmatter.value.layout === false)

/** 主題的 base.css 以 :not(:where(.vp-raw, .vp-raw *)) 排除，
 * 掛上 vp-raw 後元素重設不會蓋掉 app 內 Nuxt UI 的樣式。
 * SSR 時就輸出在 <html>，第一幀即生效
 */
useHead({
  htmlAttrs: {
    class: computed(() => isStandalone.value ? 'vp-raw' : undefined),
  },
})
</script>

<template>
  <nuxt-page v-if="isStandalone" />
  <u-app v-else>
    <site-layout />
  </u-app>
</template>
