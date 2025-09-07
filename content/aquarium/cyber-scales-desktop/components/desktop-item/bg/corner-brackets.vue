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
import { computed, inject, ref, toRefs, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { desktopItemInjectionKey } from '../type'

interface Props {
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
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

const mainProvider = inject(desktopItemInjectionKey)
if (!mainProvider) {
  throw new Error('mainProvider is not provided')
}
const { status } = mainProvider

const pStatus = ref(mainProvider.status.value)
watch(status, (value) => {
  pStatus.value = value
}, { flush: 'post' })

const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (status.value === 'visible') {
    return {
      x: -svgSize.width / 2,
      y: -svgSize.height / 2,
      size: 6,
      width: 0.4,
    }
  }

  if (status.value === 'hover') {
    return {
      x: -svgSize.width / 2 - 5,
      y: -svgSize.height / 2 - 5,
      size: 6,
      width: 0.8,
    }
  }

  return {
    x: 0,
    y: 0,
    size: 6,
    width: 0,
  }
})

const delayMap: Partial<Record<
  `${ComponentStatus}-${ComponentStatus}`,
  Partial<Record<keyof GraphParams, number>>
>> = {
  'hidden-visible': {
    x: props.duration,
    y: props.duration * 1.5,
    width: props.duration,
  },
}

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => {
      const key = `${pStatus.value}-${status.value}` as const
      return delayMap[key]?.[fieldKey] ?? 0
    },
    duration: props.duration,
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

  const maskPoint = size + strokeWidth
  return {
    lt: {
      'x': x - halfSize + halfWidth,
      'y': y - halfSize + halfHeight,
      'width': size,
      'height': size,
      'stroke-width': strokeWidth,
      'mask': pipe(
        [
          [maskPoint, -strokeWidth],
          [maskPoint, maskPoint],
          [-strokeWidth, maskPoint],
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
          [-strokeWidth, -strokeWidth],
          [-strokeWidth, maskPoint],
          [maskPoint, maskPoint],
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
          [-strokeWidth, -strokeWidth],
          [maskPoint, maskPoint],
          [maskPoint, -strokeWidth],
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
          [-strokeWidth, -strokeWidth],
          [maskPoint, -strokeWidth],
          [-strokeWidth, maskPoint],
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
