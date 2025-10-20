<template>
  <div
    :id
    ref="boxRef"
    class="box absolute pointer-events-none origin-top-left"
    :style="boxStyle"
  >
    <div
      ref="textRef"
      class="text p-4 min-w-[6rem] whitespace-pre pointer-events-auto"
      contenteditable
      :style="textStyle"
      @input="handleInput"
    />

    <div
      v-if="props.isEditing"
      ref="toolbarRef"
      :style="toolbarStyle"
      class=" absolute flex rounded pointer-events-auto text-white bg-black/50 "
    >
      <u-button
        icon="i-lucide-settings-2"
        class="p-2! duration-300"
        :class="{ 'text-primary!': settingVisible }"
        @click="toggleSettingVisible()"
      />

      <u-button
        icon="i-lucide-trash-2"
        class="p-2!"
        @click="emit('delete')"
      />
    </div>

    <u-slideover
      v-model:open="settingVisible"
      :overlay="false"
      side="bottom"
      class="z-[100] border border-[#DDD]"
      :ui="{
        header: 'min-h-auto ',
        body: 'grid grid-cols-4 gap-4 items-center',
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
      </template>

      <template #body>
        <div
          class="border border-[#EEE] border-dashed col-span-4 p-4 mb-2 text-center pointer-events-none"
          v-html="textDom"
        />

        <u-form-field
          class="col-span-2"
          label="顏色"
          :ui="{
            label: 'text-xs',
            container: 'flex',
          }"
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
          label="字級 (px)"
          :ui="{
            label: 'text-xs',
            container: 'flex',
          }"
        >
          <u-input-number
            v-model="settings.fontSize"
            :ui="{ base: 'p-1! px-2! mr-1' }"
            :min="0"
            :step="2"
          />
        </u-form-field>

        <u-form-field
          class="col-span-2"
          label="外框顏色"
          :ui="{
            label: 'text-xs',
            container: 'flex',
          }"
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
          label="外框寬度 (px)"
          :ui="{
            label: 'text-xs',
            container: 'flex',
          }"
        >
          <u-input-number
            v-model="settings.strokeWidth"
            :ui="{ base: 'p-1! px-2! mr-1' }"
            :min="0"
            :step="2"
          >
            <template #trailing>
              <div class="text-xs opacity-50">
                px
              </div>
            </template>
          </u-input-number>
        </u-form-field>
      </template>
    </u-slideover>
  </div>
</template>

<script setup lang="ts">
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import type { CSSProperties } from 'vue'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { useToggle, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'

interface ModelValue {
  text: string;
  x: number;
  y: number;
  angle: number;
  fontSize: number;
  fontWeight: number;
  strokeWidth: number;
  strokeColor: string;
  color: string;
  backgroundColor: string;
}

interface Props {
  isEditing?: boolean;
  /** 建立後自動 focus */
  autoFocus?: boolean;
  modelValue?: ModelValue;
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
    strokeWidth: 0,
    strokeColor: '#FFF',
    color: '#000000',
    backgroundColor: '#0000',
  }),
})

const emit = defineEmits<{
  'update:model-value': [value: ModelValue];
  'delete': [];
}>()

const id = useId()

/** defineModel 無法觸發更新 */
const settings = useVModel(props, 'modelValue', emit, {
  passive: true,
  deep: true,
})

const boxRef = useTemplateRef('boxRef')
const boxTransform = ref([
  `translate(${settings.value.x}px, ${settings.value.y}px)`,
  `rotate(${settings.value.angle}deg)`,
].join(' '))

const boxStyle = computed<CSSProperties>(() => ({
  transform: boxTransform.value,
  userSelect: props.isEditing ? 'text' : 'none',
}))

const textRef = useTemplateRef('textRef')
const textStyle = computed<CSSProperties>(() => ({
  'fontSize': `${settings.value.fontSize}px`,
  'fontWeight': settings.value.fontWeight,
  'color': settings.value.color,
  'backgroundColor': settings.value.backgroundColor,
  '-webkit-text-stroke': `${settings.value.strokeWidth}px ${settings.value.strokeColor}`,
  'outline': props.isEditing ? '1px dashed #3b82f6' : 'none',
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
const { floatingStyles: toolbarStyle } = useFloating(textRef, toolbarRef, {
  placement: 'right',
  whileElementsMounted: autoUpdate,
  middleware: [
    offset(10),
    flip(),
    shift(),
  ],
})

onMounted(() => {
  const box = boxRef.value
  const text = textRef.value
  if (!box || !text) {
    return
  }

  text.textContent = settings.value.text

  interact(box)
    .draggable({
      listeners: {
        move(event) {
          settings.value.x += event.dx
          settings.value.y += event.dy

          boxTransform.value = [
            `translate(${settings.value.x}px, ${settings.value.y}px)`,
            `rotate(${settings.value.angle}deg)`,
          ].join(' ')
        },
      },
    })
    .gesturable({
      listeners: {
        move(event) {
          settings.value.angle += event.da

          boxTransform.value = [
            `translate(${settings.value.x}px, ${settings.value.y}px)`,
            `rotate(${settings.value.angle}deg)`,
          ].join(' ')
        },
      },
    })

  if (props.autoFocus) {
    box.focus()
  }
})

const [settingVisible, toggleSettingVisible] = useToggle(false)
</script>

<style scoped lang="sass">
.box
  touch-action: none !important
.text
  transform: translate(-50%, -50%)
  paint-order: stroke fill
</style>
