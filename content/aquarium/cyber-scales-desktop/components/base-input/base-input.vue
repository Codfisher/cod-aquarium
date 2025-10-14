<template>
  <div
    ref="inputRef"
    class="base-input relative"
    :class="mainClass"
  >
    <bg />

    <content-wrapper class="z-0  ">
      <input-decoding
        v-model="modelValue"
        class="w-full p-2 pl-3"
        :class="props.inputClass"
        :id="id"
        :charset="charset"
      />
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computedAsync, useActiveElement, useElementHover, useMounted } from '@vueuse/core'
import { computed, nextTick, provide, useId, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseInputInjectionKey } from './type'
import InputDecoding from './input-decoding.vue'

interface Props {
  inputClass?: string;
  disabled?: boolean;
}

interface Emits {
  click: [evt: MouseEvent];
}

interface Slots {
  default?: () => unknown;
}

const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<Emits>()
defineSlots<Slots>()

const modelValue = defineModel({
  default: ''
})

const id = useId()
const inputRef = useTemplateRef('inputRef')
const activeElement = useActiveElement()

const mainClass = computed(() => ({
  'cursor-not-allowed': props.disabled,
}))

const isMounted = useMounted()
const isHover = useElementHover(inputRef)
const isVisible = computedAsync(async () => {
  await nextTick()
  await nextFrame()

  return isMounted.value
}, false)

const status = computed(() => {
  if (isVisible.value) {
    if (props.disabled) {
      return ComponentStatus.DISABLED
    }

    if (activeElement.value?.id === id) {
      return ComponentStatus.ACTIVE
    }
    if (isHover.value) {
      return ComponentStatus.HOVER
    }

    return ComponentStatus.VISIBLE
  }

  return ComponentStatus.HIDDEN
})

const charset = [
  /** 數字 */
  (char: string) => char.match(/\d/)
    ? '¥$¢€£'
    : undefined,

  /** 中文 */
  (char: string) => char.match(/[\u4E00-\u9FA5]/)
    ? 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'
    : undefined,

  /** emoji */
  (char: string) => char.match(/\p{Emoji}/u)
    ? '♩♪♫♬𝄞'
    : undefined,

  /** 其他 */
  () => 'ᚠᚢᚦᚨᚱᚳᚷᚹᚻᚾᛁᛂᛇᛈᛉᛊᛏᛒᛖᛗᛚᛝᛟᛡᛢᛣᛤᛥᛦᛧᛨ',
]

interface Expose { }
defineExpose<Expose>({})

provide(baseInputInjectionKey, {
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
</style>
