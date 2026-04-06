<template>
  <svg
    viewBox="0 0 400 280"
    class="w-full max-w-sm mx-auto"
  >
    <g
      v-for="row in rowCount"
      :key="`row-${row}`"
    >
      <!-- 灰色間隔線（水平線，始終顯示） -->
      <rect
        x="10"
        :y="getRowY(row)"
        width="380"
        height="2"
        fill="#888888"
      />

      <!-- 黑白磚塊（向兩側滑出） -->
      <rect
        v-for="col in colCount"
        :key="`brick-${row}-${col}`"
        :x="getBrickX(row, col)"
        :y="getRowY(row) + 2"
        :width="brickWidth"
        :height="brickHeight - 2"
        :fill="(col % 2 === 0) ? '#1a1a1a' : '#e8e8e8'"
        :transform="`translate(${getSlideOffset(row, col)}, 0)`"
        class="transition-transform duration-150"
      />
    </g>

    <!-- 最底部的線 -->
    <rect
      x="10"
      :y="getRowY(rowCount + 1)"
      width="380"
      height="2"
      fill="#888888"
    />

    <!-- 揭示用的平行對齊參考線 -->
    <line
      x1="5" y1="10" x2="5" y2="270"
      stroke="#ef4444" stroke-width="2" stroke-dasharray="4,4"
      :transform="`translate(${(1 - progress) * -30}, 0)`"
      class="transition-transform duration-150"
    />
    <line
      x1="395" y1="10" x2="395" y2="270"
      stroke="#ef4444" stroke-width="2" stroke-dasharray="4,4"
      :transform="`translate(${(1 - progress) * 30}, 0)`"
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

const rowCount = 8
const colCount = 8
const brickWidth = 48
const brickHeight = 30

function getRowY(row: number): number {
  return 10 + (row - 1) * brickHeight
}

function getBrickX(row: number, col: number): number {
  const offset = ((row - 1) % 3) * (brickWidth / 3)
  return 10 + (col - 1) * brickWidth + offset
}

function getSlideOffset(row: number, col: number): number {
  const direction = col <= colCount / 2 ? -1 : 1
  return direction * progress.value * 400
}
</script>
