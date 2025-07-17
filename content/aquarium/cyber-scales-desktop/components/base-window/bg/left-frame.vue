<template>
  <path
    class="left-frame"
    d="M0 0 V100"
    stroke="#777"
    stroke-width="4"
  />
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'

interface Props {
  status?: `${ComponentStatus}`;
  svgSize: { width: number; height: number };
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
})

const graphParams = reactive({
  x1: 0,
  y1: 0,
  y2: 100,
  color: '#777',
  width: 4,
})

const graphAttrs = computed(() => {
  return {
    d: `M${graphParams.x1} ${graphParams.y1} V${graphParams.y2}`,
  }
})
</script>

<style scoped lang="sass">
</style>
