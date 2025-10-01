<template>
  <polygon
    v-bind="textBgAttrs"
    ref="handlerRef"
    class=" pointer-events-auto cursor-move"
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
import type { ComponentStatus } from '../../../types'
import { useEventListener } from '@vueuse/core'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { useDecodingText } from '../../../../../../composables/use-decoding-text'
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

  if (props.status === 'visible') {
    return {
      x1: -offset,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: maxWidth,
    }
  }

  return {
    x1: -offset * 2,
    y1: 0,
    y2: svgSize.height,
    // color: '#777',
    width: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof LineParams, number>>
>> = {
  visible: {
    x1: props.duration * 2.5,
    y1: props.duration * 2.5,
    y2: props.duration * 2.5,
    width: props.duration * 2.5,
  },
}
const durationMap: Partial<Record<ComponentStatus, number>> = {
}

const { data: lineParams } = useAnimatable(
  lineTargetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: () => durationMap[props.status] ?? props.duration,
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

let isDragging = false
useEventListener('pointerdown', (evt) => {
  isDragging = true
  handlerRef.value?.setPointerCapture(evt.pointerId)
})
useEventListener('pointermove', (evt) => {
  if (!isDragging) {
    return
  }

  windowProvider.emit('dragging', {
    offsetX: evt.movementX,
    offsetY: evt.movementY,
  })
})
useEventListener('pointerup', (evt) => {
  isDragging = false
  handlerRef.value?.releasePointerCapture(evt.pointerId)
})
</script>

<style scoped lang="sass">
</style>
