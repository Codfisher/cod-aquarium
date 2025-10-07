<template>
  <div
    ref="containerRef"
    class="container absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
      :style="{ transform: 'translateZ(-100px)' }"
    >
      <outline-frame v-bind="frameParams" />
    </svg>

    <svg
      class="absolute select-none"
      v-bind="svgAttrs"
    >
      <right-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentStatus } from '../../../types'
import { useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import LeftFrame from './left-frame.vue'
import OutlineFrame from './outline-frame.vue'
import RightFrame from './right-frame.vue'

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
.container
  transform-style: preserve-3d
</style>
