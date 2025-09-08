<template>
  <svg
    ref="svgRef"
    v-bind="svgAttrs"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :stroke="props.color">
      <path
        class="tl"
        v-bind="pathsAttrsMap.tl"
      />
      <path
        class="br"
        v-bind="pathsAttrsMap.br"
      />
      <path
        class="tr"
        v-bind="pathsAttrsMap.tr"
      />
      <path
        class="bl"
        v-bind="pathsAttrsMap.bl"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { useElementBounding, UseMouseReturn } from '@vueuse/core'
import type { CursorState } from '../type'
import { reactiveComputed } from '@vueuse/core'
import { animate } from 'animejs'
import { clone, mapValues, pipe } from 'remeda'
import { type Reactive, type SVGAttributes, useTemplateRef, watch } from 'vue'
import { useAnimatable } from '../../../../../../composables/use-animatable'

type PathName = 'tl' | 'tr' | 'bl' | 'br'
interface PathParams {
  x: number;
  y: number;
  /** 依 SVG 中心旋轉 */
  rotate: number;
  /** 依 path 中心旋轉 */
  rotateSelf: number;
  strokeWidth: number;
  /** path 起點 */
  p1: number;
  /** path 終點 */
  p2: number;
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
  size: 80,
  color: '#777',
})

const mouse = reactiveComputed(() => props.mouse)

const { data: svgParams } = useAnimatable(
  () => {
    const { hoverElementBounding, size } = props
    if (props.state === 'pointer' && hoverElementBounding) {
      const { width, height, x, y } = hoverElementBounding

      return {
        width,
        height,
        x: x + width - size / 2,
        y: y + height - size / 2,
      }
    }

    return {
      width: size,
      height: size,
      x: mouse.x,
      y: mouse.y,
    }
  },
  {
    duration: 100,
  },
)

const svgRef = useTemplateRef('svgRef')
function blink() {
  if (!svgRef.value) {
    return
  }
  animate(svgRef.value, {
    opacity: [
      0.1,
      0.8,
      0.3,
      1,
    ],
    duration: 200,
    easing: 'linear',
  })
}
watch(() => props.state, blink)

const svgAttrs = reactiveComputed(() => {
  const { size } = props
  const { x, y } = svgParams

  const width = svgParams.width + size
  const height = svgParams.height + size

  const halfSize = size / 2

  return {
    width,
    height,
    viewBox: `${-width / 2 + halfSize} ${-height / 2 + halfSize} ${width} ${height}`,
    style: {
      transform: [
        'translate(',
        x - width + size,
        'px, ',
        y - height + size,
        'px)',
      ].join(''),
    },
  } as SVGAttributes
})

/** 定義所有 state 對應目標數值 */
const pathsStateTargetParamsMap = reactiveComputed<
  Record<CursorState, Record<PathName, PathParams>>
