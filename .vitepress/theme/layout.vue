<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { useData, useRouter } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { computed, onMounted, onUnmounted } from 'vue'
import DonateSection from '../../web/components/donate-section.vue'
import FishDiorama from '../../web/components/fish-diorama/fish-diorama.vue'

const { page } = useData()
/** 首頁頂部的 3D 箱庭 hero，只在首頁出現 */
const dioramaVisible = computed(() => page.value.relativePath === 'index.md')

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
    <template #layout-top>
      <fish-diorama v-if="dioramaVisible" />
    </template>

    <template #doc-footer-before>
      <donate-section />
    </template>
  </DefaultTheme.Layout>
</template>

<style>
/* 首頁手機版：VitePress 導覽列在窄螢幕是正常流排版，會被排在整屏箱庭 hero 之後（跑到畫面最下面）。
   把 .Layout 轉成 flex 直排、將導覽列 order 提到 hero 之前，維持在頂部。
   桌機（≥960px）導覽列本來就是 fixed 覆蓋，不受此影響。pageClass 由 index.md frontmatter 指定。 */
@media (max-width: 959px) {
  .Layout.home-diorama {
    display: flex;
    flex-direction: column;
  }

  .Layout.home-diorama > .VPNav {
    order: -1;
  }
}
</style>
