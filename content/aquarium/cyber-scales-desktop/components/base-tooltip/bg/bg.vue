<template>
  <div
    ref="containerRef"
    class="transform-3d absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute select-none"
      v-bind="svgAttrs"
    >
      <corner-box v-bind="frameParams" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentStatus } from '../../../types'
import { useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef, watch } from 'vue'
import CornerBox from './corner-box.vue'

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

// watch(svgAttrs, (v) => {
//   console.log('status', props.status)
//   console.log('svgAttrs', v)
// })

const frameParams = computed(() => ({
  svgSize: containerSize,
  ...props,
}))
</script>

<style scoped lang="sass">
</style>
