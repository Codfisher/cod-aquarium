<template>
  <span class="text-xs opacity-50">
    interval-top-level 已安裝
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
