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
import { until, useElementSize } from '@vueuse/core'
import { computed, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import { useElement3dRotate } from '../../composables/use-element-3d-rotate'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseWindowInjectionKey } from './type'

interface Props {
  title?: string;
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
})

const emit = defineEmits<BaseWindowEmits>()

defineSlots<Slots>()

const status = ref(ComponentStatus.HIDDEN)

const windowRef = useTemplateRef('windowRef')
const windowSize = useElementSize(windowRef)
useElement3dRotate(
  windowRef,
  computed(() => status.value === ComponentStatus.ACTIVE),
)

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
  status: computed(() => status.value),
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