>(() => {
  const { size } = props

  return {
    'default': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 3
      const params = {
        rotateSelf: 0,
        rotate: -45,
        p1: size * 0.45,
        p2: size * 0.55,
        strokeWidth: 0.6,
      }

      return {
        tl: { ...params, x: -offset, y: -offset },
        tr: { ...params, x: offset, y: -offset },
        bl: { ...params, x: -offset, y: offset },
        br: { ...params, x: offset, y: offset },
      }
    }),
    'pointer': pipe(undefined, (): Record<PathName, PathParams> => {
      const { hoverElementBounding } = props

      const { xOffset, yOffset } = pipe(undefined, () => {
        if (hoverElementBounding) {
          const { width, height } = hoverElementBounding
          return {
            xOffset: width / 2,
            yOffset: height / 2,
          }
        }

        return {
          xOffset: size / 4,
          yOffset: size / 4,
        }
      })
      const params = {
        rotateSelf: 0,
        rotate: 0,
        strokeWidth: 1,
        p1: size * 0.47,
        p2: size * 0.53,
      }

      return {
        tl: { ...params, x: -xOffset, y: -yOffset },
        tr: { ...params, x: xOffset, y: -yOffset },
        bl: { ...params, x: -xOffset, y: yOffset },
        br: { ...params, x: xOffset, y: yOffset },
      }
    }),
    'pressed': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 5
      const params = {
        rotateSelf: 0,
        rotate: -135,
        p1: size * 0.45,
        p2: size * 0.55,
        strokeWidth: 0.4,
      }

      return {
        tl: { ...params, x: -offset, y: -offset },
        tr: { ...params, x: offset, y: -offset },
        bl: { ...params, x: -offset, y: offset },
        br: { ...params, x: offset, y: offset },
      }
    }),
    'not-allowed': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 4
      const params = {
        rotateSelf: -180,
        rotate: 135,
        p1: size * 0.4,
        p2: size * 0.6,
        strokeWidth: 2,
      }

      return {
        tl: { ...params, x: -offset, y: -offset },
        tr: { ...params, x: offset, y: -offset },
        bl: { ...params, x: -offset, y: offset },
        br: { ...params, x: offset, y: offset },
      }
    }),
    'wait': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 4
      const params = {
        rotateSelf: 0,
        rotate: 45,
        p1: size * 0.4,
        p2: size * 0.6,
        strokeWidth: 2,
      }

      return {
        tl: { ...params, x: -offset, y: -offset },
        tr: { ...params, x: offset, y: -offset },
        bl: { ...params, x: -offset, y: offset },
        br: { ...params, x: offset, y: offset },
      }
    }),
  }
})

const defaultDuration = 700
/** 透過延遲讓不同參數動作更有節奏 */
const paramsDelayMap: Partial<
  Record<CursorState, Partial<PathParams>>
> = {
  'default': {
    rotate: defaultDuration / 2,
  },
  'pointer': {
    strokeWidth: defaultDuration / 2,
    p1: defaultDuration / 2,
    p2: defaultDuration / 2,
  },
  'pressed': {
    rotate: defaultDuration / 2,
    strokeWidth: defaultDuration / 2,
  },
  'not-allowed': {
    x: defaultDuration / 4 * 3,
    y: defaultDuration / 4 * 3,
    strokeWidth: defaultDuration / 5 * 3,
  },
  'wait': {
    x: defaultDuration / 2,
    y: defaultDuration / 2,
  },
}

/** 目前數值 */
const pathsParamsMap = mapValues(
  clone(pathsStateTargetParamsMap.default),
  (item, pathName) => useAnimatable(
    () => pathsStateTargetParamsMap[props.state][pathName],
    {
      duration: defaultDuration,
      delay(fieldKey) {
        return paramsDelayMap[props.state]?.[fieldKey] ?? 0
      },
      ease: 'outExpo',
    },
  ).data,
)

const pathsDMap = reactiveComputed(() => ({
  tl: pipe(
    pathsParamsMap.tl,
    ({ p1, p2 }) => `M${p1} ${p2}V${p1}H${p2}`,
  ),
  br: pipe(
    pathsParamsMap.br,
    ({ p1, p2 }) => `M${p1} ${p2}H${p2}V${p1}`,
  ),
  tr: pipe(
    pathsParamsMap.tr,
    ({ p1, p2 }) => `M${p1} ${p1}H${p2}V${p2}`,
  ),
  bl: pipe(
    pathsParamsMap.bl,
    ({ p1, p2 }) => `M${p1} ${p1}V${p2}H${p2}`,
  ),
}))

const pathsAttrsMap = reactiveComputed(() => mapValues(
  pathsParamsMap,
  (data, key) => {
    const { x, y, rotate, rotateSelf, strokeWidth } = data
    const rotateCenter = props.size / 2

    return {
      'd': pathsDMap[key],
      'stroke-width': strokeWidth,
      'transform': [
        `rotate(${rotate}, ${rotateCenter}, ${rotateCenter})`,
        `translate(${x}, ${y})`,
        `rotate(${rotateSelf}, ${rotateCenter}, ${rotateCenter})`,
      ].join(' '),
    }
  },
))
</script>

<style scoped lang="sass">
</style>
