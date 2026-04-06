<template>
  <svg
    viewBox="0 0 360 360"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 白色格線 + 黑色方塊，方塊縮小揭示 -->
    <!-- 垂直白線 -->
    <rect
      v-for="col in gridLineCount"
      :key="`v-${col}`"
      :x="(col - 1) * (cellSize + lineWidth)"
      y="0"
      :width="lineWidth"
      height="360"
      :fill="lineColor"
    />

    <!-- 水平白線 -->
    <rect
      v-for="row in gridLineCount"
      :key="`h-${row}`"
      x="0"
      :y="(row - 1) * (cellSize + lineWidth)"
      width="360"
      :height="lineWidth"
      :fill="lineColor"
    />

    <!-- 黑色方塊（縮小離開） -->
    <rect
      v-for="cell in cellList"
      :key="`cell-${cell.row}-${cell.col}`"
      :x="getCellX(cell) + cellShrinkOffset"
      :y="getCellY(cell) + cellShrinkOffset"
      :width="Math.max(0, shrunkCellSize)"
      :height="Math.max(0, shrunkCellSize)"
      fill="#1a1a1a"
      rx="2"
      class="transition-[x,y,width,height] duration-150"
    />

    <!-- 揭示：在交叉點畫紅圈 -->
    <circle
      v-for="(pos, index) in intersectionList"
      :key="`circle-${index}`"
      :cx="pos.x"
      :cy="pos.y"
      :r="progress * 10"
      fill="none"
      stroke="#ef4444"
      stroke-width="2"
      class="transition-[r] duration-150"
    />

  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const gridLineCount = 6
const lineWidth = 12
const cellSize = 48

const lineColor = '#e0e0e0'

interface Cell {
  row: number;
  col: number;
}

const cellList: Cell[] = []
for (let row = 0; row < gridLineCount - 1; row++) {
  for (let col = 0; col < gridLineCount - 1; col++) {
    cellList.push({ row, col })
  }
}

const shrunkCellSize = computed(() => cellSize * (1 - progress.value * 0.8))
const cellShrinkOffset = computed(() => (cellSize - shrunkCellSize.value) / 2)

function getCellX(cell: Cell): number {
  return cell.col * (cellSize + lineWidth) + lineWidth
}

function getCellY(cell: Cell): number {
  return cell.row * (cellSize + lineWidth) + lineWidth
}

interface Position {
  x: number;
  y: number;
}

const intersectionList: Position[] = []
for (let row = 1; row < gridLineCount; row++) {
  for (let col = 1; col < gridLineCount; col++) {
    intersectionList.push({
      x: col * (cellSize + lineWidth) + lineWidth / 2,
      y: row * (cellSize + lineWidth) + lineWidth / 2,
    })
  }
}
</script>
