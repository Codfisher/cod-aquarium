import type { Ref } from 'vue'
import type { ComponentStatus } from '../types'
import { usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'

/** 定義 ComponentStatus 狀態與動畫參數映射數值 */
export type StatusParamsMap<
  Data extends object,
  Value,
> = Partial<Record<
  `${ComponentStatus}-${ComponentStatus}` | `${ComponentStatus}`,
  Partial<Record<keyof Data, Value>> | Value
>>

/** 解析狀態轉換與屬性對應數值 */
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  status: ComponentStatus,
  pStatus: ComponentStatus,
  fieldKey: keyof Data,
  map: StatusParamsMap<Data, Value>,
): Value | undefined
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  status: ComponentStatus,
  pStatus: ComponentStatus,
  fieldKey: keyof Data,
  map: StatusParamsMap<Data, Value>,
  defaultValue: NonNullable<Value>,
): Value
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  status: ComponentStatus,
  pStatus: ComponentStatus,
  fieldKey: keyof Data,
  map: StatusParamsMap<Data, Value>,
  defaultValue?: Value,
): Value | undefined {
  if (!map || !fieldKey) {
    return defaultValue
  }

  const key = `${pStatus}-${status}` as const
  const statusKey = key in map ? key : status

  const value = map[statusKey]
  if (!value) {
    return defaultValue
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value ?? defaultValue
  }

  return value[fieldKey] ?? defaultValue
}
