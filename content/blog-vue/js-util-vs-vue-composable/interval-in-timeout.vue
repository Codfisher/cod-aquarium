<template>
  <span class="text-xs opacity-50">
    元件已掛載，interval 運作中
  </span>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { asyncCount } from './interval-store'
import { useIntervalFnSimple } from './use-interval-fn-simple'

// ✗ 模擬非同步操作（例如等待 API 回應）後才啟動 interval
// setTimeout callback 執行時，已經脫離元件的同步流程
// onUnmounted 無法正確註冊，元件銷毀後 interval 不會被清除
setTimeout(() => {
  useIntervalFnSimple(() => {
    asyncCount.value++
  }, 1000)
}, 1000)
</script>
