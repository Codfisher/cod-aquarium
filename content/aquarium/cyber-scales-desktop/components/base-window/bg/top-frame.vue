<template>
  <path
    class="top-frame"
    v-bind="graphAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import { ComponentStatus } from '../../../types'
import { computed, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
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

const pStatus = usePrevious(
  () => props.status as ComponentStatus,
  ComponentStatus.HIDDEN
)

interface GraphParams {
  x1: number;
  y1: number;
  x2: number;
  // color?: string;
  width: number;
}

const maxWidth = 1
const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'hidden') {
    return {
      x1: svgSize.width / 2,
      y1: svgSize.height / 2,
      x2: svgSize.width / 2,
      // color: '#777',
      width: 1,
    }
  }

  if (props.status === 'active') {
    return {
      x1: 0,
      y1: -offset,
      x2: svgSize.width,
      // color: '#777',
      width: maxWidth,
    }
  }

  if (props.status === 'hover') {
    return {
      x1: 0,
      y1: -offset * 2,
      x2: svgSize.width,
      // color: '#777',
      width: maxWidth,
    }
  }

  return {
    x1: 0,
    y1: -offset,
    x2: svgSize.width,
    // color: '#777',
    width: maxWidth / 2,
  }
})
// watch(targetParams, () => {
//   console.log('status', props.status)
//   console.log('targetParams', { ...targetParams.value })
// }, { deep: true })

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0
      },
      {
        hover: {
          y1: props.duration * 0.6,
        },
        hidden: {
          x1: props.duration * 2,
          x2: props.duration * 2,
          y1: props.duration,
        },
        'hidden-visible': {
          y1: props.duration,

        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(0.9, 0, 0.1, 1)',
    animationTriggerBy: () => props.status,
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
