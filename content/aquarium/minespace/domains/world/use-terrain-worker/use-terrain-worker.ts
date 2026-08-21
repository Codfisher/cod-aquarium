import type { TerrainWorkerResponse } from './type'
import { useWebWorker } from '@vueuse/core'
import { watch } from 'vue'
import { reportError } from '../../../composables/use-error-logger'

/**
 * 封裝地形生成 Worker
 *
 * 地形生成需要跑滿整張 128×128×48 的世界，
 * 丟到 Worker 才不會讓首屏卡住。
 */
export function useTerrainWorker() {
  const worker = new Worker(
    new URL('./terrain-worker.ts', import.meta.url),
    { type: 'module' },
  )
  /** worker 有自己獨立的全域環境，主執行緒的 window.onerror 接不到它的例外 */
  worker.onerror = (event: ErrorEvent) => {
    reportError(`[TerrainWorker] ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`)
  }
  const { data, post, terminate } = useWebWorker(worker)

  function generate(): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unwatch()
        reject(new Error('[TerrainWorker] 地形生成逾時（20 秒）'))
      }, 20_000)

      const unwatch = watch(data, (message: TerrainWorkerResponse | null) => {
        if (message?.type !== 'terrain-ready')
          return

        clearTimeout(timeoutId)
        unwatch()
        resolve(message.worldState)
      })

      post({ type: 'generate' } as never)
    })
  }

  return { generate, terminate }
}
