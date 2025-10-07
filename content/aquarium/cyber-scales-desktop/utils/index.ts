import type { Ref } from 'vue'
import type { ComponentStatus } from '../types'
import { usePrevious } from '@vueuse/core'
import { pipe } from 'remeda'

/** 定義 ComponentStatus 狀態與動畫參數映射數值 */
export type StatusTransitionParamsMap<
  Data extends object,
  Value,
> = Partial<Record<
  `${ComponentStatus}-${ComponentStatus}` | `${ComponentStatus}`,
  Partial<Record<keyof Data, Value>> | Value
>>

/** 解析狀態轉換與屬性對應數值
 *
 * 例如：delayMap = { visible: 100, 'hidden-visible': 200 }
 */
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  data: {
    status: ComponentStatus;
    pStatus: ComponentStatus;
    fieldKey: keyof Data;
  },
  transitionMap: StatusTransitionParamsMap<Data, Value>,
): Value | undefined
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  data: {
    status: ComponentStatus;
    pStatus: ComponentStatus;
    fieldKey: keyof Data;
    defaultValue: NonNullable<Value>;
  },
  transitionMap: StatusTransitionParamsMap<Data, Value>,
): Value
export function resolveTransitionParamValue<
  Data extends object,
  Value extends string | number | undefined,
>(
  data: {
    status: ComponentStatus;
    pStatus: ComponentStatus;
    fieldKey: keyof Data;
    defaultValue?: Value;
  },
  transitionMap: StatusTransitionParamsMap<Data, Value>,
): Value | undefined {
  const { status, pStatus, fieldKey, defaultValue } = data

  if (!transitionMap || !fieldKey) {
    return defaultValue
  }

  const key = `${pStatus}-${status}` as const
  const statusKey = key in transitionMap ? key : status

  const value = transitionMap[statusKey]
  if (!value) {
    return defaultValue
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return value ?? defaultValue
  }

  return value[fieldKey] ?? defaultValue
}

export function downloadAsFile(
  content: string,
  filename: string,
  options?: BlobPropertyBag,
) {
  const blob = new Blob([content], options)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
