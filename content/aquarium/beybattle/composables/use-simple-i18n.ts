import type { UnionToIntersection } from 'type-fest'
import type { Ref } from 'vue'
import { createSharedComposable, usePreferredLanguages } from '@vueuse/core'
import { ref, watch } from 'vue'

type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? string[]
    : T

type KeysOfUnion<T> = T extends unknown ? keyof T : never
type KeyUniverse<Messages> = KeysOfUnion<Messages[keyof Messages]>

type CommonType<T, K extends keyof unknown> = UnionToIntersection<
  {
    [L in keyof T]: K extends keyof T[L] ? Widen<T[L][K]> : never
  }[keyof T]
>

type StrictCheck<Messages> = {
  [L in keyof Messages]: {
    [K in KeyUniverse<Messages>]: CommonType<Messages, K>
  }
}

type MessageSchema = Record<string, string | string[]>

export function useSimpleI18n<
  Messages extends Record<DefaultLang, MessageSchema>,
  DefaultLang extends 'zh-hant' | 'en',
  Data = Messages[DefaultLang],
>(
  messages: Messages & StrictCheck<Messages>,
  options?: {
    defaultLocale?: DefaultLang;
  },
) {
  const currentLocale = ref(options?.defaultLocale ?? Object.keys(messages)[0]) as Ref<DefaultLang>

  const languageList = usePreferredLanguages()

  watch(languageList, ([language]) => {
    currentLocale.value = (language?.includes('zh') ? 'zh-hant' : 'en') as DefaultLang
  }, {
    immediate: true,
  })

  function setLocale(language: DefaultLang) {
    currentLocale.value = language
  }

  function getMessage<Key extends keyof Data>(key: Key): Data[Key] {
    const localeData = messages[currentLocale.value] as unknown as Data
    return (localeData?.[key] ?? 'NOT_FOUND') as Data[Key]
  }

  function t<Key extends keyof Data>(
    key: Key,
    params?: Record<string, string | number>,
  ): Data[Key] extends string[] ? string[] : string {
    const value = getMessage(key) as string

    if (Array.isArray(value)) {
      // @ts-expect-error type coercion
      return value
    }

    if (typeof value === 'string' && params) {
      let text = value
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v))
      })
      // @ts-expect-error type coercion
      return text
    }

    return value as Data[Key] extends string[] ? string[] : string
  }

  return {
    locale: currentLocale,
    setLocale,
    t,
  }
}
