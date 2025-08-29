<template>
  <polygon
    v-bind="btnBgAttrs"
    fill="#777"
  />
  <path
    class="right-frame"
    v-bind="lineAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { computed } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const offset = 6
const lineTargetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x1: offset + svgSize.width,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: 1,
    }
  }

  return {
    x1: offset * 2 + svgSize.width,
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
    x1: props.duration * 1.8,
    y1: props.duration * 1.8,
    y2: props.duration * 1.8,
    width: props.duration * 1.8,
  },
}
const durationMap: Partial<Record<ComponentStatus, number>> = {
}

const { data: lineParams } = useAnimatable(
  {
    x1: 0,
    y1: 0,
    y2: 0,
    // color: '#777',
    width: 0,
  },
  lineTargetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: () => durationMap[props.status] ?? props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
  },
)

const lineAttrs = computed(() => {
  return {
    'd': `M${lineParams.x1} ${lineParams.y1} V${lineParams.y2}`,
    'stroke-width': lineParams.width,
  }
})

const bgWidth = 24
const btnBgAttrs = computed(() => {
  const { svgSize } = props

  const { width: svgWidth, height: svgHeight } = svgSize
  const height = svgHeight / 4
  const offsetX = lineParams.x1

  return {
    points: [
      `${offset + svgWidth},${svgHeight - height}`,
      `${bgWidth + svgWidth},${svgHeight - height + offset * 2}`,
      `${bgWidth + svgWidth},${svgHeight - offset * 2}`,
      `${offset + svgWidth},${svgHeight}`,
    ].join(' '),
    opacity: lineParams.width,
  }
})
</script>

<style scoped lang="sass">
</style>
