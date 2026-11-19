<script setup lang="ts">
import { onContentUpdated } from '#vp'
import { useDebounceFn } from '@vueuse/core'
import { useNuxtApp } from 'nuxt/app'
import { onUnmounted } from 'vue'
import DonateSection from '../../../web/components/donate-section.vue'
import Layout from '../Layout.vue'
/** 站台自訂樣式要排在主題元件樣式之後，同權重的選擇器才會覆寫成功（與 VitePress 自訂主題的載入順序相同），
 * 所以不放 nuxt.config 的全域 css，改在匯入主題之後匯入
 */
import '../../assets/css/style.css'
import { useSidebarScrollbarFade } from './use-sidebar-scrollbar-fade'

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
}

function stopObserving() {
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
