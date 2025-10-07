<template>
  <rect
    class="outline-frame"
    v-bind="graphAttrs"
    fill="transparent"
    stroke="#f87171"
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
    }
  }

  return {
    x: -offset / 2,
    y: -offset / 2,
    width: svgSize.width + offset,
    height: svgSize.height + offset,
    strokeWidth: 1,
    opacity: 0.4,
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
        visible: props.duration * 2.8,
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
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
