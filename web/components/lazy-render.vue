<script setup lang="ts">
import { useIntersectionObserver, useRafFn, useResizeObserver } from '@vueuse/core'
import { computed, ref } from 'vue'

interface Props {
  /** IntersectionObserver 提前載入邊距 */
  rootMargin?: string;
}

const props = withDefaults(defineProps<Props>(), {
  rootMargin: '200px',
})

const containerRef = ref<HTMLElement | null>(null)
const isVisible = ref(true)
const contentHeight = ref(0)
const isReady = ref(false)

/** 只在可見時才觀察 resize，不可見時傳 null 停止觀察 */
const resizeTarget = computed(() => isVisible.value ? containerRef.value : null)

/** 輪詢 slot 內容高度，直到 > 0 才視為載入完成 */
const { pause: pauseRaf } = useRafFn(() => {
  const element = containerRef.value
  if (!element)
    return

  const height = element.offsetHeight
  if (height > 0) {
    contentHeight.value = height
    isReady.value = true
    pauseRaf()
  }
})

useIntersectionObserver(
  containerRef,
  ([entry]) => {
    if (!entry || !isReady.value)
      return
    isVisible.value = entry.isIntersecting
  },
  { rootMargin: props.rootMargin },
)

useResizeObserver(resizeTarget, ([entry]) => {
  if (!entry)
    return
  const height = entry.contentRect.height
  if (height > 0) {
    contentHeight.value = height
  }
})
</script>

<template>
  <div
    ref="containerRef"
    :style="!isVisible && isReady
      ? { minHeight: `${contentHeight}px` }
      : undefined"
  >
    <slot v-if="isVisible" />
  </div>
</template>
