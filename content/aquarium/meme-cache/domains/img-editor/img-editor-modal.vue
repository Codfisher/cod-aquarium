<template>
  <u-modal
    v-model:open="open"
    title="編輯圖片"
    fullscreen
    class="z-70 data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_200ms_ease-in]"
    :ui="{
      header: ' hidden',
      body: 'p-0',
    }"
  >
    <template #body>
      <img-editor
        ref="editorRef"
        :data="data"
      />
    </template>

    <template #footer="{ close }">
      <div class=" flex w-full gap-1">
        <u-button
          label="分享/複製"
          icon="i-material-symbols:file-copy-rounded"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="copyImg"
        />

        <u-button
          label="版面設定"
          icon="i-material-symbols:mobile-layout-outline"
          variant="ghost"
          size="sm"
          color="neutral"
          @click="toggleSettingForm()"
        />

        <u-popover
          :ui="{ content: 'z-9999 p-2' }"
          arrow
        >
          <u-button
            label="清空"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-material-symbols:cleaning-services-rounded"
          />

          <template #content="{ close: closePopover }">
            <div class=" text-sm p-2">
              確定清空所有內容？
            </div>

            <div class="flex justify-end">
              <u-button
                label="確定"
                class="px-2 bg-red-400 text-white"
                @click="clean(); closePopover()"
              />
            </div>
          </template>
        </u-popover>
        <div class="flex-1" />

        <u-dropdown-menu
          :items="moreFcnItems"
          :ui="{
            content: 'z-70',
            item: 'p-2',
          }"
        >
          <u-button
            icon="i-lucide-ellipsis"
            variant="ghost"
            color="neutral"
            size="sm"
          />
        </u-dropdown-menu>

        <u-button
          icon="i-material-symbols:close-rounded"
          color="error"
          size="sm"
          @click="close"
        />
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from '../meme/type'
import UModal from '@nuxt/ui/components/Modal.vue'
import { snapdom } from '@zumer/snapdom'
import { h, useTemplateRef } from 'vue'
import ImgEditor from './img-editor.vue'

interface Props {
  data: MemeData | undefined;
}
defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const overlay = useOverlay()

const editorRef = useTemplateRef('editorRef')

function toggleSettingForm() {
  editorRef.value?.toggleLayoutSettingVisible()
}

function clean() {
  editorRef.value?.clean()
}

async function getImgBlob() {
  if (!editorRef.value?.boardRef)
    return

  const loadingToast = toast.add({
    title: '請稍等片刻',
    description: '正在奮力處理圖片...◝( •ω• )◟',
    icon: 'i-lucide-loader-circle',
    ui: { icon: 'animate-spin' },
    progress: false,
    close: false,
  })

  await editorRef.value.blur()

  const blob = await snapdom.toBlob(editorRef.value.boardRef, {
    quality: 0.8,
    backgroundColor: '#FFF',
    type: 'png',
  })
  toast.remove(loadingToast.id)

  return blob
}

async function copyImg() {
  const blob = await getImgBlob()
  if (!blob) {
    toast.add({
      title: '產生圖片失敗',
      description: '嘗試重新整理後再試一次',
      color: 'error',
    })
    return
  }

  // 嘗試 Clipboard API
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.add({
        title: '處理完成',
        description: '圖片已寫入剪貼簿 (ゝ∀・)b',
      })
      return
    }
    catch (e) {
      console.warn('Clipboard API failed, fallback to execCommand', e)
    }
  }

  // 開啟圖片，自行分享
  const url = URL.createObjectURL(blob)
  const imgModal = overlay.create(
    h(
      UModal,
      {
        title: '手動分享',
        description: '無法寫入剪貼簿，請長按或右鍵圖片，手動分享 ლ(╹ε╹ლ)',
        ui: {
          overlay: 'z-[99999]',
          content: 'z-[999999]',
        },
      },
      {
        body: () => [h(
          'img',
          { src: url, class: 'rounded-none' },
        )],
      },
    ),
  )
  imgModal.open()

  // TODO: Web Share 沒有成功
}

const moreFcnItems = [
  {
    icon: 'i-lucide-image-down',
    label: '下載',
    async onSelect() {
      const blob = await getImgBlob()
      if (!blob) {
        toast.add({
          title: '產生圖片失敗',
          description: '嘗試重新整理後再試一次',
          color: 'error',
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'meme.png'
      a.click()

      toast.add({ title: '已開始下載' })
    },
  },
  {
    icon: 'i-material-symbols:image-search-outline',
    label: '預覽成果',
    async onSelect() {
      const blob = await getImgBlob()
      if (!blob) {
        toast.add({
          title: '產生圖片失敗',
          description: '嘗試重新整理後再試一次',
          color: 'error',
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const imgModal = overlay.create(
        h(
          UModal,
          {
            title: '成果',
            description: '下圖為目前的成果圖片 (ゝ∀・)b',
            ui: {
              overlay: 'z-[99999]',
              content: 'z-[999999] ',
              body: 'bg-gray-100 dark:bg-gray-400',
            },
          },
          {
            body: () => [h(
              'img',
              { src: url, class: 'rounded-none!' },
            )],
          },
        ),
      )
      imgModal.open()
    },
  },
] as const satisfies DropdownMenuItem[]
</script>
