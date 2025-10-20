<template>
  <client-only>
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

          <template #detail>
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
          <div class="flex-1" />

          <u-button
            icon="i-lucide-x"
            @click="close"
          />
        </div>
      </template>
    </u-modal>
  </client-only>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from './type'
import { useActiveElement, watchThrottled } from '@vueuse/core'
import { snapdom } from '@zumer/snapdom'
import Fuse from 'fuse.js'
import { throttle } from 'lodash-es'
import { useData } from 'vitepress'
import { onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../web/common/utils'
import ImgEditor from './components/img-editor.vue'
import ImgList from './components/img-list.vue'
import { useStickyToolbar } from './composables/use-sticky-toolbar'
import { memeOriDataSchema } from './type'

const isDev = import.meta.env.DEV

onMounted(async () => {
  useData().isDark.value = false
})

const toast = useToast()
const memeDataMap = shallowRef(new Map<string, MemeData>())
const triggerMemeData = throttle(() => {
  triggerRef(memeDataMap)
}, 500)

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

/** 串流讀取 ndjson 檔案 */
async function consumeNdjsonPipeline<T = unknown>(
  url: string,
  onItem: (row: T) => void,
  opts: { signal?: AbortSignal } = {},
) {
  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson' },
    signal: opts.signal,
  })
  if (!res.ok)
    throw new Error(`HTTP ${res.status}`)

  let buffer = ''

  const lineSplitter = new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim())
          controller.enqueue(line)
      }
    },
    flush(controller) {
      if (buffer.trim())
        controller.enqueue(buffer)
    },
  })

  const reader = res.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(lineSplitter)
    .getReader()

  for (; ;) {
    const { value, done } = await reader.read()
    if (done)
      break
    onItem(JSON.parse(value) as T)
  }
}

const controller = new AbortController()
async function main() {
  // 串流讀取圖片資料
  consumeNdjsonPipeline('/memes/memes-data.ndjson', (row) => {
    const result = memeOriDataSchema.safeParse(row)
    if (!result.success) {
      return
    }

    const existedData = memeDataMap.value.get(result.data.file)

    memeDataMap.value.set(
      result.data.file,
      {
        describeZhTw: '',
        ...existedData,
        ...result.data,
      },
    )
    triggerMemeData()
  }, { signal: controller.signal })

  consumeNdjsonPipeline('/memes/memes-data-zh-tw.ndjson', (row) => {
    const result = memeOriDataSchema.safeParse(row)
    if (!result.success) {
      return
    }

    const existedData = memeDataMap.value.get(result.data.file)
    const { describe, ...otherData } = result.data

    memeDataMap.value.set(
      result.data.file,
      {
        describe: '',
        ...otherData,
        ...existedData,
        describeZhTw: describe ?? '',
      },
    )
    triggerMemeData()
  }, { signal: controller.signal })
}
if (!import.meta.env.SSR) {
  main()
}

onBeforeUnmount(() => {
  controller.abort()
})

const toolbarRef = useTemplateRef('toolbarRef')
const { toolbarStyle, contentStyle } = useStickyToolbar(toolbarRef)

const editorRef = useTemplateRef('editorRef')

function toggleSettingForm() {
  editorRef.value?.toggleImgSettingVisible()
}

async function copyImg() {
  if (!editorRef.value?.boardRef)
    return

  await editorRef.value.blur()
  const img = await snapdom.toBlob(
    editorRef.value?.boardRef,
    {
      quality: 1,
      backgroundColor: '#FFFFFF',
      type: 'png',
    },
  )

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': img,
    }),
  ])
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
