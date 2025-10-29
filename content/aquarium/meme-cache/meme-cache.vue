<template>
  <client-only>
    <u-app :toaster="{
      position: 'top-right',
    }">
      <div
        class="meme-cache flex flex-col"
        @click="handleClick"
      >
        <transition
          name="opacity"
          mode="out-in"
        >
          <div
            ref="tipRef"
            :key="tipText"
            class=" whitespace-pre  text-center py-6 opacity-80 "
            v-html="tipText"
          />
        </transition>

        <img-list
          :list="filteredList"
          :detail-visible="settings.detailVisible"
          :style="{ height: listHeight }"
          class="overflow-auto"
          @select="handleSelect"
        />

        <div
          ref="toolbarRef"
          class="toolbar flex gap-2 w-full fixed left-0 p-4 bg-white dark:bg-black "
          :style="toolbarStyle"
        >
          <u-input
            ref="inputRef"
            v-model.trim="keyword"
            placeholder="輸入關鍵字或任何線索 (・∀・)９"
            class="w-full "
            :ui="{
              base: 'py-4! px-6! rounded-full',
              trailing: 'pe-4',
            }"
            data-clarity-unmask="true"
            @keydown.enter="handleEnter"
          >
            <template
              v-if="keyword?.length"
              #trailing
            >
              <u-button
                color="neutral"
                variant="link"
                size="sm"
                icon="i-material-symbols:cancel-rounded"
                aria-label="Clear input"
                @click="keyword = ''"
              />
            </template>
          </u-input>

          <u-dropdown-menu
            :items="mainMenuItems"
            :ui="{
              content: 'z-70',
              item: 'p-2!',
            }"
          >
            <u-button icon="i-material-symbols:menu-rounded" />

            <template #detail>
              <u-checkbox
                v-model="settings.detailVisible"
                label="顯示細節"
              />
            </template>
          </u-dropdown-menu>
        </div>
      </div>

      <u-modal
        v-model:open="editorVisible"
        title="編輯圖片"
        fullscreen
        class="z-70 data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_200ms_ease-in]"
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
              label="分享/複製"
              icon="i-material-symbols:file-copy-rounded"
              @click="copyImg"
            />

            <u-button
              label="版面設定"
              icon="i-material-symbols:mobile-layout-outline"
              @click="toggleSettingForm()"
            />

            <u-popover
              :ui="{ content: 'z-9999 p-2' }"
              arrow
            >
              <u-button
                label="清空"
                icon="i-material-symbols:cleaning-services-rounded"
              />

              <template #content="{ close: closePopover }">
                <div class=" text-sm p-2">
                  確定清空所有內容？
                </div>

                <div class="flex justify-end">
                  <u-button
                    label="確定"
                    class=" px-2! bg-red-400! text-white!"
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
                item: 'p-2!',
              }"
            >
              <u-button icon="i-lucide-ellipsis" />
            </u-dropdown-menu>

            <u-button
              icon="i-material-symbols:close-rounded"
              @click="close"
            />
          </div>
        </template>
      </u-modal>

      <div class=" fixed right-0 top-0 p-2 px-3 text-xs opacity-10">
        {{ version }}
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from './type'
import UModal from '@nuxt/ui/components/Modal.vue'
import { useActiveElement, useColorMode, useElementSize, useWindowSize, watchThrottled } from '@vueuse/core'
import { snapdom } from '@zumer/snapdom'
import Fuse from 'fuse.js'
import { filter, isTruthy, pipe } from 'remeda'
import { computed, h, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import ImgEditor from './components/img-editor.vue'
import ImgList from './components/img-list.vue'
import { useMemeData } from './composables/use-meme-data'
import { useStickyToolbar } from './composables/use-sticky-toolbar'

const version = '0.3.2'
// onMounted(() => {
//   document.title = pipe(
//     document.title.split('v'),
//     ([value]) => `${value?.trim()} v${version}`,
//   )
// })

const uploadUrl = 'https://drive.google.com/drive/u/2/folders/1UUpzhZPdI-i_7PhCYZNDS-BxbulATMlN'

const isDev = import.meta.env.DEV

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()
colorMode.value = 'light'

const toast = useToast()
const overlay = useOverlay()

const windowSize = reactive(useWindowSize())

const { memeDataMap } = useMemeData()
const activeElement = useActiveElement()
function handleEnter() {
  activeElement.value?.blur()
}

const fuse = new Fuse<MemeData>([], {
  keys: [
    'describe',
    'ocr',
    {
      name: 'keyword',
      weight: 2,
    },
  ],
  ignoreLocation: true,
})
watch(memeDataMap, (data) => {
  const list = [...data.values()].reverse()
  fuse.setCollection(list)
})

const inputRef = useTemplateRef('inputRef')
const keyword = ref('')
const settings = ref({
  detailVisible: false,
})
const mainMenuItems = pipe(
  [
    isDev
      ? [{ slot: 'detail' }] satisfies DropdownMenuItem[]
      : undefined,
    [
      {
        icon: 'i-ph:fish-simple-duotone',
        label: '關於鱈魚',
        onSelect() {
          window.open('/', '_blank')
        },
      },
      {
        icon: 'i-material-symbols:favorite',
        label: '鼓勵我',
        onSelect() {
          window.open('https://portaly.cc/codfish/support', '_blank')
        },
      },
    ] satisfies DropdownMenuItem[],
  ],
  filter(isTruthy),
)

const editorVisible = ref(false)
const targetMeme = shallowRef<MemeData>()
function handleSelect(data: MemeData) {
  targetMeme.value = data
  editorVisible.value = true
}

const filteredList = shallowRef<MemeData[]>([])
watchThrottled(() => [keyword.value, memeDataMap.value], () => {
  if (!keyword.value) {
    filteredList.value = [...memeDataMap.value.values()].reverse()
    return
  }

  filteredList.value = fuse.search(keyword.value).map(({ item }) => item)
}, {
  deep: true,
  throttle: 300,
  leading: false,
  immediate: true,
})

watch(keyword, async () => {
  await nextFrame()
  window.scrollTo({ top: -100, behavior: 'smooth' })
})

const toolbarRef = useTemplateRef('toolbarRef')
const toolbarSize = reactive(useElementSize(toolbarRef, undefined, {
  box: 'border-box',
}))
const { toolbarStyle } = useStickyToolbar(toolbarRef)

const tipRef = useTemplateRef('tipRef')
const tipSize = reactive(useElementSize(tipRef, undefined, {
  box: 'border-box',
}))

const listHeight = computed(
  () => `${windowSize.height - toolbarSize.height - tipSize.height}px`,
)

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
          { src: url, class: 'rounded-none!' },
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
              body: 'bg-gray-100',
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

const tipText = computed(() => {
  if (!keyword.value) {
    return '常常找不到記憶中的梗圖嗎？\n我來幫你找找 ԅ(´∀` ԅ)'
  }

  if (keyword.value && filteredList.value.length === 0) {
    return [
      '沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )<br>可以<a href="',
      uploadUrl,
      '" target="_blank" class=" text-teal-600! font-extrabold">在此上傳圖片</a>，我會努力建檔',
    ].join('')
  }

  return `找到 ${filteredList.value.length} 個候選項目 ੭ ˙ᗜ˙ )੭`
})

onMounted(async () => {
  toast.add({
    icon: 'line-md:emoji-grin',
    title: '歡迎來到快取梗圖 ( ´ ▽ ` )ﾉ',
    description: [
      '常常找不到記憶中的梗圖嗎？在下方輸入框輸入任何線索，我來幫你找找 ԅ(´∀` ԅ)',
    ].join(''),
    duration: 60000,
    actions: [{
      icon: 'line-md:uploading-loop',
      label: '按此投稿圖片',
      color: 'neutral',
      class: 'py-1! px-2!',
      variant: 'outline',
      onClick: () => {
        window.open(uploadUrl)
      },
    }],
  })

  await nextFrame()
  inputRef.value?.inputRef?.focus()
})

function handleClick() {
  if (keyword.value === '') {
    inputRef.value?.inputRef?.focus()
  }
}
</script>

<style scoped lang="sass">
</style>

<style lang="sass">
.meme-cache
  position: fixed
  top: 0
  left: 0
  width: 100vw
  height: 100dvh

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
