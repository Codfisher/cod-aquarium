<template>
  <interval-card
    label="effectScope 補救"
    :correct="true"
    :show="showScope"
    :count="scopeCount"
    :leaking="!showScope && scopeCount > scopeCountWhenDestroyed"
    :stopped="!showScope && scopeCount <= scopeCountWhenDestroyed"
    @toggle="toggleScope()"
  >
    <interval-effect-scope v-if="showScope && isMounted" />
  </interval-card>
</template>

<script setup lang="ts">
import { useMounted } from '@vueuse/core'
import { ref } from 'vue'
import IntervalCard from './interval-card.vue'
import IntervalEffectScope from './interval-effect-scope.vue'
import { resetScopeCount, scopeCount } from './interval-store'

/** 示範元件一掛載就啟動 setInterval，只在瀏覽器渲染：預先渲染時跑計時器沒有意義，Nuxt 在 dev 遇到 server 端的 setInterval 還會直接報錯 */
const isMounted = useMounted()

const showScope = ref(true)
const scopeCountWhenDestroyed = ref(0)

function toggleScope() {
  if (showScope.value) {
    scopeCountWhenDestroyed.value = scopeCount.value
  }
  else {
    resetScopeCount()
    scopeCountWhenDestroyed.value = 0
  }
  showScope.value = !showScope.value
}
</script>
