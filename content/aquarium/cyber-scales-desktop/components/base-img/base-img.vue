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
import type { WAAPIAnimation } from 'animejs'
import type { CSSProperties, ImgHTMLAttributes } from 'vue'
import { asyncComputed, until, useAsyncState, useElementSize } from '@vueuse/core'
import { stagger, utils, waapi } from 'animejs'
import { computed, nextTick, onMounted, reactive, useId, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../common/utils'

interface Props extends /* @vue-ignore */ ImgHTMLAttributes {
  gridSize?: number;
  maskColor?: string;
}
interface Emits {
  error: [payload: Event];
}
const props = withDefaults(defineProps<Props>(), {
  gridSize: 15,
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

const cols = computed(() => Math.max(1, Math.ceil(imgSize.width / props.gridSize!)))
const rows = computed(() => Math.max(1, Math.ceil(imgSize.height / props.gridSize!)))

const partCount = computed(() => cols.value * rows.value)

const maskStyle = computed<CSSProperties>(() => ({
  width: `${imgSize.width}px`,
  height: `${imgSize.height}px`,
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  gridTemplateRows: `repeat(${rows.value}, 1fr)`,
}))

const targets = asyncComputed(async () => {
  await until(imgRef).toBeTruthy()
  await nextFrame()
  return document.querySelectorAll(`#${id} .part`)
})

onMounted(async () => {
  await until(targets).toBeTruthy()
  startLoadingAnime()

  await until(isLoading).toBe(false)
  startVisibleAnime()
})

let loadingAnime: WAAPIAnimation | undefined
function startLoadingAnime() {
  if (!targets.value) {
    return
  }

  loadingAnime = waapi.animate(
    targets.value!,
    {
      background: '#EEE',
      loop: 1,
      alternate: true,
      delay: stagger(300, {
        grid: [rows.value, cols.value],
        from: utils.random(0, rows.value * cols.value),
      }),
      duration: () => utils.random(2000, 3000),
      onComplete() {
        startLoadingAnime()
      },
    },
  )
}
function startVisibleAnime() {
  if (!targets.value) {
    return
  }

  loadingAnime?.cancel()

  waapi.animate(
    targets.value!,
    {
      opacity: [1, 0.1, 0.9, 0.2, 0.7, 0],
      delay: () => utils.random(0, 200),
      duration: 300,
      onComplete() {
        loadingAnime?.cancel()
      },
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
  background: v-bind('props.maskColor')
</style>
