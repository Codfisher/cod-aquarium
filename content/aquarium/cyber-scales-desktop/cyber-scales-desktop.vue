<template>
  <div
    class="cyber-scales-desktop w-screen h-screen flex justify-center items-center p-4 gap-4"
    @click.self="handleClick"
  >
    <hexagon-layout
      class="pb-10"
      size-selector=".icon"
    >
      <desktop-item
        v-for="item, i in itemList"
        :key="item.label"
        v-bind="item"
        :label="`0${i} ${item.label}`"
        :label-left="i % 2 === 0"
        :delay="(i + 1) * 100"
      />
    </hexagon-layout>

    <window-container />

    <cursor-futuristic class="z-[99999]" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import CursorFuturistic from './components/cursor-futuristic/cursor-futuristic.vue'
import DesktopItem from './components/desktop-item/desktop-item.vue'
import HexagonLayout from './components/hexagon-layout.vue'
import WindowContainer from './components/window-container.vue'
import { useAppStore } from './stores/app-store'

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
  {
    label: '作品集',
    subLabel: 'Portfolio',
    icon: 'wall_art',
    onclick() {
      appStore.open('portfolio')
    },
  },
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
      window.open('/article-overview', '_blank')
    },
  },
]

function handleClick() {
  appStore.focus()
}
</script>

<style lang="sass">
.font-orbitron
  font-family: "Orbitron", sans-serif

.cyber-scales-desktop
  ::-webkit-scrollbar-thumb
    background-color: #e7e7e7
</style>
