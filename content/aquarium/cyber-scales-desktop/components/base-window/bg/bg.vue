<template>
  <div
    ref="containerRef"
    class="container absolute inset-0 w-full h-full pointer-events-none"
    :style="containerStyle"
  >
  <svg
      class="absolute"
      v-bind="svgAttrs"
      :style="{ transform: 'translateZ(-20px)' }"
    >
      <outline-frame v-bind="frameParams" />
    </svg>

    <svg
      class="absolute"
      v-bind="svgAttrs"
    >
      <top-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
      <corner-box v-bind="frameParams" />
    </svg>

    <svg
      class="absolute -scale-100 origin-center"
      v-bind="svgAttrs"
    >
      <top-frame v-bind="frameParams" />
      <left-frame v-bind="frameParams" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentStatus } from '../../../types'
import { reactiveComputed, throttleFilter, useElementSize, useMouse, useMouseInElement, useMousePressed, useRafFn } from '@vueuse/core'
import { computed, reactive, ref, useTemplateRef } from 'vue'
import LeftFrame from './left-frame.vue'
import TopFrame from './top-frame.vue'
import CornerBox from './corner-box.vue'
import OutlineFrame from './outline-frame.vue'
import { pipe } from 'remeda'

interface Props {
  status?: `${ComponentStatus}`;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
})

const containerRef = useTemplateRef<HTMLDivElement>('containerRef')
const containerSize = reactive(useElementSize(containerRef))

const {
  elementX: mouseX,
  elementY: mouseY,
  isOutside,
} = useMouseInElement(containerRef, {
  eventFilter: throttleFilter(35),
})
/** 計算滑鼠到與元素的中心距離 */
const mousePosition = reactiveComputed(() => {
  const x = containerSize.width / 2 - mouseX.value
  const y = containerSize.height / 2 - mouseY.value

  return {
    x,
    y,
  }
})


const rotateData = ref({ x: 0, y: 0 })
useRafFn(()=>{
  const { x, y } = mousePosition

  const target= pipe(
    {
      x: y / 20,
      y: x / 20,
    },
    (result)=>{
      if(isOutside.value){
        return result
      }

      return { x: 0, y: 0 }
    }
  )

  rotateData.value = {
    x: rotateData.value.x + (target.x - rotateData.value.x) * 0.2,
    y: rotateData.value.y + (target.y - rotateData.value.y) * 0.2,
  }
})

const containerStyle = computed<CSSProperties>(() => ({
  transform: `rotateX(${rotateData.value.x}deg) rotateY(${-rotateData.value.y}deg)`,
}))

const outset = 100
const svgAttrs = computed(() => ({
  style: {
    inset: `-${outset}px`,
  } satisfies CSSProperties,
  viewBox: [
    -outset,
    -outset,
    containerSize.width + outset * 2,
    containerSize.height + outset * 2,
  ].join(' '),
}))

const frameParams = computed(() => ({
  svgSize: containerSize,
  ...props,
}))




</script>

<style scoped lang="sass">
.container
  transform-style: preserve-3d
</style>
