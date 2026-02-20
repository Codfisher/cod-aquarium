<template>
  <div>
    安安
  </div>
</template>

<script setup lang="ts">
import type { Block } from './builder'

interface Props {
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const emit = defineEmits<{
  select: [block: Block];
}>()
</script>

<style scoped lang="sass">
</style>
