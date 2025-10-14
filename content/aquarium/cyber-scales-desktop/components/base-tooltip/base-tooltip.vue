<template>
  <div ref="referenceRef">
    <slot />
  </div>

  <teleport to="body">
    <div
      ref="tooltipRef"
      class="base-tooltip relative p-2 z-[999999]"
      v-bind="$attrs"
      :style="floatingStyles"
    >
      <bg
        :status="status"
        class="z-[-1]"
      />

      <content-wrapper
        :status="status"
        class="z-0 absolute inset-0 "
      >
        <slot name="content">
          <div v-html="textData" />
        </slot>
      </content-wrapper>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { until, useElementHover, useElementSize } from '@vueuse/core'
import { computed, getCurrentInstance, nextTick, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../common/utils'
import { ComponentStatus } from '../../types'
import Bg from './bg/bg.vue'
import ContentWrapper from './content-wrapper.vue'
import { baseTooltipInjectionKey } from './type'
import { useFloating } from '@floating-ui/vue';
import MarkdownIt from 'markdown-it'

interface Slots {
  default?: () => unknown;
  content?: () => unknown;
}

interface Props {
  text?: string;
}
const props = withDefaults(defineProps<Props>(), {
  text: '',
})
const emit = defineEmits()
const slot = defineSlots<Slots>()

const instance = getCurrentInstance()
if (!instance) {
  throw new Error('無法取得 instance')
}

const md = new MarkdownIt({
  linkify: true,
  breaks: true
})

const status = ref(ComponentStatus.HIDDEN)

const tooltipRef = useTemplateRef('tooltipRef')
const tooltipSize = useElementSize(tooltipRef)

const textData = computed(() => md.render(props.text))

/** 外層父元件 */
const referenceRef = ref()
const isHover = useElementHover(referenceRef)

const { floatingStyles } = useFloating(referenceRef, tooltipRef);

onMounted(async () => {
  // 確保 window 有尺寸
  await until(tooltipSize.width).toBeTruthy()
  await until(tooltipSize.height).toBeTruthy()

  // 確保 Vue 資料、畫面更新完畢
  await nextTick()
  await nextFrame()

  status.value = ComponentStatus.VISIBLE
})

defineExpose({
  status: computed(() => status.value),
  setStatus(value: `${ComponentStatus}`) {
    status.value = value as ComponentStatus
  },
})

provide(baseTooltipInjectionKey, {
  status: computed(() => status.value),
})
</script>

<style scoped lang="sass">
</style>
