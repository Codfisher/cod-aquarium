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
      const y = svgSize.height / 2
      const width = 12
      return {
        x1: svgSize.width / 2 - width / 2,
        y1: y - 50,
        y2: y + 50,
        width,
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
        visible: {
          x1: props.duration * 0.8,
          y1: props.duration * 1.8,
          y2: props.duration * 1.8,
        },
        hidden: {
          y1: props.duration,
          y2: props.duration,
          opacity: props.duration * 0.8,
        },
      },
    ),
    duration: props.duration,
    ease: (key) => key === 'opacity' ? 'outBounce' : 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const graphAttrs = computed(() => {
  const { width, opacity, x1, y1, y2 } = graphParams
  const height = y2 - y1

  return {
    points: [
      // 左上
      `${x1},${y1}`,

      // 右上倒角
      `${x1 + width - 6}, ${y1}`,
      `${x1 + width}, ${y1 + 6}`,

      // 右側缺角
      `${x1 + width},${y1 + height / 8} `,
      `${x1 + width - 2},${y1 + height / 8} `,
      `${x1 + width - 2},${y1 + height / 8 + 2} `,
      `${x1 + width},${y1 + height / 8 + 2} `,

      // 右下
      `${x1 + width},${y1 + height - 5} `,
      `${x1 + width - width / 2},${y1 + height - 5} `,
      `${x1 + width - width / 2 - 2},${y1 + height} `,

      // 左下
      `${x1 + 5},${y1 + height} `,
      `${x1},${y1 + height} `,

      // 左凹槽
      `${x1},${y1 + height - height / 4} `,
      `${x1 + 2},${y1 + height - height / 4 - 5} `,
      `${x1 + 2},${y1 + height / 4 - 5} `,
      `${x1},${y1 + height / 4 - 10} `,
    ].join(' '),
    opacity,
  }
})
</script>

<style scoped lang="sass">
</style>
