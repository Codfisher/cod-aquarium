<template>
  <UApp>
    <div class="fixed w-dvw h-dvh m-0 bg-black">
      <main-scene class="w-full h-full" />

      <div class="absolute bottom-0 right-0 p-1 text-xs text-white/40 pointer-events-none">
        v{{ version }}
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { useFontLoader } from './composables/use-font-loader'
import { version } from './constants'
import MainScene from './domains/scene/main-scene.vue'

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

useFontLoader()
</script>
