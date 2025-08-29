import type { InjectionKey, Ref } from 'vue'

export const windowInjectionKey = Symbol('window') as InjectionKey<{
  title: Ref<string>;
}>
