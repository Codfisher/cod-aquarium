<template>
  <div class=" w-screen h-screen flex flex-col items-start p-4 gap-4">
    <hexagon-layout class="  w-full h-full pb-10">
      <desktop-item
        v-for="item, i in itemList"
        :key="item.label"
        v-bind="item"
        :label="`0${i} ${item.label}`"
        :label-left="i % 2 === 0"
        :delay="(i + 1) * 100"
      />
    </hexagon-layout>

    <cursor-futuristic />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import BaseWindow from './components/base-window/base-window.vue'
import DesktopItem from './components/desktop-item/desktop-item.vue'
import HexagonLayout from './components/hexagon-layout.vue'
import CursorFuturistic from './components/cursor-futuristic/cursor-futuristic.vue'

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

const itemList = [
  {
    label: '應用程式',
    subLabel: 'Applications',
    icon: 'mobile_layout',
  },
  {
    label: '作品集',
    subLabel: 'Portfolio',
    icon: 'wall_art',
  },
  {
    label: '相簿',
    subLabel: 'Album',
    icon: 'photo_auto_merge',
  },
  {
    label: '部落格',
    subLabel: 'Blog',
    icon: 'article_person',
  },
  {
    label: '設定',
    subLabel: 'Settings',
    icon: 'settings_slow_motion',
  },
]
</script>

<style lang="sass">
.font-orbitron
  font-family: "Orbitron", sans-serif
</style>
