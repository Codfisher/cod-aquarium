<template>
  <base-app-frame
    ref="appFrameRef"
    title="ChatLLM"
    :app-id="appId"
  >
    <main-content class=" w-full h-full bg-gray-50 overflow-auto" />
  </base-app-frame>
</template>

<script setup lang="ts">
import { getCurrentInstance, useTemplateRef } from 'vue'
import BaseAppFrame from '../base-app-frame.vue'
import MainContent from './main-content.vue'

interface Props { }
interface Emits { }

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const appFrameRef = useTemplateRef('appFrameRef')

const instance = getCurrentInstance()
const appId = instance?.vnode.key as string
if (!appId) {
  throw new Error('無法取得 key')
}
</script>

<style scoped lang="sass">
</style>
