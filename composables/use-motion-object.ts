import type { EaseStringParamNames } from 'animejs'
import type { MotionValue } from 'motion-v'
import type { MaybeRefOrGetter } from 'vue'
import { createAnimatable } from 'animejs'
import { useMotionValue } from 'motion-v'
import { clone, entries, isFunction, mapValues, pipe, when } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

type DataObject = Record<string, number | string>
type EaseString = EaseStringParamNames | (string & {})

interface UseAnimatableParams<Data extends DataObject> {
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
  ease?: EaseString | ((fieldKey: keyof Data) => EaseString | undefined);
  /** @default */
  immediate?: boolean;
}

/** 需搭配 motion 元件使用 */
export function useMotionObject<
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
    immediate = true,
  } = params

  const data = mapValues(
    clone(initData),
    (value) => useMotionValue(value),
  ) as unknown as Record<string, MotionValue<number | string>>

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
        data[fieldKey].set(value)
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
  }
}
