<template>
  <div :style="{ opacity: graphParams.opacity }">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../types'
import { useAnimate, useElementSize } from '@vueuse/core'
import { computed, reactive, useTemplateRef } from 'vue'
import { useAnimatable } from '../../../../../composables/use-animatable'

interface Props {
  status?: `${ComponentStatus}`;
  duration?: number;
}
const props = withDefaults(defineProps<Props>(), {
  status: 'hidden',
  duration: 260,
})

interface GraphParams {
  opacity: number;
}

const targetParams = computed<GraphParams>(() => {
  if (props.status === 'visible') {
    return {
      opacity: 1,
    }
  }

  return {
    opacity: 0,
  }
})

const delayMap: Partial<Record<
  ComponentStatus,
  Partial<Record<keyof GraphParams, number>>
>> = {
  visible: {
    opacity: props.duration * 3,
  },
}

const { data: graphParams } = useAnimatable(
  { opacity: 0 },
  targetParams,
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'outBounce',
  },
)
</script>

<style scoped lang="sass">
</style>
