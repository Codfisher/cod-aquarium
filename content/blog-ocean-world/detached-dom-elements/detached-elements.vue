<template>
  <div
    v-bind="containerProps"
    class="overflow-auto p-2 border border-gray-400/80 rounded opacity-80"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="item in list"
        :key="item.index"
        class="mb-2 flex items-center justify-center h-[40px] bg-gray-200/50"
      >
        Row {{ item.index }}

        <input
          v-model="value"
          class=" outline ml-4"
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core'
import { ref } from 'vue'

const allItems = Array
  .from({ length: 99999 })
  .map((_, index) => ({ value: `${index}` }))

const { list, containerProps, wrapperProps } = useVirtualList(
  allItems,
  { itemHeight: 40 },
)

const value = ref('codfish')
</script>
