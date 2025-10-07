<template>
  <div class="pointer-events-none fixed left-0 top-0 h-0 w-0">
    <corner-bracket-4
      class="fixed left-0 top-0"
      v-bind="partsProps"
    />
    <corner-line-4
      class="fixed left-0 top-0"
      v-bind="partsProps"
    />
    <corner-bracket-x
      class="fixed left-0 top-0"
      v-bind="partsProps"
    />
    <corner-diamond
      class="fixed left-0 top-0"
      v-bind="partsProps"
    />
  </div>
</template>

<script setup lang="ts">
import type { CursorState } from './type'
import {
  reactiveComputed,
  throttleFilter,
  useActiveElement,
  useElementBounding,
  useElementByPoint,
  useMouse,
  useMousePressed,
} from '@vueuse/core'
import { isIncludedIn } from 'remeda'
import { computed, reactive, shallowRef, watch, watchEffect } from 'vue'
import CornerBracket4 from './parts/corner-bracket-4.vue'
import CornerBracketX from './parts/corner-bracket-x.vue'
import CornerDiamond from './parts/corner-diamond.vue'
import CornerLine4 from './parts/corner-line-4.vue'

interface Props {
  state?: `${CursorState}`;
}
const props = withDefaults(defineProps<Props>(), {})

const mouseInfo = useMouse({
  eventFilter: throttleFilter(10),
  type: 'client',
})
const mouse = reactiveComputed(() => mouseInfo)

// 有效的 active element
const activeElement = shallowRef<HTMLElement | null>()
const activeElementBounding = reactive(useElementBounding(activeElement, {
  reset: false,
}))

const activeElementRef = useActiveElement()
watch(activeElementRef, (el) => {
  // body 例外
  if (el instanceof HTMLBodyElement) {
    activeElement.value = undefined
    return
  }

  activeElement.value = el
})

// 有效的 hover element
const hoverElement = shallowRef<HTMLElement | null>()
const hoverElementBounding = reactive(useElementBounding(hoverElement, {
  reset: false,
}))

const { element } = useElementByPoint(mouseInfo)
watch(element, (el) => {
  if (el) {
    const cursorStyle = getComputedStyle(el).cursor
    if (cursorStyle !== 'pointer') {
      hoverElement.value = undefined
      return
    }
  }

  let prevEl
  while (el && el !== document.body) {
    prevEl = el
    el = el.parentElement

    if (el && getComputedStyle(el).cursor !== 'pointer') {
      hoverElement.value = prevEl
      return
    }
  }

  hoverElement.value = el
})

// const currentState = ref<`${CursorState}`>('default')

const { pressed } = useMousePressed()

const currentState = computed<`${CursorState}`>(() => {
  if (pressed.value) {
    return 'pressed'
  }

  if (element.value) {
    const cursorStyle = getComputedStyle(element.value).cursor
    if (isIncludedIn(cursorStyle, ['pointer', 'not-allowed', 'wait'] as const)) {
      return cursorStyle
    }
  }

  return 'default'
})

const partsProps = computed(() => ({
  mouse,
  state: currentState.value,
  activeElementBounding: activeElement.value ? activeElementBounding : undefined,
  hoverElementBounding: hoverElement.value ? hoverElementBounding : undefined,
}))

watchEffect(() => {
  // console.log(`🚀 ~ activeElement:`, activeElement.value)
  // console.log(`🚀 ~ hoverElement:`, hoverElement.value)
  // console.log(`🚀 ~ currentState:`, currentState.value)
})
</script>

<style scoped lang="sass">
</style>
