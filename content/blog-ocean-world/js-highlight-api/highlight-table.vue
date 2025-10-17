<template>
  <div ref="tableRef">
    <filter-table v-model="keyword" />
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useTextHighlight } from '../../../web/composables/use-text-highlight'
import FilterTable from './filter-table.vue'

const tableRef = useTemplateRef('tableRef')

const keyword = ref('')
useTextHighlight(keyword, {
  target: tableRef,
})
</script>
