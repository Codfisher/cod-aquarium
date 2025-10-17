<template>
  <rect
    v-for="value, key in graphAttrs"
    :key
    :class="key"
    v-bind="value"
  />
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import { usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, toRef, toRefs, watch } from 'vue'
import { useAnimatable } from '../../../../../../web/composables/use-animatable'
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
  opacity: number;
}

const offset = 0
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (status.value === 'hidden') {
    return {
      x: 0,
      y: 0,
      size: 4,
      color: 0xAAAAAA,
      opacity: 0,
    }
  }

  return {
    x: -svgSize.width / 2 + offset,
    y: -svgSize.height / 2 + offset,
    size: 2,
    color: 0x444444,
    opacity: 1,
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
        visible: {
          x: props.duration * 0.4,
          y: props.duration * 0.8,
          color: props.duration * 1.6,
          size: props.duration * 1.6,
        },
        hidden: {
          x: props.duration * 0.8,
          size: props.duration,
          opacity: props.duration,
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
  const { x, y, size, opacity } = graphParams
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
    ? `drop-shadow(0 0 0.2rem ${fill})`
    : 'none'

  return {
    lt: {
      x: x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
      opacity,
    },
    rt: {
      x: -x - halfSize + halfWidth,
      y: y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
      opacity,
    },
    lb: {
      x: x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
      opacity,
    },
    rb: {
      x: -x - halfSize + halfWidth,
      y: -y - halfSize + halfHeight,
      width: size,
      height: size,
      fill,
      style: `filter: ${glow}`,
      opacity,
    },
  }
})
</script>

<style scoped lang="sass">
</style>
