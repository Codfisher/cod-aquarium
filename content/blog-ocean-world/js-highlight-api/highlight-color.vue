<template>
  <div ref="tableRef">
    <div class=" flex items-center gap-1 border rounded p-2 mb-2">
      <label>背景顏色</label>
      <input
        v-model="style.backgroundColor"
        type="color"
      >
      <label class="ml-2">文字顏色</label>
      <input
        v-model="style.color"
        type="color"
      >
    </div>

    <filter-table v-model="keyword" />
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useTextHighlight } from '../../../composables/use-text-highlight'
import FilterTable from './filter-table.vue'

const tableRef = useTemplateRef('tableRef')

const keyword = ref('')
const style = ref({
  backgroundColor: '#ffff00',
  color: '#000000',
})
useTextHighlight(keyword, {
  target: tableRef,
  background: () => style.value.backgroundColor,
  color: () => style.value.color,
})
</script>
