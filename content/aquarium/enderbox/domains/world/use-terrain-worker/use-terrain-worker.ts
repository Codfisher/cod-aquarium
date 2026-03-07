import type { SandFall } from '../world-state'
import type { TerrainWorkerResponse } from './type'
import { useWebWorker } from '@vueuse/core'
import { watch } from 'vue'

export interface TerrainWorkerResult {
  worldState: Uint8Array;
  sandFalls: SandFall[];
}

/**
 * 封裝地形生成 Worker
 *
 * 使用 VueUse 的 useWebWorker 管理 Worker 生命週期。
 * 提供 Promise 化的 generate() 方法，呼叫後在 Worker 中執行
 * generateTerrain + simulateSandGravity，完成後回傳結果。
 */
export function useTerrainWorker() {
  const worker = new Worker(
    new URL('./terrain-worker.ts', import.meta.url),
    { type: 'module' },
  )
  const { data, post, terminate } = useWebWorker(worker)

  function generate(): Promise<TerrainWorkerResult> {
    return new Promise<TerrainWorkerResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unwatch()
        reject(new Error('[TerrainWorker] 地形生成逾時（10 秒）'))
      }, 10_000)

      const unwatch = watch(data, (message: TerrainWorkerResponse | null) => {
        if (message?.type === 'terrain-ready') {
          clearTimeout(timeoutId)
          unwatch()
          resolve({
            worldState: message.worldState,
            sandFalls: message.sandFalls,
          })
        }
      })

      post({ type: 'generate' } as never)
    })
  }

  return { generate, terminate }
}
