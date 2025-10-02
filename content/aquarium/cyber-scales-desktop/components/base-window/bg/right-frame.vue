<template>
  <polygon
    ref="btnRef"
    v-bind="btnBgAttrs"
    :fill="btnColor"
    stroke="white"
    class="btn pointer-events-auto cursor-pointer"
    @click="windowProvider.emit('close')"
  />
</template>

<script setup lang="ts">
import { useElementHover, usePrevious } from '@vueuse/core'
import { computed, inject, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { ComponentStatus } from '../../../types'
import { resolveTransitionParamValue } from '../../../utils'
import { baseWindowInjectionKey } from '../type'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

const windowProvider = inject(baseWindowInjectionKey)
if (!windowProvider) {
  throw new Error('windowProvider is not provided')
}

const pStatus = usePrevious(
  windowProvider.status,
  ComponentStatus.HIDDEN,
)

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  width: number;
}

const maxWidth = 2
const offset = 6

const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
    const { svgSize } = props

    if (props.status === 'hidden') {
      return {
        x1: offset * 2 + svgSize.width,
        y1: 0,
        y2: svgSize.height,
        width: 0,
      }
    }

    if (props.status === 'hover') {
      return {
        x1: offset * 1.2 + svgSize.width,
        y1: 0,
        y2: svgSize.height,
        width: maxWidth,
      }
    }

    return {
      x1: offset + svgSize.width,
      y1: 0,
      y2: svgSize.height,
      width: maxWidth,
    }
  }),
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0,
      },
      {
        'hover': props.duration * 0.6,
        'active': props.duration * 0.5,
        'hidden-visible': {
          x1: props.duration * 2.5,
          y1: props.duration * 2.5,
          y2: props.duration * 2.5,
          width: props.duration * 2.5,
        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const bgWidth = 10
const btnBgAttrs = computed(() => {
  const { svgSize } = props

  const { width: svgWidth, height: svgHeight } = svgSize
  const height = Math.min(svgHeight / 3, 80)
  const offsetX = graphParams.x1 - svgWidth

  return {
    points: [
      `${offsetX + svgWidth},${svgHeight - height}`,
      `${offsetX + bgWidth + svgWidth},${svgHeight - height + offset * 2}`,
      `${offsetX + bgWidth + svgWidth},${svgHeight - offset * 2}`,
      `${offsetX + svgWidth},${svgHeight}`,
    ].join(' '),
    opacity: graphParams.width / maxWidth,
  }
})

const btnRef = useTemplateRef('btnRef')
const isBtnHover = useElementHover(btnRef)
const btnColor = computed(() => (isBtnHover.value ? '#f87171' : '#777'))
</script>

<style scoped lang="sass">
.btn
  transition: fill 0.3s
</style>
