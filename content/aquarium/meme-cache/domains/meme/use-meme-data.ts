import { throttle } from 'lodash-es'
import { computed, onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue'
import { mergeMemeDataList } from './merge-meme-data'
import { type MemeData, memeDataSchema } from './type'

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

export function useMemeData() {
  /** 自動分析結果，寫入順序即檔案順序 */
  const baseMap = shallowRef(new Map<string, MemeData>())
  /** 手動標註的補充資料 */
  const extendMap = shallowRef(new Map<string, MemeData>())

  const memeDataList = computed(() => mergeMemeDataList(baseMap.value, extendMap.value))

  /** 兩份 ndjson 都讀完才算完整，預建索引與缺圖回報都要等這個訊號 */
  const loaded = ref(false)

  const triggerMemeData = throttle(() => {
    triggerRef(baseMap)
    triggerRef(extendMap)
  }, 500)

  const controller = new AbortController()
  async function main() {
    const taskList = [
      consumeNdjsonPipeline('/memes/a-memes-data.ndjson', (row) => {
        const result = memeDataSchema.safeParse(row)
        if (!result.success)
          return

        baseMap.value.set(result.data.file, result.data)
        triggerMemeData()
      }, { signal: controller.signal }),

      consumeNdjsonPipeline('/memes/a-memes-data-extend.ndjson', (row) => {
        const result = memeDataSchema.safeParse(row)
        if (!result.success)
          return

        extendMap.value.set(result.data.file, result.data)
        triggerMemeData()
      }, { signal: controller.signal }),
    ]

    const resultList = await Promise.allSettled(taskList)
    resultList
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .forEach(({ reason }) => {
        console.warn('[meme-cache] 讀取迷因資料失敗', reason)
      })

    triggerMemeData.flush()
    loaded.value = true
  }
  if (!import.meta.env.SSR) {
    main()
  }

  onBeforeUnmount(() => {
    controller.abort()
  })

  return { memeDataList, loaded }
}
