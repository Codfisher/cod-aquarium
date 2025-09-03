import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ComponentStatus } from '../../types'

export const baseWindowInjectionKey = Symbol('base-window') as InjectionKey<{
  title: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;
}>
