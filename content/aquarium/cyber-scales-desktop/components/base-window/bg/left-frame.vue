<template>
  <polygon
    v-bind="textBgAttrs"
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
    class=" pointer-events-auto"
  >
    安安 codlin
  </text>

  <path
    class="left-frame"
    v-bind="lineAttrs"
    stroke="#777"
  />
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { computed } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 300,
})

interface LineParams {
  x1: number;
  y1: number;
  y2: number;
  // color?: string;
  width: number;
}

const offset = 6
const lineTargetParams = computed<LineParams>(() => {
  const { svgSize } = props

  if (props.status === 'visible') {
    return {
      x1: -offset,
      y1: 0,
      y2: svgSize.height,
      // color: '#777',
      width: 1,
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
    x1: props.duration * 1.8,
    y1: props.duration * 1.8,
    y2: props.duration * 1.8,
    width: props.duration * 1.8,
  },
}
const durationMap: Partial<Record<ComponentStatus, number>> = {
}

const { data: lineParams } = useAnimatable(
  {
    x1: 0,
    y1: 0,
    y2: 0,
    // color: '#777',
    width: 0,
  },
  lineTargetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: () => durationMap[props.status] ?? props.duration,
    ease: 'cubicBezier(1, 0.3, 0, 0.7)',
  },
)

const lineAttrs = computed(() => {
  return {
    'd': `M${lineParams.x1} ${lineParams.y1} V${lineParams.y2}`,
    'stroke-width': lineParams.width,
  }
})

const textAttrs = computed(() => {
  return {
    x: lineParams.x1 + -offset * 2,
    y: 20,
    opacity: lineParams.width,
    fontSize: `12px`,
  }
})

const textBgAttrs = computed(() => {
  const height = props.svgSize.height / 2
  const offsetX = lineParams.x1
  const fontSize = Number.parseInt(textAttrs.value.fontSize)

  const padding = 12
  return {
    points: [
      `${offsetX},0`,
      `${-fontSize - padding + offsetX},${offset * 3}`,
      `${-fontSize - padding + offsetX},${height}`,
      `${offsetX},${height + offset * 3}`,
    ].join(' '),
    opacity: lineParams.width,
  }
})
const textBgPartAttrs = computed(() => {
  const bgHeight = props.svgSize.height / 2
  const height = props.svgSize.height / 15
  const offsetX = lineParams.x1
  /** 與 text-bg 的間距 */
  const gap = 10

  const padding = 10
  return {
    points: [
      `${offsetX},${bgHeight + offset * 3 + gap}`,
      `${-textAttrs.value.fontSize - padding + offsetX},${bgHeight + gap}`,
      `${-textAttrs.value.fontSize - padding + offsetX},${bgHeight + gap + height}`,
      `${offsetX},${bgHeight + offset * 3 + gap + height}`,
    ].join(' '),
    opacity: lineParams.width,
  }
})
</script>

<style scoped lang="sass">
</style>
