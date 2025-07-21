<template>
  <rect
    v-for="value, key in graphAttrs"
    :key
    :class="key"
    v-bind="value"
    fill="#777"
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

/** 圖形上下左右對稱，只要定義部分參數即可
 *
 * 這裡的 xy 以 SVG 中心為原點，rect 則是以左上角為原點
 */
interface GraphParams {
  x: number;
  y: number;
  size: number;
}

const offset = 10
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x: svgSize.width / 2,
      y: svgSize.height / 2,
      size: 1,
    }
  }

  return {
    x: 0,
    y: 0,
    size: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {}

const { data: graphParams } = useAnimatable(
  {
    x: 0,
    y: 0,
    size: 0,
  },
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
  },
)

const graphAttrs = computed(() => {
  const { width, height } = props.svgSize
  const { x, y, size } = graphParams
  const [
    halfSize,
    halfWidth,
    halfHeight
  ] = [size / 2, width / 2, height / 2]

  return {
    lt: {
      x: x - halfSize - halfWidth - offset,
      y: y - halfSize - halfHeight - offset,
      width: size,
      height: size,
    },
    rt: {
      x: x - halfSize + halfWidth + offset,
      y: y - halfSize - halfHeight - offset,
      width: size,
      height: size,
    },
    lb: {
      x: x - halfSize - halfWidth - offset,
      y: y - halfSize + halfHeight + offset,
      width: size,
      height: size,
    },
    rb: {
      x: x - halfSize + halfWidth + offset,
      y: y - halfSize + halfHeight + offset,
      width: size,
      height: size,
    },
  }
})
</script>

<style scoped lang="sass">
</style>
