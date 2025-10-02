<template>
  <rect
    class="outline-frame"
    v-bind="graphAttrs"
    fill="transparent"
  />
</template>

<script setup lang="ts">
import { usePrevious } from '@vueuse/core'
import { omit, pipe } from 'remeda'
import { computed } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { resolveTransitionParamValue } from '../../../utils'

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
  ComponentStatus.HIDDEN,
)

/** SVG 以左上角為原點 */
interface GraphParams {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  opacity: number;
  color: number;
}

const offset = 6
const targetParams = computed<GraphParams>(() => {
  const { svgSize } = props

  if (props.status === 'hidden') {
    return {
      x: -offset * 2,
      y: -offset * 2,
      width: svgSize.width + offset * 4,
      height: svgSize.height + offset * 4,
      strokeWidth: 0,
      opacity: 0,
      color: 0x777777,
    }
  }

  if (props.status === 'active') {
    return {
      x: offset / 2,
      y: offset / 2,
      width: svgSize.width - offset,
      height: svgSize.height - offset,
      strokeWidth: 4,
      opacity: 0.1,
      color: 0x2DD4BF,
    }
  }

  return {
    x: -offset,
    y: -offset,
    width: svgSize.width + offset * 2,
    height: svgSize.height + offset * 2,
    strokeWidth: 2,
    opacity: 0.05,
    color: 0x777777,
  }
})

const { data: graphParams } = useAnimatable(
  targetParams,
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hidden-visible': {
          x: props.duration * 2,
          y: props.duration * 2,
          width: props.duration * 2,
          height: props.duration * 2,
          strokeWidth: props.duration * 2,
          opacity: props.duration * 2,
        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const graphAttrs = computed(() => {
  const { strokeWidth } = graphParams

  const stroke = pipe(
    Math.round(graphParams.color),
    (value) => `#${value.toString(16).padStart(6, '0')}`,
  )

  return {
    ...omit(graphParams, ['color']),
    'stroke-width': strokeWidth,
    stroke,
  }
})
</script>

<style scoped lang="sass">
</style>
