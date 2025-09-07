<template>
  <div class=" w-screen h-screen flex flex-col items-start p-4 gap-4">
    <hexagon-layout class="  w-full h-full ">
      <desktop-item
        v-for="item, i in itemList"
        :key="item.label"
        v-bind="item"
        :label-left="i % 2 === 0"
        :delay="i * 300"
      />
    </hexagon-layout>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import BaseWindow from './components/base-window/base-window.vue'
import DesktopItem from './components/desktop-item/desktop-item.vue'
import HexagonLayout from './components/hexagon-layout.vue'

// 載入字體
const fontHref = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
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
    label: '作品集',
    icon: 'folder',
  },
  {
    label: '相簿',
  },
  {
    label: '部落格',
  },
  {
    label: '設定',
    icon: 'settings_slow_motion',
  },
]
</script>

<style lang="sass" scoped>

</style>
