<template>
  <rect
    class="outline-frame"
    v-bind="graphAttrs"
    fill="transparent"
    :stroke="strokeColor"
  />
</template>

<script setup lang="ts">
import { usePrevious } from '@vueuse/core'
import { omit, pipe } from 'remeda'
import { computed, inject } from 'vue'
import { useAnimatable } from '../../../../../../web/composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { resolveTransitionParamValue } from '../../../utils'
import { baseDialogInjectionKey, DialogColorType } from '../type'

interface Props {
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 260,
})

const dialogProvider = inject(baseDialogInjectionKey)
if (!dialogProvider) {
  throw new Error('dialogProvider is not provided')
}
const { status } = dialogProvider

const pStatus = usePrevious(
  status,
  ComponentStatus.HIDDEN,
)

const strokeColorMap: Record<DialogColorType, string> = {
  positive: '#2DD4BF',
  negative: '#f87171'
}
const strokeColor = computed(() => strokeColorMap[dialogProvider.colorType])

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

  if (status.value === 'hidden') {
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
    strokeWidth: 2,
    opacity: 0.4,
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
        visible: props.duration * 2.8,
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => status.value,
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
