<template>
  <u-app
    :toaster="{
      ui: {
        base: 'chamfer-2 chamfer-border-0.25 bg-gray-200',
      },
    }"
  >
    <div class="fixed w-dvw h-dvh m-0 bg-black">
      <main-scene
        class="w-full h-full"
      />

      <div class="absolute bottom-0 right-0 p-1 text-xs text-white">
        v{{ version }}
      </div>
    </div>
  </u-app>
</template>

<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { version } from './constants'
import MainScene from './domains/scene/main-scene.vue'

const colorMode = useColorMode()
colorMode.value = 'light'
</script>
