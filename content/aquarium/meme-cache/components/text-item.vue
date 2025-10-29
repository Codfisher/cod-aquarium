<template>
  <div
    :id
    ref="boxRef"
    class="box flex justify-center absolute min-w-[10rem] py-1 px-10"
    :style="boxStyle"
    v-bind="$attrs"
  >
    <div
      ref="textRef"
      class="text whitespace-pre px-1 text-center outline-none!"
      contenteditable
      :style="textStyle"
      @input="handleInput"
    />

    <u-slideover
      v-model:open="settingVisible"
      :overlay="false"
      side="bottom"
      class="z-[100] border border-[#DDD] opacity-95"
      :ui="{
        header: 'min-h-auto flex flex-col p-2',
        body: 'grid grid-cols-4 items-center',
      }"
    >
      <template #header="{ close }">
        <div class=" flex w-full">
          <div class="flex-1 text-sm opacity-80">
            文字設定
          </div>

          <u-button
            icon="i-lucide-x"
            @click="close"
          />
        </div>

        <!-- <div
          class="flex w-full justify-center border border-[#EEE] border-dashed col-span-4 p-2 pointer-events-none"
          v-html="textDom"
        /> -->
      </template>

      <template #body>
        <div class="grid grid-cols-4 gap-1 items-center col-span-4">
          <div class=" text-sm opacity-50 col-span-4">
            快速樣式
          </div>

          <div class="style-list col-span-4 flex flex-wrap gap-2">
            <div
              v-for="(item, i) in stylePresetList"
              :key="i"
              :style="item.style"
              class="text p-3 border border-[#DDD] rounded cursor-pointer"
              @click="presetStyle(item.data)"
            >
              文字
            </div>
          </div>

          <u-form-field
            class="col-span-2"
            label="字重"
            :ui="{
              hint: 'text-xs opacity-50',
              container: 'flex items-center gap-4 mt-2 px-1',
            }"
          >
            <template #label="{ label }">
              <span class="flex-1">{{ label }}</span>
              <span class=" text-xs opacity-40 ml-2">{{ settings.fontWeight }}</span>
            </template>

            <u-slider
              v-model="settings.fontWeight"
              :min="100"
              :step="100"
              :max="900"
            />

            <u-button
              icon="i-lucide-rotate-ccw"
              @click="settings.fontWeight = 400"
            />
          </u-form-field>

          <u-form-field
            class="col-span-2"
            label="字級"
            :ui="{ container: 'flex gap-1' }"
          >
            <u-input
              v-model="settings.fontSize"
              class="flex-1"
              :ui="{ base: 'p-1! px-2! text-center' }"
            >
              <template #trailing>
                <span class=" opacity-40 text-xs">px</span>
              </template>
            </u-input>

            <u-button
              icon="i-lucide-rotate-ccw"
              @click="settings.fontSize = 14"
            />
            <u-button
              icon="i-lucide-chevron-down"
              @click="settings.fontSize -= 2"
            />
            <u-button
              icon="i-lucide-chevron-up"
              @click="settings.fontSize += 2"
            />
          </u-form-field>
        </div>

        <u-collapsible
          class="col-span-4"
          :ui="{ content: 'grid grid-cols-4 gap-1' }"
        >
          <u-button
            label="詳細設定"
            trailing-icon="i-lucide-chevron-down"
            block
            class="group opacity-50 mt-4"
            :ui="{
              trailingIcon: 'group-data-[state=open]:rotate-180 duration-200',
            }"
          />

          <template #content>
            <u-form-field
              class="col-span-2"
              label="顏色"
            >
              <u-popover :ui="{ content: 'z-[9999]' }">
                <u-button
                  class="w-full h-[1.75rem]"
                  variant="outline"
                  :style="{ backgroundColor: settings.color }"
                />

                <template #content>
                  <u-color-picker
                    v-model="settings.color"
                    size="xs"
                    class="p-2"
                  />
                </template>
              </u-popover>
            </u-form-field>

            <u-form-field
              class="col-span-2"
              label="背景色"
            >
              <u-popover :ui="{ content: 'z-[9999]' }">
                <u-button
                  class="w-full h-[1.75rem]"
                  variant="outline"
                  :style="{ backgroundColor: settings.backgroundColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="settings.backgroundColor"
                    size="xs"
                    class="p-2"
                  />
                </template>
              </u-popover>
            </u-form-field>

            <u-form-field
              class="col-span-2"
              label="背景透明度"
              :ui="{
                hint: 'text-xs opacity-50',
                container: 'flex items-center gap-4 mt-2 px-1',
              }"
            >
              <template #label="{ label }">
                <span class="flex-1">{{ label }}</span>
                <span class=" text-xs opacity-40 ml-2">{{ settings.backgroundOpacity }}</span>
              </template>

              <u-slider
                v-model="settings.backgroundOpacity"
                :min="0"
                :step="0.1"
                :max="1"
              />

              <u-button
                icon="i-lucide-x"
                @click="settings.backgroundOpacity = 0"
              />
            </u-form-field>

            <u-form-field
              class="col-span-2"
              label="外框顏色"
            >
              <u-popover :ui="{ content: 'z-[9999]' }">
                <u-button
                  class="w-full h-[1.75rem]"
                  variant="outline"
                  :style="{ backgroundColor: settings.strokeColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="settings.strokeColor"
                    size="xs"
                    class="p-2"
                  />
                </template>
              </u-popover>
            </u-form-field>

            <u-form-field
              class="col-span-2"
              label="旋轉"
              hint="雙指可旋轉文字"
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
                class=""
                :min="-180"
                :max="180"
                :step="5"
              />

              <u-button
                icon="i-lucide-x"
                @click="settings.angle = 0"
              />
            </u-form-field>

            <u-form-field
              class="col-span-2"
              label="外框寬度"
              :ui="{ container: 'flex gap-1' }"
            >
              <u-input
                v-model="settings.strokeWidth"
                class="flex-1"
                :ui="{ base: 'p-1! px-2! text-center' }"
              >
                <template #trailing>
                  <span class=" opacity-40 text-xs">px</span>
                </template>
              </u-input>

              <u-button
                icon="i-lucide-x"
                @click="settings.strokeWidth = 0"
              />
              <u-button
                icon="i-lucide-chevron-down"
                @click="settings.strokeWidth -= 2"
              />
              <u-button
                icon="i-lucide-chevron-up"
                @click="settings.strokeWidth += 2"
              />
            </u-form-field>

            <u-form-field
              class="col-span-4"
              label="行距"
              :ui="{
                hint: 'text-xs opacity-50',
                container: 'flex items-center gap-4 mt-2 px-1',
              }"
            >
              <template #label="{ label }">
                <span class="flex-1">{{ label }}</span>
                <span class=" text-xs opacity-40 ml-2">{{ settings.lineHeight }}</span>
              </template>

              <u-slider
                v-model="settings.lineHeight"
                :min="0"
                :step="0.1"
                :max="3"
              />

              <u-button
                icon="i-lucide-rotate-ccw"
                @click="settings.lineHeight = 1.2"
              />
            </u-form-field>
          </template>
        </u-collapsible>
      </template>
    </u-slideover>
  </div>

  <div
    v-if="props.isEditing"
    ref="toolbarRef"
    :style="toolbarStyle"
    class="toolbar absolute flex rounded pointer-events-auto text-white bg-black/50"
  >
    <u-button
      icon="i-lucide-settings-2"
      class="p-2! duration-300"
      size="lg"
      :class="{ 'text-primary!': settingVisible }"
      @click="toggleSettingVisible()"
    />

    <u-button
      icon="i-material-symbols:content-copy-rounded"
      class="p-2!"
      size="lg"
      @click="emit('duplicate')"
    />

    <u-button
      icon="i-lucide-trash-2"
      class="p-2!"
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
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import type { CSSProperties } from 'vue'
import type { AlignTarget } from '../type'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { refThrottled, useToggle, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { join, keys, map, mapValues, omit, pipe } from 'remeda'
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../web/common/utils'

interface ModelValue {
  text: string;
  x: number;
  y: number;
  angle: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  strokeWidth: number;
  strokeColor: string;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
}

interface Props {
  boardOrigin: { x: number; y: number };
  isEditing?: boolean;
  /** 建立後自動 focus */
  autoFocus?: boolean;
  modelValue?: ModelValue;
  alignTargetList?: AlignTarget[];
}
const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  autoFocus: true,
  modelValue: () => ({
    text: '點擊編輯',
    x: 0,
    y: 0,
    angle: 0,
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.2,
    strokeWidth: 0,
    strokeColor: '#FFF',
    color: '#000',
    backgroundColor: '#FFF',
    backgroundOpacity: 0,
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
  transform: `translate(-50%, -50%) rotate(${settings.value.angle}deg)`,
  transformOrigin: 'center',
  userSelect: props.isEditing ? 'text' : 'none',
  outline: props.isEditing ? '1px dashed #3b82f6' : 'none',
}))

