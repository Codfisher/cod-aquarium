<template>
  <div class=" absolute top-0 left-0 pointer-events-auto">
    <base-window
      title="應用程式"
      @dragging="handleDragging"
    >
      安安
    </base-window>
  </div>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { getCurrentInstance } from 'vue'
import { useAppStore } from '../../stores/app-store'
import BaseWindow from '../base-window/base-window.vue'

type BaseWindowProps = ComponentProps<typeof BaseWindow>

interface Props { }

interface Emits { }

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const appStore = useAppStore()

const instance = getCurrentInstance()

const appId = instance?.vnode.key as string
if (!appId) {
  throw new Error('無法取得 key')
}

const handleDragging: BaseWindowProps['onDragging'] = (data) => {
  appStore.update(appId, {
    offsetX: data.offsetX,
    offsetY: data.offsetY,
  })
}
</script>

<style scoped lang="sass">
</style>
