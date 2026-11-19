<template>
  <div class="grid md:grid-cols-2 gap-4">
    <interval-card
      label="同步呼叫"
      :correct="true"
      :show="showSync"
      :count="syncCount"
      :leaking="!showSync && syncCount > syncCountWhenDestroyed"
      :stopped="!showSync && syncCount <= syncCountWhenDestroyed"
      @toggle="toggleSync()"
    >
      <interval-top-level v-if="showSync && isMounted" />
    </interval-card>

    <interval-card
      label="非同步呼叫"
      :correct="false"
      :show="showAsync"
      :count="asyncCount"
      :leaking="!showAsync && asyncCount > asyncCountWhenDestroyed"
      :stopped="!showAsync && asyncCount <= asyncCountWhenDestroyed"
      @toggle="toggleAsync()"
    >
      <interval-in-timeout v-if="showAsync && isMounted" />
    </interval-card>
  </div>
</template>

<script setup lang="ts">
import { useMounted } from '@vueuse/core'
import { ref } from 'vue'
import IntervalCard from './interval-card.vue'
import IntervalInTimeout from './interval-in-timeout.vue'
import { asyncCount, resetAsyncCount, resetSyncCount, syncCount } from './interval-store'
import IntervalTopLevel from './interval-top-level.vue'

/** 示範元件一掛載就啟動 setInterval，只在瀏覽器渲染：預先渲染時跑計時器沒有意義，Nuxt 在 dev 遇到 server 端的 setInterval 還會直接報錯 */
const isMounted = useMounted()

const showSync = ref(true)
const syncCountWhenDestroyed = ref(0)

const showAsync = ref(true)
const asyncCountWhenDestroyed = ref(0)

function toggleSync() {
  if (showSync.value) {
    syncCountWhenDestroyed.value = syncCount.value
  }
  else {
    resetSyncCount()
    syncCountWhenDestroyed.value = 0
  }
  showSync.value = !showSync.value
}

function toggleAsync() {
  if (showAsync.value) {
    asyncCountWhenDestroyed.value = asyncCount.value
  }
  else {
    resetAsyncCount()
    asyncCountWhenDestroyed.value = 0
  }
  showAsync.value = !showAsync.value
}
</script>
