import type { EaseStringParamNames } from 'animejs'
import type { MaybeRefOrGetter } from 'vue'
import { createAnimatable } from 'animejs'
import { clone, entries, isFunction, pipe, when } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

type DataObject = Record<string, number>
type EaseString = EaseStringParamNames | (string & {})

interface UseAnimatableParams<Data extends DataObject> {
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
  ease?: EaseString | ((fieldKey: keyof Data) => EaseString | undefined);
  /** @default */
  immediate?: boolean;

  /** 會自動縮短 Duration，讓總時間（Duration + Delay）等於原本的 Duration
   * @default false
   */
  adjustDurationByDelay?: boolean;
}

export function useAnimatable<
  Data extends DataObject,
>(
  initData: Data,
  targetData: MaybeRefOrGetter<Data>,
  params: UseAnimatableParams<Data> = {},
) {
  const {
    delay = 0,
    duration = 500,
    ease,
    adjustDurationByDelay = false,
    immediate = true,
  } = params

  const data = reactive(clone(initData))

  const dataAnimatable = createAnimatable(data, clone(initData))

  watch(targetData, () => {
    const delayList: ReturnType<typeof setTimeout>[] = []

    entries(toValue(targetData)).forEach(([fieldKey, value]) => {
      const delayValue = pipe(
        delay,
        when(
          // 不知道為甚麼直接給 isFunction 型別推導會只剩 StrictFunction
          (value) => isFunction(value),
          (fcn) => fcn(fieldKey),
        ),
      )

      const durationValue = pipe(
        duration,
        when(
          (value) => isFunction(value),
          (fcn) => fcn(fieldKey),
        ),
        when(
          () => adjustDurationByDelay,
          (value) => value - delayValue,
        ),
      )

      const easeValue = pipe(undefined, () => {
        if (!ease) {
          return undefined
        }

        return typeof ease === 'function'
          ? ease(fieldKey)
          : ease
      })

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
    data,
    dataAnimatable,
  }
}
