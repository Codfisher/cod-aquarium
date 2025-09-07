<template>
  <div
    ref="layoutRef"
    class=" flex flex-col justify-center items-center "
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { promiseTimeout } from '@vueuse/core';
import { nextTick, onMounted, useTemplateRef } from 'vue'

interface Props {
  modelValue?: string;
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
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
      await promiseTimeout(50)
    } catch { }
  }

  await nextTick()

  el.querySelectorAll(':scope > div').forEach((child, i) => {
    if (!(child instanceof HTMLElement)) {
      return
    }

    const { width } = child.getBoundingClientRect()
    console.log(`🚀 ~ width:`, width);
    const x = width / 3 * ((-1) ** i)
    child.style.transform = `translate(${x}px, 0px)`
  })
})
</script>

<style scoped lang="sass">
</style>
