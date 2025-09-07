<template>
  <div
    ref="containerRef"
    class="container absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <!-- <corner-brackets v-bind="frameParams" /> -->

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
import { sample } from 'remeda'
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
  width: number;
  height: number;
  /** 倒角 */
  chamfer: number;
  rotate: number;
  opacity: number;
}

const delayMap: Partial<Record<
  `${ComponentStatus}-${ComponentStatus}`,
  Partial<Record<keyof GraphParams, number>>
>> = {
  'hidden-visible': {
    width: props.duration,
    height: props.duration,
    chamfer: props.duration,
  },
}

const maxRotate = sample([45, 135, -45, -135], 1)[0] ?? 45
const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    const { width, height } = containerSize

    if (status.value === 'visible') {
      return {
        width,
        height,
        chamfer: 10,
        rotate: maxRotate,
        opacity: 1,
      }
    }

    if (status.value === 'hover') {
      return {
        width,
        height,
        chamfer: 10,
        rotate: maxRotate,
        opacity: 0.9,
      }
    }

    return {
      width: 10,
      height: 10,
      chamfer: 5,
      rotate: maxRotate - 45,
      opacity: 0,
    }
  },
  {
    delay: (fieldKey) => {
      const key = `${pStatus.value}-${status.value}` as const
      return delayMap[key]?.[fieldKey] ?? 0
    },
    duration: props.duration,
    ease: (fieldKey) => fieldKey === 'opacity'
      ? 'outBounce'
      : 'inOutQuint',
  },
)

const graphAttrs = computed(() => {
  const { opacity, rotate, chamfer } = graphParams
  const hChamfer = chamfer / 2
  const [x, y, width, height] = [
    containerSize.width / 2,
    containerSize.height / 2,
    graphParams.width / 2,
    graphParams.height / 2,
  ]

  return {
    points: [
      `${x - width},${y - height + chamfer}`,
      `${x - width + chamfer},${y - height}`,
      `${x + width - chamfer},${y - height}`,
      `${x + width - chamfer},${y - height}`,
      `${x + width - hChamfer},${y - height + hChamfer}`,
      `${x + width - hChamfer},${y}`,
      `${x + width},${y + hChamfer}`,
      `${x + width},${y + height - hChamfer}`,
      `${x + width - hChamfer},${y + height}`,
      `${x - width + chamfer},${y + height}`,
      `${x - width},${y + height - chamfer}`,
    ].join(' '),
    transform: `rotate(${rotate}, ${x}, ${y})`,
    opacity,
  }
})
</script>

<style scoped lang="sass">
.container
  transform-style: preserve-3d
</style>
