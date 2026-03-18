<template>
  <span class="text-xs opacity-50">
    元件已掛載，interval 運作中
  </span>
</template>

<script setup lang="ts">
import { syncCount } from './interval-store'
import { useIntervalFnSimple } from './use-interval-fn-simple'

// ✓ 在同步流程中呼叫，onUnmounted 綁定元件實例
useIntervalFnSimple(() => {
  syncCount.value++
}, 1000)
</script>
