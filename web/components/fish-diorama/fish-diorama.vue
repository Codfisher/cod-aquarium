<template>
  <section
    v-if="!hasFailed"
    ref="sectionRef"
    class="fish-diorama relative w-full overflow-hidden select-none"
    aria-label="鱈魚箱庭互動場景：點擊沙地讓鱈魚跳過去"
  >
    <canvas
      ref="canvasRef"
      class="diorama-canvas block h-full w-full"
      :class="{ 'is-ready': isReady }"
    />

    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
      <transition
        name="text"
        mode="out-in"
      >
        <span
          :key="hintText"
          class="hint-text text-sm tracking-wide"
        >
          {{ hintText }}
        </span>
      </transition>

      <svg
        class="hint-arrow w-5 h-5 animate-bounce"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DioramaSceneHandle } from './diorama-scene'
import {
  useIntersectionObserver,
  usePreferredReducedMotion,
  useResizeObserver,
  useWindowFocus,
} from '@vueuse/core'
import { useData } from 'vitepress'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

const sectionRef = useTemplateRef('sectionRef')
const canvasRef = useTemplateRef('canvasRef')

const { isDark } = useData()
const isFocused = useWindowFocus()
const reducedMotionPreference = usePreferredReducedMotion()

const isReady = ref(false)
const hasFailed = ref(false)

/** Babylon 場景控制器。非響應式資料，不放進 ref */
let dioramaHandle: DioramaSceneHandle | undefined

const visible = ref(false)
useIntersectionObserver(sectionRef, ([entry]) => {
  visible.value = entry?.isIntersecting || false
})

const shouldRun = computed(() => (
  isReady.value && visible.value && isFocused.value
))

const hintText = computed(() => {
  if (!isReady.value) {
    return '正在佈置魚缸...(´,,•ω•,,)'
  }
  return '點沙地叫鱈魚過去 (ゝ∀・)b'
})

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  try {
    // Babylon 相關模組延後到瀏覽器端才載入，避免佔用首屏 bundle
    const { createDioramaScene } = await import('./diorama-scene')

    dioramaHandle = createDioramaScene(canvas, {
      isDark: isDark.value,
      isReducedMotion: reducedMotionPreference.value === 'reduce',
    })
    dioramaHandle.resize()
    isReady.value = true
  }
  catch (error) {
    // WebGL 不可用或載入失敗：收起整個箱庭，首頁維持原樣
    console.error('[fish-diorama] 場景初始化失敗', error)
    hasFailed.value = true
  }
})

watch(shouldRun, (value) => {
  dioramaHandle?.setRunning(value)
})

watch(isDark, (value) => {
  dioramaHandle?.setDarkMode(value)
})

watch(reducedMotionPreference, (value) => {
  dioramaHandle?.setReducedMotion(value === 'reduce')
})

useResizeObserver(sectionRef, () => {
  dioramaHandle?.resize()
})

onUnmounted(() => {
  dioramaHandle?.dispose()
  dioramaHandle = undefined
})
</script>

<style scoped lang="sass">
.fish-diorama
  // 手機版導覽列佔版面高度，扣掉才剛好一屏；桌機導覽列為 fixed 覆蓋，用整屏
  height: calc(100vh - var(--vp-nav-height))
  height: calc(100dvh - var(--vp-nav-height))
  background: linear-gradient(180deg, light-dark(oklch(0.97 0.015 195), oklch(0.26 0.03 220)) 0%, light-dark(oklch(0.93 0.03 180), oklch(0.22 0.035 205)) 55%, light-dark(oklch(0.9 0.045 170), oklch(0.19 0.04 195)) 100%)

  @media (min-width: 960px)
    height: 100vh
    height: 100dvh

.diorama-canvas
  opacity: 0
  transition: opacity 0.8s ease
  cursor: pointer
  touch-action: pan-y
  -webkit-tap-highlight-color: transparent
  outline: none

  &.is-ready
    opacity: 1

.hint-text, .hint-arrow
  color: light-dark(oklch(0.45 0.06 175), oklch(0.85 0.05 175))
  opacity: 0.75

.text
  &-enter-active, &-leave-active
    transition: opacity 0.4s, transform 0.4s
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(6px)
</style>
