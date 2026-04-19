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

        <u-dropdown-menu
          :items="insertItems"
          :ui="{
            content: 'z-70',
            item: 'p-2',
          }"
        >
          <u-button
            label="插入圖片"
            icon="i-material-symbols:add-photo-alternate-outline-rounded"
            variant="ghost"
            color="neutral"
            size="sm"
          />
        </u-dropdown-menu>

        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileChange"
        >

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

  <meme-picker-modal
    v-model:open="memePickerVisible"
    :data-list="memeDataList"
    @select="handleMemePick"
  />
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from '../meme/type'
import UButton from '@nuxt/ui/components/Button.vue'
import UModal from '@nuxt/ui/components/Modal.vue'
import { snapdom } from '@zumer/snapdom'
import { h, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import ImgEditor from './img-editor.vue'
import MemePickerModal from './meme-picker-modal.vue'

interface Props {
  data: MemeData | undefined;
  memeDataList: MemeData[];
}
defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const memePickerVisible = ref(false)

const toast = useToast()
const overlay = useOverlay()

const editorRef = useTemplateRef('editorRef')
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef')

function toggleSettingForm() {
  editorRef.value?.toggleLayoutSettingVisible()
}

function confirmClean() {
  const modal = overlay.create(
    h(
      UModal,
      {
        title: '清空內容',
        description: '確定清空所有文字與圖片？此操作無法復原。',
        ui: {
          overlay: 'z-[99999]',
          content: 'z-[999999]',
        },
      },
      {
        footer: ({ close }: { close: () => void }) => h(
          'div',
          { class: 'flex w-full justify-end gap-2' },
          [
            h(UButton, {
              label: '取消',
              variant: 'ghost',
              color: 'neutral',
              onClick: () => close(),
            }),
            h(UButton, {
              label: '確定清空',
              color: 'error',
              onClick: () => {
                editorRef.value?.clean()
                close()
              },
            }),
          ],
        ),
      },
    ),
  )
  modal.open()
}

async function insertImage(source: Blob) {
  try {
    await editorRef.value?.addImage(source)
  }
  catch (error) {
    console.warn('[meme-cache] 插入圖片失敗', error)
    toast.add({
      title: '插入圖片失敗',
      description: '請嘗試其他圖片',
      color: 'error',
    })
  }
}

function pickImageFile() {
  fileInputRef.value?.click()
}

const insertItems: DropdownMenuItem[][] = [[
  {
    icon: 'i-material-symbols:upload-rounded',
    label: '上傳圖片',
    onSelect: () => pickImageFile(),
  },
  {
    icon: 'i-material-symbols:image-search-outline',
    label: '選擇迷因',
    onSelect: () => {
      memePickerVisible.value = true
    },
  },
]]

async function handleMemePick(data: MemeData) {
  try {
    await editorRef.value?.addImage(`/memes/${data.file}`)
  }
  catch (error) {
    console.warn('[meme-cache] 插入迷因失敗', error)
    toast.add({
      title: '插入迷因失敗',
      description: '請嘗試其他圖片',
      color: 'error',
    })
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await insertImage(file)
  }
  // 允許重複選取同一檔案
  input.value = ''
}

async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items)
    return

  for (const item of Array.from(items)) {
    if (!item.type.startsWith('image/'))
      continue

    const file = item.getAsFile()
    if (!file)
      continue

    event.preventDefault()
    await insertImage(file)
    break
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('paste', handlePaste)
  }
  else {
    window.removeEventListener('paste', handlePaste)
  }
}, { immediate: true })

onBeforeUnmount(() => {
  window.removeEventListener('paste', handlePaste)
})

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

const moreFcnItems: DropdownMenuItem[][] = [
  [
    {
      icon: 'i-material-symbols:mobile-layout-outline',
      label: '版面設定',
      onSelect: () => toggleSettingForm(),
    },
  ],
  [
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
  ],
  [
    {
      icon: 'i-material-symbols:cleaning-services-rounded',
      label: '清空',
      color: 'error',
      onSelect: () => confirmClean(),
    },
  ],
]
</script>
