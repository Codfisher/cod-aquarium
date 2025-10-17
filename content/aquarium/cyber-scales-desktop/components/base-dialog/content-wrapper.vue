<template>
  <div :style="{ opacity: graphParams.opacity }">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../types'
import { computed, inject } from 'vue'
import { useAnimatable } from '../../../../../web/composables/use-animatable'
import { baseDialogInjectionKey } from './type'

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 260,
})

const dialogProvider = inject(baseDialogInjectionKey)
if (!dialogProvider) {
  throw new Error('dialogProvider is not provided')
}
const { status } = dialogProvider

interface GraphParams {
  opacity: number;
}

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    opacity: props.duration * 3,
  },
}

const { data: graphParams } = useAnimatable(
  computed(() => {
    if (status.value === 'hidden') {
      return {
        opacity: 0,
      }
    }

    if (status.value === 'active') {
      return {
        opacity: [0.3, 1] as const,
      }
    }

    return {
      opacity: 0.98,
    }
  }),
  {
    delay: (fieldKey) => delayMap[status.value]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'outBounce',
  },
)
</script>

<style scoped lang="sass">
</style>
