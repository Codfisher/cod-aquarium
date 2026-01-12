<template>
  <div
    v-bind="containerProps"
    class="h-[50vh] overflow-auto p-2 border rounded"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ index } in list"
        :key="index"
        class="border mb-2 flex items-center justify-center h-[40px]"
      >
        Row {{ index }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'

const allItems = Array.from(Array.from({ length: 99999 })
  .keys())

const { list, containerProps, wrapperProps } = useVirtualList(
  allItems,
  { itemHeight: 40 },
)
</script>
