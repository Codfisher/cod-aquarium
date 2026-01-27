<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <u-dashboard-group storage="local">
        <u-dashboard-sidebar
          resizable
          :min-size="15"
          :default-size="30"
          :max-size="40"
        >
          <file-preview-panel />
        </u-dashboard-sidebar>

        <scene-viewer class="w-full h-full" />
      </u-dashboard-group>

      <div class="font-orbitron fixed right-0 bottom-0 p-2 px-3 opacity-50">
        <span class="text-base">CodStack</span>

        <span class="ml-1 text-xs text-gray-500">
          v{{ version }}
        </span>
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import FilePreviewPanel from './components/file-preview-panel.vue'
import SceneViewer from './components/scene-viewer.vue'

const version = '0.1.0'

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
</script>

<style lang="sass" scoped>
.font-orbitron
  font-family: "Orbitron", sans-serif
</style>
