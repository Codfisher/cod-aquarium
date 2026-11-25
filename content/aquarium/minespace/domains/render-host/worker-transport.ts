import type { RenderHostTransport, RenderProbeResultMessage, RenderUpMessage } from './protocol'
import { useTimeoutFn } from '@vueuse/core'
import { reportWarning } from '../../composables/use-error-logger'

/**
 * worker 模組載入完的時限
 *
 * 模組要下載整個 Babylon，慢網路上要好幾十秒，這段不能當成「不支援」。
 * 真正載入失敗時 worker 會丟 error，不必靠時限；這個長時限只是擋住「永遠沒有回應」
 */
const LOAD_TIMEOUT = 120_000
/** 載入完之後，worker 回答能力偵測的時限：這時只剩開一塊畫布，很快 */
const PROBE_TIMEOUT = 5_000

/**
 * 真正的 Worker 傳輸層
 *
 * 渲染端跑在 Dedicated Worker 裡，畫在 transferControlToOffscreen 交過去的畫布上。
 * 主執行緒因此不再被渲染卡住：選單、輸入與音訊在掉幀時仍然順暢。
 *
 * 不支援時回傳 null，由呼叫端改走同一條執行緒上的退路。
 * 「不支援」要先問過 worker 才知道：OffscreenCanvas 能不能拿到 webgl2、
 * 巢狀 worker 能不能建，主執行緒這邊測得出來的只是一半——
 * 而畫布一旦轉移就收不回來，所以得在轉移之前確認。
 *
 * signal 是給元件在偵測途中被卸載用的：偵測要等 worker 載入，那段時間不短，
 * 元件可能早就不在了，不收的話 worker 會一直掛著
 */
export async function createWorkerTransport(signal: AbortSignal): Promise<RenderHostTransport | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined')
    return null

  if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype))
    return null

  const worker = new Worker(
    new URL('./render-worker.ts', import.meta.url),
    { type: 'module' },
  )

  const probeResult = await requestProbe(worker, signal)

  if (signal.aborted) {
    worker.terminate()
    return null
  }

  if (!probeResult.isSupported) {
    worker.terminate()
    reportWarning(`[RenderWorker] 退回主執行緒算繪：${probeResult.reason ?? '不支援'}`)
    return null
  }

  let messageHandler: ((message: RenderUpMessage) => void) | null = null

  worker.onmessage = (event: MessageEvent<RenderUpMessage>) => {
    messageHandler?.(event.data)
  }

  /**
   * 偵測通過之後的錯誤也要接
   *
   * 沒有這一段，初始化之後 worker 裡冒出來的例外沒有人聽：
   * 畫面停住、HUD 不動，使用者看不到任何原因。
   * 轉成 init-error，由上層決定是退回主執行緒還是顯示錯誤。
   * 開發時 worker 自己會先攔下例外、記進紀錄並 preventDefault（見 render-worker），
   * 所以這裡收到的是沒被攔的那些，不會重複回報；正式版沒有攔，
   * 這裡不 preventDefault，瀏覽器照常把它印進主控台
   */
  worker.onerror = (event: ErrorEvent) => {
    messageHandler?.({
      type: 'init-error',
      message: `[RenderWorker] ${event.message || '渲染 worker 發生錯誤'}`,
    })
  }
  worker.onmessageerror = () => {
    messageHandler?.({
      type: 'init-error',
      message: '[RenderWorker] 收到無法解析的訊息',
    })
  }

  return {
    kind: 'worker',
    prepareCanvas: (canvas) => canvas.transferControlToOffscreen(),
    post: (message, transferList = []) => worker.postMessage(message, transferList),
    setMessageHandler: (handler) => {
      messageHandler = handler
    },
    /** 巢狀的 worker（地形、區塊、全局光、雲雜訊）隨它的上層一起收掉 */
    dispose: () => worker.terminate(),
  }
}

/**
 * 問 worker 它能不能當渲染端
 *
 * 分兩段計時：先等 worker 說它載入完了（時限長，載入失敗另由 error 事件處理），
 * 再送能力偵測、等答案（時限短）。載入出錯、逾時或被取消都算不支援。
 *
 * 計時器用 useTimeoutFn：不管怎麼收場（有答案、出錯、被取消）都要把兩個計時器停掉，
 * 不然一個一百二十秒的計時器會在頁面上掛到時間到
 */
function requestProbe(worker: Worker, signal: AbortSignal): Promise<RenderProbeResultMessage> {
  return new Promise<RenderProbeResultMessage>((resolve) => {
    const loadTimer = useTimeoutFn(() => settle(createUnsupportedResult('worker 載入逾時')), LOAD_TIMEOUT)
    const probeTimer = useTimeoutFn(() => settle(createUnsupportedResult('能力偵測逾時')), PROBE_TIMEOUT, { immediate: false })

    function settle(result: RenderProbeResultMessage) {
      loadTimer.stop()
      probeTimer.stop()
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      signal.removeEventListener('abort', handleAbort)
      resolve(result)
    }

    function handleMessage(event: MessageEvent<RenderUpMessage>) {
      if (event.data.type === 'loaded') {
        /** 載入完才開始計偵測的時限 */
        loadTimer.stop()
        probeTimer.start()
        worker.postMessage({ type: 'probe' })
        return
      }

      if (event.data.type === 'probe-result') {
        settle(event.data)
      }
    }

    /** 模組載入或求值就出錯的話，worker 不會回任何訊息，只會丟 error */
    function handleError(event: ErrorEvent) {
      settle(createUnsupportedResult(`worker 載入失敗：${event.message}`))
    }

    function handleAbort() {
      settle(createUnsupportedResult('已取消'))
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    signal.addEventListener('abort', handleAbort)
  })
}

function createUnsupportedResult(reason: string): RenderProbeResultMessage {
  return { type: 'probe-result', isSupported: false, reason }
}
