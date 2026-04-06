<template>
  <svg
    viewBox="0 0 400 400"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 棋盤格 -->
    <template
      v-for="row in 8"
      :key="`row-${row}`"
    >
      <rect
        v-for="col in 8"
        :key="`cell-${row}-${col}`"
        :x="(col - 1) * 50"
        :y="(row - 1) * 50"
        width="50"
        height="50"
        :fill="getCellColor(row, col)"
      />
    </template>

    <!-- 圓柱陰影（opacity 0.45 讓亮格 #a0 降為 #58，與暗格相同） -->
    <ellipse
      cx="250" cy="275"
      rx="110" ry="100"
      fill="rgba(0, 0, 0, 0.45)"
    />

    <!-- A 標記（格內） -->
    <text
      x="175" y="181"
      text-anchor="middle" fill="#ff4444"
      font-size="16" font-weight="bold"
    >A</text>

    <!-- B 標記（格內） -->
    <text
      x="225" y="281"
      text-anchor="middle" fill="#66aaff"
      font-size="16" font-weight="bold"
    >B</text>

    <!-- 連接帶：從右側滑入，證明 A 與 B 同色 -->
    <rect
      x="150" y="175"
      width="100" height="100"
      :fill="darkColor"
      :transform="`translate(${(1 - progress) * 300}, 0)`"
      class="transition-transform duration-150"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

/**
 * 暗格 #585858 (rgb 88)
 * 亮格 #a0a0a0 (rgb 160)
 * 陰影 opacity 0.45 → 亮格渲染為 160 × 0.55 = 88 = #585858
 */
const darkColor = '#585858'
const lightColor = '#a0a0a0'

function getCellColor(row: number, col: number): string {
  const isDark = (row + col) % 2 === 0
  return isDark ? darkColor : lightColor
}
</script>
