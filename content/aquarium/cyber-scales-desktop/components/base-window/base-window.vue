<template>
  <div
    ref="windowRef"
    :style="windowStyle"
    class="base-window relative border border-gray-50"
    @click="toggleData()"
  >
    <base-window-bg
      :status="status"
      class="z-[-1]"
    />
    <div class="z-0">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactiveComputed, throttleFilter, useMouseInElement, useMousePressed, useRafFn, useToggle } from '@vueuse/core'
import { computed, CSSProperties, ref, useTemplateRef } from 'vue'
import { ComponentStatus } from '../../types'
import BaseWindowBg from './bg/bg.vue'
import { pipe } from 'remeda';

// #region Props
interface Props {
  modelValue?: string;
}
// #endregion Props

// #region Emits
interface Emits {
  'update:modelValue': [value: Props['modelValue']];
}
// #endregion Emits

// #region Slots
interface Slots {
  default?: () => unknown;
}
// #endregion Slots

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

const [data, toggleData] = useToggle(false)
const status = computed(() => {
  return data.value ? ComponentStatus.VISIBLE : ComponentStatus.HIDDEN
})

const windowRef = useTemplateRef('windowRef')

const {
  elementX: mouseX,
  elementY: mouseY,
  elementWidth,
  elementHeight,
  isOutside,
} = useMouseInElement(windowRef, {
  eventFilter: throttleFilter(35),
})
/** 計算滑鼠到與元素的中心距離 */
const mousePosition = reactiveComputed(() => {
  const x = elementWidth.value / 2 - mouseX.value
  const y = elementHeight.value / 2 - mouseY.value

  return {
    x,
    y,
  }
})


const rotateData = ref({ x: 0, y: 0 })
useRafFn(() => {
  const { x, y } = mousePosition

  const target = pipe(undefined, () => {
    if (isOutside.value) {
      return {
        x: y / 40,
        y: x / 40,
      }
    }

    return { x: 0, y: 0 }
  })

  rotateData.value = {
    x: rotateData.value.x + (target.x - rotateData.value.x) * 0.2,
    y: rotateData.value.y + (target.y - rotateData.value.y) * 0.2,
  }
})

const windowStyle = computed<CSSProperties>(() => ({
  transform: `rotateX(${rotateData.value.x}deg) rotateY(${-rotateData.value.y}deg)`,
}))

// #region Methods
interface Expose { }
// #endregion Methods

defineExpose<Expose>({})
</script>

<style scoped lang="sass">
.base-window
  transform-style: preserve-3d
  min-width: 500px
  min-height: 300px
</style>
