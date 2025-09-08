import type { Ref } from 'vue'
import { usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'
import { ComponentStatus } from '../types'

/** 定義 ComponentStatus 狀態與動畫參數映射數值 */
export type StatusParamsMap<
  Data extends object,
  Value,
> = Partial<Record<
  `${ComponentStatus}-${ComponentStatus}` | `${ComponentStatus}`,
  Partial<Record<keyof Data, Value>> | Value
>>

export function getStatusParamsValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  status: Ref<ComponentStatus>,
  map: StatusParamsMap<Data, Value>,
) {
  const pStatus = usePrevious(status, ComponentStatus.HIDDEN)

  return (fieldKey: keyof Data): Value | undefined => {
    if (!map || !fieldKey) {
      return
    }

    const key = `${pStatus.value}-${status.value}` as const
    const statusKey = key in map ? key : status.value

    const value = map[statusKey]
    if (!value) {
      return
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value
    }

    return value[fieldKey]
  }
}
