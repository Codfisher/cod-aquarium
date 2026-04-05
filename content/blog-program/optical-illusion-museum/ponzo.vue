<template>
  <svg
    viewBox="0 0 400 300"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 收斂線（向兩側張開） -->
    <line
      x1="200" y1="20"
      :x2="60 - progress * 40" y2="280"
      stroke="currentColor" stroke-width="2"
      :opacity="1 - progress"
      class="transition-[x2,opacity] duration-500"
    />
    <line
      x1="200" y1="20"
      :x2="340 + progress * 40" y2="280"
      stroke="currentColor" stroke-width="2"
      :opacity="1 - progress"
      class="transition-[x2,opacity] duration-500"
    />

    <!-- 橫向參考線（透視感） -->
    <line
      v-for="i in 6"
      :key="`ref-${i}`"
      :x1="200 - (20 + i * 18)"
      :y1="40 + i * 40"
      :x2="200 + (20 + i * 18)"
      :y2="40 + i * 40"
      stroke="currentColor"
      stroke-width="1"
      :opacity="(1 - progress) * 0.2"
      class="transition-opacity duration-300"
    />

    <!-- 上方橫線 -->
    <line
      x1="145" y1="100" x2="255" y2="100"
      stroke="#f97316" stroke-width="5" stroke-linecap="round"
    />

    <!-- 下方橫線 -->
    <line
      x1="145" y1="220" x2="255" y2="220"
      stroke="#6366f1" stroke-width="5" stroke-linecap="round"
    />

    <!-- 對齊輔助線 -->
    <g :opacity="progress" class="transition-opacity duration-300">
      <line x1="145" y1="90" x2="145" y2="230" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,4" />
      <line x1="255" y1="90" x2="255" y2="230" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,4" />
      <text x="200" y="88" text-anchor="middle" fill="#f97316" font-size="13" font-weight="bold">110px</text>
      <text x="200" y="250" text-anchor="middle" fill="#6366f1" font-size="13" font-weight="bold">110px</text>
    </g>

    <!-- 標籤 -->
    <text x="280" y="105" fill="#f97316" font-size="14" :opacity="1 - progress" class="transition-opacity duration-300">較長？</text>
    <text x="280" y="225" fill="#6366f1" font-size="14" :opacity="1 - progress" class="transition-opacity duration-300">較短？</text>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)
</script>
