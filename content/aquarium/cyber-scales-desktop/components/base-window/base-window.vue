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
import type { BaseWindowEmits } from './type'
import { createEventHook, until, useElementSize } from '@vueuse/core'
import { computed, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../common/utils'
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

const emit = defineEmits<BaseWindowEmits>()

defineSlots<Slots>()

const windowRef = useTemplateRef('windowRef')
const windowSize = useElementSize(windowRef)
useWindow3dRotate(windowRef)

const status = ref(ComponentStatus.HIDDEN)
onMounted(async () => {
  // 確保 window 有尺寸
  await until(windowSize.width).toBeTruthy()
  await until(windowSize.height).toBeTruthy()

  // 確保 Vue 資料、畫面更新完畢
  await nextTick()
  await nextFrame()

  status.value = ComponentStatus.VISIBLE
})

defineExpose({
  setStatus(value: `${ComponentStatus}`) {
    status.value = value as ComponentStatus
  },
})

provide(baseWindowInjectionKey, {
  title: computed(() => props.title),
  status: computed(() => status.value),
  emit,
})
</script>

<style scoped lang="sass">
.base-window
  transform-style: preserve-3d
  min-width: 300px
  min-height: 200px
</style>
