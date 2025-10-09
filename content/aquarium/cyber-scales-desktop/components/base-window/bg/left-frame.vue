<template>
  <polygon
    v-bind="textBgAttrs"
    ref="handlerRef"
    class=" pointer-events-auto"
    :class="handlerClass"
    stroke="white"
    fill="#777"
  />
  <polygon v-bind="textBgPart01Attrs" />

  <text
    v-bind="textAttrs"
    fill="#fff"
    writing-mode="vertical-rl"
    class=" text-sm tracking-wider"
  >
    {{ titleDecoder.text }}
  </text>

  <!-- <path
    class="left-frame"
    v-bind="lineAttrs"
    stroke="#777"
  /> -->
</template>

<script setup lang="ts">
import { useEventListener, usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'
import { useDecodingText } from '../../../../../../composables/use-decoding-text'
import { ComponentStatus } from '../../../types'
import { hasChroma, resolveTransitionParamValue } from '../../../utils'
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

const titleDecoder = useDecodingText(windowProvider.title.value)
watch(() => props.status, (value) => {
  if (value === 'visible') {
    setTimeout(() => {
      titleDecoder.start()
    }, props.duration * 2)
  }
})

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  gap: number;
  opacity: number;
  color: number;
}

const offset = 6
const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
    const { svgSize } = props

    if (props.status === 'hidden') {
      return {
        x1: -offset * 2,
        y1: 0,
        y2: svgSize.height,
        gap: 18,
        opacity: 0,
        color: 0x777777,
      }
    }

    if (props.status === 'hover') {
      return {
        x1: -offset * 1.2,
        y1: 0,
        y2: svgSize.height,
        gap: 18,
        opacity: 1,
        color: 0x777777,
      }
    }

    if (props.status === 'active') {
      return {
        x1: -offset,
        y1: 0,
        y2: svgSize.height,
        gap: 12,
        opacity: 1,
        color: 0x2DD4BF,
      }
    }

    return {
      x1: -offset,
      y1: 0,
      y2: svgSize.height,
      gap: 12,
      opacity: 1,
      color: 0x777777,
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
          opacity: props.duration * 2.5,
        },
      },
    ),
    duration: props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
    animationTriggerBy: () => props.status,
  },
)

const textPadding = 12
const textAttrs = computed(() => {
  return {
    x: graphParams.x1 + -offset * 2,
    y: graphParams.y1 + offset * 3 + textPadding / 2,
    opacity: graphParams.opacity,
    fontSize: `12px`,
  }
})

const textBgAttrs = computed(() => {
  const height = props.svgSize.height / 2
  const { x1 } = graphParams
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  const width = fontSize + textPadding

  return {
    points: [
      // 右上
      `${x1},0`,
      // 左上
      `${-width + x1},${offset * 3}`,

      // 左凹槽
      `${-width + x1},${height / 3 * 2}`,
      `${-width + x1 + 4},${height / 3 * 2 + 4}`,
      `${-width + x1 + 4},${height}`,
      // 右下
      `${x1},${height + offset * 3}`,

      // 右凹槽
      `${x1},${height}`,
      `${x1 - 2},${height - 2}`,
      `${x1 - 2},${height - 2 - 40}`,
      `${x1},${height - 2 - 40 - 2}`,
    ].join(' '),
    opacity: graphParams.opacity,
  }
})
const textBgPart01Attrs = computed(() => {
  const startY = props.svgSize.height / 2
  const height = Math.min(props.svgSize.height / 2, 10)
  const offsetX = graphParams.x1
  const width = Number.parseInt(textAttrs.value.fontSize)

  const gap = graphParams.gap
  const padding = 4

  const leftX = -width - padding + offsetX
  const leftTopY = startY + gap
  const leftBottomY = startY + gap + height

  // 斜率與 textBgAttrs 一致
  const skew = (offset * 3) * ((width + padding) / (width + textPadding))

  const fill = pipe(
    Math.round(graphParams.color),
    (value) => `#${value.toString(16).padStart(6, '0')}`,
  )
  const glow = hasChroma(graphParams.color)
    ? `drop-shadow(0 0 1rem ${fill})`
    : 'none'

  return {
    points: [
      // 右上
      `${offsetX},${leftTopY + skew}`,
      // 左上
      `${leftX},${leftTopY}`,
      // 左下
      `${leftX},${leftBottomY}`,
      // 右下
      `${offsetX},${leftBottomY + skew}`,
    ].join(' '),
    fill,
    style: `filter: ${glow}`,
    opacity: graphParams.opacity,
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
