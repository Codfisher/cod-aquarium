<template>
  <div
    ref="containerRef"
    class="absolute inset-0 w-full h-full pointer-events-none transform-3d"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <top-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
    </svg>

    <svg
      class="absolute -scale-100 origin-center"
      v-bind="svgAttrs"
    >
      <top-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
    </svg>

    <svg
      class="absolute"
      v-bind="svgAttrs"
      :style="{ transform: 'translateZ(10px)' }"
    >
      <corner-box v-bind="frameParams" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentStatus } from '../../../types'
import { useElementSize, useMousePressed } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import LeftFrame from './left-frame.vue'
import TopFrame from './top-frame.vue'
import CornerBox from './corner-box.vue'

interface Props {
  status?: `${ComponentStatus}`;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
})

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const svgSize = reactive(useElementSize(containerRef))

const outset = 100
const svgAttrs = computed(() => ({
  style: {
    inset: `-${outset}px`,
  } satisfies CSSProperties,
  viewBox: [
    -outset,
    -outset,
    svgSize.width + outset * 2,
    svgSize.height + outset * 2,
  ].join(' '),
}))

const frameParams = computed(() => ({
  svgSize,
  ...props,
}))
</script>

<style scoped lang="sass">
</style>
