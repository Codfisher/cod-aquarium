<template>
  <u-app>
    <div class="relative w-full h-full">
      <main-scene
        ref="mainSceneRef"
        class="w-full h-full"
        :input="input"
        @ready="handleReady"
      />

      <!-- 速度儀表 -->
      <div
        class="absolute bottom-6 right-6 flex flex-col items-center gap-1 select-none"
      >
        <div class="text-white text-4xl font-bold tabular-nums drop-shadow-lg">
          {{ displaySpeed }}
        </div>
        <div class="text-white/70 text-sm drop-shadow">
          km/h
        </div>
      </div>

      <!-- 操作提示 -->
      <transition name="fade">
        <div
          v-if="showHint"
          class="absolute bottom-6 left-6 flex flex-col gap-1 text-white/80 text-sm select-none drop-shadow"
        >
          <div class="flex items-center gap-2">
            <kbd class="kbd">W</kbd>
            <span>加速</span>
          </div>
          <div class="flex items-center gap-2">
            <kbd class="kbd">S</kbd>
            <span>煞車 / 倒車</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex gap-0.5">
              <kbd class="kbd">A</kbd>
              <kbd class="kbd">D</kbd>
            </div>
            <span>轉向</span>
          </div>
        </div>
      </transition>

      <!-- 載入畫面 -->
      <transition name="fade">
        <div
          v-if="!isReady"
          class="absolute inset-0 bg-gray-900 flex items-center justify-center"
        >
          <div class="text-white text-lg">
            載入中...
          </div>
        </div>
      </transition>
    </div>
  </u-app>
</template>

<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import { useInput } from './composables/use-input'
import MainScene from './main-scene.vue'

const colorMode = useColorMode()
colorMode.value = 'light'

const { input } = useInput()

const mainSceneRef = useTemplateRef<InstanceType<typeof MainScene>>('mainSceneRef')
const isReady = ref(false)
const showHint = ref(true)

const displaySpeed = computed(() => {
  const speedValue = mainSceneRef.value?.speed ?? 0
  // linearSpeed 範圍 0~1，映射為 0~180 km/h
  return Math.round(speedValue * 180)
})

function handleReady() {
  isReady.value = true

  setTimeout(() => {
    showHint.value = false
  }, 10000)
}
</script>

<style scoped>
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.35rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 0.75rem;
  font-family: monospace;
  backdrop-filter: blur(4px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
