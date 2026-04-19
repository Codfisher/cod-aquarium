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
      class="block w-full h-full pointer-events-none select-none border-none! rounded-none!"
      draggable="false"
    >
  </div>

  <div
    v-if="props.isEditing"
    ref="toolbarRef"
    :style="toolbarStyle"
    class="toolbar absolute flex rounded pointer-events-auto text-white bg-black/50"
    @pointerdown.stop
  >
    <u-button
      icon="i-lucide-settings-2"
      class="p-2 duration-300"
      size="lg"
      variant="subtitle"
      :class="{ 'text-primary': settingVisible }"
      @click="toggleSettingVisible()"
    />

    <u-button
      icon="i-lucide-magnet"
      class="p-2 duration-300"
      size="lg"
      variant="subtitle"
      :class="{ 'text-primary': snapEnabled }"
      :aria-label="snapEnabled ? '關閉自動對齊' : '開啟自動對齊'"
      @click="snapEnabled = !snapEnabled"
    />

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

  <u-slideover
    v-model:open="settingVisible"
    :overlay="false"
    :dismissible="false"
    :modal="false"
    side="bottom"
    class="z-100 border border-gray-300 dark:border-gray-600 opacity-95"
    :ui="{
      header: 'min-h-auto flex flex-col p-2',
      body: 'grid grid-cols-4 gap-1 items-center',
    }"
  >
    <template #header="{ close }">
      <div class=" flex w-full">
        <div class="flex-1 text-sm opacity-80">
          素材設定
        </div>

        <u-button
          icon="i-lucide-x"
          @click="close"
        />
      </div>
    </template>

    <template #body>
      <div class="col-span-4 flex items-center justify-between text-sm">
        <span class="opacity-50">尺寸</span>

        <u-switch
          v-model="aspectRatioLocked"
          size="xs"
          label="鎖定比例"
          :ui="{ label: 'text-xs opacity-70' }"
        />
      </div>

      <u-form-field
        class="col-span-2"
        label="寬度"
        :ui="{ container: 'flex gap-1' }"
      >
        <u-input
          v-model="widthInputText"
          type="number"
          class="flex-1"
          :ui="{ base: 'p-1 px-2 text-center' }"
          @blur="commitSize('width')"
          @keydown.enter.prevent="commitSize('width')"
        >
          <template #trailing>
            <span class=" opacity-40 text-xs">px</span>
          </template>
        </u-input>

        <u-button
          icon="i-lucide-chevron-down"
          @click="updateSize('width', settings.width - 10)"
        />
        <u-button
          icon="i-lucide-chevron-up"
          @click="updateSize('width', settings.width + 10)"
        />
      </u-form-field>

      <u-form-field
        class="col-span-2"
        label="高度"
        :ui="{ container: 'flex gap-1' }"
      >
        <u-input
          v-model="heightInputText"
          type="number"
          class="flex-1"
          :ui="{ base: 'p-1 px-2 text-center' }"
          @blur="commitSize('height')"
          @keydown.enter.prevent="commitSize('height')"
        >
          <template #trailing>
            <span class=" opacity-40 text-xs">px</span>
          </template>
        </u-input>

        <u-button
          icon="i-lucide-chevron-down"
          @click="updateSize('height', settings.height - 10)"
        />
        <u-button
          icon="i-lucide-chevron-up"
          @click="updateSize('height', settings.height + 10)"
        />
      </u-form-field>

      <u-form-field
        class="col-span-4"
        label="旋轉"
        hint="兩指可旋轉圖片"
        :ui="{
          hint: 'text-xs opacity-50',
          container: 'flex items-center gap-4 mt-2 px-1',
        }"
      >
        <template #label="{ label }">
          <span class="flex-1">{{ label }}</span>
          <span class=" text-xs opacity-40 ml-2">{{ settings.angle }}°</span>
        </template>

        <u-slider
          v-model="settings.angle"
          :min="-180"
          :max="180"
          :step="1"
        />

        <u-button
          icon="i-lucide-x"
          @click="settings.angle = 0"
        />
      </u-form-field>
    </template>
  </u-slideover>

  <teleport to="body">
    <div
      v-for="line in alignLineList"
      :key="`${line.class}-${line.style.left}-${line.style.top}`"
      class="align-line duration-200 z-999"
      v-bind="line"
    />
  </teleport>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AlignTarget } from './type'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { refThrottled, useToggle, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { join, keys, mapValues, omit, pipe } from 'remeda'
import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
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

/** 自動對齊吸附開關，關閉時忽略 alignTargetList */
const snapEnabled = ref(true)

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

function buildAlignLine(item: AlignTarget) {
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
}

const alignLineList = computed<Array<{
  class: string;
  style: CSSProperties;
}>>(() => {
  if (!snapEnabled.value)
    return []
  return props.alignTargetList.map(buildAlignLine)
})

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

function buildSnapModifierList(): ReturnType<typeof interact.modifiers.snap>[] {
  if (!snapEnabled.value)
    return []
  return [
    interact.modifiers.snap({
      targets: toInteractSnapTargets(props.alignTargetList),
      relativePoints: [{ x: 0.5, y: 0.5 }],
    }),
  ]
}

let interactable: ReturnType<typeof interact> | undefined
onMounted(() => {
  const box = boxRef.value
  if (!box) {
    return
  }

  interactable = interact(box)
    .draggable({
      modifiers: buildSnapModifierList(),
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
        end() {
          // resize 結束後同步 snapshot，讓後續數字輸入沿用拖拉後的比例
          if (aspectRatioLocked.value && settings.value.width > 0) {
            snapshotAspectRatio.value = settings.value.height / settings.value.width
          }
        },
      },
    })

  // alignTargetList 或 snapEnabled 變動時重建 snap modifier
  watchThrottled(
    () => [props.alignTargetList, snapEnabled.value] as const,
    () => {
      interactable?.draggable({
        modifiers: buildSnapModifierList(),
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

const [settingVisible, toggleSettingVisible] = useToggle(false)

watch(() => props.isEditing, (value) => {
  if (!value) {
    settingVisible.value = false
  }
})

const aspectRatioLocked = ref(true)
/** 以「鎖定瞬間」的 height/width 為比例基準，避免每次調整的浮點誤差累積 */
const snapshotAspectRatio = ref(
  settings.value.width > 0 ? settings.value.height / settings.value.width : 1,
)

watch(aspectRatioLocked, (locked) => {
  if (locked && settings.value.width > 0) {
    snapshotAspectRatio.value = settings.value.height / settings.value.width
  }
})

// 尺寸輸入採獨立字串 state，編輯中允許暫時為空，blur 或 Enter 才 commit
const widthInputText = ref(String(settings.value.width))
const heightInputText = ref(String(settings.value.height))

watch(() => settings.value.width, (value) => {
  widthInputText.value = String(value)
})
watch(() => settings.value.height, (value) => {
  heightInputText.value = String(value)
})

function commitSize(field: 'width' | 'height') {
  const text = field === 'width' ? widthInputText.value : heightInputText.value
  const trimmed = text.trim()
  const parsed = Number(trimmed)

  if (trimmed === '' || !Number.isFinite(parsed)) {
    // 無效輸入還原為當前值
    if (field === 'width') {
      widthInputText.value = String(settings.value.width)
    }
    else {
      heightInputText.value = String(settings.value.height)
    }
    return
  }

  updateSize(field, parsed)
  // updateSize 可能 clamp 或等比換算，上面的 watch 會自動同步顯示
}

function updateSize(field: 'width' | 'height', value: number) {
  if (!Number.isFinite(value)) {
    return
  }

  const clamped = Math.max(IMAGE_MIN_DIMENSION, Math.round(value))

  if (!aspectRatioLocked.value) {
    settings.value[field] = clamped
    return
  }

  // 依鎖定瞬間的 ratio 換算另一側，保持比例穩定
  const ratio = snapshotAspectRatio.value
  let newWidth = field === 'width' ? clamped : Math.round(clamped / ratio)
  let newHeight = field === 'height' ? clamped : Math.round(clamped * ratio)

  // 若任一邊小於下限，等比例放大整體，比例優先於單側下限
  const minSide = Math.min(newWidth, newHeight)
  if (minSide < IMAGE_MIN_DIMENSION) {
    const scale = IMAGE_MIN_DIMENSION / minSide
    newWidth = Math.round(newWidth * scale)
    newHeight = Math.round(newHeight * scale)
  }

  settings.value.width = newWidth
  settings.value.height = newHeight
}
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
