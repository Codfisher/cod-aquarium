<template>
  <rect
    v-for="value, key in graphAttrs"
    :key
    :class="key"
    v-bind="value"
    fill="#111"
  />
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { computed, watch } from 'vue'
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

/** 圖形上下左右對稱，只要 lt 參數即可
 *
 * SVG 以左上角為原點
 */
interface GraphParams {
  x: number;
  y: number;
  size: number;
}

const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x: -svgSize.width / 2 - offset,
      y: -svgSize.height / 2 - offset,
      size: 4,
    }
  }

  return {
    x: -svgSize.width / 2 - offset * 2,
    y: -svgSize.height / 2 - offset * 2,
    size: 0,
  }
})
watch(targetParams, () => {
  console.log('status', props.status)
  console.log('targetParams', { ...targetParams.value })
}, { deep: true })

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    x: props.duration * 1.5,
    y: props.duration * 1.5,
    size: props.duration * 1.5,
  },
}
const durationMap: Partial<Record<ComponentStatus, number>> = {}

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: () => durationMap[props.status] ?? props.duration,
    ease: 'inOutQuint',
    animationTriggerBy: () => props.status,
  },
)

const graphAttrs = computed(() => {
  const { width, height } = props.svgSize
  const { x, y, size } = graphParams
  const [
    halfSize,
    halfWidth,
    halfHeight,
  ] = [size / 2, width / 2, height / 2]

  return {
    lt: {
      x: x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
    },
    rt: {
      x: -x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
    },
    lb: {
      x: x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
    },
    rb: {
      x: -x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
    },
  }
})
</script>

<style scoped lang="sass">
</style>
