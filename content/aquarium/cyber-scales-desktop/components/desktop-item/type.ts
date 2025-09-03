import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ComponentStatus } from '../../types'

export const desktopItemInjectionKey = Symbol('desktop-item') as InjectionKey<{
  label: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;
}>
