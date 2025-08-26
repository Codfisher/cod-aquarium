<template>
  <div ref="tableRef">
    <div class=" flex items-center gap-1 border rounded p-2 mb-2">
      <label>背景顏色</label>
      <input
        type="color"
        v-model="style.backgroundColor"
      />
      <label class="ml-2">文字顏色</label>
      <input
        type="color"
        v-model="style.color"
      />
    </div>

    <filter-table v-model="keyword" />
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import FilterTable from './filter-table.vue';
import { useTextHighlight } from '../../../composables/use-text-highlight';

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
