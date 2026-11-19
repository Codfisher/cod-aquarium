<script setup lang="ts">
import type { NuxtError } from 'nuxt/app'
import { notFoundForcedKey, notFoundPageData, useData } from '#vp'
import { useHead, useRouter } from 'nuxt/app'
import { computed, onMounted, onUnmounted, provide } from 'vue'
import SiteLayout from './theme/custom/site-layout.vue'
import { createTitle } from './theme/shared'

const props = defineProps<{
  error: NuxtError;
}>()

const isNotFound = computed(() => (props.error.status ?? props.error.statusCode) === 404)

/** 版面內的元件一律視為 404 頁，VPContent 會改渲染主題的 NotFound */
provide(notFoundForcedKey, true)

/** 離開錯誤頁一律整頁載入。
 *
 * 錯誤頁沒有掛載 NuxtPage，Nuxt 版面層讀的路由（nuxtApp._route）要等 NuxtPage 解析完才同步，
 * 在這裡走 SPA 換頁的話網址會變、畫面卻停在 404。錯誤頁很少被瀏覽，整頁載入最單純可靠
 */
const router = useRouter()
let removeGuard: (() => void) | undefined
onMounted(() => {
  removeGuard = router.beforeEach((to, from) => {
    // 只換 hash（例如點目錄錨點）不算離開
    if (to.path === from.path)
      return
    window.location.assign(to.fullPath)
    return false
  })
})
onUnmounted(() => removeGuard?.())

const { site } = useData()
useHead({
  title: computed(() => isNotFound.value
    ? createTitle(site.value, notFoundPageData)
    : createTitle(site.value, { ...notFoundPageData, title: String(props.error.status ?? 500) })),
  meta: [{ name: 'description', content: computed(() => site.value.description) }],
})
</script>

<template>
  <u-app>
    <site-layout v-if="isNotFound" />

    <div
      v-else
      class="error-fallback"
    >
      <p class="code">
        {{ error.status ?? 500 }}
      </p>
      <p class="message">
        {{ error.statusText || error.message }}
      </p>
      <a
        class="link"
        href="/"
      >回首頁</a>
    </div>
  </u-app>
</template>

<style scoped>
.error-fallback {
  padding: 96px 24px;
  text-align: center;
}

.code {
  font-size: 64px;
  font-weight: 600;
  line-height: 64px;
}

.message {
  padding: 16px 0 24px;
  color: var(--vp-c-text-2);
}

.link {
  color: var(--vp-c-brand-1);
}
</style>
