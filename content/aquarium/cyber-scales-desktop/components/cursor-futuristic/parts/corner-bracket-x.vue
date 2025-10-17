<template>
  <svg
    ref="svgRef"
    v-bind="svgAttrs"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask
      id="mask"
      maskContentUnits="userSpaceOnUse"
    >
      <rect
        x="-50%"
        y="-50%"
        width="100%"
        height="100%"
        fill="white"
      />
      <path
        stroke="black"
        v-bind="maskPathAttrs"
      />
    </mask>

    <g
      stroke="#777"
      mask="url(#mask)"
    >
      <rect
        class="diamond"
        v-bind="pathAttrs"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { UseMouseReturn } from '@vueuse/core'
import type { CursorState } from '../type'
import { reactiveComputed, useElementBounding } from '@vueuse/core'
import { animate } from 'animejs'
import { clone, pipe } from 'remeda'
import { reactive, type Reactive, type SVGAttributes, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../web/composables/use-animatable'

interface PathParams {
  x: number;
  y: number;
  maskRotate: number;
  rotate: number;
  width: number;
  height: number;
  strokeWidth: number;
  /** 引號之間的間距，由 mask path 實現 */
  gap: number;
  opacity: number;
}

interface Props {
  state: `${CursorState}`;
  mouse: Reactive<UseMouseReturn>;
  size?: number;

  hoverElementBounding?: Reactive<ReturnType<typeof useElementBounding>>;
  activeElementBounding?: Reactive<ReturnType<typeof useElementBounding>>;
}

const props = withDefaults(defineProps<Props>(), {
  size: 30,
})

const mouse = reactiveComputed(() => props.mouse)

const svgRef = useTemplateRef('svgRef')
const svgBounding = reactive(useElementBounding(svgRef))

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
watch(() => props.state, blink)

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
      const w = size / 3 * 2
      return {
        maskRotate: 0,
        rotate: 45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        strokeWidth: 3,
        gap: w / 2,
        opacity: 1,
      }
    }),
    'pointer': pipe(undefined, (): PathParams => {
      const w = size / 2
      return {
        maskRotate: 0,
        rotate: 0,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        strokeWidth: 0.5,
        gap: size / 3,
        opacity: 0.8,
      }
    }),
    'pressed': pipe(undefined, (): PathParams => {
      const w = size / 3
      return {
        maskRotate: 90,
        rotate: 135,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        strokeWidth: 2,
        gap: w / 2,
        opacity: 1,
      }
    }),
    'not-allowed': pipe(undefined, (): PathParams => {
      const w = size * 3
      return {
        maskRotate: 0,
        rotate: 45,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        strokeWidth: 3,
        gap: w,
        opacity: 0.5,
      }
    }),
    'wait': pipe(undefined, (): PathParams => {
      const w = size * 2.5
      return {
        maskRotate: -180,
        rotate: 45 - 180,
        width: w,
        height: w,
        x: -w / 2,
        y: -w / 2,
        strokeWidth: 1,
        gap: w,
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
  'pointer': {
    x: defaultDuration / 2,
    y: defaultDuration / 2,
    width: defaultDuration / 2,
    height: defaultDuration / 2,
  },
  'pressed': {
    maskRotate: defaultDuration / 2,
    rotate: defaultDuration / 2,
    x: defaultDuration / 2,
    y: defaultDuration / 2,
    width: defaultDuration / 2,
    height: defaultDuration / 2,
    strokeWidth: defaultDuration / 2,
    gap: defaultDuration / 2,
    opacity: defaultDuration / 2,
  },
  'not-allowed': {
    x: defaultDuration / 3,
    y: defaultDuration / 3,
    width: defaultDuration / 3,
    height: defaultDuration / 3,
    gap: defaultDuration / 3,
  },
  'wait': {
    strokeWidth: defaultDuration / 2,
    opacity: defaultDuration / 2,
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

const maskPathAttrs = reactiveComputed(() => {
  const { maskRotate, gap } = pathParamsMap

  return {
    'd': `M0 ${svgBounding.height} V-${svgBounding.height}`,
    'stroke-width': gap,
    'transform': `rotate(${maskRotate}, 0, 0)`,
  }
})

const pathAttrs = reactiveComputed(() => {
  const data = pathParamsMap

  return {
    'x': data.x,
    'y': data.y,
    'width': data.width,
    'height': data.height,
    'opacity': data.opacity,
    'stroke-width': data.strokeWidth,
    'transform': `rotate(${data.rotate}, 0, 0)`,
  }
})
</script>

<style scoped lang="sass">
</style>
