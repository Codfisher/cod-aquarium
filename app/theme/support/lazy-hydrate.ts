import type { Component } from 'vue'
import { defineAsyncComponent, hydrateOnIdle } from 'vue'

/** 閒置時才 hydration 的最長等待時間（毫秒），超過就直接 hydration，避免互動元件太晚可用 */
const IDLE_TIMEOUT = 2000

/** 定義閒置時才 hydration 的元件：SSR 照常輸出完整 HTML，client 端等主執行緒閒置才下載並 hydration。
 *
 * 版面原本在同一個任務裡一次 hydration 完，是一整段超過 50ms 的長任務（計入 TBT）；
 * 拆成數個各自在閒置時進行的小任務，總工作量不變，但每段都短於 50ms，不再阻塞輸入。
 * 只用在首屏不需立即互動、或互動前已有原生行為可用的元件（例如一般連結）
 */
export function defineIdleHydrated<T extends Component>(loader: () => Promise<T | { default: T }>) {
  return defineAsyncComponent({
    loader,
    hydrate: hydrateOnIdle(IDLE_TIMEOUT),
  })
}
