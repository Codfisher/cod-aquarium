<template>
  <polygon
    v-bind="textBgAttrs"
    ref="handlerRef"
    class=" pointer-events-auto"
    :class="handlerClass"
    fill="#777"
  />
  <polygon
    v-bind="textBgPart01Attrs"
    fill="#777"
  />
  <polygon
    v-bind="textBgPart02Attrs"
    fill="#777"
  />

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

interface GraphParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const maxWidth = 2
const offset = 6

const { data: graphParams } = useAnimatable(
  computed<GraphParams>(() => {
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
  }),
  {
    delay: (fieldKey) => resolveTransitionParamValue<GraphParams, number>(
      {
        status: props.status as ComponentStatus,
        pStatus: pStatus.value,
        fieldKey,
        defaultValue: 0
      },
      {
        hover: props.duration * 0.6,
        active: props.duration * 0.5,
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
    'd': `M${graphParams.x1} ${graphParams.y1} V${graphParams.y2}`,
    'stroke-width': graphParams.width,
  }
})

const textPadding = 12
const textAttrs = computed(() => {
  return {
    x: graphParams.x1 + -offset * 2,
    y: graphParams.y1 + offset * 3 + textPadding / 2,
    opacity: graphParams.width,
    fontSize: `12px`,
  }
})

const textBgAttrs = computed(() => {
  const height = props.svgSize.height / 2
  const offsetX = graphParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  return {
    points: [
      `${offsetX},0`,
      `${-fontSize - textPadding + offsetX},${offset * 3}`,
      `${-fontSize - textPadding + offsetX},${height}`,
      `${offsetX},${height + offset * 3}`,
    ].join(' '),
    opacity: graphParams.width,
  }
})
const textBgPart01Attrs = computed(() => {
  const bgHeight = props.svgSize.height / 2
  const height = props.svgSize.height / 15
  const offsetX = graphParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  const gap = 10
  const padding = 8

  const leftX = -fontSize - padding + offsetX
  const leftTopY = bgHeight + gap
  const leftBottomY = bgHeight + gap + height

  // 斜率與 textBgAttrs 一致
  const skew = (offset * 3) * ((fontSize + padding) / (fontSize + textPadding))

  return {
    points: [
      `${offsetX},${leftTopY + skew}`,     // 右上
      `${leftX},${leftTopY}`,              // 左上
      `${leftX},${leftBottomY}`,           // 左下
      `${offsetX},${leftBottomY + skew}`,  // 右下
    ].join(' '),
    opacity: graphParams.width / maxWidth,
  }
})
const textBgPart02Attrs = computed(() => {
  const bgHeight = props.svgSize.height / 2
  const height = props.svgSize.height / 15
  const offsetX = graphParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  const gap = 30
  const padding = 8

  const leftX = -fontSize - padding + offsetX
  const leftTopY = bgHeight + gap
  const leftBottomY = bgHeight + gap + height

  // 斜率與 textBgAttrs 一致
  const skew = (offset * 3) * ((fontSize + padding) / (fontSize + textPadding))

  return {
    points: [
      `${offsetX},${leftTopY + skew}`,     // 右上
      `${leftX},${leftTopY}`,              // 左上
      `${leftX},${leftBottomY}`,           // 左下
      `${offsetX},${leftBottomY + skew}`,  // 右下
    ].join(' '),
    opacity: graphParams.width / maxWidth,
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
