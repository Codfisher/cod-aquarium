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
  /** 指定特定尺寸 */
  source?: typeof WIDTH_LIST[number];
}
const props = withDefaults(defineProps<Props>(), {
  alt: '圖片',
  source: undefined,
})

const WIDTH_LIST = [700, 300, 100] as const

// 去除附檔名
const fileName = computed(() => props.src
  .split('.')
  .slice(0, -1)
  .join('.'),
)

const srcset = computed(() => {
  if (props.source) {
    return `${fileName.value}-${props.source}.webp`
  }

  return pipe(
    WIDTH_LIST,
    map((size) => `${fileName.value}-${size}.webp ${size}w`),
    join(', '),
  )
})

const sourceVisible = computed(() => {
  if (import.meta.env.DEV) {
    return false
  }

  return !props.src.includes('.gif')
})
</script>

<style scoped lang="sass">
</style>
