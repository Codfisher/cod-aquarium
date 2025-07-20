<template>
  <path
    class="top-frame"
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
  x2: number;
  // color?: string;
  width: number;
}

const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x1: 0,
      y1: 0,
      x2: svgSize.height,
      // color: '#777',
      width: 2,
    }
  }

  return {
    x1: svgSize.width / 2,
    y1: svgSize.height / 2,
    x2: svgSize.height / 2,
    // color: '#777',
    width: 2,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    x1: props.duration * 2,
    y1: props.duration,
    x2: props.duration,
  },
  hidden: {
    x1: props.duration,
    y1: props.duration * 2,
    x2: props.duration * 2,
  },
}

const { data: graphParams } = useAnimatable(
  {
    x1: props.svgSize.width / 2,
    y1: props.svgSize.height / 2,
    x2: props.svgSize.height / 2,
    // color: '#777',
    width: 2,
  },
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'cubicBezier(0.9, 0, 0.1, 1)',
  },
)

const graphAttrs = computed(() => {
  return {
    'd': `M${graphParams.x1} ${graphParams.y1} H${graphParams.x2}`,
    'stroke-width': graphParams.width,
  }
})
</script>

<style scoped lang="sass">
</style>
