import type { UnionToIntersection } from 'type-fest'
import type { Ref } from 'vue'
import { createSharedComposable, usePreferredLanguages } from '@vueuse/core'
import { ref, watch } from 'vue'

/**
 * 寬鬆化：還原 as const 的型別
 *
 * 如果不做 Widen，'哈囉' & 'Hello' 也會變成 never。加上 Widen 後，它會先變成 string & string，這樣就只檢查「型別」而不檢查「內容」
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : T

/**
 * Key 提取器：
 * 1. Messages[keyof Messages] 會拿到所有語系的 Value 的聯合型別 (例如 {a:1} | {b:2})
 * 2. KeysOfUnion 會把這個聯合型別拆開，分別取 keyof，再組回來
 * 結果：'a' | 'b'
 */
type KeysOfUnion<T> = T extends any ? keyof T : never
type KeyUniverse<Messages> = KeysOfUnion<Messages[keyof Messages]>

/**
 * 取得所有語系中某個 Key 的「共同型別」
 */
type CommonType<T, K extends keyof any> = UnionToIntersection<
  {
    [L in keyof T]: K extends keyof T[L] ? Widen<T[L][K]> : never
  }[keyof T]
>

/**
 * 嚴格檢查器：
 * 每一種語言 (L) 的 每一個潛在 Key (K)，都必須符合共同型別 (CommonType)
 */
type StrictCheck<Messages> = {
  [L in keyof Messages]: {
    [K in KeyUniverse<Messages>]: CommonType<Messages, K>
  }
}

type MessageSchema = Record<string, string | string[]>

/** whyframe 中無法使用原本的 vue-i18n
 *
 * 只好自己做一個簡易版
 */
export function useSimpleI18n<
  Messages extends Record<DefaultLang, MessageSchema>,
  DefaultLang extends 'zh-hant' | 'en',
  Data = Messages[DefaultLang],
>(
  messages: Messages & StrictCheck<Messages>,
  options?: {
    defaultLocale?: DefaultLang;
    autoDetect?: boolean;
  },
) {
  const currentLocale = ref(options?.defaultLocale ?? Object.keys(messages)[0]) as Ref<DefaultLang>

  function setLocale(lang: DefaultLang) {
    currentLocale.value = lang
  }

  function getMessage<Key extends keyof Data>(key: Key): Data[Key] {
    const localeData = messages[currentLocale.value] as unknown as Data
    return (localeData?.[key] ?? 'NOT_FOUND') as Data[Key]
  }

  function t<Key extends keyof Data>(
    key: Key,
    params?: Record<string, string | number>,
  ): Data[Key] extends string[] ? string[] : string {
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
