import { throttle } from 'lodash-es'
import { nanoid } from 'nanoid'
import { omit } from 'remeda'
import { onBeforeUnmount, shallowRef, triggerRef } from 'vue'
import { type MemeData, memeOriDataSchema } from '../type'

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
  const memeDataMap = shallowRef(new Map<string, MemeData>())
  const triggerMemeData = throttle(() => {
    triggerRef(memeDataMap)
  }, 500)

  const controller = new AbortController()
  async function main() {
    // 串流讀取圖片資料
    consumeNdjsonPipeline(`/memes/memes-data.ndjson`, (row) => {
      const result = memeOriDataSchema.safeParse(row)
      if (!result.success) {
        return
      }

      const existedData = memeDataMap.value.get(result.data.file)

      memeDataMap.value.set(
        result.data.file,
        {
          describeZhTw: '',
          ocr: '',
          keyword: '',
          ...existedData,
          ...omit(result.data, ['ocr', 'keyword']),
        },
      )
      triggerMemeData()
    }, { signal: controller.signal })

    // 中文
    consumeNdjsonPipeline(`/memes/memes-data-zh-tw.ndjson`, (row) => {
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

    // 手動標註的資料
    consumeNdjsonPipeline(`/memes/memes-data-extend.ndjson`, (row) => {
      const result = memeOriDataSchema.safeParse(row)
      if (!result.success) {
        return
      }

      const existedData = memeDataMap.value.get(result.data.file)
      const { ocr, keyword, ...otherData } = result.data

      memeDataMap.value.set(
        result.data.file,
        {
          ...otherData,
          ...existedData,
          describeZhTw: existedData?.describeZhTw ?? '',
          ocr,
          keyword,
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

  return { memeDataMap }
}
