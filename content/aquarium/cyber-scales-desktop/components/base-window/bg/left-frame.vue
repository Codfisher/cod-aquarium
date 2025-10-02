<template>
  <polygon
    v-bind="textBgAttrs"
    ref="handlerRef"
    class=" pointer-events-auto"
    :class="handlerClass"
    fill="#777"
  />
  <polygon
    v-bind="textBgPartAttrs"
    fill="#777"
  />
  <text
    v-bind="textAttrs"
    fill="#fff"
    writing-mode="vertical-rl"
  >
    {{ titleDecoder.text }}
  </text>

  <path
    class="left-frame"
    v-bind="lineAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import { ComponentStatus } from '../../../types'
import { useEventListener, usePrevious } from '@vueuse/core'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { useDecodingText } from '../../../../../../composables/use-decoding-text'
import { baseWindowInjectionKey } from '../type'
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

const windowProvider = inject(baseWindowInjectionKey)
if (!windowProvider) {
  throw new Error('windowProvider is not provided')
}

const pStatus = usePrevious(
  windowProvider.status,
  ComponentStatus.HIDDEN
)

const titleDecoder = useDecodingText(windowProvider.title.value)
watch(() => props.status, (value) => {
  if (value === 'visible') {
    setTimeout(() => {
      titleDecoder.start()
    }, props.duration * 2)
  }
})

interface LineParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const maxWidth = 2
const offset = 6
const lineTargetParams = computed<LineParams>(() => {
  const { svgSize } = props

  if (props.status === 'hidden') {
    return {
      x1: -offset * 2,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: 0,
    }
  }

  if (props.status === 'hover') {
    return {
      x1: -offset * 2,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: maxWidth,
    }
  }

  return {
    x1: -offset,
    y1: 0,
    y2: svgSize.height,
    // color: '#777',
    width: maxWidth,
  }
})

const { data: lineParams } = useAnimatable(
  lineTargetParams,
  {
    delay: (fieldKey) => resolveTransitionParamValue<LineParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0
      },
      {
        hover: props.duration * 0.6,
        active: {
          x1: props.duration * 0.6,
        },
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

const lineAttrs = computed(() => {
  return {
    'd': `M${lineParams.x1} ${lineParams.y1} V${lineParams.y2}`,
    'stroke-width': lineParams.width,
  }
})

const textPadding = 12
const textAttrs = computed(() => {
  return {
    x: lineParams.x1 + -offset * 2,
    y: lineParams.y1 + offset * 3 + textPadding / 2,
    opacity: lineParams.width,
    fontSize: `12px`,
  }
})

const textBgAttrs = computed(() => {
  const height = props.svgSize.height / 2
  const offsetX = lineParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  return {
    points: [
      `${offsetX},0`,
      `${-fontSize - textPadding + offsetX},${offset * 3}`,
      `${-fontSize - textPadding + offsetX},${height}`,
      `${offsetX},${height + offset * 3}`,
    ].join(' '),
    opacity: lineParams.width,
  }
})
const textBgPartAttrs = computed(() => {
  const bgHeight = props.svgSize.height / 2
  const height = props.svgSize.height / 15
  const offsetX = lineParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  /** 與 text-bg 的間距 */
  const gap = 10

  const padding = 8
  return {
    points: [
      `${offsetX},${bgHeight + offset * 3 + gap}`,
      `${-fontSize - padding + offsetX},${bgHeight + gap}`,
      `${-fontSize - padding + offsetX},${bgHeight + gap + height}`,
      `${offsetX},${bgHeight + offset * 3 + gap + height}`,
    ].join(' '),
    opacity: lineParams.width / maxWidth,
  }
})

const handlerRef = useTemplateRef('handlerRef')

const isDragging = ref(false)
const handlerClass = computed(() => {
  return isDragging.value ? ' cursor-grabbing' : ' cursor-grab'
})

let startPointer = { x: 0, y: 0 }
useEventListener(handlerRef, 'pointerdown', (evt: PointerEvent) => {
  isDragging.value = true
  startPointer = { x: evt.clientX, y: evt.clientY }
  handlerRef.value?.setPointerCapture(evt.pointerId)
})
useEventListener(handlerRef, 'pointermove', (evt: PointerEvent) => {
  if (!isDragging.value) {
    return
  }

  windowProvider.emit('dragging', {
    offsetX: evt.clientX - startPointer.x,
    offsetY: evt.clientY - startPointer.y,
  })
})
useEventListener(handlerRef, ['pointerup', 'pointercancel'], (evt: PointerEvent) => {
  isDragging.value = false
  handlerRef.value?.releasePointerCapture(evt.pointerId)
  windowProvider.emit('dragEnd')
})
</script>

<style scoped lang="sass">
</style>
