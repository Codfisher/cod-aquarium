<template>
  <div class="relative w-full max-w-sm mx-auto overflow-hidden rounded-2xl">
    <!-- 原圖出自 Edward Adelson（persci.mit.edu），對方網站憑證過期導致外連圖片載不出來，改放站內 -->
    <img
      src="/optical-illusion-museum/checker-shadow.webp"
      alt="Checker Shadow Illusion"
      width="1024"
      height="796"
      class="block w-full"
    >

    <!-- 全高度灰色方塊，從右往左滑入 -->
    <div
      class="absolute inset-y-0"
      :style="{
        width: '15%',
        backgroundColor: grayColor,
        left: `${100 - progress * 66}%`,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

/** A 格與 B 格的實際顏色 */
const grayColor = '#787878'
</script>
