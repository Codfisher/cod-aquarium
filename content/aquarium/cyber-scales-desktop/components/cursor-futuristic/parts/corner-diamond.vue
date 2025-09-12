<template>
  <svg
    ref="svgRef"
    v-bind="svgAttrs"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :fill="props.color">
      <rect
        class="diamond"
        v-bind="pathAttrs"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { useElementBounding, UseMouseReturn } from '@vueuse/core'
import type { CursorState } from '../type'
import { reactiveComputed } from '@vueuse/core'
import { animate } from 'animejs'
import { clone, pipe } from 'remeda'
import { type Reactive, type SVGAttributes, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'

interface PathParams {
  x: number;
  y: number;
  rotate: number;
  width: number;
  height: number;
  opacity: number;
}

interface Props {
  state: `${CursorState}`;
  mouse: Reactive<UseMouseReturn>;
  size?: number;
  color?: string;

  hoverElementBounding?: Reactive<ReturnType<typeof useElementBounding>>;
  activeElementBounding?: Reactive<ReturnType<typeof useElementBounding>>;
}

const props = withDefaults(defineProps<Props>(), {
  size: 10,
  color: '#777',
})

const mouse = reactiveComputed(() => props.mouse)

const svgRef = useTemplateRef('svgRef')
function blink() {
  if (!svgRef.value) {
    return
  }
  animate(svgRef.value, {
    opacity: [
      0.4,
      0.9,
      0.6,
      1,
    ],
    duration: 200,
    easing: 'linear',
  })
}
// watch(() => props.state, blink)

const svgAttrs = reactiveComputed(() => {
  const { x, y } = mouse

  const size = props.size * 10
  const half = size / 2

  return {
    width: size,
    height: size,
    viewBox: `${-half} ${-half} ${size} ${size}`,
    style: {
      transform: [
        'translate(',
        x - half,
        'px, ',
        y - half,
        'px)',
      ].join(''),
    },
  } as SVGAttributes
})

/** 定義所有 state 對應目標數值 */
const pathStateTargetParamsMap = reactiveComputed<
  Record<CursorState, PathParams>
>(() => {
  const { size } = props

  return {
    'default': pipe(undefined, (): PathParams => {
      const w = size / 2
      return {
        rotate: 45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        opacity: 1,
      }
    }),
    'pointer': pipe(undefined, (): PathParams => {
      const w = 3
      return {
        rotate: 0,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        opacity: 0.8,
      }
    }),
    'pressed': pipe(undefined, (): PathParams => {
      const w = 3
      return {
        rotate: 45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        opacity: 1,
      }
    }),
    'not-allowed': pipe(undefined, (): PathParams => {
      const w = size * 4
      return {
        rotate: 45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        opacity: 0.2,
      }
    }),
    'wait': pipe(undefined, (): PathParams => {
      const w = size * 4
      return {
        rotate: -45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        opacity: 0.2,
      }
    }),
  }
})

const defaultDuration = 700
/** 透過延遲讓不同參數動作更有節奏 */
const paramsDelayMap: Partial<
  Record<CursorState, Partial<PathParams>>
> = {
  'pressed': {
    x: defaultDuration / 2,
    y: defaultDuration / 2,
    width: defaultDuration / 2,
    height: defaultDuration / 2,
    opacity: defaultDuration / 2,
  },
  'not-allowed': {
    x: defaultDuration / 2,
    y: defaultDuration / 2,
    width: defaultDuration / 2,
    height: defaultDuration / 2,
  },
  'wait': {
    rotate: defaultDuration / 2,
  },
}

/** 目前數值 */
const { data: pathParamsMap } = useAnimatable(
  () => pathStateTargetParamsMap[props.state],
  {
    duration: defaultDuration,
    delay(fieldKey) {
      return paramsDelayMap[props.state]?.[fieldKey] ?? 0
    },
    ease: 'outExpo',
  },
)

const pathAttrs = reactiveComputed(() => {
  const { rotate, ...data } = pathParamsMap

  return {
    ...data,
    transform: [
      `rotate(${rotate}, 0, 0)`,
    ].join(' '),
  }
})
</script>

<style scoped lang="sass">
</style>
