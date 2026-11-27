import type { IssueLogPayload } from './use-error-logger'

/** 與 site/plugins/vite-minespace-issue-log.ts 的事件名一致 */
const EVENT_NAME = 'minespace:issue-log'

/**
 * 把問題紀錄經 Vite 的 HMR 通道送給 dev server，由那邊寫進檔案
 *
 * 這支只能在主執行緒載入，所以獨立成一個檔案、由 useErrorLogger 動態載入：
 * 用到 import.meta.hot 的模組會被 Vite 注入 HMR 客戶端，
 * 而 use-error-logger 本身渲染端的 worker 也會載入，不能讓 worker 跟著拉進那一套
 */
export function sendIssueLog(payload: IssueLogPayload): void {
  import.meta.hot?.send(EVENT_NAME, payload)
}
