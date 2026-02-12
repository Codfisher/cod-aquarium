<template>
  <div
    class="btn flex flex-center text-4xl md:text-5xl p-8 px-24 md:p-10 md:px-30 rounded-full"
    :class="btnClass"
    @click="handleClick()"
    @mouseenter="handleMouseenter"
    @mouseleave="handleMouseleave"
    @mousedown="handleMousedown"
    @mouseup="handleMouseup"
  >
    <slot v-bind="state" />

    <!-- label -->
    <div
      class="label relative font-black tracking-widest"
      :style="labelStyle"
    >
      {{ props.label }}

      <!-- stroke -->
      <div
        class="label-stroke absolute"
        :style="strokeStyle"
      >
        {{ props.label }}
      </div>
    </div>

    <svg
      version="1.1"
      style="display: none;"
    >
      <defs>
        <filter :id="svgFilterId">
          <feMorphology
            operator="dilate"
            :radius="props.strokeSize"
          />
          <feComposite
            operator="xor"
            in="SourceGraphic"
          />
        </filter>
      </defs>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { promiseTimeout } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { computed, ref } from 'vue'

export interface State {
  active: boolean;
  hover: boolean;
}

interface Props {
  label?: string;
  labelColor?: string;
  labelHoverColor?: string;
  strokeColor?: string;
  strokeHoverColor?: string;
  strokeSize?: string;
}
const props = withDefaults(defineProps<Props>(), {
  label: '',
  labelColor: 'white',
  labelHoverColor: undefined,
  strokeColor: '#888',
  strokeHoverColor: undefined,
  strokeSize: '3',
})

const emit = defineEmits<{
  (e: 'click'): void;
}>()

const state = ref<State>({
  active: false,
  hover: false,
})

const btnClass = computed(() => ({
  active: state.value.active,
}))

const labelStyle = computed(() => {
  let color = props.labelColor

  if (props.labelHoverColor) {
    color = state.value.hover ? props.labelHoverColor : props.labelColor
  }

  return {
    color,
  }
})

const svgFilterId = `svg-filter-${nanoid()}`
const strokeStyle = computed(() => {
  let color = props.strokeColor

  if (props.strokeHoverColor) {
    color = state.value.hover ? props.strokeHoverColor : props.strokeColor
  }

  return {
    color,
    filter: `url(#${svgFilterId})`,
  }
})

function handleClick(showEffect = false) {
  emit('click')

  if (showEffect) {
    processClick()
  }
}
async function processClick() {
  state.value.hover = true
  state.value.active = true

  await promiseTimeout(200)

  state.value.active = false
}
function handleMouseenter() {
  state.value.hover = true
}
function handleMouseleave() {
  state.value.hover = false
}
function handleMousedown() {
  state.value.active = true
}
function handleMouseup() {
  state.value.active = false
}
</script>

<style scoped lang="sass">
.btn
  font-family: 'Titan One'
  backdrop-filter: blur(6px)
  background: rgba(white, 0.2)
  box-shadow: 2.8px 2.8px 2.2px rgba(0, 0, 0, 0.006), 6.7px 6.7px 5.3px rgba(0, 0, 0, 0.008), 12.5px 12.5px 10px rgba(0, 0, 0, 0.01), 22.3px 22.3px 17.9px rgba(0, 0, 0, 0.012), 41.8px 41.8px 33.4px rgba(0, 0, 0, 0.014), 100px 100px 80px rgba(0, 0, 0, 0.02)
  user-select: none
  overflow: hidden
  cursor: pointer
  transition-timing-function: cubic-bezier(0.000, 1.650, 1.000, 1.650)
  transition-duration: 0.2s
  &.active
    transform: scale(0.98) rotate(-1deg)
    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1)

.label
  transition-duration: 0.4s

.label-stroke
  top: 0px
  transition-duration: 0.4s
</style>
