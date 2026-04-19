<template>
  <div
    :id
    ref="boxRef"
    class="box absolute"
    :style="boxStyle"
    v-bind="$attrs"
  >
    <img
      :src="settings.url"
      class="block w-full h-full pointer-events-none select-none border-none rounded-none!"
      draggable="false"
    >
  </div>

  <div
    v-if="props.isEditing"
    ref="toolbarRef"
    :style="toolbarStyle"
    class="toolbar absolute flex rounded pointer-events-auto text-white bg-black/50"
  >
    <u-button
      icon="i-material-symbols:content-copy-outline-rounded"
      class="p-2"
      variant="subtitle"
      size="lg"
      @click="emit('duplicate')"
    />

    <u-button
      icon="i-lucide-trash-2"
      class="p-2"
      variant="subtitle"
      size="lg"
      @click="emit('delete')"
    />
  </div>

  <teleport to="body">
    <div
      v-for="line, i in alignLineList"
      :key="i"
      class="align-line duration-200 z-999"
      v-bind="line"
    />
  </teleport>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AlignTarget } from './type'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { refThrottled, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { join, keys, mapValues, omit, pipe } from 'remeda'
import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'
import { isClose } from '../../utils'
import { IMAGE_MIN_DIMENSION } from './constants'

interface ModelValue {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

interface Props {
  boardOrigin: { x: number; y: number };
  isEditing?: boolean;
  modelValue?: ModelValue;
  alignTargetList?: AlignTarget[];
}
const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  modelValue: () => ({
    url: '',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0,
  }),
  alignTargetList: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: ModelValue];
  'duplicate': [];
  'delete': [];
}>()

const id = useId()

/** defineModel 無法觸發更新 */
const settings = useVModel(props, 'modelValue', emit, {
  passive: true,
  deep: true,
})
const throttledSettings = refThrottled(settings, 100, undefined, false)

const boxRef = useTemplateRef('boxRef')
const boxStyle = computed<CSSProperties>(() => ({
  left: `${settings.value.x}px`,
  top: `${settings.value.y}px`,
  width: `${settings.value.width}px`,
  height: `${settings.value.height}px`,
  transform: `translate(-50%, -50%) rotate(${settings.value.angle}deg)`,
  transformOrigin: 'center',
  outline: props.isEditing ? '1px dashed #3b82f6' : 'none',
}))

const toolbarRef = useTemplateRef('toolbarRef')
const { floatingStyles: toolbarStyle } = useFloating(boxRef, toolbarRef, {
  placement: 'top',
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(10),
    shift(),
    flip(),
  ],
})

const isDragging = ref(false)

const alignLineList = computed<Array<{
  class: string;
  style: CSSProperties;
}>>(() => props.alignTargetList.map((item) => {
  const { left, top } = pipe(
    undefined,
    () => {
      if (item.type === 'point') {
        return { left: item.x, top: item.y }
      }
      if ('y' in item) {
        return { top: item.y }
      }

      return { left: item.x }
    },
    mapValues((value) => `${value}px`),
  )

  const opacity = pipe(
    undefined,
    () => {
      if (!isDragging.value) {
        return false
      }

      const [x, y] = [
        throttledSettings.value.x + props.boardOrigin.x,
        throttledSettings.value.y + props.boardOrigin.y,
      ]

      if (item.type === 'point') {
        if (isClose(x, item.x) && isClose(y, item.y)) {
          return true
        }
      }
      else if ('y' in item) {
        if (isClose(y, item.y)) {
          return true
        }
      }
      else {
        if (isClose(x, item.x)) {
          return true
        }
      }
    },
    (value) => value ? 0.6 : 0,
  )

  return {
    class: pipe(
      omit(item, ['type']),
      keys(),
      join(' '),
    ),
    style: {
      left,
      top,
      opacity,
    },
  }
}))

type SnapFn = (x: number, y: number) => { x: number; y: number; range?: number }
/** 吸附半徑 */
const SNAP_RANGE = 8

function toInteractSnapTargets(list: AlignTarget[]): SnapFn[] {
  const result: SnapFn[] = list.map((target) => {
    if (target.type === 'point') {
      return () => ({ x: target.x, y: target.y, range: SNAP_RANGE * 2 })
    }
    if ('x' in target) {
      return (_, y) => ({ x: target.x, y, range: SNAP_RANGE })
    }
    return (x, _) => ({ x, y: target.y, range: SNAP_RANGE })
  })

  return result
}

let interactable: ReturnType<typeof interact> | undefined
onMounted(() => {
  const box = boxRef.value
  if (!box) {
    return
  }

  interactable = interact(box)
    .draggable({
      modifiers: [
        interact.modifiers.snap({
          targets: toInteractSnapTargets(props.alignTargetList),
          relativePoints: [{ x: 0.5, y: 0.5 }],
        }),
      ],
      listeners: {
        start() {
          isDragging.value = true
        },
        end() {
          isDragging.value = false
        },
        move(event) {
          settings.value.x += event.dx
          settings.value.y += event.dy
        },
      },
    })
    .gesturable({
      listeners: {
        move(event) {
          settings.value.angle += Math.floor(event.da)
        },
      },
    })
    .resizable({
      edges: { top: true, right: true, bottom: true, left: true },
      modifiers: [
        // restrictSize 需巢狀放進 aspectRatio，邊界才不會打破比例
        interact.modifiers.aspectRatio({
          ratio: 'preserve',
          equalDelta: false,
          modifiers: [
            interact.modifiers.restrictSize({
              min: { width: IMAGE_MIN_DIMENSION, height: IMAGE_MIN_DIMENSION },
            }),
          ],
        }),
      ],
      margin: 12,
      listeners: {
        move(event) {
          settings.value.width = event.rect.width
          settings.value.height = event.rect.height
          settings.value.x += event.deltaRect.left + event.deltaRect.width / 2
          settings.value.y += event.deltaRect.top + event.deltaRect.height / 2
        },
      },
    })

  // alignTargetList 變動需要更新
  watchThrottled(
    () => props.alignTargetList,
    (list) => {
      interactable?.draggable({
        modifiers: [
          interact.modifiers.snap({
            targets: toInteractSnapTargets(list),
            relativePoints: [{ x: 0.5, y: 0.5 }],
          }),
        ],
      })
    },
    {
      throttle: 0,
      deep: true,
      leading: false,
      trailing: true,
    },
  )
})

onBeforeUnmount(() => {
  interactable?.unset()
})
</script>

<style scoped lang="sass">
.box
  touch-action: none !important
  will-change: left, top, transform

.toolbar
  box-shadow: 0px 0px 10px rgba(white, 0.6)
  z-index: 99999

.align-line
  position: fixed
  pointer-events: none
  &::before, &::after
    content: ''
    position: absolute
    display: block
    background: #FE9900

  &.x::after
    left: 0
    top: -100vh
    width: 1px
    height: 200vh
    transform: translateX(-50%)

  &.y::before
    top: 0
    left: -100vw
    width: 200vw
    height: 1px
    transform: translateY(-50%)
</style>
