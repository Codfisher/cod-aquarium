import type { ComputedRef, EmitFn, InjectionKey } from 'vue'
import type { ComponentStatus } from '../../types'

export interface BaseDialogEmits {
  close: [];
}

export const baseDialogInjectionKey = Symbol('base-dialog') as InjectionKey<{
  title: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;

  emit: EmitFn<BaseDialogEmits>;
}>
