<template>
  <polygon
    v-bind="graphAttrs"
    fill="#777"
  />
</template>

<script setup lang="ts">
import { usePrevious } from '@vueuse/core'
import { computed, inject } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { resolveTransitionParamValue } from '../../../utils'
import { baseDialogInjectionKey } from '../type'

interface Props {
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 260,
})

const dialogProvider = inject(baseDialogInjectionKey)
if (!dialogProvider) {
  throw new Error('dialogProvider is not provided')
}
const { status } = dialogProvider

const pStatus = usePrevious(
  status,
  ComponentStatus.HIDDEN,
)

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  opacity: number;
  width: number;
}

const offset = 6
const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
    const { svgSize } = props

    if (status.value === 'hidden') {
      const y = svgSize.height / 2
      const width = 10
      return {
        x1: svgSize.width / 2 + width / 2,
        y1: y - 50,
        y2: y + 50,
        width,
        opacity: 0,
      }
    }

    if (status.value === 'hover') {
      return {
        x1: -offset + 2,
        y1: 0,
        y2: svgSize.height,
        width: 10,
        opacity: 1,
      }
    }

    return {
      x1: -offset,
      y1: 0,
      y2: svgSize.height,
      width: 10,
      opacity: 1,
    }
  }),
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hidden-visible': {
          x1: props.duration * 0.8,
          y1: props.duration * 1.8,
          y2: props.duration * 1.8,
        },
        'hidden': {
          y1: props.duration,
          y2: props.duration,
          opacity: props.duration * 0.8,
        },
      },
    ),
    duration: props.duration,
    ease: (key) => key === 'opacity' ? 'outBounce' : 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => status.value,
  },
)

const graphAttrs = computed(() => {
  const { x1, width, y1, y2 } = graphParams
  const height = y2 - y1

  return {
    points: [
      // 左上
      `${x1 - width},${y1}`,
      // 右上
      `${x1},${y1}`,
      // 右下
      `${x1},${y1 + height}`,
      // 左下
      `${x1 - width},${y1 + height}`,
      `${x1 - width},${y1 + height - 5}`,
      `${x1 - width + 2},${y1 + height - 10}`,

      `${x1 - width + 2},${y1 + height - height / 4}`,
      `${x1 - width},${y1 + height - height / 4 - 5}`,
      `${x1 - width},${y1 + height / 4}`,
      `${x1 - width + 2},${y1 + height / 4 - 5}`,

      // 左上凹槽
      `${x1 - width + 2},${y1 + 20}`,
      `${x1 - width + 2},${y1 + 15}`,
      `${x1 - width + 4},${y1 + 10}`,
      `${x1 - width},${y1 + 5}`,
    ].join(' '),
    opacity: graphParams.opacity,
  }
})
</script>

<style scoped lang="sass">
</style>
