import type { RenderHostTransport } from './protocol'
import { createInProcessTransport } from './in-process-transport'
import { createWorkerTransport } from './worker-transport'

interface CreateRenderTransportOption {
  /** 元件卸載時取消，偵測與載入途中的資源才收得掉 */
  signal: AbortSignal;
  /** 跳過 worker，直接走主執行緒的退路（worker 初始化失敗之後重建時用） */
  shouldSkipWorker?: boolean;
}

/**
 * 選傳輸層
 *
 * 能用 worker 就用 worker，不行才退回主執行緒。
 * 網址帶 ?renderer=main 可以強制走退路，驗證退路或排查 worker 專屬的問題時用。
 * 被取消時回 null
 */
export async function createRenderTransport({ signal, shouldSkipWorker = false }: CreateRenderTransportOption): Promise<RenderHostTransport | null> {
  const forcedMode = new URLSearchParams(window.location.search).get('renderer')

  if (forcedMode !== 'main' && !shouldSkipWorker) {
    const workerTransport = await createWorkerTransport(signal)
    if (workerTransport)
      return workerTransport

    if (signal.aborted)
      return null
  }

  return createInProcessTransport(signal)
}
