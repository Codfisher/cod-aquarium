<template>
  <div
    ref="frameRef"
    class="app-frame absolute top-0 left-0 pointer-events-auto"
  >
    <base-window
      ref="windowRef"
      title="關於"
      :style="style"
      @pointerdown="handlePointerDown"
      @dragging="handleDragging"
      @drag-end="commitUpdate"
      @resizing="handleResizing"
      @resize-end="commitUpdate"
      @close="handleClose"
    >
      <main-content class=" w-full h-full bg-gray-50 overflow-auto" />
    </base-window>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { promiseTimeout, refAutoReset, useElementHover } from '@vueuse/core'
import { computed, getCurrentInstance, useTemplateRef, watch } from 'vue'
import { useAppStore } from '../../stores/app-store'
import { ComponentStatus } from '../../types'
import BaseWindow from '../base-window/base-window.vue'
import MainContent from './main-content.vue'

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

const style = computed(() => {
  const info = appStore.appMap.get(appId)
  if (!info) {
    return
  }

  const data = info.data
  return {
    width: `${data.width + data.offsetW}px`,
    height: `${data.height + data.offsetH}px`,
  }
})

/** 第一次從 hidden 至 visible 時，阻止所以狀態轉換
 *
 * TODO: 先使用時間判斷，未來在想更好的設計
 */
const isFirst = refAutoReset(false, 1400)
isFirst.value = true

const isHover = useElementHover(frameRef)
const isActive = computed(() =>
  appStore.appMap.get(appId)?.isActive ?? false,
)
watch(() => [isActive, isHover, isFirst], async () => {
  const status = windowRef.value?.status
  if (!status || isFirst.value) {
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
const handleResizing: BaseWindowProps['onResizing'] = (data) => {
  appStore.focus(appId)
  appStore.update(appId, data)
}
function commitUpdate() {
  appStore.commitUpdate(appId)
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
