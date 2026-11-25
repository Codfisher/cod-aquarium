import type { TerrainWorkerMessage, TerrainWorkerResponse } from './type'
import { reportError } from '../../../composables/use-error-logger'

/**
 * 封裝地形生成 Worker
 *
 * 地形生成需要跑滿整張 128×128×48 的世界，
 * 丟到 Worker 才不會讓首屏卡住。
 *
 * 這支會在渲染端的 worker 裡被呼叫（巢狀 worker）。原本用的 VueUse useWebWorker
 * 只認得 window，worker 裡沒有 window，它就整個不動，所以這裡直接用 Worker 的 onmessage
 */
export function useTerrainWorker() {
  const worker = new Worker(
    new URL('./terrain-worker.ts', import.meta.url),
    { type: 'module' },
  )
  /** worker 有自己獨立的全域環境，主執行緒的 window.onerror 接不到它的例外 */
  worker.onerror = (event: ErrorEvent) => {
    reportError(`[TerrainWorker] ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`)
    /**
     * 記完就算處理過了
     *
     * 沒被處理的 error 會冒到上一層的全域：在渲染 worker 裡就是 self，
     * 再往上是主執行緒的 Worker 物件，被當成「渲染端死了」而觸發退回主執行緒。
     * 這支一次性的 worker 出事，真正的後果是 generate 逾時、由 init-error 說了算
     */
    event.preventDefault()
  }

  function generate(): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('[TerrainWorker] 地形生成逾時（20 秒）'))
      }, 20_000)

      worker.onmessage = (event: MessageEvent<TerrainWorkerResponse>) => {
        if (event.data.type !== 'terrain-ready')
          return

        clearTimeout(timeoutId)
        resolve(event.data.worldState)
      }

      const message: TerrainWorkerMessage = { type: 'generate' }
      worker.postMessage(message)
    })
  }

  function terminate(): void {
    worker.terminate()
  }

  return { generate, terminate }
}
