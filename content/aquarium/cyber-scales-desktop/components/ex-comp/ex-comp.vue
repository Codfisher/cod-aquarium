<template>
</template>

<script setup lang="ts">
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
