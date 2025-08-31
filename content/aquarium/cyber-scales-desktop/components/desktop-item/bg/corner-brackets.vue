<template>
  <g
    v-for="value, key in graphAttrs"
    :key
    :transform="`translate(${value.x}, ${value.y})`"
  >
    <rect
      :class="key"
      :stroke-width="value['stroke-width']"
      x="0"
      y="0"
      :width="value.width"
      :height="value.height"
      fill="transparent"
      stroke="#111"
      :mask="`url(#cut-${key})`"
    />
    <defs>
      <mask
        :id="`cut-${key}`"
        maskUnits="userSpaceOnUse"
      >
        <rect
          v-bind="value"
          fill="white"
          x="0"
          y="0"
        />
        <polygon
          x="0"
          y="0"
          :points="value.mask"
          fill="black"
        />
      </mask>
    </defs>
  </g>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { join, map, pipe } from 'remeda'
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

/** 圖形上下左右對稱，只要 lt 參數即可
 *
 * SVG 以左上角為原點
 */
interface GraphParams {
  x: number;
  y: number;
  size: number;
  width: number;
}

const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x: -svgSize.width / 2 - offset,
      y: -svgSize.height / 2 - offset,
      size: 6,
      width: 1,
    }
  }

  return {
    x: -svgSize.width / 2 - offset * 2,
    y: -svgSize.height / 2 - offset * 2,
    size: 0,
    width: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    x: props.duration * 2.5,
    y: props.duration * 2.5,
    size: props.duration * 2,
    width: props.duration * 2,
  },
}
const durationMap: Partial<Record<ComponentStatus, number>> = {}

const { data: graphParams } = useAnimatable(
  {
    x: 0,
    y: 0,
    size: 0,
    width: 0,
  },
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: () => durationMap[props.status] ?? props.duration,
    ease: 'inOutQuint',
  },
)

const graphAttrs = computed(() => {
  const { width, height } = props.svgSize
  const { x, y, size, width: strokeWidth } = graphParams
  const [
    halfSize,
    halfWidth,
    halfHeight,
  ] = [size / 2, width / 2, height / 2]

  return {
    lt: {
      'x': x - halfSize + halfWidth,
      'y': y - halfSize + halfHeight,
      'width': size,
      'height': size,
      'stroke-width': strokeWidth,
      'mask': pipe(
        [
          [size, 0],
          [size, size],
          [0, size],
        ],
        map(join(',')),
        join(' '),
      ),
    },
    rt: {
      'x': -x - halfSize + halfWidth,
      'y': y - halfSize + halfHeight,
      'width': size,
      'height': size,
      'stroke-width': strokeWidth,
      'mask': pipe(
        [
          [0, 0],
          [0, size],
          [size, size],
        ],
        map(join(',')),
        join(' '),
      ),
    },
    lb: {
      'x': x - halfSize + halfWidth,
      'y': -y - halfSize + halfHeight,
      'width': size,
      'height': size,
      'stroke-width': strokeWidth,
      'mask': pipe(
        [
          [0, 0],
          [size, size],
          [size, 0],
        ],
        map(join(',')),
        join(' '),
      ),
    },
    rb: {
      'x': -x - halfSize + halfWidth,
      'y': -y - halfSize + halfHeight,
      'width': size,
      'height': size,
      'stroke-width': strokeWidth,
      'mask': pipe(
        [
          [0, 0],
          [size, 0],
          [0, size],
        ],
        map(join(',')),
        join(' '),
      ),
    },
  }
})
</script>

<style scoped lang="sass">
</style>
