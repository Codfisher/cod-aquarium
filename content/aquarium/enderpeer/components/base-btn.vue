<template>
  <div ref="btnRef">
    <u-button
      :style="style"
      v-bind="props"
    />
  </div>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'
import type { CSSProperties } from 'vue'
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

const props = defineProps<ButtonProps>()

const btnRef = useTemplateRef('btnRef')
const { height } = useElementSize(btnRef)

const style = computed<CSSProperties>(() => {
  const size = height.value / 2
  const size2 = size / 3 * 2

  return {
    paddingInline: `${size * 1.1}px`,
    clipPath: `polygon(
    ${size2}px 0,
    calc(100% - ${size2}px) 0,
    100% ${size}px,
    100% calc(100% - ${size}px),
    calc(100% - ${size2}px) 100%,
    ${size2}px 100%,
    0 calc(100% - ${size}px),
    0 ${size}px
  )`,
  }
})
</script>

<style scoped lang="sass">
</style>
