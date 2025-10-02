<template>
  <polygon
    v-bind="btnBgAttrs"
    fill="#777"
    class=" pointer-events-auto cursor-pointer"
    @click="windowProvider.emit('close')"
  />
  <path
    class="right-frame"
    v-bind="lineAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import { ComponentStatus } from '../../../types'
import { computed, inject } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { baseWindowInjectionKey } from '../type'
import { usePrevious } from '@vueuse/core';
import { resolveTransitionParamValue } from '../../../utils';

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

const windowProvider = inject(baseWindowInjectionKey)
if (!windowProvider) {
  throw new Error('windowProvider is not provided')
}

const pStatus = usePrevious(
  windowProvider.status,
  ComponentStatus.HIDDEN
)

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const maxWidth = 2
const offset = 6
const lineTargetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'hidden') {
    return {
      x1: offset * 2 + svgSize.width,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: 0,
    }
  }

  if (props.status === 'hover') {
    return {
      x1: offset * 2 + svgSize.width,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: maxWidth,
    }
  }

  return {
    x1: offset + svgSize.width,
    y1: 0,
    y2: svgSize.height,
    // color: '#777',
    width: maxWidth,
  }
})

const { data: lineParams } = useAnimatable(
  lineTargetParams,
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0
      },
      {
        hover: props.duration * 0.6,
        active: props.duration * 0.5,
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

const lineAttrs = computed(() => {
  return {
    'd': `M${lineParams.x1} ${lineParams.y1} V${lineParams.y2}`,
    'stroke-width': lineParams.width,
  }
})

const bgWidth = 10
const btnBgAttrs = computed(() => {
  const { svgSize } = props

  const { width: svgWidth, height: svgHeight } = svgSize
  const height = svgHeight / 3
  const offsetX = lineParams.x1 - svgWidth

  return {
    points: [
      `${offsetX + svgWidth},${svgHeight - height}`,
      `${offsetX + bgWidth + svgWidth},${svgHeight - height + offset * 2}`,
      `${offsetX + bgWidth + svgWidth},${svgHeight - offset * 2}`,
      `${offsetX + svgWidth},${svgHeight}`,
    ].join(' '),
    opacity: lineParams.width / maxWidth,
  }
})
</script>

<style scoped lang="sass">
</style>
