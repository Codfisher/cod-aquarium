<template>
  <div
    ref="windowRef"
    class="base-window relative border border-gray-50"
    @click="toggleData()"
  >
    <base-window-bg
      :status="status"
      class="z-[-1]"
    />
    <content-wrapper
      :status="status"
      class="z-0 absolute inset-0 "
    >
      <slot />
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { useToggle } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { ComponentStatus } from '../../types'
import BaseWindowBg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { useWindowRotate } from './use-window-rotate'

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

const windowRef = useTemplateRef('windowRef')
useWindowRotate(windowRef)

// #region Methods
interface Expose { }
// #endregion Methods

defineExpose<Expose>({})
</script>

<style scoped lang="sass">
.base-window
  transform-style: preserve-3d
  min-width: 500px
  min-height: 300px
</style>
