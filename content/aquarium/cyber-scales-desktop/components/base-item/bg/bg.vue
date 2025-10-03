<template>
  <div
    ref="containerRef"
    class="bg absolute inset-0 w-full h-full pointer-events-none"
  >
    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <polygon
        v-bind="graphAttrs"
        fill="#888"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { EaseString } from '../../../../../../composables/use-animatable'
import { useElementSize, usePrevious } from '@vueuse/core'
import { sample } from 'remeda'
import { computed, inject, reactive, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { resolveTransitionParamValue } from '../../../utils'
import { baseItemInjectionKey } from '../type'

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 260,
})

const mainProvider = inject(baseItemInjectionKey)
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
  opacity: number;
}

const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    const { width, height } = containerSize

    if (status.value === ComponentStatus.HIDDEN) {
      return {
        width: 5,
        height,
        chamfer: 2,
        opacity: 0,
      }
    }

    if (status.value === ComponentStatus.HOVER) {
      return {
        width,
        height,
        chamfer: 10,
        opacity: 0.6,
      }
    }

    if (status.value === ComponentStatus.ACTIVE) {
      return {
        width: width - 2,
        height: height - 2,
        chamfer: 10,
        opacity: 0.9,
      }
    }

    return {
      width,
      height,
      chamfer: 10,
      opacity: 1,
    }
  },
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hidden-visible': {
          width: props.duration * 1.6,
          height: props.duration,
          chamfer: props.duration * 1.6,
        },
      },
    ),
    duration: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: props.duration,
      },
      {
        active: 50,
      },
    ),
    ease: (fieldKey) => {
      if (fieldKey === 'opacity') {
        return 'outBounce'
      }

      return resolveTransitionParamValue<GraphParams, EaseString>(
        {
          status: status.value,
          pStatus: pStatus.value,
          fieldKey,
          defaultValue: 'inOutQuint',
        },
        {
          visible: 'inOutQuint',
          hover: 'outBounce',
        },
      )
    },
    animationTriggerBy: status,
  },
)

const graphAttrs = computed(() => {
  const { opacity, chamfer } = graphParams
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
      `${x + width - hChamfer},${y - height}`,
      `${x + width},${y - height + hChamfer}`,
      `${x + width},${y}`,
      `${x + width + hChamfer},${y + hChamfer}`,
      `${x + width + hChamfer},${y + height - hChamfer}`,
      `${x + width},${y + height}`,
      `${x - width + chamfer},${y + height}`,
      `${x - width},${y + height - chamfer}`,
    ].join(' '),
    opacity,
  }
})
</script>

<style scoped lang="sass">
.bg
  transform-style: preserve-3d
</style>
