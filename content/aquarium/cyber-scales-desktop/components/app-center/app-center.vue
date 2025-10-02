<template>
  <div class=" absolute top-0 left-0 pointer-events-auto">
    <base-window
      ref="windowRef"
      title="應用程式"
      @pointerdown="handlePointerDown"
      @dragging="handleDragging"
      @close="handleClose"
    >
      <div class=" w-full h-full  bg-slate-200">
        安安
      </div>
    </base-window>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { promiseTimeout, whenever } from '@vueuse/core'
import { computed, getCurrentInstance, useTemplateRef, watch } from 'vue'
import { useAppStore } from '../../stores/app-store'
import BaseWindow from '../base-window/base-window.vue'

type BaseWindowProps = ComponentProps<typeof BaseWindow>

interface Props { }

interface Emits { }

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const windowRef = useTemplateRef('windowRef')

const appStore = useAppStore()

const instance = getCurrentInstance()

const appId = instance?.vnode.key as string
if (!appId) {
  throw new Error('無法取得 key')
}
const isActive = computed(() =>
  appStore.appMap.get(appId)?.isActive ?? false,
)
watch(isActive, async (value) => {
  windowRef.value?.setStatus(value ? 'active' : 'visible')
})

function handlePointerDown() {
  appStore.focus(appId)
}
const handleDragging: BaseWindowProps['onDragging'] = (data) => {
  appStore.focus(appId)
  appStore.update(appId, data)
}

const handleClose: BaseWindowProps['onClose'] = async () => {
  windowRef.value?.setStatus('hidden')
  await promiseTimeout(1000)
  appStore.close(appId)
}
</script>

<style scoped lang="sass">
</style>
