import type { MaybeRefOrGetter } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { toValue } from 'vue'

type GtagFn = (command: 'event', eventName: string, params: Record<string, unknown>) => void

interface HostWindow extends Window {
  gtag?: GtagFn;
}

/** 太短的關鍵字多半是還沒打完，記下來也看不出想找什麼 */
const MIN_KEYWORD_LENGTH = 2
/** 過長多半是整段貼上的句子，對建檔沒有指導價值 */
const MAX_KEYWORD_LENGTH = 30
/** 等使用者停手再記，避免逐字記下打字過程 */
const DEBOUNCE_MS = 1500

export interface MissingKeywordReportOptions {
  keyword: MaybeRefOrGetter<string>;
  /** 只計搜尋結果，不含情緒與收藏等篩選，否則會把「篩掉了」誤記成「沒有這張圖」 */
  resultCount: MaybeRefOrGetter<number>;
  /** 資料尚未載完時的空結果不算數 */
  loaded: MaybeRefOrGetter<boolean>;
}

/**
 * 搜尋 0 結果時送出 GA4 自訂事件。
 *
 * 使用者找不到的關鍵字就是最該補的圖，彙整後即為建檔清單。
 * 應用跑在 whyframe 的 iframe 內，gtag 掛在宿主頁面，故取 window.parent。
 */
export function useMissingKeywordReport(options: MissingKeywordReportOptions) {
  const { keyword, resultCount, loaded } = options

  /** 同一次瀏覽重複輸入同一個詞只記一次 */
  const reportedSet = new Set<string>()

  function getHostWindow(): HostWindow | undefined {
    if (typeof window === 'undefined')
      return undefined

    try {
      return (window.parent ?? window) as HostWindow
    }
    catch {
      // 跨網域嵌入時存取 parent 會被擋，放棄記錄即可
      return undefined
    }
  }

  function report(value: string) {
    const host = getHostWindow()
    if (typeof host?.gtag !== 'function')
      return

    host.gtag('event', 'meme_not_found', { keyword: value })
  }

  watchDebounced(
    () => [toValue(keyword), toValue(resultCount), toValue(loaded)] as const,
    ([value, count, isLoaded]) => {
      if (!isLoaded || count > 0)
        return

      const trimmed = value.trim()
      if (trimmed.length < MIN_KEYWORD_LENGTH || trimmed.length > MAX_KEYWORD_LENGTH)
        return
      if (reportedSet.has(trimmed))
        return

      reportedSet.add(trimmed)
      report(trimmed)
    },
    { debounce: DEBOUNCE_MS },
  )
}
