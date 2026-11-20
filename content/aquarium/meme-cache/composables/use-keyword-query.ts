import { watchDebounced } from '@vueuse/core'
import { onNuxtReady } from 'nuxt/app'
import { ref } from 'vue'

export interface KeywordQueryOptions {
  /** query string 參數名稱 */
  queryKey?: string;
  /** 寫回 URL 的 debounce 毫秒數 */
  debounceMs?: number;
}

/**
 * 將關鍵字與外層頁面的 URL query string 雙向同步，方便分享網址。
 * 早期 app 包在 whyframe 的 iframe 內才需要 window.parent，現在直接渲染，window.parent 就是 window 本身。
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

  /** 等 Nuxt 完成 hydration 才讀網址：預先渲染頁帶 query 開啟時，Nuxt 會暫時把網址換成不含 query 的版本，
   * 掛載當下讀到的 location.search 是空的
   */
  onNuxtReady(() => {
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
