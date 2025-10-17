<template>
  <svg
    ref="svgRef"
    v-bind="svgAttrs"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g :stroke="props.color">
      <path
        class="t"
        v-bind="pathsAttrsMap.t"
      />
      <path
        class="r"
        v-bind="pathsAttrsMap.r"
      />
      <path
        class="b"
        v-bind="pathsAttrsMap.b"
      />
      <path
        class="l"
        v-bind="pathsAttrsMap.l"
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
import { type Reactive, type SVGAttributes, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../../web/composables/use-animatable'

type PathName = 't' | 'r' | 'b' | 'l'
interface PathParams {
  x: number;
  y: number;
  /** 依 SVG 中心旋轉 */
  rotate: number;
  /** 依 path 中心旋轉 */
  rotateSelf: number;
  strokeWidth: number;
  /** path 長度 */
  length: number;
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
  size: 300,
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
    delay: 100,
    easing: 'linear',
  })
}
// watch(() => props.state, blink)

const svgAttrs = reactiveComputed(() => {
  const { x, y } = mouse

  const size = props.size * 2
  const half = props.size

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
const pathsStateTargetParamsMap = reactiveComputed<
  Record<CursorState, Record<PathName, PathParams>>
>(() => {
  const { size } = props

  return {
    'default': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 12
      const params = {
        rotateSelf: 0,
        rotate: 45,
        length: size / 12,
        strokeWidth: 0.2,
      }

      return {
        t: { ...params, x: 0, y: -offset },
        b: { ...params, x: 0, y: offset },
        l: { ...params, x: offset, y: 0 },
        r: { ...params, x: -offset, y: 0 },
      }
    }),
    'pointer': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 25
      const params = {
        rotateSelf: 0,
        rotate: 0,
        length: size / 10,
        strokeWidth: 0.5,
      }

      return {
        t: { ...params, x: 0, y: -offset },
        b: { ...params, x: 0, y: offset },
        l: { ...params, x: offset, y: 0 },
        r: { ...params, x: -offset, y: 0 },
      }
    }),
    'pressed': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 25
      const params = {
        rotateSelf: 0,
        rotate: 45,
        length: size / 15,
        strokeWidth: 1,
      }

      return {
        t: { ...params, x: 0, y: -offset },
        b: { ...params, x: 0, y: offset },
        l: { ...params, x: offset, y: 0 },
        r: { ...params, x: -offset, y: 0 },
      }
    }),
    'not-allowed': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = 0
      const params = {
        rotateSelf: 0,
        rotate: -135,
        length: size / 5,
        strokeWidth: 0.8,
      }

      return {
        t: { ...params, x: -offset, y: -offset },
        b: { ...params, x: offset, y: -offset },
        l: { ...params, x: -offset, y: offset },
        r: { ...params, x: offset, y: offset },
      }
    }),
    'wait': pipe(undefined, (): Record<PathName, PathParams> => {
      const offset = size / 5
      const params = {
        rotateSelf: 0,
        rotate: 180,
        length: size / 10,
        strokeWidth: 0.6,
      }

      return {
        t: { ...params, x: 0, y: -offset },
        b: { ...params, x: 0, y: offset },
        l: { ...params, x: offset, y: 0 },
        r: { ...params, x: -offset, y: 0 },
      }
    }),
  }
})

const defaultDuration = 700
/** 透過延遲讓不同參數動作更有節奏 */
const paramsDelayMap: Partial<
  Record<CursorState, Partial<PathParams>>
> = {
  pointer: {
    x: defaultDuration / 4 * 3,
    y: defaultDuration / 4 * 3,
  },
  pressed: {
    x: defaultDuration / 4 * 3,
    y: defaultDuration / 4 * 3,
    strokeWidth: defaultDuration / 4 * 3,
  },
  wait: {
    x: defaultDuration / 3 * 2,
    y: defaultDuration / 3 * 2,
    length: defaultDuration / 3 * 2,
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
  t: pipe(
    pathsParamsMap.t,
    ({ length }) => `M0 0V${-length}`,
  ),
  r: pipe(
    pathsParamsMap.r,
    ({ length }) => `M0 0H${-length}`,
  ),
  b: pipe(
    pathsParamsMap.t,
    ({ length }) => `M0 0V${length}`,
  ),
  l: pipe(
    pathsParamsMap.r,
    ({ length }) => `M0 0H${length}`,
  ),
}))

const pathsAttrsMap = reactiveComputed(() => mapValues(
  pathsParamsMap,
  (data, key) => {
    const { x, y, rotate, rotateSelf, strokeWidth } = data

    return {
      'd': pathsDMap[key],
      'stroke-width': strokeWidth,
      'transform': [
        `rotate(${rotate}, 0, 0)`,
        `translate(${x}, ${y})`,
        `rotate(${rotateSelf}, 0, 0)`,
      ].join(' '),
    }
  },
))
</script>

<style scoped lang="sass">
</style>
