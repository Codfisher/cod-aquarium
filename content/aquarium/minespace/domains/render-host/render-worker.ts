import type {
  RenderChannel,
  RenderDownMessage,
  RenderProbeResultMessage,
  RenderUpMessage,
} from './protocol'
import type { RenderRuntime } from './render-runtime'
import { PrecisionDate } from '@babylonjs/core'
import { enableIssueForwarding, installIssueCapture } from '../../composables/use-error-logger'
import { createRenderRuntime } from './render-runtime'

/**
 * 渲染 worker 的入口
 *
 * Babylon 的引擎、場景與所有每幀的邏輯都在這裡跑，畫在主執行緒轉移過來的 OffscreenCanvas 上。
 * 這個檔案只負責接線：收訊息交給渲染執行期、把它要送的東西往主執行緒送。
 */

// eslint-disable-next-line no-restricted-globals
const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<RenderDownMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  close: () => void;
}

/**
 * 時間戳要用 performance.now
 *
 * Babylon 的 PrecisionDate.Now 只有在有 window 時才用 performance.now，
 * 否則退回 Date.now——worker 裡就是後者。那會讓每一幀的 deltaTime 只有毫秒解析度
 * （在十六與十七之間跳），而且 Date.now 會跟著系統時鐘走，
 * 時鐘被校正往回撥時，deltaTime 會出現負值。
 * performance.now 在 worker 裡有、單調遞增、精度高，直接把它換進去
 */
Object.defineProperty(PrecisionDate, 'Now', {
  configurable: true,
  get: () => performance.now(),
})

/**
 * worker 的錯誤與 console 接不進主執行緒的 window.onerror，得自己攔
 *
 * 記下來的東西不留在這裡，由渲染執行期每隔一段時間成批送上主執行緒，
 * 匯進那一邊的清單，F6 匯出的檔案才兩邊都有。
 *
 * 只有開發時才裝，與主執行緒的 useErrorLogger 一致：
 * 這一層會換掉 Babylon 的 Logger.Error 與 Logger.Warn、包住 console，
 * 而記錄本身在正式版是空的（reportIssue 一開頭就返回）——裝了只會把著色器與貼圖的錯誤吞掉，
 * 還讓每一次 console 呼叫白白付一次格式化的錢。正式版維持原樣，錯誤照常印進主控台
 */
if (import.meta.env.DEV) {
  enableIssueForwarding()
  // eslint-disable-next-line no-restricted-globals
  installIssueCapture(self, { shouldPreventDefault: true })
}

let messageHandler: ((message: RenderDownMessage) => void) | null = null
let runtime: RenderRuntime | null = null

const channel: RenderChannel = {
  post: (message: RenderUpMessage, transferList: Transferable[] = []) => {
    workerSelf.postMessage(message, transferList)
  },
  setMessageHandler: (handler) => {
    messageHandler = handler
  },
}

/**
 * 能不能當渲染端
 *
 * 開一塊用完即丟的 OffscreenCanvas 試著拿 webgl2，並確認巢狀 worker 能建。
 * 真的畫布要等這個答案是肯定的才會轉移過來
 */
function probeSupport(): RenderProbeResultMessage {
  if (typeof OffscreenCanvas === 'undefined')
    return { type: 'probe-result', isSupported: false, reason: 'worker 裡沒有 OffscreenCanvas' }

  if (typeof Worker === 'undefined')
    return { type: 'probe-result', isSupported: false, reason: 'worker 裡不能再建 worker' }

  const context = new OffscreenCanvas(1, 1).getContext('webgl2')
  if (!context)
    return { type: 'probe-result', isSupported: false, reason: 'OffscreenCanvas 拿不到 webgl2' }

  /** 試完就還給 GPU，不要等垃圾回收 */
  context.getExtension('WEBGL_lose_context')?.loseContext()

  return { type: 'probe-result', isSupported: true }
}

workerSelf.onmessage = (event) => {
  const message = event.data

  if (message.type === 'probe') {
    channel.post(probeSupport())
    return
  }

  if (!runtime) {
    runtime = createRenderRuntime({ channel })
  }

  messageHandler?.(message)

  if (message.type === 'dispose') {
    runtime = null
    workerSelf.close()
  }
}

/**
 * 入口模組求值完畢
 *
 * 主執行緒要等到這一則才開始計能力偵測的時限：
 * 這支 worker 要下載整個 Babylon，慢網路上可能要好幾十秒，不能算進偵測裡。
 * 訊息處理器在上面已經掛好，所以主執行緒收到之後立刻送 probe 也來得及
 */
const loadedMessage: RenderUpMessage = { type: 'loaded' }
workerSelf.postMessage(loadedMessage)
