<template>
  <picture>
    <template v-if="sourceVisible">
      <source
        :srcset="darkSrcset"
        media="(prefers-color-scheme: dark)"
        type="image/webp"
      >
      <source
        :srcset="lightSrcset"
        type="image/webp"
      >
    </template>

    <img v-bind="imgProps">
  </picture>
</template>

<script setup lang="ts">
import type { ImgHTMLAttributes } from 'vue'
import { join, map, pipe } from 'remeda'
import { useData } from 'vitepress'
import { computed, useAttrs } from 'vue'

interface Props extends /* @vue-ignore */ ImgHTMLAttributes {
  src: string;
  /** 指定特定尺寸 */
  useSize?: typeof WIDTH_LIST[number];
}

const props = withDefaults(defineProps<Props>(), {
  useSize: undefined,
})

const { isDark } = useData()

const attrs = useAttrs()

const WIDTH_LIST = [700, 300] as const

// 去除附檔名
const fileName = computed(() => props.src
  .split('.')
  .slice(0, -1)
  .join('.'),
)

const imgProps = computed(() => ({
  ...props,
  ...attrs,
  src: isDark.value ? props.src.replace('.webp', '-dark.webp') : props.src,
}))

/** 抽取邏輯：根據傳入的檔名 (baseName) 產生對應的 srcset 字串
 */
function getSrcset(baseName: string) {
  // 指定特定尺寸
  if (props.useSize) {
    return `${baseName}-${props.useSize}.webp`
  }

  // 產生響應式清單
  return pipe(
    WIDTH_LIST,
    map((size) => `${baseName}-${size}.webp ${size}w`),
    join(', '),
  )
}

/** 一般模式的 srcset */
const lightSrcset = computed(() => getSrcset(fileName.value))

/** 暗黑模式的 srcset
 * 邏輯：在原檔名後加上 -dark
 * 例如：image-700.webp -> image-dark-700.webp
 */
const darkSrcset = computed(() => getSrcset(`${fileName.value}-dark`))

const sourceVisible = computed(() => {
  /** DEV 模式不顯示響應式圖片 */
  if (import.meta.env.DEV) {
    return false
  }

  /** gif 不特別處理 */
  return !props.src.includes('.gif')
})
</script>
