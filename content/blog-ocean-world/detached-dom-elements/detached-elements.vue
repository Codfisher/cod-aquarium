<template>
  <div
    v-bind="containerProps"
    class="overflow-auto p-2 border rounded"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="item in list"
        :key="item.index"
        class="border mb-2 flex items-center justify-center h-[40px]"
      >
        Row {{ item.index }}

        <input
          v-model="item.data.value"
          type="text"
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'

const allItems = Array
  .from({ length: 99999 })
  .map((_, index) => ({ value: `${index}` }))

const { list, containerProps, wrapperProps } = useVirtualList(
  allItems,
  { itemHeight: 40 },
)
</script>
