import type { EncodeGifOptions } from './animated-output'
import type { AnimatedOutputResponse, EncodeRequest } from './animated-output.worker'
import { encodeGif, encodeMp4, isOffscreenSupported } from './animated-output'

/**
 * 動圖輸出的入口。
 *
 * 優先丟給 worker，環境不支援或 worker 出事就退回主執行緒，
 * 兩條路走的是同一份編碼程式碼
 */

export interface AnimatedOutputOptions extends EncodeGifOptions {
  format: 'gif' | 'mp4';
}

/**
 * 多久沒收到進度就當 worker 卡死。
 *
 * 不能用「整段編碼的總時限」：長動圖本來就要跑上十幾秒，訂死會誤殺。
 * 改看進度回報當心跳，只要還在動就繼續等
 */
const PROGRESS_IDLE_TIMEOUT = 30_000

/**
 * 上層內容去重。
 *
 * 相同的影格共用同一張 ImageBitmap，逐格傳等於把同一張複製好幾份。
 * 張數不多，用 indexOf 逐一比對即可
 */
function dedupeOverlayList(overlayList: ImageBitmap[]) {
  const bitmapList: ImageBitmap[] = []
  const indexList = overlayList.map((bitmap) => {
    const existingIndex = bitmapList.indexOf(bitmap)
    return existingIndex >= 0 ? existingIndex : bitmapList.push(bitmap) - 1
  })

  return { bitmapList, indexList }
}

function encodeInMainThread(options: AnimatedOutputOptions) {
  return options.format === 'mp4' ? encodeMp4(options) : encodeGif(options)
}

/** worker 能不能用。SSR 與 Safari 16.4 以前都缺，得留主執行緒這條路 */
function isWorkerSupported() {
  return !import.meta.env.SSR
    && typeof Worker !== 'undefined'
    && isOffscreenSupported()
}

function encodeInWorker(options: AnimatedOutputOptions): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL('./animated-output.worker.ts', import.meta.url),
      { type: 'module' },
    )

    let idleTimer: ReturnType<typeof setTimeout>
    function finish(settle: () => void) {
      clearTimeout(idleTimer)
      worker.terminate()
      settle()
    }
    function watchProgress() {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(
        () => finish(() => reject(new Error('動圖編碼逾時'))),
        PROGRESS_IDLE_TIMEOUT,
      )
    }

    worker.addEventListener('message', (event: MessageEvent<AnimatedOutputResponse>) => {
      const response = event.data

      if (response.type === 'progress') {
        options.onProgress?.(response.ratio)
        watchProgress()
        return
      }

      if (response.type === 'done') {
        finish(() => resolve(response.blob))
        return
      }

      finish(() => reject(new Error(response.message)))
    })

    worker.addEventListener('error', (event) => {
      finish(() => reject(event.error ?? new Error('worker 執行失敗')))
    })

    const { sprite, overlayList } = options
    const { bitmapList, indexList } = dedupeOverlayList(overlayList)

    /*
     * 不用 transfer：ImageBitmap 一旦 transfer 走，主執行緒這邊就成了空殼，
     * worker 出事也沒得回頭跑 fallback。
     * 去重後的張數不多，複製的代價遠比失去退路划算
     */
    worker.postMessage({
      type: 'encode',
      format: options.format,
      spriteFile: sprite.file,
      columnCount: sprite.columnCount,
      frameWidth: sprite.frameWidth,
      frameHeight: sprite.frameHeight,
      delayList: sprite.delayList,
      overlayBitmapList: bitmapList,
      overlayIndexList: indexList,
      outputWidth: options.outputWidth,
      outputHeight: options.outputHeight,
      baseRect: options.baseRect,
      overlayRect: options.overlayRect,
      backgroundColor: options.backgroundColor,
    } satisfies EncodeRequest)

    watchProgress()
  })
}

/** 輸出動圖。worker 不可用或中途出事都會退回主執行緒，不讓使用者空手而回 */
export async function encodeAnimatedOutput(options: AnimatedOutputOptions): Promise<Blob> {
  if (!isWorkerSupported()) {
    return encodeInMainThread(options)
  }

  try {
    return await encodeInWorker(options)
  }
  catch (error) {
    console.warn('[meme-cache] worker 輸出動圖失敗，改由主執行緒處理', error)
    return encodeInMainThread(options)
  }
}
