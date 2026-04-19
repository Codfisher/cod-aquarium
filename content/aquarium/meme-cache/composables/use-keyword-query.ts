import { watchDebounced } from '@vueuse/core'
import { onMounted, ref } from 'vue'

export interface KeywordQueryOptions {
  /** query string 參數名稱 */
  queryKey?: string;
  /** 寫回 URL 的 debounce 毫秒數 */
  debounceMs?: number;
}

/**
 * 將關鍵字與外層頁面的 URL query string 雙向同步，方便分享網址。
 * whyframe 隔離下透過 window.parent 存取宿主頁面。
 */
export function useKeywordQuery(options: KeywordQueryOptions = {}) {
  const {
    queryKey = 'q',
    debounceMs = 300,
  } = options

  const keyword = ref('')

  function getHostWindow() {
    if (typeof window === 'undefined')
      return null
    return window.parent || window
  }

  onMounted(() => {
    const host = getHostWindow()
    if (!host)
      return
    const initial = new URLSearchParams(host.location.search).get(queryKey)
    if (initial) {
      keyword.value = initial
    }
  })

  watchDebounced(keyword, (value) => {
    const host = getHostWindow()
    if (!host)
      return
    const url = new URL(host.location.href)
    if (value) {
      url.searchParams.set(queryKey, value)
    }
    else {
      url.searchParams.delete(queryKey)
    }
    host.history.replaceState(host.history.state, '', url)
  }, { debounce: debounceMs })

  return keyword
}
