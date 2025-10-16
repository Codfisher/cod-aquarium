<template>
  <client-only>
    <div class=" flex flex-col p-4">
      <div class="search-input rounded-full border">
        <input
          v-model="keyword"
          class=" p-4 px-6 w-full"
        >
      </div>

      <div class="meme-cache w-screen h-screen flex justify-center items-center p-4 gap-4">
        {{ filteredList }}
      </div>
    </div>
  </client-only>
</template>

<script setup lang="ts">
import type { z } from 'zod'
import Fuse from 'fuse.js'
import { debounce } from 'lodash-es'
import { computed, onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue'
import { memeDataSchema } from './type'

type MemeData = z.infer<typeof memeDataSchema>

const memeDataMap = shallowRef(new Map<string, MemeData>())
const triggerMemeData = debounce(() => {
  triggerRef(memeDataMap)
}, 500)

const fuse = computed(() => new Fuse(
  [...memeDataMap.value.values()],
  {
    keys: [
      'describe.en',
      'describe.zh',
      {
        name: 'ocr',
        weight: 2,
      },
    ],
  },
))

const keyword = ref('')
const filteredList = computed(() =>
  fuse.value.search(keyword.value).map(({ item }) => item),
)

/** 串流讀取 meme ndjson 檔案 */
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
    const result = memeDataSchema.safeParse(row)
    if (!result.success) {
      return
    }

    memeDataMap.value.set(
      result.data.file,
      result.data,
    )
    triggerMemeData()
  }, { signal: controller.signal })
}
main()

onBeforeUnmount(() => {
  controller.abort()
})
</script>

<style scoped lang="sass">

</style>
