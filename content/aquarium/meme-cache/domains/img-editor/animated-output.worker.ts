import type { Rect } from './animated-output'
import { SPRITE_LAYOUT_VERSION } from '../../../../../.vitepress/utils/meme-sprite-layout'
import { encodeGif, encodeMp4 } from './animated-output'

/**
 * 動圖輸出的 worker。
 *
 * 逐格合成與量化編碼是純 CPU 工作，長動圖要跑上好幾秒，
 * 擺在主執行緒會讓整個編輯器凍住，連載入提示都轉不動。
 *
 * 影格長圖由 worker 自己 fetch：主執行緒雖然已經載過一次，但那是 HTMLImageElement，
 * 過不了 postMessage。改傳 ImageBitmap 則要嘛複製整張（動輒數十 MB），
 * 要嘛 transfer 走（主執行緒就沒得回頭 fallback）。
 * 這裡是同一個網址，直接命中 HTTP 快取，還順便把解碼也移出主執行緒
 */

export interface EncodeRequest {
  type: 'encode';
  format: 'gif' | 'mp4';
  /** 影格長圖檔名，worker 自行取用 */
  spriteFile: string;
  columnCount: number;
  frameWidth: number;
  frameHeight: number;
  delayList: number[];
  /**
   * 去重後的上層內容。
   *
   * 文字可設顯示區間，各影格未必一樣，但相同的影格共用同一張；
   * 逐格傳等於把同一張複製好幾份，故拆成「不重複的圖」與「每格用哪張」
   */
  overlayBitmapList: ImageBitmap[];
  overlayIndexList: number[];
  outputWidth: number;
  outputHeight: number;
  baseRect: Rect;
  overlayRect: Rect;
  backgroundColor: string;
}

export interface ProgressResponse {
  type: 'progress';
  /** 0~1 */
  ratio: number;
}

export interface DoneResponse {
  type: 'done';
  blob: Blob;
}

export interface ErrorResponse {
  type: 'error';
  message: string;
}

export type AnimatedOutputResponse = ProgressResponse | DoneResponse | ErrorResponse

/** tsconfig 的 lib 只含 DOM，worker 全域型別得自行描述。比照 meme-search.worker */
interface WorkerScope {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<EncodeRequest>) => void,
  ) => void;
  postMessage: (message: AnimatedOutputResponse) => void;
}

const workerScope = globalThis as unknown as WorkerScope

/** 進度回報的最小間隔，每格都回報只是在洗版並拖慢編碼 */
const PROGRESS_REPORT_STEP = 0.02

async function loadSpriteBitmap(file: string) {
  const response = await fetch(`/meme-sprites/${file}?v=${SPRITE_LAYOUT_VERSION}`)
  if (!response.ok) {
    throw new Error(`影格長圖載入失敗：${response.status}`)
  }

  return createImageBitmap(await response.blob())
}

async function handleEncode(request: EncodeRequest) {
  const image = await loadSpriteBitmap(request.spriteFile)

  let reportedRatio = 0
  const options = {
    sprite: {
      image,
      file: request.spriteFile,
      frameCount: request.delayList.length,
      columnCount: request.columnCount,
      frameWidth: request.frameWidth,
      frameHeight: request.frameHeight,
      delayList: request.delayList,
    },
    overlayList: request.overlayIndexList.map(
      (bitmapIndex) => request.overlayBitmapList[bitmapIndex]!,
    ),
    outputWidth: request.outputWidth,
    outputHeight: request.outputHeight,
    baseRect: request.baseRect,
    overlayRect: request.overlayRect,
    backgroundColor: request.backgroundColor,
    onProgress(ratio: number) {
      if (ratio - reportedRatio < PROGRESS_REPORT_STEP) {
        return
      }

      reportedRatio = ratio
      workerScope.postMessage({ type: 'progress', ratio } satisfies ProgressResponse)
    },
  }

  try {
    const blob = request.format === 'mp4'
      ? await encodeMp4(options)
      : await encodeGif(options)

    workerScope.postMessage({ type: 'done', blob } satisfies DoneResponse)
  }
  finally {
    image.close()
    for (const bitmap of request.overlayBitmapList) {
      bitmap.close()
    }
  }
}

workerScope.addEventListener('message', (event) => {
  if (event.data?.type !== 'encode') {
    return
  }

  handleEncode(event.data).catch((error: unknown) => {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies ErrorResponse)
  })
})
