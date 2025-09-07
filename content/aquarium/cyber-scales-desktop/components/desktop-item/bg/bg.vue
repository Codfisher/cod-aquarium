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

      <polygon
        v-bind="graphAttrs"
        fill="#777"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { useElementSize, usePrevious } from '@vueuse/core'
import { computed, inject, reactive, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { desktopItemInjectionKey } from '../type'
import CornerBrackets from './corner-brackets.vue'

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 260,
})

const mainProvider = inject(desktopItemInjectionKey)
if (!mainProvider) {
  throw new Error('mainProvider is not provided')
}
const { status } = mainProvider
const pStatus = usePrevious(status, ComponentStatus.HIDDEN)

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

interface GraphParams {
  opacity: number;
}
const chamfer = 20

const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    if (status.value === 'visible') {
      return {
        opacity: 0.4,
      }
    }

    if (status.value === 'hover') {
      return {
        opacity: 0.8,
      }
    }

    return {
      opacity: 0,
    }
  },
  {
    // delay: (fieldKey) => {
    //   const key = `${pStatus.value}-${status.value}` as const
    //   return delayMap[key]?.[fieldKey] ?? 0
    // },
    duration: props.duration,
    ease: (fieldKey) => fieldKey === 'opacity'
      ? 'outBounce'
      : 'inOutQuint',
  },
)

const graphAttrs = computed(() => {
  const { width, height } = containerSize

  return {
    points: [
      `0,0`,
      `${width},0`,
      `${width},${height}`,
      `0,${height}`,
    ].join(' '),
    transform: `rotate(45, ${width / 2}, ${height / 2})`,
    opacity: 1,
  }
})
</script>

<style scoped lang="sass">
.container
  transform-style: preserve-3d
</style>
