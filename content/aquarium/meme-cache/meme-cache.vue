<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <div class="meme-cache flex flex-col min-h-svh p-4">
        <div
          class="flex-1 flex justify-center relative"
          :style="contentStyle"
        >
          <img-list
            :list="filteredList"
            class=""
            :detail-visible="settings.detailVisible"
            @select="handleSelect"
          />

          <transition name="opacity">
            <div
              v-if="filteredList.length === 0 && keyword"
              class="absolute flex justify-center items-center p-10 opacity-30"
            >
              沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )
            </div>
          </transition>

          <transition name="opacity">
            <div
              v-if="!keyword && !settings.allVisible"
              class=" absolute flex justify-center items-center p-10 opacity-30"
            >
              來點梗圖吧 ԅ(´∀` ԅ)
            </div>
          </transition>
        </div>

        <div
          ref="toolbarRef"
          class="toolbar flex gap-2 w-full fixed left-0 p-4 bg-white dark:bg-black "
          :style="toolbarStyle"
        >
          <div class="rounded-full border border-[#DDD] flex-1">
            <input
              v-model.trim="keyword"
              class=" py-4! px-6! w-full"
              placeholder="輸入關鍵字，馬上為您尋找 (・∀・)９"
              @keydown.enter="handleEnter"
            >
          </div>

          <u-dropdown-menu
            :items="items"
            :ui="{ content: 'z-[70]' }"
          >
            <u-button icon="i-lucide-menu" />

            <template #all>
              <u-checkbox
                v-model="settings.allVisible"
                label="顯示全部"
                size="xl"
                class="p-4"
              />
            </template>

            <template
              v-if="isDev"
              #detail
            >
              <u-checkbox
                v-model="settings.detailVisible"
                label="顯示細節"
                size="xl"
                class="p-4"
              />
            </template>
          </u-dropdown-menu>
        </div>
      </div>

      <u-modal
        v-model:open="editorVisible"
        title="編輯圖片"
        fullscreen
        class="z-[70]"
        :ui="{
          header: ' hidden',
          body: 'p-0!',
        }"
      >
        <template #body>
          <img-editor
            ref="editorRef"
            :data="targetMeme"
          />
        </template>

        <template #footer="{ close }">
          <div class=" flex w-full gap-4">
            <u-button
              label="複製"
              icon="i-lucide-clipboard-copy"
              @click="copyImg"
            />

            <u-button
              label="圖片設定"
              icon="i-lucide-settings-2"
              @click="toggleSettingForm()"
            />

            <u-popover
              v-model:open="cleanPopupVisible"
              :ui="{ content: 'z-[9999] p-2' }"
              arrow
            >
              <u-button
                label="清空"
                icon="i-lucide-brush-cleaning"
              />

              <template #content>
                <div class=" text-sm p-2">
                  確定清空所有內容？
                </div>

                <div class="flex justify-end">
                  <u-button
                    label="確定"
                    class=" px-2! bg-red-400! text-white!"
                    @click="clean()"
                  />
                </div>
              </template>
            </u-popover>
            <div class="flex-1" />

            <u-button
              icon="i-lucide-x"
              @click="close"
            />
          </div>
        </template>
      </u-modal>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from './type'
import UModal from '@nuxt/ui/components/Modal.vue'
import { useActiveElement, useColorMode, watchThrottled } from '@vueuse/core'
import { snapdom } from '@zumer/snapdom'
import Fuse from 'fuse.js'
import { h, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import ImgEditor from './components/img-editor.vue'
import ImgList from './components/img-list.vue'
import { useMemeData } from './composables/use-meme-data'
import { useStickyToolbar } from './composables/use-sticky-toolbar'

const isDev = import.meta.env.DEV

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

const toast = useToast()
const overlay = useOverlay()

const { memeDataMap } = useMemeData()
const activeElement = useActiveElement()
function handleEnter() {
  activeElement.value?.blur()
}

const fuse = new Fuse<MemeData>([], {
  keys: [
    'describe',
    'describeZhTw',
    {
      name: 'ocr',
      weight: 2,
    },
    {
      name: 'keyword',
      weight: 3,
    },
  ],
})
watch(memeDataMap, (data) => {
  const list = [...data.values()]
  fuse.setCollection(list)
})

const keyword = ref('')
const settings = ref({
  allVisible: false,
  detailVisible: false,
})
const items = [
  { slot: 'all' },
  { slot: 'detail' },
] as const satisfies DropdownMenuItem[]

const editorVisible = ref(false)
const targetMeme = shallowRef<MemeData>()
function handleSelect(data: MemeData) {
  targetMeme.value = data
  editorVisible.value = true
}

const filteredList = shallowRef<MemeData[]>([])
watchThrottled(() => [keyword.value, settings.value.allVisible], () => {
  if (!keyword.value && settings.value.allVisible) {
    filteredList.value = [...memeDataMap.value.values()]
    return
  }

  filteredList.value = fuse.search(keyword.value).map(({ item }) => item)
}, {
  throttle: 300,
  leading: false,
})

watch(keyword, async () => {
  await nextFrame()
  window.scrollTo({ top: -100, behavior: 'smooth' })
})

const toolbarRef = useTemplateRef('toolbarRef')
const { toolbarStyle, contentStyle } = useStickyToolbar(toolbarRef)

const editorRef = useTemplateRef('editorRef')

function toggleSettingForm() {
  editorRef.value?.toggleImgSettingVisible()
}

/** FIX: 文件明明說 slot 有 close 可以用，但是實際上沒有
 *
 * https://ui.nuxt.com/docs/components/popover#slots
 */
const cleanPopupVisible = ref(false)
function clean() {
  cleanPopupVisible.value = false
  editorRef.value?.clean()
}

async function copyImg() {
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
    quality: 1,
    backgroundColor: '#FFF',
    type: 'png',
  })

  // 嘗試 Clipboard API
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.add({
        title: '處理完成',
        description: '圖片已寫入剪貼簿 (ゝ∀・)b',
      })
      toast.remove(loadingToast.id)
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
        ui: {
          overlay: 'z-[99999]',
          content: 'z-[999999]',
        },
      },
      {
        content: () => [
          h(
            'img',
            { src: url },
          ),
          h(
            'div',
            { class: 'text-center py-4' },
            '無法寫入剪貼簿，請手動分享此圖片',
          ),
        ],
      },
    ),
  )
  imgModal.open()
  toast.remove(loadingToast.id)

  // execCommand('copy') 複製 <img>
  // try {
  //   const url = URL.createObjectURL(blob)
  //   const host = document.createElement('div')
  //   Object.assign(host.style, {
  //     position: 'fixed',
  //     left: '-9999px',
  //     top: '0',
  //     opacity: '0',
  //     pointerEvents: 'none',
  //   })
  //   host.setAttribute('contenteditable', 'true')

  //   const img = document.createElement('img')
  //   img.src = url
  //   host.appendChild(img)
  //   document.body.appendChild(host)

  //   // 選取 <img> 後 copy
  //   const range = document.createRange()
  //   range.selectNode(img)
  //   const sel = window.getSelection()
  //   sel?.removeAllRanges()
  //   sel?.addRange(range)

  //   const ok = document.execCommand('copy')
  //   sel?.removeAllRanges()

  //   URL.revokeObjectURL(url)
  //   document.body.removeChild(host)

  //   if (ok) {
  //     toast.add({ title: '圖片已成功複製至剪貼簿' })
  //     return
  //   }
  //   throw new Error('execCommand copy returned false')
  // }
  // catch (e) {
  //   console.warn('execCommand fallback failed', e)
  // }

  // 最後備援：使用 Web Share
  // try {
  //   if (
  //     navigator.canShare?.({ files: [new File([blob], 'image.png', { type: 'image/png' })] })
  //     && navigator?.share
  //   ) {
  //     await navigator.share({
  //       files: [new File([blob], 'image.png', { type: 'image/png' })],
  //       title: '分享梗圖',
  //     })
  //   }

  //   toast.add({ title: '無法寫入剪貼簿，使用分享功能' })
  // }
  // catch {
  //   toast.add({ title: '分享圖片失敗 QQ' })
  // }
}
</script>

<style scoped lang="sass">
</style>

<style lang="sass">
.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.3s
  &-enter-from, &-leave-to
    opacity: 0 !important

.list
  &-move, &-enter-active, &-leave-active
    transition: all 0.5s ease
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(3px)
  &-leave-active
    position: absolute
</style>
