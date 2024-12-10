<template>
  <picture>
    <template v-if="sourceVisible">
      <source
        :srcset="srcset"
        type="image/webp"
      >
    </template>

    <img
      v-bind="$attrs"
      :src
      :alt
    >
  </picture>
</template>

<script setup lang="ts">
import { join, map, pipe } from 'remeda'
import { computed } from 'vue'

interface Props {
  src: string;
  alt?: string;
}
const props = withDefaults(defineProps<Props>(), {
  alt: '圖片',
})

// 去除附檔名
const fileName = computed(() => props.src
  .split('.')
  .slice(0, -1)
  .join('.'),
)

const srcset = computed(() => pipe(
  [700, 200, 50],
  map((size) => `${fileName.value}-${size}.webp ${size}w`),
  join(', '),
))

const sourceVisible = computed(() => {
  if (import.meta.env.DEV) {
    return false
  }

  return !props.src.includes('.gif')
})
</script>

<style scoped lang="sass">
</style>
