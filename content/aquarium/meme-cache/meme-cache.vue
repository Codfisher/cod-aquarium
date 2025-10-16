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
        />

        <transition name="opacity">
          <div
            v-if="filteredList.length === 0 && keyword"
            class=" absolute inset-0 flex justify-center items-center text-3xl opacity-30"
          >
            沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )
          </div>
        </transition>

        <transition name="opacity">
          <div
            v-if="!keyword && !settings.allVisible"
            class="absolute inset-0 flex justify-center items-center text-3xl opacity-30"
          >
            來點梗圖吧 ԅ(´∀` ԅ)
          </div>
        </transition>
      </div>

      <div
        ref="toolbarRef"
        class="flex gap-2 w-full fixed left-0 p-4 bg-white dark:bg-black "
        :style="toolbarStyle"
      >
        <div class="rounded-full border flex-1">
          <input
            v-model.trim="keyword"
            class=" p-4 px-6 w-full"
            placeholder="輸入關鍵字，馬上為您尋找 (・∀・)９"
            @keydown.enter="handleEnter"
          >
        </div>

        <label class="flex items-center gap-2">
          <input
            v-model="settings.allVisible"
            type="checkbox"
          >
          顯示全部
        </label>

        <!-- <label class="flex items-center gap-2">
          <input
            v-model="settings.detailVisible"
            type="checkbox"
          >
          顯示細節
        </label> -->
      </div>
    </div>
  </client-only>
</template>

<script setup lang="ts">
import type { MemeData } from './type'
import { useActiveElement, useElementSize, useEventListener, useRafFn, useWindowScroll, useWindowSize } from '@vueuse/core'
import Fuse from 'fuse.js'
import { throttle } from 'lodash-es'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../common/utils'
import ImgList from './img-list.vue'
import { memeOriDataSchema } from './type'

const memeDataMap = shallowRef(new Map<string, MemeData>())
const triggerMemeData = throttle(() => {
  triggerRef(memeDataMap)
}, 500)

const windowSize = reactive(useWindowSize())

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
const filteredList = computed(() => {
  if (!keyword.value && settings.value.allVisible) {
    return [...memeDataMap.value.values()]
  }

  return fuse.search(keyword.value).map(({ item }) => item)
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

const occluded = ref(0)
function updateOccluded() {
  occluded.value = visualViewport
    ? Math.max(0, windowSize.height - visualViewport.height - visualViewport.offsetTop)
    : 0
}
useRafFn(() => {
  updateOccluded()
})

const toolbarRef = useTemplateRef('toolbarRef')
const toolbarSize = reactive(useElementSize(toolbarRef, undefined, {
  box: 'border-box',
}))
const toolbarStyle = computed(() => ({
  bottom: `calc(${occluded.value}px + env(safe-area-inset-bottom))`,
}))

const contentStyle = computed(() => ({
  paddingBottom: `calc(${toolbarSize.height}px + env(safe-area-inset-bottom))`,
}))
</script>

<style scoped lang="sass">
</style>

<style lang="sass">
.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.4s
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
