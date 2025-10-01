import type { EaseStringParamNames } from 'animejs'
import type { MaybeRefOrGetter } from 'vue'
import { createAnimatable } from 'animejs'
import { clone } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

export type DataObject<T extends object> = { [K in keyof T]: number }
export type EaseString = EaseStringParamNames | (string & {})

interface UseAnimatableParams<Data extends object> {
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
  ease?: EaseString | ((fieldKey: keyof Data) => EaseString | undefined);
  /** @default */
  immediate?: boolean;

  /** 會自動縮短 Duration，讓總時間（Duration + Delay）等於原本的 Duration
   * @default false
   */
  adjustDurationByDelay?: boolean;

  /** 動畫觸發來源。
   *
   * 因為 targetData 變更一定是動畫，有可能是資料初始化（從 0 變成有數值），所以預設會馬上觸發動畫。
   *
   * 這樣會導致初始動畫不符合預期，所以可以指定
   */
}

export function useAnimatable<Data extends object>(
  targetData: MaybeRefOrGetter<DataObject<Data>>,
  params: UseAnimatableParams<DataObject<Data>> = {},
) {
  const {
    delay = 0,
    duration = 500,
    ease,
    adjustDurationByDelay = false,
    immediate = true,
  } = params

  const data = reactive(clone(toValue(targetData)))

  const dataAnimatable = createAnimatable(
    data,
    // @ts-expect-error reactive 也可以當一般物件傳遞
    clone(data),
  )

  watch(targetData, () => {
    const delayList: ReturnType<typeof setTimeout>[] = []

    const current = toValue(targetData);
    (Object.keys(current) as Array<keyof DataObject<Data>>).forEach((fieldKey) => {
      const value = current[fieldKey]

      const delayValue = typeof delay === 'function'
        ? delay(fieldKey)
        : delay

      const durationRaw = typeof duration === 'function'
        ? duration(fieldKey)
        : duration

      const durationValue = adjustDurationByDelay
        ? Math.max(durationRaw - delayValue, 0)
        : durationRaw

      const easeValue = typeof ease === 'function'
        ? ease(fieldKey)
        : ease

      delayList.push(setTimeout(() => {
        dataAnimatable?.[fieldKey]?.(value, durationValue, easeValue)
      }, delayValue))
    })

    onWatcherCleanup(() => {
      delayList.forEach(clearTimeout)
    })
  }, {
    deep: true,
    immediate,
  })

  return {
    /** Reactive Data */
    data,
    dataAnimatable,
  }
}
