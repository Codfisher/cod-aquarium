<template>
  <span class="text-xs opacity-50">
    interval-effect-scope 已安裝
  </span>
</template>

<script setup lang="ts">
import { effectScope } from 'vue'
import { scopeCount } from './interval-store'
import { useIntervalFnSimple } from './use-interval-fn-simple'

// 在同步流程中建立 scope，會自動成為元件 scope 的子 scope，除非將 detached 設為 true
const scope = effectScope()

// ✓ 雖然在 setTimeout（非同步）中呼叫，但用 effectScope 包住
// composable 內部的 onScopeDispose 會被收集到 scope 中
// 元件銷毀時 scope 自動停止，interval 也跟著被清除
setTimeout(() => scope.run(() => {
  useIntervalFnSimple(() => {
    scopeCount.value++
  }, 1000)
}), 1000)
</script>
