<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useRouter } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { onMounted, onUnmounted } from 'vue'
import DonateSection from '../../web/components/donate-section.vue'

/** 非同步元件載入後重新定位錨點 */
let resizeObserver: ResizeObserver | undefined
let stopTimer: ReturnType<typeof setTimeout> | undefined
const router = useRouter()

function scrollToHash() {
  const hash = location.hash
  if (!hash)
    return

  const target = document.querySelector(decodeURIComponent(hash))
  if (target) {
    target.scrollIntoView({
      behavior: 'instant',
      block: 'center',
      inline: 'center',
    })
  }
}

const debouncedScroll = useDebounceFn(scrollToHash, 80)

function startObserving() {
  stopObserving()

  if (!location.hash)
    return

  const container = document.querySelector('.vp-doc')
  if (!container)
    return

  resizeObserver = new ResizeObserver(() => {
    debouncedScroll()
  })
  resizeObserver.observe(container)

  // 10 秒後自動停止，非同步元件應該都載入完畢了
  stopTimer = setTimeout(stopObserving, 10_000)
}

function stopObserving() {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = undefined
  }
}

onMounted(() => {
  startObserving()
  router.onAfterRouteChanged = () => {
    startObserving()
  }
})

onUnmounted(() => {
  stopObserving()
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #doc-footer-before>
      <donate-section />
    </template>
  </DefaultTheme.Layout>
</template>
