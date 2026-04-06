<template>
  <svg
    viewBox="0 0 400 200"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 左側：大圓包圍（散開消失） -->
    <circle
      v-for="(pos, index) in leftSurroundPositionList"
      :key="`left-${index}`"
      :cx="pos.x + (pos.x - 100) * progress * 2"
      :cy="pos.y + (pos.y - 100) * progress * 2"
      :r="bigRadius * (1 - progress)"
      fill="#6366f1"
      class="transition-[cx,cy,r] duration-50"
    />

    <!-- 左側中心圓 -->
    <circle cx="100" cy="100" :r="centerRadius" fill="#f97316" />

    <!-- 右側：小圓包圍（散開消失） -->
    <circle
      v-for="(pos, index) in rightSurroundPositionList"
      :key="`right-${index}`"
      :cx="pos.x + (pos.x - 300) * progress * 2"
      :cy="pos.y + (pos.y - 100) * progress * 2"
      :r="smallRadius * (1 - progress)"
      fill="#6366f1"
      class="transition-[cx,cy,r] duration-50"
    />

    <!-- 右側中心圓 -->
    <circle cx="300" cy="100" :r="centerRadius" fill="#f97316" />

    <!-- 揭示時的尺寸對齊線 -->
    <line
      x1="100" y1="75" x2="300" y2="75"
      stroke="#ef4444" stroke-width="1" stroke-dasharray="4,4"
      :transform="`translate(0, ${(1 - progress) * -40})`"
      class="transition-transform duration-50"
    />
    <line
      x1="100" y1="125" x2="300" y2="125"
      stroke="#ef4444" stroke-width="1" stroke-dasharray="4,4"
      :transform="`translate(0, ${(1 - progress) * 40})`"
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

const centerRadius = 20
const bigRadius = 30
const smallRadius = 10

function generateSurroundPositionList(
  centerX: number,
  centerY: number,
  distance: number,
  count: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    }
  })
}

const leftSurroundPositionList = generateSurroundPositionList(100, 100, 62, 6)
const rightSurroundPositionList = generateSurroundPositionList(300, 100, 38, 8)
</script>
