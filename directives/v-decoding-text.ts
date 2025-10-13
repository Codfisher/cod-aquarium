import { useIntervalFn } from '@vueuse/core'
import { type Directive, effectScope, watch } from 'vue'
import { useDecodingText } from '../composables/use-decoding-text'

interface UseDecodingTextOptions extends NonNullable<
  Parameters<typeof useDecodingText>[1]
> {
  startDelay?: number;
}

export const vDecodingText: Directive<any, UseDecodingTextOptions> = {
  mounted(el, binding) {
    if (!(el instanceof HTMLElement)) {
      return
    }

    const text = el.textContent
    if (!text) {
      return
    }

    const scope = effectScope()
    scope.run(() => {
      const titleDecoder = useDecodingText(text, binding.value)
      const startDelay = binding.value?.startDelay || 0

      watch(titleDecoder.text, (value) => {
        el.textContent = value
      })

      setTimeout(() => titleDecoder.start(), startDelay)

      useIntervalFn(() => {
        // 檢查元素是否還在 DOM 中，否則停止 effect scope
        if (!el.isConnected) {
          scope.stop()
        }
      }, 500)
    })
  },
}
