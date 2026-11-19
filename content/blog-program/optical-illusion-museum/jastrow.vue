<template>
  <svg
    viewBox="0 0 400 240"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 上方弧形 A（稍微偏右） -->
    <path
      :d="getArcPath(topCx, topCy)"
      fill="#6366f1"
      stroke="#4f46e5"
      stroke-width="1.5"
    />

    <!-- 下方弧形 B（稍微偏左，揭示時移動到與 A 重疊） -->
    <path
      :d="getArcPath(bottomCx, bottomCy)"
      fill="#f97316"
      stroke="#ea580c"
      stroke-width="1.5"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const outerRadius = 280
const innerRadius = 200
const sweepDeg = 55
const halfSweep = (sweepDeg / 2) * (Math.PI / 180)

/** 座標取到小數 3 位。Node（預先渲染）與瀏覽器的三角函數在最後幾位小數會有差異，不取整會造成 hydration 不一致 */
function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000
}

function getArcPath(cx: number, cy: number): string {
  const angleLeft = Math.PI / 2 + halfSweep
  const angleRight = Math.PI / 2 - halfSweep

  const oLx = roundCoordinate(cx + outerRadius * Math.cos(angleLeft))
  const oLy = roundCoordinate(cy - outerRadius * Math.sin(angleLeft))
  const oRx = roundCoordinate(cx + outerRadius * Math.cos(angleRight))
  const oRy = roundCoordinate(cy - outerRadius * Math.sin(angleRight))

  const iLx = roundCoordinate(cx + innerRadius * Math.cos(angleLeft))
  const iLy = roundCoordinate(cy - innerRadius * Math.sin(angleLeft))
  const iRx = roundCoordinate(cx + innerRadius * Math.cos(angleRight))
  const iRy = roundCoordinate(cy - innerRadius * Math.sin(angleRight))

  return [
    `M ${oLx} ${oLy}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${oRx} ${oRy}`,
    `L ${iRx} ${iRy}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${iLx} ${iLy}`,
    'Z',
  ].join(' ')
}

// A 的位置（偏右，固定）
const aCx = 215
const aCy = 120 + outerRadius * Math.cos(halfSweep)

// B 的錯覺位置（偏左，內弧頂部剛好貼著 A 外弧底部，不重疊）
const bCx = 185
const bCy = 110 + innerRadius

// A 位置
const topCx = aCx
const topCy = aCy

// B 位置：從錯覺位置移動到與 A 完全重疊
const bottomCx = computed(() => bCx + (aCx - bCx) * progress.value)
const bottomCy = computed(() => bCy + (aCy - bCy) * progress.value)
</script>
