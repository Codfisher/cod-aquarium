import type { VoxelGiBakeResponse, VoxelGiInitMessage, VoxelGiWorkerMessage } from './type'
import { reportError } from '../../../composables/use-error-logger'

interface BakeParam {
  sunColor: [number, number, number];
  sunStrength: number;
  bouncePassCount: number;
}

/** 一次烘焙最多等多久，worker 卡死也不該讓呼叫端永遠掛著 */
const BAKE_TIMEOUT_MS = 5000

/**
 * 封裝全局光烘焙 Worker
 *
 * 跟地形生成那個 worker 不一樣：那個是一次性的，這個要活著、
 * 反覆接請求——世界的形狀只送一次，之後每次重烘只送太陽的方向與顏色，
 * 傳回一份可以直接塞進 RawTexture 的資料（2D 圖集，排法見 type.ts）
 */
export function useVoxelGiWorker() {
  const worker = new Worker(
    new URL('./voxel-gi-worker.ts', import.meta.url),
    { type: 'module' },
  )

  /**
   * worker 裡的例外不會冒到主執行緒的 window.onerror
   *
   * worker 有自己獨立的全域環境，這裡是唯一攔得到它出錯的地方——
   * 接進共用的錯誤紀錄，才會跟其他錯誤一起匯出
   */
  worker.onerror = (event: ErrorEvent) => {
    reportError(`[VoxelGiWorker] ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`)
  }

  let nextRequestId = 0
  const pendingMap = new Map<number, {
    resolve: (data: Uint8Array) => void;
    reject: (error: Error) => void;
  }>()

  worker.onmessage = (event: MessageEvent<VoxelGiBakeResponse>) => {
    const pending = pendingMap.get(event.data.requestId)
    if (!pending)
      return

    pendingMap.delete(event.data.requestId)
    pending.resolve(event.data.textureData)
  }

  /**
   * 把粗網格送進 worker，只呼叫這一次
   *
   * 三份陣列用轉移的，不用複製——世界生成完之後主執行緒不會再讀
   * 這份降採樣資料，所有權整個交給 worker 更乾淨，也省一次複製
   */
  function init(param: Omit<VoxelGiInitMessage, 'type'>): void {
    const message: VoxelGiInitMessage = { type: 'init', ...param }
    worker.postMessage(message, [
      message.solidList.buffer,
      message.albedoList.buffer,
      message.skyVisibilityList.buffer,
    ])
  }

  function bake(param: BakeParam): Promise<Uint8Array> {
    const requestId = nextRequestId++

    return new Promise<Uint8Array>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingMap.delete(requestId)
        reject(new Error('[VoxelGiWorker] 烘焙逾時'))
      }, BAKE_TIMEOUT_MS)

      pendingMap.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeoutId)
          resolve(data)
        },
        reject: (error) => {
          clearTimeout(timeoutId)
          reject(error)
        },
      })

      const message: VoxelGiWorkerMessage = { type: 'bake', requestId, ...param }
      worker.postMessage(message)
    })
  }

  function dispose(): void {
    worker.terminate()
    pendingMap.clear()
  }

  return { init, bake, dispose }
}
