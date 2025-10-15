<template>
  <div
    :style="{ opacity: graphParams.opacity }"
    class="content"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { ComponentStatus } from '../../types'
import { computed } from 'vue'
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
    opacity: props.duration * 2,
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
      opacity: 1,
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
.content
  backdrop-filter: blur(2px)
  background: rgba(#888, 0.05)
  text-shadow: 0 0 4px white, 0 0 2px white
</style>
