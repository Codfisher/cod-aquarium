<template>
  <div
    ref="layoutRef"
    class=" flex flex-col justify-center items-center "
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { promiseTimeout } from '@vueuse/core'
import { nextTick, onMounted, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../common/utils'

interface Props {
  /** 偏移的尺寸量測依據。可避免因為載入等其他原因導致的偏移 */
  sizeSelector?: string;
  gap?: number;
}
const props = withDefaults(defineProps<Props>(), {
  gap: 14,
})

const layoutRef = useTemplateRef('layoutRef')

onMounted(async () => {
  const el = layoutRef.value
  if (!el) {
    return
  }

  // 等字型載入完成
  if (document.fonts) {
    try {
      await document.fonts.ready
      await nextFrame()
    }
    catch { }
  }

  await nextTick()
  await nextFrame()

  Array.from(el.children).forEach((child, i) => {
    if (!(child instanceof HTMLElement)) {
      return
    }

    const sizeEl = props.sizeSelector
      ? child.querySelector(props.sizeSelector) ?? child
      : child

    const { width } = sizeEl.getBoundingClientRect()
    const x = (width / 2 + props.gap) * ((-1) ** i)
    child.style.transform = `translate(${x}px, 0px)`
  })
})
</script>

<style scoped lang="sass">
</style>
