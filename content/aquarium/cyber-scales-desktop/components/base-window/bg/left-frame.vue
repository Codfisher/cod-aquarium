<template>
  <path
    class="left-frame"
    v-bind="graphAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { useAnimate, useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 300,
})

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x1: 0,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: 1,
    }
  }

  return {
    x1: -10,
    y1: 0,
    y2: svgSize.height,
    // color: '#777',
    width: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    x1: props.duration * 2,
    y1: props.duration * 2,
    y2: props.duration * 2,
    width: props.duration * 2,
  }
}

const { data: graphParams } = useAnimatable(
  {
    x1: 0,
    y1: 0,
    y2: 0,
    // color: '#777',
    width: 0,
  },
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
  },
)

const graphAttrs = computed(() => {
  return {
    'd': `M${graphParams.x1} ${graphParams.y1} V${graphParams.y2}`,
    'stroke-width': graphParams.width,
  }
})
</script>

<style scoped lang="sass">
</style>
