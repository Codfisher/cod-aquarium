<template>
  <polygon
    v-bind="graphAttrs"
    fill="#777"
  />
</template>

<script setup lang="ts">
import { useEventListener, usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { useDecodingText } from '../../../../../../composables/use-decoding-text'
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
  opacity: number;
  width: number;
}

const offset = 6
const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
    const { svgSize } = props

    if (props.status === 'hidden') {
      const qH = svgSize.height / 4
      const width = 10
      return {
        x1: svgSize.width / 2 + width / 2,
        y1: qH,
        y2: qH * 3,
        width,
        opacity: 0,
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
