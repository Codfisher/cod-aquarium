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
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

const windowProvider = inject(baseDialogInjectionKey)
if (!windowProvider) {
  throw new Error('windowProvider is not provided')
}

const pStatus = usePrevious(
  windowProvider.status,
  ComponentStatus.HIDDEN,
)

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  width: number;
  opacity: number;
}

const offset = 6

const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
    const { svgSize } = props

    if (props.status === 'hidden') {
      return {
        x1: offset * 2 + svgSize.width,
        y1: 0,
        y2: svgSize.height,
        width: 0,
        opacity: 0,
      }
    }
    return {
      x1: offset + svgSize.width,
      y1: 0,
      y2: svgSize.height,
      width: 12,
      opacity: 1,
    }
  }),
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hover': props.duration * 0.6,
        'active': props.duration * 0.5,
        'hidden-visible': {
          x1: props.duration * 2.5,
          y1: props.duration * 2.5,
          y2: props.duration * 2.5,
          width: props.duration * 2.5,
        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const graphAttrs = computed(() => {
  const { width, opacity, x1, y1, y2 } = graphParams
  const height = y2 - y1

  return {
    points: [
      // 左上
      `${x1},0`,

      // 右上倒角
      `${x1 + width - 6}, 0`,
      `${x1 + width}, 6`,

      // 右側缺角
      `${x1 + width},${height / 8} `,
      `${x1 + width - 2},${height / 8} `,
      `${x1 + width - 2},${height / 8 + 2} `,
      `${x1 + width},${height / 8 + 2} `,

      // 右下
      `${x1 + width},${height - 5} `,
      `${x1 + width - width / 2},${height - 5} `,
      `${x1 + width - width / 2 - 2},${height} `,

      // 左下
      `${x1 + 5},${height} `,
      `${x1},${height} `,

      // 左凹槽
      `${x1},${height - height / 4} `,
      `${x1 + 2},${height - height / 4 - 5} `,
      `${x1 + 2},${height / 4 - 5} `,
      `${x1},${height / 4 - 10} `,
    ].join(' '),
    opacity,
  }
})
</script>

<style scoped lang="sass">
</style>
