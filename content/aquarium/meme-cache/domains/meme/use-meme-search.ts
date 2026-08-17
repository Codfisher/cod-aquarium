import type { SearchWorkerRequest, SearchWorkerResponse } from './meme-search.worker'
import type { MemeData } from './type'
import { onBeforeUnmount } from 'vue'
import { searchMeme } from './meme-search-core'

export { calcCharCoverage, searchMeme } from './meme-search-core'

/** 建置期預先產出的搜尋索引 */
export const SEARCH_INDEX_URL = '/memes/a-memes-search-index.json'

/** worker 若卡死，畫面會永遠停在上一次結果，故設上限逼它走 fallback */
const RESPONSE_TIMEOUT = 10000

interface PrebuiltSearchIndex {
  count: number;
  firstFile: string;
  lastFile: string;
  index: unknown;
}

/** 索引與資料必須完全對齊，否則 Fuse 會查到錯的項目，故比對筆數與頭尾檔名 */
function isIndexMatched(index: PrebuiltSearchIndex, dataList: MemeData[]): boolean {
  return index.count === dataList.length
    && index.firstFile === dataList[0]?.file
    && index.lastFile === dataList[dataList.length - 1]?.file
}

let prebuiltIndexTask: Promise<PrebuiltSearchIndex | undefined> | undefined

function getPrebuiltIndex() {
  prebuiltIndexTask ??= fetch(SEARCH_INDEX_URL)
    .then((res) => res.ok ? res.json() as Promise<PrebuiltSearchIndex> : undefined)
    .catch((error) => {
      console.warn('[meme-search] 預建索引讀取失敗，改由 worker 自行建立', error)
      return undefined
    })

  return prebuiltIndexTask
}

/**
 * 索引建立昂貴，主畫面與插入迷因的選圖視窗共用同一個 worker，
 * 兩者拿到的是同一份 memeDataList，索引可完全重複使用。
 */
let worker: Worker | undefined
let indexedDataList: MemeData[] | undefined
let userCount = 0
let searchId = 0

function resetWorker() {
  worker?.terminate()
  worker = undefined
  indexedDataList = undefined
}

/** 等待 worker 回應指定訊息，逾時或出錯都拋出，交由呼叫端 fallback */
function waitResponse<T extends SearchWorkerResponse['type']>(
  type: T,
  id?: number,
): Promise<Extract<SearchWorkerResponse, { type: T }>> {
  return new Promise((resolve, reject) => {
    const target = worker
    if (!target) {
      reject(new Error('worker 不存在'))
      return
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('worker 回應逾時'))
    }, RESPONSE_TIMEOUT)

    function cleanup() {
      clearTimeout(timer)
      target?.removeEventListener('message', handleMessage)
      target?.removeEventListener('error', handleError)
    }

    function handleMessage(event: MessageEvent<SearchWorkerResponse>) {
      const response = event.data
      if (response.type === 'error' && (response.id === undefined || response.id === id)) {
        cleanup()
        reject(new Error(response.message))
        return
      }

      if (response.type !== type)
        return
      if (response.type === 'result' && response.id !== id)
        return

      cleanup()
      resolve(response as Extract<SearchWorkerResponse, { type: T }>)
    }

    function handleError(event: ErrorEvent) {
      cleanup()
      reject(event.error ?? new Error('worker 執行失敗'))
    }

    target.addEventListener('message', handleMessage)
    target.addEventListener('error', handleError)
  })
}

async function ensureWorker(dataList: MemeData[]) {
  worker ??= new Worker(
    new URL('./meme-search.worker.ts', import.meta.url),
    { type: 'module' },
  )

  if (indexedDataList === dataList)
    return

  const prebuiltIndex = await getPrebuiltIndex()
  const readyTask = waitResponse('ready')
  worker.postMessage({
    type: 'init',
    dataList,
    indexData: prebuiltIndex && isIndexMatched(prebuiltIndex, dataList)
      ? prebuiltIndex.index
      : undefined,
  } satisfies SearchWorkerRequest)
  await readyTask

  indexedDataList = dataList
}

export function useMemeSearch() {
  userCount += 1

  async function search(dataList: MemeData[], input: string): Promise<MemeData[]> {
    try {
      await ensureWorker(dataList)

      const id = ++searchId
      const resultTask = waitResponse('result', id)
      worker?.postMessage({ type: 'search', id, input } satisfies SearchWorkerRequest)
      const { fileList } = await resultTask

      const dataMap = new Map(dataList.map((item) => [item.file, item]))
      return fileList
        .map((file) => dataMap.get(file))
        .filter((item): item is MemeData => Boolean(item))
    }
    catch (error) {
      console.warn('[meme-search] Worker 失敗，fallback 到主執行緒', error)
      resetWorker()
    }

    return searchMeme(dataList, input)
  }

  onBeforeUnmount(() => {
    userCount -= 1
    if (userCount <= 0) {
      resetWorker()
    }
  })

  return { search }
}
