<template>
  <svg
    viewBox="0 0 400 300"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 左側區塊 -->
    <g>
      <!-- 背景 -->
      <rect x="20" y="30" width="160" height="240" :fill="leftBackground" class="transition-[fill] duration-150" />

      <!-- 條紋 -->
      <rect
        v-for="i in stripeCount"
        :key="`left-stripe-${i}`"
        x="20"
        :y="30 + (i - 1) * stripeHeight"
        width="160"
        height="20"
        fill="#000000"
        :transform="`translate(${-progress * 180}, 0)`"
        class="transition-transform duration-150"
      />

      <!-- 灰色目標 -->
      <rect x="60" y="70" width="80" height="160" :fill="targetColor" />
    </g>

    <!-- 右側區塊 -->
    <g>
      <!-- 背景 -->
      <rect x="220" y="30" width="160" height="240" :fill="rightBackground" class="transition-[fill] duration-150" />

      <!-- 條紋 -->
      <rect
        v-for="i in stripeCount"
        :key="`right-stripe-${i}`"
        x="220"
        :y="30 + (i - 1) * stripeHeight"
        width="160"
        height="20"
        fill="#ffffff"
        :transform="`translate(${progress * 180}, 0)`"
        class="transition-transform duration-150"
      />

      <!-- 灰色目標 -->
      <rect x="260" y="70" width="80" height="160" :fill="targetColor" />
    </g>

    <!-- 標籤 -->
    <text x="100" y="22" text-anchor="middle" fill="currentColor" font-size="14">
      看起來較深？
    </text>
    <text x="300" y="22" text-anchor="middle" fill="currentColor" font-size="14">
      看起來較淺？
    </text>

    <!-- 揭示文字 -->
    <text
      x="200"
      y="290"
      text-anchor="middle"
      fill="currentColor"
      font-size="14"
      font-weight="bold"
      :transform="`translate(0, ${(1 - progress) * 30})`"
      class="transition-transform duration-150"
    >完全一樣！</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const targetColor = '#808080'
const stripeCount = 7
const stripeHeight = 40

const progress = computed(() => props.revealPercent / 100)

const leftBackground = computed(() => lerpColor('#ffffff', '#808080', progress.value))
const rightBackground = computed(() => lerpColor('#000000', '#808080', progress.value))

function lerpColor(from: string, to: string, t: number): string {
  const f = parseInt(from.slice(1), 16)
  const toVal = parseInt(to.slice(1), 16)

  const r = Math.round(((f >> 16) & 0xff) + (((toVal >> 16) & 0xff) - ((f >> 16) & 0xff)) * t)
  const g = Math.round(((f >> 8) & 0xff) + (((toVal >> 8) & 0xff) - ((f >> 8) & 0xff)) * t)
  const b = Math.round((f & 0xff) + ((toVal & 0xff) - (f & 0xff)) * t)

  return `rgb(${r}, ${g}, ${b})`
}
</script>
