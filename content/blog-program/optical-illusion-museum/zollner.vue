<template>
  <svg
    viewBox="0 0 400 300"
    class="w-full max-w-sm mx-auto"
  >
    <g
      v-for="row in lineCount"
      :key="`row-${row}`"
    >
      <!-- 主要平行線 -->
      <line
        x1="30" :y1="getLineY(row)"
        x2="370" :y2="getLineY(row)"
        stroke="currentColor" stroke-width="3"
      />

      <!-- 交叉短線（縮短消失） -->
      <line
        v-for="tick in tickCount"
        :key="`tick-${row}-${tick}`"
        :x1="getTickX(tick)"
        :y1="getLineY(row) - tickLength * (1 - progress)"
        :x2="getTickX(tick) + getTickDirection(row) * tickSpread * (1 - progress)"
        :y2="getLineY(row) + tickLength * (1 - progress)"
        stroke="currentColor"
        stroke-width="1.5"
        class="transition-[x1,y1,x2,y2] duration-50"
      />
    </g>

    <!-- 揭示：平行對齊參考線 -->
    <line
      x1="25" y1="30" x2="25" y2="270"
      stroke="#ef4444" stroke-width="2" stroke-dasharray="4,4"
      :transform="`translate(${(1 - progress) * -30}, 0)`"
      class="transition-transform duration-50"
    />
    <line
      x1="375" y1="30" x2="375" y2="270"
      stroke="#ef4444" stroke-width="2" stroke-dasharray="4,4"
      :transform="`translate(${(1 - progress) * 30}, 0)`"
      class="transition-transform duration-50"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const lineCount = 6
const tickCount = 14
const tickLength = 12
const tickSpread = 14
const lineSpacing = 44

function getLineY(row: number): number {
  return 30 + (row - 1) * lineSpacing
}

function getTickX(tick: number): number {
  return 30 + (tick - 1) * 25
}

function getTickDirection(row: number): number {
  return row % 2 === 0 ? 1 : -1
}
</script>
