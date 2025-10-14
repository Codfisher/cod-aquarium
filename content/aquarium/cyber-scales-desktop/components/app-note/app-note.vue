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

const handleClose: ComponentProps<typeof BaseAppFrame>['onClose'] = async (done) => {
  if (contentRef.value?.isChanged) {
    const dialog = useDialog({
      title: '尚未儲存',
      description: '有未儲存的變更，確定要關閉？',
      colorType: 'negative',
      actionList: [
        {
          label: '確定',
          flat: true,
          onClick() {
            done(true)
            dialog.close()
          },
        },
        {
          label: '取消',
          onClick() {
            done(false)
            dialog.close()
          },
        },
      ],
      onBackdrop() {
        done(false)
        dialog.close()
      },
    })
    return
  }

  done(true)
}
</script>

<style scoped lang="sass">
</style>
