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
        stroke-width="2"
        class="transition-[x1,y1,x2,y2] duration-50"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const lineCount = 7
const tickCount = 18
const tickLength = 18
const tickSpread = 30
const lineSpacing = 36

function getLineY(row: number): number {
  return 30 + (row - 1) * lineSpacing
}

function getTickX(tick: number): number {
  return 30 + (tick - 1) * 19
}

function getTickDirection(row: number): number {
  return row % 2 === 0 ? 1 : -1
}
</script>
