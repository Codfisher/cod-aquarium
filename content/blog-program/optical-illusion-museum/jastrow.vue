<template>
  <svg
    viewBox="0 0 400 250"
    class="w-full max-w-sm mx-auto"
  >
    <defs>
      <!-- 扇形用的 clipPath -->
      <clipPath id="jastrow-clip-top">
        <path :d="getArcPath(200, 80, 120, 60)" />
      </clipPath>
      <clipPath id="jastrow-clip-bottom">
        <path :d="getArcPath(200, 160, 120, 60)" />
      </clipPath>
    </defs>

    <!-- 上方弧形（看起來較小） -->
    <path
      :d="getArcPath(200, topY, 120, 60)"
      fill="#6366f1"
      stroke="#4f46e5"
      stroke-width="1"
      class="transition-[d] duration-50"
    />

    <!-- 下方弧形（看起來較大） -->
    <path
      :d="getArcPath(200, bottomY, 120, 60)"
      fill="#f97316"
      stroke="#ea580c"
      stroke-width="1"
      class="transition-[d] duration-50"
    />

    <!-- 揭示時的尺寸標記（上方） -->
    <g :transform="`translate(0, ${(1 - progress) * -40})`" class="transition-transform duration-50">
      <line
        x1="80"
        :y1="topY - 35"
        x2="320"
        :y2="topY - 35"
        stroke="#6366f1"
        stroke-width="2"
      />
      <line x1="80" :y1="topY - 40" x2="80" :y2="topY - 30" stroke="#6366f1" stroke-width="2" />
      <line x1="320" :y1="topY - 40" x2="320" :y2="topY - 30" stroke="#6366f1" stroke-width="2" />
      <text
        x="200"
        :y="topY - 42"
        text-anchor="middle"
        fill="#6366f1"
        font-size="13"
        font-weight="bold"
      >240px</text>
    </g>

    <!-- 揭示時的尺寸標記（下方） -->
    <g :transform="`translate(0, ${(1 - progress) * 40})`" class="transition-transform duration-50">
      <line
        x1="80"
        :y1="bottomY + 65"
        x2="320"
        :y2="bottomY + 65"
        stroke="#f97316"
        stroke-width="2"
      />
      <line x1="80" :y1="bottomY + 60" x2="80" :y2="bottomY + 70" stroke="#f97316" stroke-width="2" />
      <line x1="320" :y1="bottomY + 60" x2="320" :y2="bottomY + 70" stroke="#f97316" stroke-width="2" />
      <text
        x="200"
        :y="bottomY + 82"
        text-anchor="middle"
        fill="#f97316"
        font-size="13"
        font-weight="bold"
      >240px</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const topY = computed(() => {
  const base = 80
  const target = 90
  return base + (target - base) * (props.revealPercent / 100)
})

const bottomY = computed(() => {
  const base = 140
  const target = 150
  return base + (target - base) * (props.revealPercent / 100)
})

function getArcPath(
  cx: number,
  cy: number,
  width: number,
  height: number,
): string {
  const outerRadius = width
  const innerRadius = width - height

  const startAngle = Math.PI + 0.3
  const endAngle = 2 * Math.PI - 0.3

  const outerX1 = cx + outerRadius * Math.cos(startAngle)
  const outerY1 = cy + outerRadius * Math.sin(startAngle)
  const outerX2 = cx + outerRadius * Math.cos(endAngle)
  const outerY2 = cy + outerRadius * Math.sin(endAngle)

  const innerX1 = cx + innerRadius * Math.cos(endAngle)
  const innerY1 = cy + innerRadius * Math.sin(endAngle)
  const innerX2 = cx + innerRadius * Math.cos(startAngle)
  const innerY2 = cy + innerRadius * Math.sin(startAngle)

  return [
    `M ${outerX1} ${outerY1}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerX2} ${outerY2}`,
    `L ${innerX1} ${innerY1}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerX2} ${innerY2}`,
    'Z',
  ].join(' ')
}
</script>
