import { computed, onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue'
import { mergeMemeDataList } from './merge-meme-data'
import { type MemeData, memeDataSchema } from './type'

/** 串流讀取 ndjson 檔案 */
async function consumeNdjsonPipeline<T = unknown>(
  url: string,
  onItem: (row: T) => void,
  opts: { signal?: AbortSignal } = {},
) {
  // 不帶自訂 header：config.mts 在 head 預載了這兩份 ndjson，請求條件不同就無法沿用預載結果
  const res = await fetch(url, {
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

  const controller = new AbortController()
  async function main() {
    const taskList = [
      consumeNdjsonPipeline('/memes/a-memes-data.ndjson', (row) => {
        const result = memeDataSchema.safeParse(row)
        if (!result.success)
          return

        baseMap.value.set(result.data.file, result.data)
      }, { signal: controller.signal }),

      consumeNdjsonPipeline('/memes/a-memes-data-extend.ndjson', (row) => {
        const result = memeDataSchema.safeParse(row)
        if (!result.success)
          return

        extendMap.value.set(result.data.file, result.data)
      }, { signal: controller.signal }),
    ]

    const resultList = await Promise.allSettled(taskList)
    resultList
      .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      .forEach(({ reason }) => {
        console.warn('[meme-cache] 讀取迷因資料失敗', reason)
      })

    /** 兩份 ndjson 都讀完才通知一次，不在串流途中邊讀邊更新。
     * 原本每 500ms 觸發一次：沒有關鍵字時清單每次都整份重新洗牌，首屏圖片被換掉、LCP 重來，
     * 整份清單也跟著重繪；主執行緒一忙，串流讀得更慢、觸發次數更多，實測會從 4 次膨脹到 30 次。
     * 壓縮後資料約 1 秒內就讀完，邊讀邊顯示省不了多少時間
     */
    triggerRef(baseMap)
    triggerRef(extendMap)
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
