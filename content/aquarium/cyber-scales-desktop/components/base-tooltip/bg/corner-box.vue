<template>
  <rect
    v-for="value, key in graphAttrs"
    :key
    :class="key"
    v-bind="value"
  />
</template>

<script setup lang="ts">
import { usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, Ref, toRef, toRefs, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { hasChroma, resolveTransitionParamValue } from '../../../utils'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

const { status } = toRefs(props)
const pStatus = usePrevious(
  status as Ref<ComponentStatus>,
  ComponentStatus.HIDDEN,
)

/** 圖形上下左右對稱，只要 lt 參數即可
 *
 * SVG 以左上角為原點
 */
interface GraphParams {
  x: number;
  y: number;
  size: number;
  color: number;
}

const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (status.value === 'hidden') {
    return {
      x: -svgSize.width / 2 - offset * 2,
      y: -svgSize.height / 2 - offset * 2,
      size: 0,
      color: 0x444444,
    }
  }

  if (status.value === 'active') {
    const size = 4
    return {
      x: -svgSize.width / 2 - offset + size / 4,
      y: -svgSize.height / 2 - offset + size / 4,
      size,
      color: 0x2DD4BF,
    }
  }

  if (status.value === 'hover') {
    return {
      x: -svgSize.width / 2 - offset * 2,
      y: -svgSize.height / 2 - offset * 2,
      size: 2,
      color: 0x444444,
    }
  }

  return {
    x: -svgSize.width / 2 - offset,
    y: -svgSize.height / 2 - offset,
    size: 3,
    color: 0x444444,
  }
})

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: status.value as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'active': {
          x: props.duration,
          y: props.duration,
          size: props.duration,
          color: props.duration / 2,
        },
        'hidden-visible': {
          x: props.duration * 1.5,
          y: props.duration * 1.5,
          size: props.duration * 1.5,
        },
      },
    ),
    duration: props.duration,
    ease: 'inOutQuint',
    animationTriggerBy: () => status.value,
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

  const fill = pipe(
    Math.round(graphParams.color),
    (value) => `#${value.toString(16).padStart(6, '0')}`,
  )

  const glow = hasChroma(graphParams.color)
    ? `drop-shadow(0 0 0.5rem ${fill})`
    : 'none'

  return {
    lt: {
      x: x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
    },
    rt: {
      x: -x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
    },
    lb: {
      x: x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
    },
    rb: {
      x: -x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
    },
  }
})
</script>

<style scoped lang="sass">
</style>
