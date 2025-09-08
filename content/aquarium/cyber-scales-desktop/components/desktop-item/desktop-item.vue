<template>
  <div
    ref="itemRef"
    class="desktop-item relative p-3 aspect-square flex justify-center items-center"
  >
    <bg class="z-[-1]" />
    <content-wrapper class="z-0  ">
      <material-icon
        :name="props.icon"
        size="4rem"
        weight="100"
        grade="-25"
        opsz="20"
        class="text-white"
      />
      <slot />

      <div
        ref="labelRef"
        class="item-label text-[#777] text-nowrap font-orbitron"
        :style="labelStyle"
      >
        <div class=" leading-none">
          {{ labelDecoder.text }}
        </div>

        <div
          class="text-xs"
          :class="{ 'text-right': props.labelLeft }"
        >
          {{ subLabelDecoder.text }}
        </div>
      </div>
    </content-wrapper>
  </div>
</template>

<script setup lang="ts">
import { computedAsync, promiseTimeout, useElementHover, useElementSize, useMounted, whenever } from '@vueuse/core'
import { pipe } from 'remeda'
import { computed, nextTick, provide, reactive, useTemplateRef, watch } from 'vue'
import { useDecodingText } from '../../../../../composables/use-decoding-text'
import { ComponentStatus } from '../../types'
import MaterialIcon from '../material-icon.vue'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { desktopItemInjectionKey } from './type'

interface Props {
  label?: string;
  subLabel?: string;
  labelLeft?: boolean;
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
const isVisible = computedAsync(async () => {
  await promiseTimeout(props.delay)
  await nextTick()
  return isMounted.value
}, false)

const labelRef = useTemplateRef('labelRef')
const labelSize = reactive(useElementSize(labelRef))

const labelDecoder = useDecodingText(props.label)
const subLabelDecoder = useDecodingText(props.subLabel)

const labelStyle = computed(() => {
  const dir = props.labelLeft ? -1 : 1
  const offsetX = pipe(
    Math.sqrt(itemSize.width ** 2 + itemSize.height ** 2) * dir,
    (value) => {
      if (props.labelLeft) {
        return value - labelSize.width + itemSize.width / 2 - 12
      }
      return value * 0.75
    },
  )

  return {
    transform: `translateY(-50%) translateX(${offsetX}px)`,
  }
})

const status = computed(() => {
  if (isVisible.value) {
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

provide(desktopItemInjectionKey, {
  label: computed(() => props.label),
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
.item-label
  position: absolute
  top: 50%
  left: 50%
</style>
