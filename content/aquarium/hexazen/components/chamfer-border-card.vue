<template>
  <div
    class="chamfer-4 p-1 "
    :style="frameStyle"
  >
    <div
      class="bg-white chamfer-3.5 p-3"
      :class="props.contentClass"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed } from 'vue'

interface Props {
  contentClass?: string;
  borderSize?: string;
  borderColor?: string;
}
const props = withDefaults(defineProps<Props>(), {
  contentClass: '',
  borderSize: '4px',
  borderColor: '#e5e7eb',
})

defineSlots<{
  default: () => any;
}>()

const frameStyle = computed<CSSProperties>(() => ({
  padding: props.borderSize,
  backgroundColor: props.borderColor,
}))
</script>

<style scoped lang="sass">
</style>
