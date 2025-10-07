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
    if (props.status === 'hidden') {
      return {
        opacity: 0,
      }
    }

    if (props.status === 'active') {
      return {
        opacity: [0.3, 1] as const,
      }
    }

    return {
      opacity: 0.98,
    }
  }),
  {
    delay: (fieldKey) => delayMap[props.status]?.[fieldKey] ?? 0,
    duration: props.duration,
    ease: 'outBounce',
  },
)
</script>

<style scoped lang="sass">
</style>
