<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <div class="meme-cache flex flex-col min-h-svh">
        <transition
          name="opacity"
          mode="out-in"
        >
          <div
            ref="tipRef"
            :key="tipText"
            class=" whitespace-pre  text-center py-6 opacity-30 "
          >
            {{ tipText }}
          </div>
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
          <!-- <input
              v-model.trim="keyword"
              class=" py-4! px-6! w-full"
              placeholder="輸入關鍵字或任何線索 (・∀・)９"
              @keydown.enter="handleEnter"
            > -->

          <u-input
            v-model.trim="keyword"
            placeholder="輸入關鍵字或任何線索 (・∀・)９"
            class="w-full "
            :ui="{
              base: 'py-4! px-6! rounded-full',
              trailing: 'pe-4',
            }"
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
            :items="items"
            :ui="{ content: 'z-[70]' }"
          >
            <u-button icon="i-material-symbols:menu-rounded" />

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
              label="分享/複製"
              icon="i-material-symbols:file-copy-rounded"
              @click="copyImg"
            />

            <u-button
              label="圖片設定"
              icon="i-material-symbols:settings-rounded"
              @click="toggleSettingForm()"
            />

            <u-popover
              v-model:open="cleanPopupVisible"
              :ui="{ content: 'z-[9999] p-2' }"
              arrow
            >
              <u-button
                label="清空"
                icon="i-material-symbols:cleaning-services-rounded"
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

            <u-dropdown-menu
              :items="moreFcnItems"
              :ui="{
                content: 'z-[70]',
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
import { pipe } from 'remeda'
import { computed, h, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import ImgEditor from './components/img-editor.vue'
import ImgList from './components/img-list.vue'
import { useMemeData } from './composables/use-meme-data'
import { useStickyToolbar } from './composables/use-sticky-toolbar'

const version = '0.1.2'
onMounted(() => {
  document.title = pipe(
    document.title.split('v'),
    ([value]) => `${value?.trim()} v${version}`,
  )
})

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
  if (!keyword.value && settings.value.allVisible) {
    return `真貪心，都給你吧 (´,,•ω•,,)`
  }

  if (!keyword.value && !settings.value.allVisible) {
    return '常常找不到記憶中的梗圖嗎？\n我來幫你找找 ԅ(´∀` ԅ)'
  }

  if (keyword.value && filteredList.value.length === 0) {
    return '沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )'
  }

  return `找到 ${filteredList.value.length} 個候選項目 ੭ ˙ᗜ˙ )੭`
})
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
