<template>
  <div class=" fixed w-screen h-screen flex justify-center items-center">
    <div
      class=" absolute backdrop w-full h-full  duration-500"
      :class="backdropClass"
    />

    <div
      ref="dialogRef"
      class="base-dialog relative "
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
  </div>
</template>

<script setup lang="ts">
import type { BaseDialogEmits } from './type'
import { until, useElementSize } from '@vueuse/core'
import { computed, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { useElement3dRotate } from '../../composables/use-element-3d-rotate'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseDialogInjectionKey } from './type'

interface Props {
  title?: string;
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
})

const emit = defineEmits<BaseDialogEmits>()

defineSlots<Slots>()

const status = ref(ComponentStatus.HIDDEN)

const dialogRef = useTemplateRef('dialogRef')
const dialogSize = useElementSize(dialogRef)
useElement3dRotate(
  dialogRef,
  computed(() => status.value === ComponentStatus.ACTIVE),
)

const backdropClass = computed(() => ({
  'opacity-0': status.value !== ComponentStatus.VISIBLE,
  'opacity-100': status.value === ComponentStatus.VISIBLE,
}))

onMounted(async () => {
  // 確保 window 有尺寸
  await until(dialogSize.width).toBeTruthy()
  await until(dialogSize.height).toBeTruthy()

  // 確保 Vue 資料、畫面更新完畢
  await nextTick()
  await nextFrame()

  status.value = ComponentStatus.VISIBLE
})

defineExpose({
  status: computed(() => status.value),
  setStatus(value: `${ComponentStatus}`) {
    status.value = value as ComponentStatus
  },
})

provide(baseDialogInjectionKey, {
  title: computed(() => props.title),
  status: computed(() => status.value),
  emit,
})
</script>

<style scoped lang="sass">
.base-dialog
  transform-style: preserve-3d
  min-width: 300px
  min-height: 200px

.backdrop
  background: rgba(black, 0.1)
  backdrop-filter: blur(4px)
</style>
