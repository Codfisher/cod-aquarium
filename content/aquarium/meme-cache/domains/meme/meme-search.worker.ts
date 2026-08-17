import type { SearchContext } from './meme-search-core'
import type { MemeData } from './type'
import { createSearchContext, searchWithContext } from './meme-search-core'

export interface InitRequest {
  type: 'init';
  dataList: MemeData[];
  /** 建置期預先產出的 Fuse 索引，缺少時 worker 自行建立 */
  indexData?: unknown;
}

export interface SearchRequest {
  type: 'search';
  id: number;
  input: string;
}

export type SearchWorkerRequest = InitRequest | SearchRequest

export interface ReadyResponse {
  type: 'ready';
}

export interface ResultResponse {
  type: 'result';
  id: number;
  /** 只回傳檔名，避免把整份資料再結構化複製回主執行緒 */
  fileList: string[];
}

export interface ErrorResponse {
  type: 'error';
  id?: number;
  message: string;
}

export type SearchWorkerResponse = ReadyResponse | ResultResponse | ErrorResponse

/** tsconfig 的 lib 只含 DOM，worker 全域型別得自行描述 */
interface WorkerScope {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<SearchWorkerRequest>) => void,
  ) => void;
  postMessage: (message: SearchWorkerResponse) => void;
}

const workerScope = globalThis as unknown as WorkerScope

/** 索引建立一次即長駐於 worker，後續搜尋直接重複使用 */
let context: SearchContext | undefined

workerScope.addEventListener('message', (event) => {
  const request = event.data

  try {
    if (request.type === 'init') {
      context = createSearchContext(request.dataList, request.indexData)
      workerScope.postMessage({ type: 'ready' } satisfies ReadyResponse)
      return
    }

    if (!context) {
      workerScope.postMessage({
        type: 'error',
        id: request.id,
        message: '索引尚未初始化',
      } satisfies ErrorResponse)
      return
    }

    workerScope.postMessage({
      type: 'result',
      id: request.id,
      fileList: searchWithContext(context, request.input).map((item) => item.file),
    } satisfies ResultResponse)
  }
  catch (error) {
    workerScope.postMessage({
      type: 'error',
      id: request.type === 'search' ? request.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponse)
  }
})
