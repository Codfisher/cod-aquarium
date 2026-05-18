import { customRef } from 'vue'

export function useDebouncedRef<T>(initialValue: T, delayMs = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null

  return customRef<T>((track, trigger) => {
    let value = initialValue

    return {
      get() {
        track()
        return value
      },
      set(newValue) {
        if (timer !== null) {
          clearTimeout(timer)
        }
        timer = setTimeout(() => {
          value = newValue
          trigger()
          timer = null
        }, delayMs)
      },
    }
  })
}
