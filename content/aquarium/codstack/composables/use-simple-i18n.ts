import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

type Messages<
  Lang extends string,
> = Record<Lang, Record<string, string | string[]>>

/** whyframe 中無法使用原本的 vue-i18n
 *
 * 只好自己做一個簡易版
 */
function _useSimpleI18n<
  Lang extends string,
  Msg extends Messages<Lang>,
>(
  messages: Msg,
  defaultLang: Lang,
) {
  const currentLocale = ref(defaultLang) as Ref<Lang>

  // 切換語言的函式
  function setLocale(lang: Lang) {
    currentLocale.value = lang
  }

  // 核心功能：根據路徑 (keypath) 抓取資料
  // 支援 'intro' (回傳陣列) 或 'intro.0' (回傳字串)
  function getMessage(keypath: string) {
    const localeData = messages[currentLocale.value]

    // 簡單的路徑解析 (split by dot)
    const keys = keypath.split('.')
    let result: any = localeData

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key as keyof typeof result]
      }
      else {
        return keypath // 找不到就回傳 key 本身，方便除錯
      }
    }
    return result
  }

  // 模擬 t()：取得字串並替換變數
  // 例如: t('hello', { name: 'World' }) -> "Hello World"
  function t(keypath: string, params?: Record<string, string>) {
    let text = getMessage(keypath)

    if (typeof text !== 'string')
      return text

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        text = text.replace(new RegExp(`{${key}}`, 'g'), value)
      })
    }
    return text
  }

  // 模擬 tm()：取得結構 (陣列或物件)
  function tm(keypath: string) {
    const result = getMessage(keypath)
    return Array.isArray(result) ? result : []
  }

  return {
    locale: currentLocale,
    setLocale,
    t,
    tm,
  }
}

export const useSimpleI18n = createSharedComposable(_useSimpleI18n)
