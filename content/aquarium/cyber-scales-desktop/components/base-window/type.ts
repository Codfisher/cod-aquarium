import type { ComputedRef, EmitFn, InjectionKey } from 'vue'
import type { ComponentStatus } from '../../types'

export interface BaseWindowEmits {
  dragging: [value: Record<'offsetX' | 'offsetY', number>];
  close: [];
}

export const baseWindowInjectionKey = Symbol('base-window') as InjectionKey<{
  title: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;

  emit: EmitFn<BaseWindowEmits>;
}>
