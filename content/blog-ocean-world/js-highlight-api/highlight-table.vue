<template>
  <div ref="tableRef">
    <filter-table v-model="keyword" />
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import FilterTable from './filter-table.vue';
import { useTextHighlight } from '../../../composables/use-text-highlight';

const tableRef = useTemplateRef('tableRef')

const keyword = ref('')
useTextHighlight(keyword, {
  target: tableRef,
})
</script>
