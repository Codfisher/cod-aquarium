<template>
  <polygon
    ref="closeBtnRef"
    v-bind="closeBtnAttrs"
    :fill="closeBtnColor"
    stroke="white"
    class="btn pointer-events-auto cursor-pointer"
    @click="windowProvider.emit('close')"
  />
  <polygon
    ref="resizeHandlerRef"
    v-bind="resizeHandlerAttrs"
    :fill="resizeHandlerColor"
    stroke="white"
    class="btn pointer-events-auto cursor-se-resize"
  />
</template>

<script setup lang="ts">
import { useElementHover, useEventListener, usePrevious } from '@vueuse/core'
import { computed, inject, ref, useTemplateRef } from 'vue'
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

const btnWidth = 10

const closeBtnAttrs = computed(() => {
  const { svgSize } = props

  const { height: svgHeight } = svgSize
  const height = Math.min(svgHeight / 3, 80)
  const offsetY = -20
  const offsetX = graphParams.x1

  return {
    points: [
      `${offsetX},${svgHeight - height + offsetY}`,
      `${offsetX + btnWidth},${svgHeight - height + offset * 2 + offsetY}`,
      `${offsetX + btnWidth},${svgHeight - offset * 2 + offsetY}`,
      `${offsetX},${svgHeight - offset * 4 + offsetY}`,
    ].join(' '),
    opacity: graphParams.width / maxWidth,
  }
})
const closeBtnRef = useTemplateRef('closeBtnRef')
const iCloseBtnHover = useElementHover(closeBtnRef)
const closeBtnColor = computed(
  () => (iCloseBtnHover.value ? '#f87171' : '#777'),
)

const resizeHandlerAttrs = computed(() => {
  const { svgSize } = props

  const { height: svgHeight } = svgSize
  const height = Math.min(svgHeight / 3, 40)
  const offsetY = 0
  const offsetX = graphParams.x1

  return {
    points: [
      `${offsetX},${svgHeight - height + offsetY}`,
      `${offsetX + btnWidth},${svgHeight - height + offset * 2 + offsetY}`,
      `${offsetX + btnWidth},${svgHeight - offset * 2 + offsetY}`,
      `${offsetX},${svgHeight + offsetY}`,
    ].join(' '),
    opacity: graphParams.width / maxWidth,
  }
})
const resizeHandlerRef = useTemplateRef('resizeHandlerRef')
const isResizeHandlerHover = useElementHover(resizeHandlerRef)
const isResizing = ref(false)
const resizeHandlerColor = computed(
  () => (isResizeHandlerHover.value || isResizing.value ? '#7dd3fc' : '#777'),
)

let startPointer = { x: 0, y: 0 }
useEventListener(resizeHandlerRef, 'pointerdown', (evt: PointerEvent) => {
  isResizing.value = true
  startPointer = { x: evt.clientX, y: evt.clientY }
  resizeHandlerRef.value?.setPointerCapture(evt.pointerId)
})
useEventListener(resizeHandlerRef, 'pointermove', (evt: PointerEvent) => {
  if (!isResizing.value) {
    return
  }

  windowProvider.emit('resizing', {
    offsetW: evt.clientX - startPointer.x,
    offsetH: evt.clientY - startPointer.y,
  })
})
useEventListener(resizeHandlerRef, ['pointerup', 'pointercancel'], (evt: PointerEvent) => {
  isResizing.value = false
  resizeHandlerRef.value?.releasePointerCapture(evt.pointerId)
  windowProvider.emit('resizeEnd')
})
</script>

<style scoped lang="sass">
.btn
  transition: fill 0.3s
</style>
