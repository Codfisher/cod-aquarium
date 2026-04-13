<template>
  <div
    v-bind="containerProps"
    class="overflow-auto p-2 border border-gray-300 dark:border-gray-600 rounded opacity-80"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="item in list"
        :key="item.index"
        class="mb-2 flex items-center justify-center h-10 bg-gray-200/50 dark:bg-gray-700/50"
      >
        Row {{ item.index }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'

const allItems = Array
  .from({ length: 50000 })
  .map((_, index) => ({ index, value: `${index}` }))

const { list, containerProps, wrapperProps } = useVirtualList(
  allItems,
  { itemHeight: 40 },
)
</script>
