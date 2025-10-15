<template>
  <img
    ref="imgRef"
    v-bind="$attrs"
    class="base-img"
    @error="handleError"
  >

  <div
    :id="id"
    class="mask absolute overflow-hidden grid pointer-events-none"
    :style="maskStyle"
  >
    <div
      v-for="i in partCount"
      :key="i"
      class="part"
    />
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties, ImgHTMLAttributes } from 'vue'
import { asyncComputed, until, useAsyncState, useElementHover, useElementSize } from '@vueuse/core'
import { animate, stagger, utils, waapi } from 'animejs'
import { computed, onMounted, reactive, useId, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../common/utils'

interface Props extends /* @vue-ignore */ ImgHTMLAttributes {
  gridSize?: number;
  maskColor?: string;
}
interface Emits {
  error: [payload: Event];
}
const props = withDefaults(defineProps<Props>(), {
  gridSize: 20,
  maskColor: '#AAA',
})
const emit = defineEmits<Emits>()

const id = `--${useId()}`
const imgRef = useTemplateRef('imgRef')
const imgSize = reactive(useElementSize(imgRef))

function handleError(payload: Event) {
  emit('error', payload)
}

const { isLoading } = useAsyncState(async () => {
  await until(imgRef).toBeTruthy()

  const img = imgRef.value

  if (!img) {
    throw new Error('Image not found')
  }

  if (img.complete) {
    return
  }

  return new Promise<void>((resolve) => {
    img.addEventListener('load', () => {
      resolve()
    }, { once: true })

    img.addEventListener('error', () => {
      resolve()
    }, { once: true })
  })
}, undefined)
const isHover = useElementHover(imgRef)
watch(() => [isHover, isLoading], () => {
  if (isLoading.value) {
    return
  }

  isHover.value && startHoverAnime()
}, {
  deep: true,
})

const cols = computed(() => Math.max(1, Math.ceil(imgSize.width / props.gridSize!)))
const rows = computed(() => Math.max(1, Math.ceil(imgSize.height / props.gridSize!)))

const partCount = computed(() => cols.value * rows.value)

const maskStyle = computed<CSSProperties>(() => ({
  width: `${imgSize.width}px`,
  height: `${imgSize.height}px`,
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  gridTemplateRows: `repeat(${rows.value}, 1fr)`,
}))

const targetParts = asyncComputed(async () => {
  await until(imgRef).toBeTruthy()
  await nextFrame()
  return document.querySelectorAll(`#${id} .part`)
})

onMounted(async () => {
  await until(targetParts).toBeTruthy()
  startLoadingAnime()

  await until(isLoading).toBe(false)
  startVisibleAnime()
})

function startLoadingAnime() {
  if (!targetParts.value) {
    return
  }

  waapi.animate(
    targetParts.value,
    {
      background: '#EEE',
      loop: true,
      alternate: true,
      delay: stagger(-1000, {
        grid: [rows.value, cols.value],
        from: utils.random(0, rows.value * cols.value),
      }),
      duration: () => utils.random(3000, 5000),
    },
  )
}
function startVisibleAnime() {
  if (!targetParts.value) {
    return
  }
  utils.remove(targetParts.value)

  animate(
    targetParts.value,
    {
      backgroundColor: [
        { to: '#2DD4BF' },
        { to: '#FFF' },
      ],
      opacity: [1, 0.1, 0.9, 0.2, 0.7, 0],
      delay: () => utils.random(0, 200),
      duration: () => utils.random(400, 800),
    },
  )
}
function startHoverAnime() {
  if (!targetParts.value) {
    return
  }
  utils.remove(targetParts.value)

  waapi.animate(
    targetParts.value,
    {
      backgroundColor: '#FFF',
      opacity: [0, 0.6],
      loop: 1,
      alternate: true,
      delay: stagger(50, {
        grid: [rows.value, cols.value],
        axis: 'y',
      }),
      duration: 100,
    },
  )
}
</script>

<style scoped lang="sass">
.base-img
  border-radius: 0px
  anchor-name: v-bind(id)

.mask
  position-anchor: v-bind(id)
  top: anchor(center) !important
  left: anchor(center) !important
  transform: translate(-50%, -50%)

.part
  background-color: v-bind('props.maskColor')
</style>
