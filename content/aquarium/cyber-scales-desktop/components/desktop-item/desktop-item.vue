<template>
  <div
    ref="itemRef"
    class="base-window relative w-[200px] h-[200px]"
  >
    <bg
      :status="status"
      class="z-[-1]"
    />
    <content-wrapper
      :status="status"
      class="z-0 absolute inset-0 "
    >
      <slot />
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, provide, ref, useTemplateRef } from 'vue'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import { desktopItemInjectionKey } from './type'

interface Props {
  label?: string;
}

interface Emits {
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

const itemRef = useTemplateRef('itemRef')

const status = ref(ComponentStatus.HIDDEN)
onMounted(async () => {
  await nextTick()
  status.value = ComponentStatus.VISIBLE
})

interface Expose { }
defineExpose<Expose>({})

provide(desktopItemInjectionKey, {
  label: computed(() => props.label),
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
</style>
