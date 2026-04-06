<template>
  <svg
    viewBox="0 0 400 300"
    class="w-full max-w-sm mx-auto"
  >
    <rect width="400" height="300" fill="white" />

    <!-- 黑色水平線（底層） -->
    <line
      v-for="i in lineCount"
      :key="`line-${i}`"
      x1="0" :y1="getLineY(i)"
      x2="400" :y2="getLineY(i)"
      stroke="#000000" stroke-width="3"
    />

    <!-- 彩色線段（圓形區域內，覆蓋在黑線上方） -->
    <line
      v-for="segment in coloredSegmentList"
      :key="segment.key"
      :x1="segment.x1" :y1="segment.y"
      :x2="segment.x2" :y2="segment.y"
      stroke="#0088ff" stroke-width="3.5"
      :transform="`translate(${progress * 450}, 0)`"
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

const lineCount = 38
const spacing = 8
const cx = 200
const cy = 150
const radius = 110

function getLineY(i: number): number {
  return (i - 1) * spacing
}

interface Segment {
  key: string;
  x1: number;
  x2: number;
  y: number;
}

const coloredSegmentList: Segment[] = []
for (let i = 1; i <= lineCount; i++) {
  const y = getLineY(i)
  const dy = y - cy
  if (Math.abs(dy) < radius) {
    const dx = Math.sqrt(radius * radius - dy * dy)
    coloredSegmentList.push({
      key: `seg-${i}`,
      x1: cx - dx,
      x2: cx + dx,
      y,
    })
  }
}
</script>
