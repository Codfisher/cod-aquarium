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
          @click="shareImg"
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

        <u-button
          icon="i-material-symbols:undo-rounded"
          aria-label="復原"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!editorRef?.undoable"
          @click="editorRef?.undo()"
        />

        <u-button
          icon="i-material-symbols:redo-rounded"
          aria-label="重做"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="!editorRef?.redoable"
          @click="editorRef?.redo()"
        />

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
import { computed, h, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import {
  DEFAULT_OUTPUT_RATIO_VALUE,
  fitImageToRatio,
  getOutputRatioOption,
  OUTPUT_RATIO_LIST,
} from '../../utils/fit-image-to-ratio'
import { encodeGif, GIF_MAX_SIZE, GIF_MIN_SIZE } from './animated-output'
import ImgEditor from './img-editor.vue'
import MemePickerModal from './meme-picker-modal.vue'

interface Props {
  data: MemeData | undefined;
  memeDataList: MemeData[];
}
const props = defineProps<Props>()

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

async function pasteFromClipboard() {
  if (!navigator.clipboard?.read) {
    toast.add({
      title: '此瀏覽器不支援讀取剪貼簿',
      description: '請改用上傳圖片',
      color: 'warning',
    })
    return
  }

  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith('image/'))
      if (!imageType)
        continue

      const blob = await item.getType(imageType)
      await insertImage(blob)
      return
    }

    toast.add({
      title: '剪貼簿沒有圖片',
      description: '請先複製一張圖片再試一次',
      color: 'warning',
    })
  }
  catch (error) {
    console.warn('[meme-cache] 讀取剪貼簿失敗', error)
    toast.add({
      title: '讀取剪貼簿失敗',
      description: '請確認已授權瀏覽器讀取剪貼簿',
      color: 'error',
    })
  }
}

