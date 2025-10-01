import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { ComponentStatus } from '../../types'
import { createEventHook } from '@vueuse/core';

export const baseWindowInjectionKey = Symbol('base-window') as InjectionKey<{
  title: ComputedRef<string>;
  status: ComputedRef<ComponentStatus>;

  dragHook: ReturnType<typeof createEventHook<Record<'offsetX' | 'offsetY', number>>>
}>
