<template>
  <div
    ref="windowRef"
    class="base-window relative "
  >
    <bg
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
import { promiseTimeout, until, useElementSize } from '@vueuse/core'
import { computed, nextTick, onMounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseWindowInjectionKey } from './type'
import { useWindow3dRotate } from './use-window-3d-rotate'

// #region Props
interface Props {
  modelValue?: string;
  title?: string;
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
  title: '',
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

const windowRef = useTemplateRef('windowRef')
const windowSize = reactive(useElementSize(windowRef, {
  width: 300,
  height: 200,
}))
useWindow3dRotate(windowRef)

const status = ref(ComponentStatus.HIDDEN)
onMounted(async () => {
  await until(() => windowSize.width > 0 && windowSize.height > 0).toBe(true)
  status.value = ComponentStatus.VISIBLE
})

// #region Methods
interface Expose { }
// #endregion Methods

defineExpose<Expose>({})

provide(baseWindowInjectionKey, {
  title: computed(() => props.title),
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
.base-window
  transform-style: preserve-3d
  min-width: 300px
  min-height: 200px
</style>
