<template>
  <div ref="referenceRef">
    <slot />
  </div>

  <teleport
    v-if="props.text"
    to="body"
  >
    <div
      ref="tooltipRef"
      class="base-tooltip relative z-[9999999] "
      v-bind="$attrs"
      :style="floatingStyles"
      :class="tooltipClass"
    >
      <bg :status="status" />

      <!-- 填充寬度用 -->
      <div
        class=" opacity-0 text-sm p-2 pointer-events-none max-w-[40dvw]"
        v-html="textData"
      />

      <content-wrapper
        :status="status"
        class="absolute inset-0"
      >
        <slot name="content">
          <div
            class="tip text-sm h-full p-2"
            v-html="textData"
          />
        </slot>
      </content-wrapper>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import type { Placement } from '@floating-ui/vue'
import { autoPlacement, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { asyncComputed, promiseTimeout, until, useElementBounding, useElementHover, useElementSize, useIntervalFn } from '@vueuse/core'
import MarkdownIt from 'markdown-it'
import { computed, getCurrentInstance, nextTick, onMounted, provide, reactive, ref, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseTooltipInjectionKey } from './type'

interface Slots {
  default?: () => unknown;
  content?: () => unknown;
}

interface Props {
  text?: string;
  offset?: number;
  showDelay?: number;
  hideDelay?: number;
  placement?: Placement;
}
const props = withDefaults(defineProps<Props>(), {
  text: '',
  offset: 10,
  showDelay: 800,
  hideDelay: 500,
})
defineSlots<Slots>()

const instance = getCurrentInstance()
if (!instance) {
  throw new Error('無法取得 instance')
}

const md = new MarkdownIt({
  html: true,
  breaks: true,
})

const tooltipRef = useTemplateRef('tooltipRef')
const tooltipSize = useElementSize(tooltipRef)

const textData = computed(() => md.render(props.text))

/** 外層父元件 */
const referenceRef = useTemplateRef('referenceRef')
const referenceBounding = reactive(useElementBounding(referenceRef))

const isReferenceHover = useElementHover(referenceRef)
const isTooltipHover = useElementHover(tooltipRef)

const {
  floatingStyles,
} = useFloating(referenceRef, tooltipRef, {
  placement: () => props.placement,
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(props.offset),
    flip(),
    shift(),
  ],
})

const isReady = ref(false)
onMounted(async () => {
  // 確保 window 有尺寸
  await until(tooltipSize.width).toBeTruthy()
  await until(tooltipSize.height).toBeTruthy()

  // 確保 Vue 資料、畫面更新完畢
  await nextTick()
  await nextFrame()

  isReady.value = true
})

const status = asyncComputed(async () => {
  if (!isReady.value) {
    return ComponentStatus.HIDDEN
  }

  const visible = isReferenceHover.value || isTooltipHover.value
  if (visible) {
    await promiseTimeout(props.showDelay)
    return ComponentStatus.VISIBLE
  }

  await promiseTimeout(props.hideDelay)
  return ComponentStatus.HIDDEN
}, ComponentStatus.HIDDEN)

const tooltipClass = computed(() => ({
  'pointer-events-none': status.value === ComponentStatus.HIDDEN,
}))

defineExpose({
  status: computed(() => status.value),
})

provide(baseTooltipInjectionKey, {
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
.tip
  backdrop-filter: blur(10px)
  background: rgba(#888, 0.1)
  text-shadow: 0 0 5px white, 0 0 10px white, 0 0 15px white
</style>

<style lang="sass">
.base-tooltip
  a
    color: #14b8a6
    text-decoration: underline
</style>
