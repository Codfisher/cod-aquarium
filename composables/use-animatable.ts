import type { AnimatableParams, EaseStringParamNames } from 'animejs'
import type { MaybeRefOrGetter } from 'vue'
import { createAnimatable } from 'animejs'
import { clone, entries, pipe, when } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

type DataObject = Record<string, number>
type EaseString = EaseStringParamNames | (string & {})

interface UseAnimatableParams<Data extends DataObject> {
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
  ease?: EaseString | ((fieldKey: keyof Data) => EaseString | undefined);

  /** @default false */
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
  } = params

  const data = reactive(clone(initData))

  const dataAnimatable = createAnimatable(data, clone(initData))

  watch(targetData, () => {
    const delayList: ReturnType<typeof setTimeout>[] = []

    entries(toValue(targetData)).forEach(([fieldKey, value]) => {
      const delayValue = typeof delay === 'function'
        ? delay(fieldKey)
        : delay

      const durationValue = pipe(
        typeof duration === 'function'
          ? duration(fieldKey)
          : duration,
        when(() => adjustDurationByDelay, (value) => value - delayValue),
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
  }, { deep: true })

  return {
    data,
    dataAnimatable,
  }
}
