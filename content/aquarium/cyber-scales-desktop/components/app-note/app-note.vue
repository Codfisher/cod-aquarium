<template>
  <base-app-frame
    ref="appFrameRef"
    title="記事本"
    :app-id="appId"
    @close="handleClose"
  >
    <main-content
      ref="contentRef"
      class=" w-full h-full bg-gray-50"
    />
  </base-app-frame>
</template>

<script setup lang="ts">
import type { ComponentProps } from 'vue-component-type-helpers'
import { getCurrentInstance, useTemplateRef } from 'vue'
import { useDialog } from '../../composables/use-dialog'
import BaseAppFrame from '../base-app-frame.vue'
import MainContent from './main-content.vue'

interface Props { }
interface Emits { }

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<Emits>()

const appFrameRef = useTemplateRef('appFrameRef')
const contentRef = useTemplateRef('contentRef')

const instance = getCurrentInstance()
const appId = instance?.vnode.key as string
if (!appId) {
  throw new Error('無法取得 key')
}

const handleClose: ComponentProps<typeof BaseAppFrame>['onClose'] = async (next) => {
  if (contentRef.value?.isChanged) {
    const dialog = useDialog({
      title: '尚未儲存',
      description: '你有未儲存的更改，確定要關閉？',
      actionList: [
        {
          label: '確定',
          flat: true,
          onClick() {
            next(false)
            dialog.close()
          },
        },
        {
          label: '取消',
          onClick() {
            console.log(`🚀 ~ onClick:`)
            next(true)
            dialog.close()
          },
        },
      ],
      onBackdrop() {
        next(false)
        dialog.close()
      },
    })
    return
  }

  next(true)
}
</script>

<style scoped lang="sass">
</style>
