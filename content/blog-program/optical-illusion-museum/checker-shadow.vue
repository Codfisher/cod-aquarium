<template>
  <div class="relative w-full max-w-sm mx-auto overflow-hidden">
    <img
      src="https://persci.mit.edu/wp-content/uploads/checkershadow_illusion4full-1024x796.jpg"
      alt="Checker Shadow Illusion"
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
