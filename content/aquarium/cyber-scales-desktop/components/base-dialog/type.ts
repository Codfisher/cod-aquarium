import type { ComputedRef, EmitFn, InjectionKey } from 'vue'
import type { ComponentStatus } from '../../types'

export interface BaseDialogEmits {
  backdrop: [];
  close: [];
}

export type DialogColorType = 'positive' | 'negative'

export const baseDialogInjectionKey = Symbol('base-dialog') as InjectionKey<{
  status: ComputedRef<ComponentStatus>;
  colorType: DialogColorType;

  emit: EmitFn<BaseDialogEmits>;
}>
