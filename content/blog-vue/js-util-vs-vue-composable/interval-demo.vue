<template>
  <div class="grid md:grid-cols-2 gap-4">
    <!-- 同步呼叫（正確） -->
    <div
      class="flex flex-col gap-3 rounded-xl border p-4"
      :class="showSync
        ? 'border-green-200 dark:border-green-900/40 bg-green-50/30 dark:bg-green-950/10'
        : syncCount > syncCountWhenDestroyed
          ? 'border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10'
          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/10'
      "
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="size-2 rounded-full"
            :class="showSync ? 'bg-green-400' : 'bg-neutral-400'"
          />
          <span class="text-sm font-medium">
            ✓ 同步呼叫
          </span>
        </div>

        <u-button
          :color="showSync ? 'error' : 'primary'"
          size="xs"
          @click="toggleSync()"
        >
          {{ showSync ? '銷毀元件' : '建立元件' }}
        </u-button>
      </div>

      <div class="flex items-center gap-3 min-h-8">
        <span class="tabular-nums font-mono text-2xl font-bold">
          {{ syncCount }}
        </span>

        <span class="text-xs opacity-50">
          次
        </span>
      </div>

      <div class="min-h-6">
        <interval-top-level v-if="showSync" />
        <span
          v-else
          class="text-xs"
          :class="syncCount > syncCountWhenDestroyed
            ? 'text-red-500 dark:text-red-400'
            : 'text-green-500 dark:text-green-400'
          "
        >
          {{ syncCount > syncCountWhenDestroyed
            ? '✗ interval 還在跑！'
            : '✓ interval 已停止'
          }}
        </span>
      </div>
    </div>

    <!-- 非同步呼叫（錯誤） -->
    <div
      class="flex flex-col gap-3 rounded-xl border p-4"
      :class="showAsync
        ? 'border-orange-200 dark:border-orange-900/40 bg-orange-50/30 dark:bg-orange-950/10'
        : asyncCount > asyncCountWhenDestroyed
          ? 'border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/10'
          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/10'
      "
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="size-2 rounded-full"
            :class="showAsync ? 'bg-orange-400' : 'bg-neutral-400'"
          />
          <span class="text-sm font-medium">
            ✗ 非同步呼叫
          </span>
        </div>

        <u-button
          :color="showAsync ? 'error' : 'primary'"
          size="xs"
          @click="toggleAsync()"
        >
          {{ showAsync ? '銷毀元件' : '建立元件' }}
        </u-button>
      </div>

      <div class="flex items-center gap-3 min-h-8">
        <span class="tabular-nums font-mono text-2xl font-bold">
          {{ asyncCount }}
        </span>

        <span class="text-xs opacity-50">
          次
        </span>
      </div>

      <div class="min-h-6">
        <interval-in-timeout v-if="showAsync" />
        <span
          v-else
          class="text-xs"
          :class="asyncCount > asyncCountWhenDestroyed
            ? 'text-red-500 dark:text-red-400'
            : 'text-green-500 dark:text-green-400'
          "
        >
          {{ asyncCount > asyncCountWhenDestroyed
            ? '✗ interval 還在跑！(memory leak)'
            : '✓ interval 已停止'
          }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import IntervalInTimeout from './interval-in-timeout.vue'
import { asyncCount, resetAsyncCount, resetSyncCount, syncCount } from './interval-store'
import IntervalTopLevel from './interval-top-level.vue'

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
