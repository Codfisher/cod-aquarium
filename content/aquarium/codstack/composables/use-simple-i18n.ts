import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

// 定義資料結構的約束：值只能是字串或字串陣列
type MessageSchema = Record<string, string | string[]>

/** whyframe 中無法使用原本的 vue-i18n
 *
 * 只好自己做一個簡易版
 */
function _useSimpleI18n<
  // 1. 讓 TypeScript 自動推斷 Messages 的具體結構，而不是只有寬鬆的 Record
  Messages extends Record<string, MessageSchema>,
  // 2. 自動提取語言 Key (如 'en' | 'zh-hant')
  Lang extends keyof Messages = keyof Messages,
  // 3. 自動提取內容結構 (假設所有語言結構相同，取其一)
  Data = Messages[Lang],
>(
  messages: Messages,
) {
  // 強制轉型 Lang 確保型別安全
  const currentLocale = ref(Object.keys(messages)[0]) as Ref<Lang>

  function setLocale(lang: Lang) {
    currentLocale.value = lang
  }

  // 4. 這裡是最關鍵的修改！
  // <K extends keyof Data> 捕獲具體的 Key
  // 回傳型別 Data[K] 會自動對應到該 Key 的值型別 (string 或 string[])
  function getMessage<K extends keyof Data>(key: K): Data[K] {
    const localeData = messages[currentLocale.value] as unknown as Data
    // 如果找不到，為了型別安全通常需要欺騙一下 TS，或是在 Data 定義時就允許 undefined
    return (localeData?.[key] ?? 'NOT_FOUND') as Data[K]
  }

  /**
   * 實作參數替換與型別推導
   * 如果 key 對應的是 string[]，params 會被忽略 (或你可以實作針對陣列的替換)
   */
  function t<K extends keyof Data>(
    key: K,
    params?: Record<string, string | number>,
  ): Data[K] extends string[] ? string[] : string {
    const value = getMessage(key) as any

    // 如果拿到的是陣列，直接回傳 (不做替換)
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
