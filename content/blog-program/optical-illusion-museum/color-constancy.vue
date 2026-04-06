<template>
  <div class="relative w-full max-w-sm mx-auto" :style="{ aspectRatio: '4/3' }">
    <svg
      viewBox="0 0 400 300"
      class="w-full h-full"
    >
      <!-- 白色底 -->
      <rect width="400" height="300" fill="#ffffff" />

      <!-- 負片色彩圖案（盯著看 15 秒再切換） -->
      <g v-if="progress < 0.5">
        <!-- 青色圓形（紅色的互補色） -->
        <circle cx="130" cy="120" r="50" fill="#00cccc" />
        <circle cx="270" cy="120" r="50" fill="#00cccc" />
        <circle cx="200" cy="200" r="50" fill="#00cccc" />

        <!-- 綠色三角形（洋紅的互補色） -->
        <polygon points="200,30 160,90 240,90" fill="#00cc00" />

        <!-- 黃色方塊（藍色的互補色） -->
        <rect x="80" y="200" width="60" height="60" fill="#cccc00" rx="4" />
        <rect x="260" y="200" width="60" height="60" fill="#cccc00" rx="4" />

        <!-- 中心十字 -->
        <line x1="195" y1="150" x2="205" y2="150" stroke="#333" stroke-width="3" />
        <line x1="200" y1="145" x2="200" y2="155" stroke="#333" stroke-width="3" />
      </g>

      <!-- 空白畫面（殘影出現區） -->
      <g v-else>
        <!-- 中心十字 -->
        <line x1="195" y1="150" x2="205" y2="150" stroke="#aaa" stroke-width="3" />
        <line x1="200" y1="145" x2="200" y2="155" stroke="#aaa" stroke-width="3" />
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)
</script>
