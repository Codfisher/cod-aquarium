<template>
  <div
    ref="itemRef"
    class="base-item cursor-pointer relative p-3 aspect-square flex justify-center items-center"
  >
    <bg />

    <content-wrapper class="z-0  ">
      <material-icon
        :name="props.icon"
        size="4rem"
        weight="100"
        grade="-25"
        opsz="20"
        class="text-white w-[4rem] h-[4rem] icon"
      />

      <slot />

      <div
        ref="labelRef"
        class="item-label text-white text-nowrap font-orbitron text-center"
      >
        <div class=" leading-none text-sm tracking-widest">
          {{ labelDecoder.text }}
        </div>

        <div class="text-xs">
          {{ subLabelDecoder.text }}
        </div>
      </div>
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computedAsync, promiseTimeout, useElementHover, useElementSize, useMounted, useMousePressed, whenever } from '@vueuse/core'
import { computed, nextTick, provide, reactive, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { useDecodingText } from '../../../../../composables/use-decoding-text'
import { ComponentStatus } from '../../types'
import MaterialIcon from '../material-icon.vue'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseItemInjectionKey } from './type'

interface Props {
  label?: string;
  subLabel?: string;
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
  subLabel: '',
  delay: 0,
})

const emit = defineEmits<Emits>()
defineSlots<Slots>()

const itemRef = useTemplateRef('itemRef')
const itemSize = reactive(useElementSize(itemRef))

const isMounted = useMounted()
const isHover = useElementHover(itemRef)
const { pressed: isPressed } = useMousePressed({ target: itemRef })
const isVisible = computedAsync(async () => {
  await promiseTimeout(props.delay)
  await nextTick()
  await nextFrame()

  return isMounted.value
}, false)

const labelRef = useTemplateRef('labelRef')
const labelSize = reactive(useElementSize(labelRef))

const labelDecoder = useDecodingText(props.label)
const subLabelDecoder = useDecodingText(props.subLabel)

const status = computed(() => {
  if (isVisible.value) {
    if (isPressed.value) {
      return ComponentStatus.ACTIVE
    }
    if (isHover.value) {
      return ComponentStatus.HOVER
    }

    return ComponentStatus.VISIBLE
  }

  return ComponentStatus.HIDDEN
})

whenever(isVisible, async () => {
  await promiseTimeout(500)
  labelDecoder.start()
  subLabelDecoder.start()
})
whenever(isHover, async () => {
  labelDecoder.restart()
})

interface Expose { }
defineExpose<Expose>({})

provide(baseItemInjectionKey, {
  label: computed(() => props.label),
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
</style>
