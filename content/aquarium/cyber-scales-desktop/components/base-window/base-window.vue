<template>
  <div
    class="base-window relative border border-gray-50"
    @click="toggleData()"
  >
    <base-window-bg :status="status" />
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useMousePressed, useToggle } from '@vueuse/core'
import { computed } from 'vue'
import { ComponentStatus } from '../../types'
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

const [data, toggleData] = useToggle(false)
const status = computed(() => {
  return data.value ? ComponentStatus.VISIBLE : ComponentStatus.HIDDEN
})

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
