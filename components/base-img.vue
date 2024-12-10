<template>
  <picture>
    <template v-if="sourceVisible">
      <source
        :srcset="srcset"
        type="image/webp"
      >
    </template>

    <img v-bind="props">
  </picture>
</template>

<script setup lang="ts">
import type { ImgHTMLAttributes } from 'vue'
import { join, map, pipe } from 'remeda'
import { computed } from 'vue'

interface Props extends /* @vue-ignore */ ImgHTMLAttributes {
  src: string;
  /** 指定特定尺寸 */
  useSize?: typeof WIDTH_LIST[number];
}
const props = withDefaults(defineProps<Props>(), {
  useSize: undefined,
})

const WIDTH_LIST = [700, 400, 100] as const

// 去除附檔名
const fileName = computed(() => props.src
  .split('.')
  .slice(0, -1)
  .join('.'),
)

const srcset = computed(() => {
  // 指定特定尺寸
  if (props.useSize) {
    return `${fileName.value}-${props.useSize}.webp`
  }

  return pipe(
    WIDTH_LIST,
    map((size) => `${fileName.value}-${size}.webp ${size}w`),
    join(', '),
  )
})

const sourceVisible = computed(() => {
  /** DEV 模式不顯示響應式圖片 */
  if (import.meta.env.DEV) {
    return false
  }

  /** gif 不特別處理 */
  return !props.src.includes('.gif')
})
</script>
