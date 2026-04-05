<template>
  <svg
    viewBox="0 0 400 200"
    class="w-full max-w-sm mx-auto"
  >
    <!-- 左側背景（深色 → 中灰） -->
    <rect
      x="10" y="10" width="180" height="180"
      :fill="leftBackground" rx="8"
      class="transition-[fill] duration-500"
    />

    <!-- 右側背景（淺色 → 中灰） -->
    <rect
      x="210" y="10" width="180" height="180"
      :fill="rightBackground" rx="8"
      class="transition-[fill] duration-500"
    />

    <!-- 左側灰色方塊 -->
    <rect x="55" y="55" width="90" height="90" :fill="targetColor" rx="4" />

    <!-- 右側灰色方塊 -->
    <rect x="255" y="55" width="90" height="90" :fill="targetColor" rx="4" />

    <!-- 連接帶：兩個方塊之間的同色色帶 -->
    <rect
      x="145"
      y="75"
      width="110"
      height="50"
      :fill="targetColor"
      :opacity="progress"
      class="transition-opacity duration-500"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  revealPercent: number;
}>()

const targetColor = '#808080'

const progress = computed(() => props.revealPercent / 100)

const leftBackground = computed(() => lerpColor('#2a2a2a', '#808080', progress.value))
const rightBackground = computed(() => lerpColor('#d6d6d6', '#808080', progress.value))

function lerpColor(from: string, to: string, t: number): string {
  const f = parseInt(from.slice(1), 16)
  const toVal = parseInt(to.slice(1), 16)

  const r = Math.round(((f >> 16) & 0xff) + (((toVal >> 16) & 0xff) - ((f >> 16) & 0xff)) * t)
  const g = Math.round(((f >> 8) & 0xff) + (((toVal >> 8) & 0xff) - ((f >> 8) & 0xff)) * t)
  const b = Math.round((f & 0xff) + ((toVal & 0xff) - (f & 0xff)) * t)

  return `rgb(${r}, ${g}, ${b})`
}
</script>
