/**
 * 渲染端叫主執行緒播一個觸發型音源的窗口
 *
 * 音景在主執行緒（worker 裡沒有 AudioContext），而「什麼時候該響」往往只有渲染端知道：
 * 閃電劈下來、遠火山噴了一口、熔岩花濺起來。那些程式散在天氣、各場景的裝飾裡，
 * 一個一個把回呼從 render-runtime 傳進去太繞，所以開一個模組層級的窗口：
 * render-runtime 啟動時把「怎麼送出去」接上（setSoundTriggerSink）、收尾時拔掉，
 * 場景程式要聲音時呼叫 requestSoundTrigger 就好，不必知道訊息怎麼走。
 *
 * 要響的那顆音源照舊種在該場景的音源清單裡（mode 為 trigger）：
 * 音檔、音量、可聽距離、清單上的名稱與開關都在那裡，這裡只負責「現在、在這裡、響一聲」。
 * 聽者離得太遠、音源沒載入時什麼都不會發生
 */

/** 一次觸發 */
export interface SoundTriggerRequest {
  /** 要叫的音源 id（mode 為 trigger 的那一顆） */
  id: string;
  /** 這一次多大聲 0 ～ 1，不給就照音源自己的音量 */
  volume?: number;
  /** 這一次從哪裡響（世界座標），不給就留在音源原本的位置 */
  position?: { x: number; y: number; z: number };
}

export type SoundTriggerSink = (request: SoundTriggerRequest) => void

let currentSink: SoundTriggerSink | null = null

/** 接上送出去的管道，由 render-runtime 在啟動時呼叫 */
export function setSoundTriggerSink(sink: SoundTriggerSink): void {
  currentSink = sink
}

/**
 * 拔掉送出去的管道，由 render-runtime 在收尾時呼叫
 *
 * 只拔自己接的那一條：換畫質重來時新的渲染端可能先接上，舊的才收尾，不能把新的那條一起拔掉
 */
export function clearSoundTriggerSink(sink: SoundTriggerSink): void {
  if (currentSink === sink) {
    currentSink = null
  }
}

/** 叫一個觸發型音源響一聲；管道還沒接上（音景沒啟動、已經收尾）就安靜地略過 */
export function requestSoundTrigger(request: SoundTriggerRequest): void {
  currentSink?.(request)
}
