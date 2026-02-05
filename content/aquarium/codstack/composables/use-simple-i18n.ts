import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

type MessageSchema = Record<string, string | string[]>

/** whyframe 中無法使用原本的 vue-i18n
 *
 * 只好自己做一個簡易版
 */
function _useSimpleI18n<
  Messages extends Record<string, MessageSchema>,
  Lang extends keyof Messages = keyof Messages,
  Data = Messages[Lang],
>(
  messages: Messages,
) {
  const currentLocale = ref(Object.keys(messages)[0]) as Ref<Lang>

  function setLocale(lang: Lang) {
    currentLocale.value = lang
  }

  function getMessage<K extends keyof Data>(key: K): Data[K] {
    const localeData = messages[currentLocale.value] as unknown as Data
    return (localeData?.[key] ?? 'NOT_FOUND') as Data[K]
  }

  function t<K extends keyof Data>(
    key: K,
    params?: Record<string, string | number>,
  ): Data[K] extends string[] ? string[] : string {
    const value = getMessage(key) as any

    if (Array.isArray(value)) {
      // @ts-expect-error 強制轉換
      return value
    }

    // 如果是字串，且有參數，進行替換
    if (typeof value === 'string' && params) {
      let text = value
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
      })
      // @ts-expect-error 強制轉換
      return text
    }

    return value
  }

  return {
    locale: currentLocale,
    setLocale,
    t,
  }
}

export const useSimpleI18n = createSharedComposable(_useSimpleI18n)
