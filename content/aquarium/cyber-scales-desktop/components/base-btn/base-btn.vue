<template>
  <div
    ref="itemRef"
    class="base-btn  relative p-3 flex justify-center items-center"
    :class="itemClass"
    @click="(evt) => emit('click', evt)"
  >
    <bg v-if="!props.flat" />

    <content-wrapper class="z-0  ">
      <div
        ref="labelRef"
        class="item-label  text-nowrap font-orbitron text-center select-none"
      >
        <div
          class=" leading-none text-sm tracking-widest pl-2 pr-1"
          :class="labelClass"
        >
          {{ props.label }}
        </div>
      </div>
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computedAsync, promiseTimeout, useElementHover, useElementSize, useMounted, useMousePressed, whenever } from '@vueuse/core'
import { computed, nextTick, provide, reactive, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import { useDecodingText } from '../../../../../web/composables/use-decoding-text'
import { ComponentStatus, FieldStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseItemInjectionKey } from './type'

interface Props {
  label?: string;
  labelClass?: string;
  subLabel?: string;
  icon?: string;
  delay?: number;
  disabled?: boolean;
  /** 只有文字 */
  flat?: boolean;
}

interface Emits {
  click: [evt: MouseEvent];
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  subLabel: '',
  delay: 0,
  flat: false,
})

const emit = defineEmits<Emits>()
defineSlots<Slots>()

const itemRef = useTemplateRef('itemRef')

const itemClass = computed(() => ({
  'cursor-pointer': !props.disabled,
  'cursor-not-allowed': props.disabled,
}))

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
const labelClass = computed(() => {
  const result = [
    props.labelClass ?? '',
  ]

  if (!props.labelClass) {
    result.push(props.flat ? 'text-[#444]' : 'text-white')
  }

  return result
})

const labelDecoder = useDecodingText(props.label)
const subLabelDecoder = useDecodingText(props.subLabel)

const status = computed(() => {
  if (isVisible.value) {
    if (props.disabled) {
      return ComponentStatus.DISABLED
    }

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
.base-btn
  min-height: 2rem
</style>
