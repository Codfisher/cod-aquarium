<template>
  <div :style="{ opacity: graphParams.opacity }">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ComponentStatus } from '../../types'
import { computed, inject, ref, toRefs, watch } from 'vue'
import { useAnimatable } from '../../../../../composables/use-animatable'
import { desktopItemInjectionKey } from './type'
import { usePrevious } from '@vueuse/core';

interface Props {
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  duration: 300,
})

const mainProvider = inject(desktopItemInjectionKey)
if (!mainProvider) {
  throw new Error('mainProvider is not provided')
}
const { status } = mainProvider
const pStatus = usePrevious(status, ComponentStatus.HIDDEN)

interface GraphParams {
  opacity: number;
}


const delayMap: Partial<Record<
  `${ComponentStatus}-${ComponentStatus}`,
  Partial<Record<keyof GraphParams, number>>
>> = {
  'hidden-visible': {
    opacity: props.duration * 2.5,
  },
}

const { data: graphParams } = useAnimatable(
  (): GraphParams => {
    if (status.value === 'hidden') {
      return {
        opacity: 0,
      }
    }

    return {
      opacity: 1,
    }
  },
  {
    delay: (fieldKey) => {
      const key = `${pStatus.value}-${status.value}` as const
      return delayMap[key]?.[fieldKey] ?? 0
    },
    duration: props.duration,
    ease: 'outBounce',
  },
)
</script>

<style scoped lang="sass">
</style>
