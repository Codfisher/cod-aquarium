<template>
  <div class="base-window relative">
    <base-window-bg />
    <slot />
  </div>
</template>

<script setup lang="ts">
import BaseWindowBg from './bg/bg.vue'

// #region Props
interface Props {
  modelValue?: string;
}
// #endregion Props

// #region Emits
interface Emits {
  'update:modelValue': [value: Props['modelValue']];
}
// #endregion Emits

// #region Slots
interface Slots {
  default?: () => unknown;
}
// #endregion Slots

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

// #region Methods
interface Expose { }
// #endregion Methods

defineExpose<Expose>({})
</script>

<style scoped lang="sass">
.base-window
  min-width: 500px
  min-height: 300px
</style>
