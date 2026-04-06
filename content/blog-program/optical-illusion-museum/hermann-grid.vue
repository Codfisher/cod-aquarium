<template>
  <svg
    viewBox="0 0 360 360"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 背景白色 -->
    <rect width="360" height="360" fill="#ffffff" />

    <!-- 黑色方塊（縮小離開） -->
    <rect
      v-for="cell in cellList"
      :key="`cell-${cell.row}-${cell.col}`"
      :x="getCellX(cell) + cellShrinkOffset"
      :y="getCellY(cell) + cellShrinkOffset"
      :width="Math.max(0, shrunkCellSize)"
      :height="Math.max(0, shrunkCellSize)"
      fill="#000000"
      class="transition-[x,y,width,height] duration-50"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const gridCount = 5
const lineWidth = 10
const cellSize = 62

interface Cell {
  row: number;
  col: number;
}

const cellList: Cell[] = []
for (let row = 0; row < gridCount; row++) {
  for (let col = 0; col < gridCount; col++) {
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
</script>
