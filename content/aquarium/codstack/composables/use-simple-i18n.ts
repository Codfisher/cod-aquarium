import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

/**
 * 黑魔法：將聯合型別轉為交集型別
 * { a: string } | { b: string } => { a: string } & { b: string }
 * 用來檢測型別衝突 (string & string[] = never)
 */
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

/**
 * 寬鬆化：還原 as const 的型別
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : T

/**
 * 修正後的 Key 提取器：
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
function _useSimpleI18n<
  Messages extends Record<string, MessageSchema>,
  Lang extends keyof Messages = keyof Messages,
  Data = Messages[Lang],
>(
  messages: Messages & StrictCheck<Messages>,
) {
  const currentLocale = ref(Object.keys(messages)[0]) as Ref<Lang>

  function setLocale(lang: Lang) {
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

export const useSimpleI18n = createSharedComposable(_useSimpleI18n)