function hexToRgba(hex: string, alpha = 1) {
  let h = hex.replace(/^#/, '')
  if (h.length === 3)
    h = h.split('').map((c) => c + c).join('') // #000 -> #000000
  if (h.length !== 6)
    throw new Error('Invalid hex color')

  const num = Number.parseInt(h, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255

  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

const textRef = useTemplateRef('textRef')
const textStyle = computed<CSSProperties>(() => ({
  'fontSize': `${settings.value.fontSize}px`,
  'fontWeight': settings.value.fontWeight,
  'lineHeight': settings.value.lineHeight,
  'color': settings.value.color,
  'backgroundColor': hexToRgba(settings.value.backgroundColor, settings.value.backgroundOpacity),
  '-webkit-text-stroke': `${settings.value.strokeWidth}px ${settings.value.strokeColor}`,
}))
const textDom = ref('')
watchThrottled(() => [settings.value, textRef.value], () => {
  const dom = textRef.value?.cloneNode(true) as HTMLElement
  if (!dom) {
    return
  }

  dom.contentEditable = 'false'
  dom.classList.add('outline-none!')
  dom.classList.add('transform-none!')

  textDom.value = dom.outerHTML
}, {
  throttle: 30,
  trailing: true,
  deep: true,
  immediate: true,
  flush: 'post',
})

function handleInput(event: InputEvent) {
  const el = event.target as HTMLElement
  settings.value.text = el.textContent
}

const toolbarRef = useTemplateRef('toolbarRef')
const { floatingStyles: toolbarStyle } = useFloating(boxRef, toolbarRef, {
  placement: 'right',
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(10),
    shift(),
    flip(),
  ],
})

const stylePresetList = pipe(
  [
    {
      data: {
        strokeWidth: 5,
        strokeColor: '#FFF',
        color: '#000',
        backgroundColor: '#FFF',
        backgroundOpacity: 0,
      },
    },
    {
      data: {
        strokeWidth: 5,
        strokeColor: '#FFF',
        color: '#F00',
        backgroundColor: '#FFF',
        backgroundOpacity: 0,
      },
    },
    {
      data: {
        strokeWidth: 5,
        strokeColor: '#000',
        color: '#FFF',
        backgroundColor: '#FFF',
        backgroundOpacity: 0,
      },
    },
    {
      data: {
        strokeWidth: 0,
        strokeColor: '#000',
        color: '#FFF',
        backgroundColor: '#000',
        backgroundOpacity: 1,
      },
    },
  ],
  map((item) => ({
    ...item,
    style: {
      ...omit(item.data, [
        'strokeColor',
        'strokeWidth',
        'backgroundOpacity',
      ]),
      'backgroundColor': hexToRgba(item.data.backgroundColor, item.data.backgroundOpacity),
      '-webkit-text-stroke': `${item.data.strokeWidth}px ${item.data.strokeColor}`,
    },
  })),
)

function presetStyle(data: Partial<ModelValue>) {
  settings.value = {
    ...settings.value,
    ...data,
  }
}

const isDragging = ref(false)

function eq(a: number, b: number) {
  return Math.abs(a - b) < 0.1
}
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
        if (eq(x, item.x) && eq(y, item.y)) {
          return true
        }
      }
      else if ('y' in item) {
        if (eq(y, item.y)) {
          return true
        }
      }
      else {
        if (eq(x, item.x)) {
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
      // 垂直線
      return (_, y) => ({ x: target.x, y, range: SNAP_RANGE })
    }
    // 水平線
    return (x, _) => ({ x, y: target.y, range: SNAP_RANGE })
  })

  return result
}

onMounted(() => {
  const box = boxRef.value
  const text = textRef.value
  if (!box || !text) {
    return
  }

  text.textContent = settings.value.text

  const interactable = interact(box)
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

  // alignTargetList 變動需要更新
  watchThrottled(
    () => props.alignTargetList,
    (list) => {
      interactable.draggable({
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

  if (props.autoFocus) {
    nextFrame().then(() => {
      text.focus()

      try {
        const selection = window.getSelection()
        if (selection) {
          const range = document.createRange()
          range.selectNodeContents(text)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
      catch { }

      // 考慮相容性
      if (!window.getSelection()?.toString()) {
        document.execCommand?.('selectAll', false)
      }
    })
  }
})

const [settingVisible, toggleSettingVisible] = useToggle(false)
</script>

<style scoped lang="sass">
.box
  touch-action: none !important
  will-change: left, top, transform
.text
  paint-order: stroke fill

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
    left: 0         原點
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
