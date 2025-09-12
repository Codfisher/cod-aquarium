<template>
  <base-window title="應用程式">
    安安
  </base-window>
</template>

<script setup lang="ts">
import BaseWindow from '../base-window/base-window.vue'

interface Props {
  modelValue?: string;
}

interface Emits {
  'update:modelValue': [value: Props['modelValue']];
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

interface Expose { }
defineExpose<Expose>({})
</script>

<style scoped lang="sass">
</style>
