<template>
  <div
    ref="itemRef"
    class="desktop-item relative m-2 p-1"
  >
    <bg
      :status="status"
      class="z-[-1]"
    />
    <content-wrapper
      :status="status"
      class="z-0  "
    >
      <material-icon
        :name="props.icon"
        size="4rem"
        weight="100"
        grade="-25"
        opsz="20"
      />
      <slot />

      <div class=" overflow-hidden text-center">
        {{ labelDecoder.text }}
      </div>
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computedAsync, promiseTimeout, useElementHover, useMounted, whenever } from '@vueuse/core'
import { computed, nextTick, provide, useTemplateRef, watch } from 'vue'
import { useDecodingText } from '../../../../../composables/use-decoding-text'
import { ComponentStatus } from '../../types'
import MaterialIcon from '../material-icon.vue'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { desktopItemInjectionKey } from './type'

interface Props {
  label?: string;
  icon?: string;
  delay?: number;
}

interface Emits {
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  delay: 0,
})

const emit = defineEmits<Emits>()

defineSlots<Slots>()

const itemRef = useTemplateRef('itemRef')
const isMounted = useMounted()
const isHover = useElementHover(itemRef)
const isVisible = computedAsync(async () => {
  await promiseTimeout(props.delay)
  await nextTick()
  return isMounted.value
}, false)

const labelDecoder = useDecodingText(props.label)

const status = computed(() => {
  if (isVisible.value) {
    if (isHover.value) {
      return ComponentStatus.HOVER
    }

    return ComponentStatus.VISIBLE
  }

  return ComponentStatus.HIDDEN
})
watch(status, (value) => {
  console.log(`🚀 ~ status:`, value, props.delay)
})

whenever(isVisible, async () => {
  await promiseTimeout(500)
  labelDecoder.start()
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
