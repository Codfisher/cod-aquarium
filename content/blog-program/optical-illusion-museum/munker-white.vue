<template>
  <svg
    viewBox="0 0 400 300"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 左側區塊 -->
    <g>
      <!-- 背景 -->
      <rect x="20" y="30" width="160" height="240" fill="#ffffff" />

      <!-- 條紋 -->
      <rect
        v-for="i in stripeCount"
        :key="`left-stripe-${i}`"
        x="20"
        :y="30 + (i - 1) * stripeHeight"
        width="160"
        height="20"
        fill="#000000"
      />

      <!-- 灰色目標（往右移動到中間） -->
      <rect
        :x="60 + progress * 100"
        y="70" width="80" height="160"
        :fill="targetColor"
        class="transition-[x] duration-150"
      />
    </g>

    <!-- 右側區塊 -->
    <g>
      <!-- 背景 -->
      <rect x="220" y="30" width="160" height="240" fill="#000000" />

      <!-- 條紋 -->
      <rect
        v-for="i in stripeCount"
        :key="`right-stripe-${i}`"
        x="220"
        :y="30 + (i - 1) * stripeHeight"
        width="160"
        height="20"
        fill="#ffffff"
      />

      <!-- 灰色目標（往左移動到中間） -->
      <rect
        :x="260 - progress * 100"
        y="70" width="80" height="160"
        :fill="targetColor"
        class="transition-[x] duration-150"
      />
    </g>

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
</script>
