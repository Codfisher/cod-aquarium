<template>
  <svg
    viewBox="0 0 400 200"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 上方線段：向外箭頭 -->
    <g>
      <line x1="100" y1="70" x2="300" y2="70" stroke="currentColor" stroke-width="3" />
      <!-- 左側向外箭頭（收縮回去） -->
      <line
        x1="100" y1="70"
        :x2="100 - arrowOffset * (1 - progress)" :y2="70 - arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <line
        x1="100" y1="70"
        :x2="100 - arrowOffset * (1 - progress)" :y2="70 + arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <!-- 右側向外箭頭 -->
      <line
        x1="300" y1="70"
        :x2="300 + arrowOffset * (1 - progress)" :y2="70 - arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <line
        x1="300" y1="70"
        :x2="300 + arrowOffset * (1 - progress)" :y2="70 + arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
    </g>

    <!-- 下方線段：向內箭頭 -->
    <g>
      <line x1="100" y1="130" x2="300" y2="130" stroke="currentColor" stroke-width="3" />
      <!-- 左側向內箭頭 -->
      <line
        x1="100" y1="130"
        :x2="100 + arrowOffset * (1 - progress)" :y2="130 - arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <line
        x1="100" y1="130"
        :x2="100 + arrowOffset * (1 - progress)" :y2="130 + arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <!-- 右側向內箭頭 -->
      <line
        x1="300" y1="130"
        :x2="300 - arrowOffset * (1 - progress)" :y2="130 - arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
      <line
        x1="300" y1="130"
        :x2="300 - arrowOffset * (1 - progress)" :y2="130 + arrowSize * (1 - progress)"
        stroke="currentColor" stroke-width="3"
        class="transition-[x2,y2] duration-500"
      />
    </g>

    <!-- 對齊輔助線 -->
    <g :opacity="progress" class="transition-opacity duration-300">
      <line x1="100" y1="55" x2="100" y2="145" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4,4" />
      <line x1="300" y1="55" x2="300" y2="145" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4,4" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const progress = computed(() => props.revealPercent / 100)

const arrowSize = 20
const arrowOffset = 25
</script>
