import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ComponentStatus, FieldStatus } from '../../types'

export const baseItemInjectionKey = Symbol('base-item') as InjectionKey<{
  label: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;
}>
