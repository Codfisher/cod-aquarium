import type { CloudNoiseSet, CloudNoiseSizeOption } from './cloud-noise'
import { createCloudNoiseSet } from './cloud-noise'

// eslint-disable-next-line no-restricted-globals
const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
}

export interface CloudNoiseRequest {
  option: CloudNoiseSizeOption;
  seed: string;
}

export interface CloudNoiseResponse {
  noiseSet: CloudNoiseSet;
  /** 花了幾毫秒，記進診斷紀錄，手機上慢不慢一看就知道 */
  elapsedMs: number;
}

/**
 * 體積雲的雜訊在這裡算
 *
 * 基底那張六十四立方要一秒出頭，放在主執行緒上就是開場卡一秒。
 * 算完的幾份資料用轉移的交回去，不複製（宏觀圖是另開的緩衝區，與天氣圖不共用，轉移才不會互相打架）
 */
workerSelf.onmessage = (event: MessageEvent<CloudNoiseRequest>) => {
  const startTime = performance.now()
  const noiseSet = createCloudNoiseSet(event.data.option, event.data.seed)
  const response: CloudNoiseResponse = {
    noiseSet,
    elapsedMs: performance.now() - startTime,
  }

  workerSelf.postMessage(response, [
    noiseSet.base.data.buffer,
    noiseSet.detail.data.buffer,
    noiseSet.weather.data.buffer,
    noiseSet.cirrus.data.buffer,
    noiseSet.macro.data.buffer,
  ])
}
