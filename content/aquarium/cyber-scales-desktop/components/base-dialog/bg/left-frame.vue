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

const titleDecoder = useDecodingText(windowProvider.title.value)
watch(() => props.status, (value) => {
  if (value === 'visible') {
    setTimeout(() => {
      titleDecoder.start()
    }, props.duration * 2)
  }
})

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
      return {
        x1: -offset * 2,
        y1: 0,
        y2: svgSize.height / 4,
        width: 0,
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
        'hover': props.duration * 0.6,
        'active': props.duration * 0.5,
        'hidden-visible': {
          x1: props.duration * 2.5,
          y1: props.duration * 2.5,
          y2: props.duration * 2.5,
          opacity: props.duration * 2.5,
        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const graphAttrs = computed(() => {
  const { x1, width, y1, y2 } = graphParams
  const height = y2 - y1

  return {
    points: [
      // 左上
      `${x1 - width},0`,
      // 右上
      `${x1},0`,
      // 右下
      `${x1},${height}`,
      // 左下
      `${x1 - width},${height}`,
      `${x1 - width},${height - 5}`,
      `${x1 - width + 2},${height - 10}`,

      `${x1 - width + 2},${height - height / 4}`,
      `${x1 - width},${height - height / 4 - 5}`,
      `${x1 - width},${height / 4}`,
      `${x1 - width + 2},${height / 4 - 5}`,

      // 左上凹槽
      `${x1 - width + 2},20`,
      `${x1 - width + 2},15`,
      `${x1 - width + 4},10`,
      `${x1 - width},5`,
    ].join(' '),
    opacity: graphParams.opacity,
  }
})
</script>

<style scoped lang="sass">
</style>
