<template>
  <div :style="{ opacity: graphParams.opacity }">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../types'
import { computed, inject, ref, toRefs, watch } from 'vue'
import { useAnimatable } from '../../../../../composables/use-animatable'
import { desktopItemInjectionKey } from './type';

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

const pStatus = ref(mainProvider.status.value)
watch(status, (value) => {
  pStatus.value = value
}, { flush: 'post' })

interface GraphParams {
  opacity: number;
}

const targetParams = computed<GraphParams>(() => {
  if (status.value === 'visible') {
    return {
      opacity: 1,
    }
  }
  if (status.value === 'hover') {
    return {
      opacity: 0.4,
    }
  }

  return {
    opacity: 0,
  }
})

const delayMap: Partial<Record<
  `${ComponentStatus}-${ComponentStatus}`,
  Partial<Record<keyof GraphParams, number>>
>> = {
  'hidden-visible': {
    opacity: props.duration * 2.5,
  },
}

const { data: graphParams } = useAnimatable(
  { opacity: 0 },
  targetParams,
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
