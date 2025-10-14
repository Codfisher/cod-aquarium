import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ComponentStatus, FieldStatus } from '../../types'

export const baseInputInjectionKey = Symbol('base-input') as InjectionKey<{
  status: ComputedRef<ComponentStatus>;
}>
