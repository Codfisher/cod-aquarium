<template>
  <client-only>
    <div
      class="cyber-scales-desktop w-screen h-screen flex justify-center items-center p-4 gap-4"
      @click.self="handleClick"
    >
      <template v-if="!isFontLoading && !isMobile">
        <hexagon-layout
          v-if="!isLoading"
          class="pb-10"
          size-selector=".icon"
        >
          <desktop-item
            v-for="item, i in itemList"
            :key="item.label"
            v-bind="item"
            :label="`0${i} ${item.label}`"
            :label-left="i % 2 === 0"
            :delay="(i + 1) * 150"
          />
        </hexagon-layout>

        <transition
          name="opacity"
          appear
        >
          <div
            v-if="isLoading"
            class=" fixed inset-0 z-50 flex justify-center items-center text-2xl font-orbitron opacity-90 tracking-widest"
          >
            Loading...
          </div>
        </transition>
      </template>

      <div
        v-if="isMobile"
        class=" fixed inset-0 z-50 flex justify-center items-center text-xl opacity-70 text-center leading-10"
      >
        此專案暫時不支援手機版<br>請使用電腦版瀏覽 ◝( •ω• )◟
      </div>

      <window-container />

      <cursor-futuristic class="z-[99999]" />
    </div>
  </client-only>
</template>

<script setup lang="ts">
import { promiseTimeout, useAsyncState, useColorMode, useWindowSize } from '@vueuse/core'
import { useData } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import { usePageNoScroll } from '../../../web/composables/use-page-no-scroll'
import CursorFuturistic from './components/cursor-futuristic/cursor-futuristic.vue'
import DesktopItem from './components/desktop-item/desktop-item.vue'
import HexagonLayout from './components/hexagon-layout.vue'
import WindowContainer from './components/window-container.vue'
import { useAppStore } from './stores/app-store'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

const windowSize = reactive(useWindowSize())

// 載入字體
const fontHref = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Orbitron:wght@400..900'
let linkEl: HTMLLinkElement
onMounted(() => {
  // 已經有同樣的 link 就不要重複
  const existed = Array.from(document.head.querySelectorAll('link'))
    .find((link) => link.getAttribute('href') === fontHref)
  if (existed)
    return

  linkEl = document.createElement('link')
  linkEl.rel = 'stylesheet'
  linkEl.href = fontHref
  document.head.appendChild(linkEl)
})

onBeforeUnmount(() => {
  if (linkEl)
    document.head.removeChild(linkEl)
})

const appStore = useAppStore()

const itemList = [
  {
    label: '關於',
    subLabel: 'About',
    icon: 'contact_support',
    onclick() {
      appStore.open('about')
    },
  },
  {
    label: '應用程式',
    subLabel: 'Applications',
    icon: 'mobile_layout',
    onclick() {
      appStore.open('center')
    },
  },
  // {
  //   label: '作品集',
  //   subLabel: 'Portfolio',
  //   icon: 'wall_art',
  //   onclick() {
  //     appStore.open('portfolio')
  //   },
  // },
  // {
  //   label: '相簿',
  //   subLabel: 'Album',
  //   icon: 'photo_auto_merge',
  // },
  {
    label: '部落格',
    subLabel: 'Blog',
    icon: 'article_person',
    onclick() {
      open('/article-overview', '_blank')
    },
  },
]

function handleClick() {
  appStore.focus()
}

const {
  isLoading: isAssetLoading,
  execute: loadTime,
} = useAsyncState(async () => {
  await nextFrame()
  await promiseTimeout(2000)
}, undefined, {
  immediate: false,
})

const { isLoading: isFontLoading } = useAsyncState(async () => {
  await nextFrame()
  await document.fonts.ready
}, undefined, {
  onSuccess() {
    loadTime()
  },
})

const isMobile = computed(() => windowSize.width < 640)

const isLoading = computed(() => isFontLoading.value || isAssetLoading.value)

usePageNoScroll()
</script>

<style lang="sass">
.font-orbitron
  font-family: "Orbitron", sans-serif

.cyber-scales-desktop
  ::-webkit-scrollbar-thumb
    background-color: #e7e7e7

.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.4s
  &-enter-from, &-leave-to
    opacity: 0 !important
</style>
