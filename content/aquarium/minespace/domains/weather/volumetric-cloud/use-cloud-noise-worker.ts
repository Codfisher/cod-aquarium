import type { CloudNoiseSet, CloudNoiseSizeOption } from './cloud-noise'
import type { CloudNoiseRequest, CloudNoiseResponse } from './cloud-noise-worker'
import { reportDiagnostic, reportError } from '../../../composables/use-error-logger'

/**
 * 在 worker 裡算一份體積雲的雜訊
 *
 * 一次性的：算完就把 worker 收掉。雜訊與時間、天氣都無關，
 * 一個場景只需要一份
 */
export function requestCloudNoise(option: CloudNoiseSizeOption, seed: string): {
  promise: Promise<CloudNoiseSet>;
  cancel: () => void;
} {
  const worker = new Worker(
    new URL('./cloud-noise-worker.ts', import.meta.url),
    { type: 'module' },
  )

  const promise = new Promise<CloudNoiseSet>((resolve, reject) => {
    /** worker 裡的例外不會冒到主執行緒的 window.onerror，理由見 use-voxel-gi-worker */
    worker.onerror = (event: ErrorEvent) => {
      reportError(`[CloudNoiseWorker] ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`)
      worker.terminate()
      reject(new Error(event.message))
    }

    worker.onmessage = (event: MessageEvent<CloudNoiseResponse>) => {
      reportDiagnostic('體積雲/雜訊生成', `${event.data.elapsedMs.toFixed(0)} ms`)
      worker.terminate()
      resolve(event.data.noiseSet)
    }
  })

  const request: CloudNoiseRequest = { option, seed }
  worker.postMessage(request)

  return {
    promise,
    cancel: () => worker.terminate(),
  }
}
