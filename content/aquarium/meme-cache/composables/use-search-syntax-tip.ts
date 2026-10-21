import type { MaybeRefOrGetter } from 'vue'
import { useTimeoutFn } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

/** 一直開著會蓋住列表下緣，瀏覽圖片時很礙事，故只停留一下 */
const DEFAULT_DURATION = 5000

export interface SearchSyntaxTipOptions {
  /** 輸入框是否聚焦 */
  focused: MaybeRefOrGetter<boolean>;
  keyword: MaybeRefOrGetter<string | null | undefined>;
  /** 停留毫秒數 */
  duration?: number;
}

/**
 * 輸入框聚焦且尚未輸入時浮現搜尋語法提示，這時最需要知道有哪些寫法。
 *
 * 開始打字或失焦就收起，停留滿時間也會自動收起。
 * 自動收起後即使仍聚焦也不再浮現，要先失焦、或打字後清空，才會重新浮現。
 */
export function useSearchSyntaxTip(options: SearchSyntaxTipOptions) {
  const { focused, keyword, duration = DEFAULT_DURATION } = options

  const visible = ref(false)

  const { start: startTimer } = useTimeoutFn(() => {
    visible.value = false
  }, duration, { immediate: false })

  watch(
    () => toValue(focused) && !toValue(keyword),
    (shouldShow) => {
      visible.value = shouldShow
      if (shouldShow)
        startTimer()
    },
    { immediate: true },
  )

  return { visible }
}