const insertItems: DropdownMenuItem[][] = [[
  {
    icon: 'i-material-symbols:upload-rounded',
    label: '上傳圖片',
    onSelect: () => pickImageFile(),
  },
  {
    icon: 'i-material-symbols:content-paste-rounded',
    label: '來自剪貼簿',
    onSelect: () => pasteFromClipboard(),
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

const outputRatioValue = ref(DEFAULT_OUTPUT_RATIO_VALUE)
const outputRatioOption = computed(() => getOutputRatioOption(outputRatioValue.value))

const OUTPUT_BACKGROUND_COLOR = '#FFF'

/** 有影格資料才輸出得了動圖 */
const animatedOutputAvailable = computed(
  () => Boolean(props.data?.animated && props.data.frameDelayList?.length),
)

async function getStaticImgBlob(board: HTMLElement) {
  const blob = await snapdom.toBlob(board, {
    quality: 0.8,
    backgroundColor: OUTPUT_BACKGROUND_COLOR,
    type: 'png',
    // Google Fonts 的字型檔允許跨域讀取，可直接內嵌進截圖
    embedFonts: true,
  })

  return fitImageToRatio(blob, outputRatioOption.value.ratio)
}

/**
 * 逐格重新合成動圖。
 *
 * 截圖一次只拍得到動圖當下的那一格，逐格截圖又太慢，
 * 故先把底圖藏起來單獨拍上層內容，再用影格長圖逐格墊回底下，全程只截一次圖
 */
async function getAnimatedImgBlob(board: HTMLElement): Promise<Blob> {
  const editor = editorRef.value
  const baseImg = editor?.imgRef
  const sprite = editor?.frameSprite
  if (!editor || !baseImg || !sprite) {
    throw new Error('缺少動圖資料')
  }

  const overlayFrameIndexList = editor.overlayFrameIndexList
  const bitmapMap = new Map<number, ImageBitmap>()

  editor.baseImgVisible = false
  try {
    // 文字可設顯示區間，各影格的上層內容未必一樣，故依代表影格各拍一張
    for (const frameIndex of new Set(overlayFrameIndexList)) {
      editor.seekFrame(frameIndex)
      await nextTick()
      await nextFrame()

      const overlayBlob = await snapdom.toBlob(board, {
        quality: 1,
        backgroundColor: 'transparent',
        type: 'png',
        embedFonts: true,
      })
      bitmapMap.set(frameIndex, await createImageBitmap(overlayBlob))
    }
  }
  finally {
    editor.baseImgVisible = true
    editor.playFrame()
  }

  const overlayList = overlayFrameIndexList
    .map((frameIndex) => bitmapMap.get(frameIndex))
    .filter((bitmap): bitmap is ImageBitmap => Boolean(bitmap))
  const overlay = overlayList[0]
  if (!overlay) {
    throw new Error('上層內容截圖失敗')
  }

  try {
    const boardRect = board.getBoundingClientRect()
    const imgRect = baseImg.getBoundingClientRect()
    /** 截圖像素與 CSS 像素的比例 */
    const captureScale = overlay.width / boardRect.width

    // 與 fitImageToRatio 相同的補邊算法，差別在這裡要逐格套用
    const ratio = outputRatioOption.value.ratio
    const paddedWidth = ratio ? Math.max(overlay.width, Math.round(overlay.height * ratio)) : overlay.width
    const paddedHeight = ratio ? Math.max(overlay.height, Math.round(overlay.width / ratio)) : overlay.height
    const paddingLeft = (paddedWidth - overlay.width) / 2
    const paddingTop = (paddedHeight - overlay.height) / 2

    /*
     * 底圖放大只會存到放大出來的假細節，故以影格長圖的原生解析度為準；
     * 但文字是即時算繪的，跟著縮下去會糊到看不清楚，所以再給一個長邊下限
     */
    const nativeScale = sprite.frameWidth / (imgRect.width * captureScale)
    const legibleScale = GIF_MIN_SIZE / Math.max(overlay.width, overlay.height)
    const outputScale = Math.min(
      1,
      GIF_MAX_SIZE / Math.max(paddedWidth, paddedHeight),
      Math.max(nativeScale, legibleScale),
    )

    return await encodeGif({
      sprite,
      overlayList,
      outputWidth: Math.round(paddedWidth * outputScale),
      outputHeight: Math.round(paddedHeight * outputScale),
      baseRect: {
        x: (paddingLeft + (imgRect.left - boardRect.left) * captureScale) * outputScale,
        y: (paddingTop + (imgRect.top - boardRect.top) * captureScale) * outputScale,
        width: imgRect.width * captureScale * outputScale,
        height: imgRect.height * captureScale * outputScale,
      },
      overlayRect: {
        x: paddingLeft * outputScale,
        y: paddingTop * outputScale,
        width: overlay.width * outputScale,
        height: overlay.height * outputScale,
      },
      backgroundColor: OUTPUT_BACKGROUND_COLOR,
    })
  }
  finally {
    for (const bitmap of bitmapMap.values()) {
      bitmap.close()
    }
  }
}

async function getImgBlob() {
  const board = editorRef.value?.boardRef
  if (!board)
    return

  const loadingToast = toast.add({
    title: '請稍等片刻',
    description: animatedOutputAvailable.value
      ? '正在逐格合成動圖...◝( •ω• )◟'
      : '正在奮力處理圖片...◝( •ω• )◟',
    icon: 'i-lucide-loader-circle',
    ui: { icon: 'animate-spin' },
    progress: false,
    close: false,
  })

  await editorRef.value?.blur()

  try {
    // 自選字型是延遲載入的，沒等它備妥就截圖會拍到 fallback 字型
    await document.fonts.ready

    if (!animatedOutputAvailable.value)
      return await getStaticImgBlob(board)

    try {
      return await getAnimatedImgBlob(board)
    }
    catch (error) {
      console.warn('[meme-cache] 動圖輸出失敗，改輸出靜態圖', error)
      toast.add({
        title: '動圖輸出失敗',
        description: '已改成輸出靜態圖 ( ˘･з･)',
        color: 'warning',
      })
      return await getStaticImgBlob(board)
    }
  }
  finally {
    toast.remove(loadingToast.id)
  }
}

function getOutputFileName(blob: Blob) {
  return blob.type === 'image/gif' ? 'meme.gif' : 'meme.png'
}

function toImgFile(blob: Blob) {
  return new File([blob], getOutputFileName(blob), { type: blob.type || 'image/png' })
}

/** 使用者按下取消不算失敗，不該再跳錯誤提示 */
function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * 呼叫系統分享面板。
 *
 * 過去用 Web Share 失敗，原因有二：傳的是 Blob 而非 File，
 * 以及產圖是非同步的，等圖產好時 Safari 已認定使用者手勢過期。
 * 故此處只負責分享，且必須由某個點擊事件直接觸發。
 */
async function shareImgFile(blob: Blob): Promise<boolean> {
  const file = toImgFile(blob)
  if (!navigator.canShare?.({ files: [file] }))
    return false

  try {
    await navigator.share({ files: [file] })
    return true
  }
  catch (error) {
    if (isAbortError(error))
      return true

    console.warn('[meme-cache] Web Share 失敗', error)
    return false
  }
}

async function writeImgToClipboard(blob: Blob): Promise<boolean> {
  // 剪貼簿實務上只吃 png，動圖寫進去會只剩一格，不如直接讓它走下載
  if (blob.type !== 'image/png')
    return false

  if (!window.ClipboardItem || !navigator.clipboard?.write)
    return false

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  }
  catch (error) {
    console.warn('[meme-cache] 寫入剪貼簿失敗', error)
    return false
  }
}

function downloadImg(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = getOutputFileName(blob)
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 自動路徑都失敗時，給一個由使用者親自點擊的出口，手勢才會是新鮮的 */
function openManualShareModal(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const canShare = Boolean(navigator.canShare?.({ files: [toImgFile(blob)] }))

  const imgModal = overlay.create(
    h(
      UModal,
      {
        title: '手動分享',
        description: canShare
          ? '按下方的分享，或長按圖片自行儲存 ლ(╹ε╹ლ)'
          : '請長按或右鍵圖片，手動分享 ლ(╹ε╹ლ)',
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
        footer: () => [h(
          'div',
          { class: 'flex w-full gap-2' },
          [
            canShare
              ? h(UButton, {
                  label: '分享',
                  icon: 'i-material-symbols:share',
                  onClick: () => shareImgFile(blob),
                })
              : undefined,
            h(UButton, {
              label: '下載',
              icon: 'i-lucide-image-down',
              color: 'neutral',
              variant: 'outline',
              onClick: () => downloadImg(blob),
            }),
          ].filter(Boolean),
        )],
      },
    ),
  )
  imgModal.open()
}

async function shareImg() {
  const blob = await getImgBlob()
  if (!blob) {
    toast.add({
      title: '產生圖片失敗',
      description: '嘗試重新整理後再試一次',
      color: 'error',
    })
    return
  }

  // 手機有系統分享面板，可直接送進 LINE 等 app，優先走這條
  if (await shareImgFile(blob))
    return

  if (await writeImgToClipboard(blob)) {
    toast.add({
      title: '處理完成',
      description: '圖片已寫入剪貼簿 (ゝ∀・)b',
    })
    return
  }

  openManualShareModal(blob)
}

const moreFcnItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      icon: 'i-material-symbols:mobile-layout-outline',
      label: '版面設定',
      onSelect: () => toggleSettingForm(),
    },
    {
      icon: 'i-material-symbols:aspect-ratio-outline-rounded',
      label: `輸出尺寸：${outputRatioOption.value.label}`,
      children: OUTPUT_RATIO_LIST.map((item) => ({
        label: item.label,
        icon: item.value === outputRatioValue.value
          ? 'i-material-symbols:check-rounded'
          : undefined,
        onSelect: () => {
          outputRatioValue.value = item.value
        },
      })),
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

        downloadImg(blob)
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
])
</script>
