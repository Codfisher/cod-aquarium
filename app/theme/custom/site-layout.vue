<script setup lang="ts">
import { onContentUpdated } from '#vp'
import { useDebounceFn } from '@vueuse/core'
import { useNuxtApp } from 'nuxt/app'
import { defineAsyncComponent, hydrateOnVisible, onUnmounted } from 'vue'
import Layout from '../Layout.vue'
import { useSidebarScrollbarFade } from './use-sidebar-scrollbar-fade'
/** 站台自訂樣式要排在主題元件樣式之後，同權重的選擇器才會覆寫成功（與 VitePress 自訂主題的載入順序相同），
 * 所以不放 nuxt.config 的全域 css，改在匯入主題之後匯入
 */
import '../../assets/css/style.css'

/** 贊助區在文末，捲到附近才 hydration */
const DonateSection = defineAsyncComponent({
  loader: () => import('../../../web/components/donate-section.vue'),
  hydrate: hydrateOnVisible({ rootMargin: '300px' }),
})

/** 模板規範要求 kebab-case 元件名，取別名使用 */
const DefaultLayout = Layout

useSidebarScrollbarFade()

/** 非同步元件載入後重新定位錨點 */
let resizeObserver: ResizeObserver | undefined
let stopTimer: ReturnType<typeof setTimeout> | undefined

function scrollToHash() {
  const hash = location.hash
  if (!hash)
    return

  let target: HTMLElement | null = null
  try {
    target = document.getElementById(decodeURIComponent(hash).slice(1))
  }
  catch {
    return
  }
  target?.scrollIntoView({
    behavior: 'instant',
    block: 'center',
    inline: 'center',
  })
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

  /** 使用者一主動捲動就停止：內文有 content-visibility，捲動時畫面外區塊陸續渲染、高度改變，
   * 若繼續監看會把正在閱讀的人拉回錨點
   */
  for (const eventName of USER_SCROLL_EVENT_LIST)
    window.addEventListener(eventName, stopObserving, { once: true, passive: true })
}

const USER_SCROLL_EVENT_LIST = ['wheel', 'touchmove', 'keydown'] as const

function stopObserving() {
  for (const eventName of USER_SCROLL_EVENT_LIST)
    window.removeEventListener(eventName, stopObserving)
  resizeObserver?.disconnect()
  resizeObserver = undefined
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = undefined
  }
}

/** 首次載入與每次換頁內容渲染後都重新監看，.vp-doc 會隨換頁重建 */
onContentUpdated(startObserving)

/** 帶 hash 直接開預先渲染頁時，Nuxt 在 hydration 期間會暫時拿掉網址的 hash，
 * 上面那次啟動讀不到 hash 而直接略過；網址在 suspense 解析後還原，這時再啟動一次
 */
const stopSuspenseHook = import.meta.client ? useNuxtApp().hook('app:suspense:resolve', startObserving) : undefined

onUnmounted(() => {
  stopObserving()
  stopSuspenseHook?.()
})
</script>

<template>
  <default-layout>
    <template #doc-footer-before>
      <donate-section />
    </template>
  </default-layout>
</template>
