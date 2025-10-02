<template>
  <div
    ref="frameRef"
    class="app-frame absolute top-0 left-0 pointer-events-auto"
  >
    <base-window
      ref="windowRef"
      title="關於我"
      :style="style"
      @pointerdown="handlePointerDown"
      @dragging="handleDragging"
      @drag-end="handleDragEnd"
      @close="handleClose"
    >
      <content-text class=" w-full h-full bg-gray-50 overflow-auto" />
    </base-window>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { promiseTimeout, useElementHover } from '@vueuse/core'
import { computed, getCurrentInstance, useTemplateRef, watch } from 'vue'
import { useAppStore } from '../../stores/app-store'
import { ComponentStatus } from '../../types'
import BaseWindow from '../base-window/base-window.vue'
import ContentText from './content-text.vue'

type BaseWindowProps = ComponentProps<typeof BaseWindow>

interface Props { }

interface Emits { }

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const windowRef = useTemplateRef('windowRef')
const frameRef = useTemplateRef('frameRef')

const appStore = useAppStore()

const instance = getCurrentInstance()

const appId = instance?.vnode.key as string
if (!appId) {
  throw new Error('無法取得 key')
}

const isHover = useElementHover(frameRef)
const isActive = computed(() =>
  appStore.appMap.get(appId)?.isActive ?? false,
)
const style = computed(() => {
  const info = appStore.appMap.get(appId)
  if (!info) {
    return
  }
  return {
    width: `${info?.data?.width}px`,
    height: `${info?.data?.height}px`,
  }
})

watch(() => [isActive, isHover], async () => {
  const status = windowRef.value?.status
  if (!status) {
    return
  }

  if (status === ComponentStatus.VISIBLE && isHover.value) {
    windowRef.value?.setStatus('hover')
    return
  }

  if ([
    ComponentStatus.VISIBLE,
    ComponentStatus.HOVER,
    ComponentStatus.ACTIVE,
  ].includes(status)) {
    windowRef.value?.setStatus(isActive.value ? 'active' : 'visible')
  }
}, {
  deep: true,
})

function handlePointerDown() {
  appStore.focus(appId)
}
const handleDragging: BaseWindowProps['onDragging'] = (data) => {
  appStore.focus(appId)
  appStore.update(appId, data)
}
const handleDragEnd: BaseWindowProps['onDragEnd'] = () => {
  appStore.commitPosition(appId)
}

const handleClose: BaseWindowProps['onClose'] = async () => {
  windowRef.value?.setStatus('hidden')
  await promiseTimeout(1000)
  appStore.close(appId)
}
</script>

<style scoped lang="sass">
// 擴展控制範圍
.app-frame
  &::after
    content: ''
    position: absolute
    top: -20px
    left: -20px
    right: -20px
    bottom: -20px
    z-index: -1
</style>
