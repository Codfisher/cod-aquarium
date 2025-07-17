import type { AnimatableParams } from 'animejs'
import type { MaybeRefOrGetter } from 'vue'
import { createAnimatable } from 'animejs'
import { clone, entries, identity, pipe, when } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

type DataObject = Record<string, number>

interface UseAnimatableParams<Data extends DataObject> {
  animatableParams?: AnimatableParams;
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
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
    animatableParams,
    delay = 0,
    duration = 500,
    adjustDurationByDelay = false,
  } = params

  const data = reactive(clone(initData))

  const dataAnimatable = createAnimatable(data, {
    ...clone(initData),
    ...animatableParams,
  })

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

      delayList.push(setTimeout(() => {
        dataAnimatable?.[fieldKey]?.(value, durationValue)
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
