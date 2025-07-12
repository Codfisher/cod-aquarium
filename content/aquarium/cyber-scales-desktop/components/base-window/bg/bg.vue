<template>
  <svg
    ref="svgRef"
    class="border absolute w-full h-full"
    v-bind="svgAttrs"
  >
    <path
      class="l"
      d="M0 0 V100"
      stroke="#777"
      stroke-width="4"
    />

    <path
      class="r"
      d="M100 0 V100"
      stroke="#777"
      stroke-width="4"
    />
  </svg>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../../types'
import { useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'

interface Props {
  status?: `${ComponentStatus}`;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
})

const svgRef = useTemplateRef('svgRef')
const svgSize = reactive(useElementSize(svgRef))
const svgAttrs = computed(() => ({
  viewBox: `0 0 ${svgSize.width} ${svgSize.height}`,
}))

const graphParams = reactive({
  lp1: 0,
  lp2: 100,
  rp1: 0,
  rp2: 100,
})
</script>

<style scoped lang="sass">
</style>
