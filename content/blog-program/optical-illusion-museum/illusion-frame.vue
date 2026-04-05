<template>
  <div class="flex flex-col gap-4 rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-gray-50/50 dark:bg-gray-900/50">
    <div class="text-base font-medium">
      {{ title }}
    </div>

    <slot :reveal-percent="revealPercent" />

    <div class="flex items-center gap-3">
      <span class="shrink-0 text-xs opacity-60">
        錯覺
      </span>

      <u-slider
        v-model="revealPercent"
        :min="0"
        :max="100"
        class="flex-1"
      />

      <span class="shrink-0 text-xs opacity-60">
        真相
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  title: string;
}>()

const revealPercent = ref(0)
</script>
