<template>
  <rect
    class="outline-frame"
    v-bind="graphAttrs"
    fill="transparent"
    stroke="#F4F4F4"
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

/** SVG 以左上角為原點 */
interface GraphParams {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  opacity: number;
}

const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x: -offset,
      y: -offset,
      width: svgSize.width + offset * 2,
      height: svgSize.height + offset * 2,
      strokeWidth: 3,
      opacity: 1,
    }
  }

  return {
    x: -offset * 2,
    y: -offset * 2,
    width: svgSize.width + offset * 4,
    height: svgSize.height + offset * 4,
    strokeWidth: 0,
    opacity: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    x: props.duration * 2,
    y: props.duration * 2,
    width: props.duration * 2,
    height: props.duration * 2,
    strokeWidth: props.duration * 2,
    opacity: props.duration * 2,
  },
}

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
  },
)

const graphAttrs = computed(() => {
  const { strokeWidth } = graphParams

  return {
    ...graphParams,
    'stroke-width': strokeWidth,
  }
})
</script>

<style scoped lang="sass">
</style>
