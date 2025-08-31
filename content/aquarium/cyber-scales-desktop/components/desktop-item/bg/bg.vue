<template>
  <div
    ref="containerRef"
    class="container absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <corner-brackets v-bind="frameParams" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentStatus } from '../../../types'
import { useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import CornerBrackets from './corner-brackets.vue'

interface Props {
  status?: `${ComponentStatus}`;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
})

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const containerSize = reactive(useElementSize(containerRef))

const outset = 100
const svgAttrs = computed(() => ({
  style: {
    inset: `-${outset}px`,
  } satisfies CSSProperties,
  viewBox: [
    -outset,
    -outset,
    containerSize.width + outset * 2,
    containerSize.height + outset * 2,
  ].join(' '),
}))

const frameParams = computed(() => ({
  svgSize: containerSize,
  ...props,
}))
</script>

<style scoped lang="sass">
.container
  transform-style: preserve-3d
</style>
