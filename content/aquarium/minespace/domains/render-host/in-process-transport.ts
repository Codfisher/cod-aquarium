import type {
  RenderChannel,
  RenderDownMessage,
  RenderHostTransport,
  RenderUpMessage,
} from './protocol'

/**
 * 同一條執行緒上的傳輸層（退路）
 *
 * OffscreenCanvas 的 WebGL2 不能用的瀏覽器（例如舊版 Safari）走這一條：
 * 渲染執行期直接跑在主執行緒，畫在原本那塊 canvas 上。
 * 跑的是同一份程式碼、收發的是同一批訊息，差別只在沒有執行緒的隔離。
 *
 * 渲染執行期用動態載入：worker 那條路的主執行緒用不到它，
 * 不該為了這個退路把整個 Babylon 的算繪端一起打進主要的 bundle
 *
 * 訊息排進微任務再送：渲染端在處理訊息的途中又往主執行緒送東西、
 * 主執行緒又立刻回一則的話，同步呼叫會讓兩邊互相重入，
 * 而 worker 那條路本來就保證不會發生這種事
 */
export async function createInProcessTransport(signal: AbortSignal): Promise<RenderHostTransport | null> {
  const { createRenderRuntime } = await import('./render-runtime')

  /**
   * 動態載入的這段時間元件可能已經被卸載了
   *
   * 渲染執行期一建好就會開計時器，這時才發現沒人要，就沒有人會去收它。
   * 所以要在建立之前問，而不是建好之後再叫呼叫端善後
   */
  if (signal.aborted)
    return null

  let hostHandler: ((message: RenderUpMessage) => void) | null = null
  let renderHandler: ((message: RenderDownMessage) => void) | null = null

  const channel: RenderChannel = {
    post: (message) => {
      queueMicrotask(() => hostHandler?.(message))
    },
    setMessageHandler: (handler) => {
      renderHandler = handler
    },
  }

  const runtime = createRenderRuntime({ channel })

  return {
    kind: 'in-process',
    prepareCanvas: (canvas) => canvas,
    post: (message) => {
      queueMicrotask(() => renderHandler?.(message))
    },
    setMessageHandler: (handler) => {
      hostHandler = handler
    },
    dispose: () => runtime.dispose(),
  }
}
