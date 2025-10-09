import type { EaseStringParamNames } from 'animejs'
import type { MaybeRefOrGetter } from 'vue'
import { animate } from 'animejs'
import { clone, mapValues, pipe } from 'remeda'
import { onWatcherCleanup, reactive, toValue, watch } from 'vue'

type TargetDataObjectValue<Val> = Val | [Val, Val] | readonly [Val, Val]

export type DataObject<
  T extends object,
> = { [K in keyof T]: T[K] }

/** 若為 [Value, Value]，則第一個數值表示起點 */
export type TargetDataObject<T> = {
  [K in keyof T]: TargetDataObjectValue<T[K]>
}

export type EaseString = EaseStringParamNames | (string & {})

interface UseAnimatableParams<Data extends object> {
  delay?: number | ((fieldKey: keyof Data) => number);
  duration?: number | ((fieldKey: keyof Data) => number);
  ease?: EaseString | ((fieldKey: keyof Data) => EaseString | undefined);
  /** @default */
  immediate?: boolean;

  /** 動畫觸發來源。
   *
   * 因為 targetData 變更不一定是動畫，有可能只是資料初始化（從 0 變成有數值）
   *
   * 預設會馬上觸發動畫，這樣會導致初始動畫不符合預期
   *
   * 可以利用此參數指定觸發條件，例如：status 變更才觸發數值過度，否則會立即更新數值。
   */
  animationTriggerBy?: MaybeRefOrGetter;
}

export function useAnimatable<
  Data extends DataObject<object>,
>(
  targetData: MaybeRefOrGetter<TargetDataObject<Data>>,
  params: UseAnimatableParams<Data> = {},
) {
  const {
    delay = 0,
    duration = 500,
    ease,
    immediate = true,
  } = params

  const data = reactive(pipe(
    toValue(targetData),
    mapValues((value) => {
      if (Array.isArray(value)) {
        return value[1]
      }

      return value
    }),
    (data) => clone(data as Data),
  ))

  let triggerChanged = false
  watch(() => toValue(params.animationTriggerBy), () => {
    triggerChanged = true
  }, {
    deep: true,
    flush: 'sync',
  })

  watch(targetData, () => {
    const hasChanged = params.animationTriggerBy ? triggerChanged : true

    const delayList: ReturnType<typeof animate>[] = []

    const current = toValue(targetData);
    (Object.keys(current) as Array<keyof Data>).forEach((fieldKey) => {
      const value = current[fieldKey]

      const delayValue = pipe(undefined, () => {
        if (!hasChanged) {
          return 0
        }

        return typeof delay === 'function' ? delay(fieldKey) : delay
      })

      const durationValue = pipe(undefined, () => {
        if (!hasChanged) {
          return 0
        }

        return typeof duration === 'function' ? duration(fieldKey) : duration
      })

      const easeValue = typeof ease === 'function'
        ? ease(fieldKey)
        : ease

      const targetValue = pipe(undefined, () => {
        if (Array.isArray(value)) {
          animate(data, {
            [fieldKey]: value[0],
            duration: 0,
          })

          return value[1]
        }

        return value
      })

      delayList.push(animate(data, {
        [fieldKey]: targetValue,
        duration: durationValue,
        delay: delayValue,
        ease: easeValue ?? 'linear',
      }))
    })

    triggerChanged = false

    onWatcherCleanup(() => {
      delayList.forEach((item) => item.cancel())
    })
  }, {
    deep: true,
    immediate,
  })

  return {
    /** Reactive Data */
    data,
  }
}
