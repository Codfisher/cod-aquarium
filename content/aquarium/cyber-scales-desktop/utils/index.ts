import type { ComponentStatus } from '../types'
import { pipe } from 'remeda'

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
  status: ComponentStatus,
  pStatus: ComponentStatus,
  map: StatusParamsMap<Data, Value>,
  fieldKey: keyof Data,
): Value | undefined {
  if (!map || !fieldKey) {
    return
  }

  const key = `${pStatus}-${status}` as const
  const statusKey = key in map ? key : status

  const value = map[statusKey]
  if (!value) {
    return
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  return value[fieldKey]
}
