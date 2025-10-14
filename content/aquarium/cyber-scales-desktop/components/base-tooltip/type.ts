import type { ComputedRef, EmitFn, InjectionKey } from 'vue'
import type { ComponentStatus } from '../../types'

export const baseTooltipInjectionKey = Symbol('base-window') as InjectionKey<{
  status: ComputedRef<ComponentStatus>;
}>
