import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

/** whyframe 中無法使用原本的 vue-i18n
 *
 * 只好自己做一個簡易版
 */
function _useSimpleI18n<
  Lang extends string,
  Data extends Record<string, string | string[]>,
>(
  messages: Record<Lang, Data>,
) {
  const currentLocale = ref(Object.keys(messages)[0]) as Ref<Lang>

  // 切換語言的函式
  function setLocale(lang: Lang) {
    currentLocale.value = lang
  }

  function getMessage(key: keyof Data) {
    return messages[currentLocale.value][key]
  }

  // TODO: 實作參數替換功能
  function t(
    key: keyof Data,
    // params?: Record<string, string>,
  ) {
    return getMessage(key)
  }

  return {
    locale: currentLocale,
    setLocale,
    t,
  }
}

export const useSimpleI18n = createSharedComposable(_useSimpleI18n)
