<template>
  <svg
    viewBox="0 0 400 400"
    class="w-full max-w-sm mx-auto"
  >
    <defs>
      <clipPath id="checker-board-clip">
        <rect x="0" y="0" width="400" height="400" />
      </clipPath>
    </defs>

    <!-- 棋盤格 -->
    <g clip-path="url(#checker-board-clip)">
      <template
        v-for="row in 8"
        :key="`row-${row}`"
      >
        <rect
          v-for="col in 8"
          :key="`cell-${row}-${col}`"
          :x="getCellX(row, col)"
          :y="getCellY(row, col)"
          width="50"
          height="50"
          :fill="getCellColor(row, col)"
          class="transition-[x,y] duration-500"
        />
      </template>
    </g>

    <!-- 圓柱陰影 -->
    <ellipse
      cx="225"
      cy="225"
      rx="100"
      ry="100"
      :fill="`rgba(0, 0, 0, ${0.4 * (1 - progress)})`"
      class="transition-[fill] duration-300"
    />

    <!-- 連接帶：揭示時在 A、B 之間畫同色帶 -->
    <rect
      :x="175"
      :y="175"
      width="100"
      height="150"
      :fill="targetColor"
      :opacity="Math.max(0, (progress - 0.5) * 2)"
      class="transition-opacity duration-300"
    />

    <!-- 標記 A 格 -->
    <g>
      <rect
        :x="getCellX(4, 4)"
        :y="getCellY(4, 4)"
        width="50"
        height="50"
        fill="none"
        stroke="#ff4444"
        stroke-width="3"
        rx="2"
        class="transition-[x,y] duration-500"
      />
      <text
        :x="getCellX(4, 4) + 25"
        :y="getCellY(4, 4) - 8"
        text-anchor="middle"
        fill="#ff4444"
        font-size="20"
        font-weight="bold"
        class="transition-[x,y] duration-500"
      >A</text>
    </g>

    <!-- 標記 B 格 -->
    <g>
      <rect
        :x="getCellX(7, 6)"
        :y="getCellY(7, 6)"
        width="50"
        height="50"
        fill="none"
        stroke="#4488ff"
        stroke-width="3"
        rx="2"
        class="transition-[x,y] duration-500"
      />
      <text
        :x="getCellX(7, 6) + 25"
        :y="getCellY(7, 6) - 8"
        text-anchor="middle"
        fill="#4488ff"
        font-size="20"
        font-weight="bold"
        class="transition-[x,y] duration-500"
      >B</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const targetColor = '#787878'

const progress = computed(() => props.revealPercent / 100)

function isTarget(row: number, col: number): boolean {
  return (row === 4 && col === 4) || (row === 7 && col === 6)
}

function getCellColor(row: number, col: number): string {
  if (isTarget(row, col)) return targetColor
  const isDark = (row + col) % 2 === 0
  return isDark ? '#585858' : '#a0a0a0'
}

function getCellX(row: number, col: number): number {
  const baseX = (col - 1) * 50
  if (isTarget(row, col)) return baseX

  const targetCenterX = row === 4 ? 175 : 275
  const dx = baseX - targetCenterX
  return baseX + dx * progress.value * 0.6
}

function getCellY(row: number, col: number): number {
  const baseY = (row - 1) * 50
  if (isTarget(row, col)) return baseY

  const targetCenterY = row <= 5 ? 175 : 300
  const dy = baseY - targetCenterY
  return baseY + dy * progress.value * 0.6
}
</script>
