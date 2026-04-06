<template>
  <svg
    viewBox="0 0 400 200"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 左側背景（深色） -->
    <rect
      x="10" y="10" width="180" height="180"
      fill="#2a2a2a" rx="8"
    />

    <!-- 右側背景（淺色） -->
    <rect
      x="210" y="10" width="180" height="180"
      fill="#d6d6d6" rx="8"
    />

    <!-- 左側灰色方塊（往右移動到中間） -->
    <rect
      :x="55 + progress * 100"
      y="55" width="90" height="90"
      :fill="targetColor" rx="4"
      class="transition-[x] duration-50"
    />

    <!-- 右側灰色方塊（往左移動到中間） -->
    <rect
      :x="255 - progress * 100"
      y="55" width="90" height="90"
      :fill="targetColor" rx="4"
      class="transition-[x] duration-50"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const targetColor = '#808080'

const progress = computed(() => props.revealPercent / 100)
</script>
