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
        body: 'grid grid-cols-3 gap-2 items-center',
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
          class="border border-[#EEE] border-dashed col-span-4 mb-2 text-center"
          v-html="textDom"
        />

        <div class="  text-sm">
          顏色
        </div>
        <div class=" col-span-1 text-sm">
          <u-popover :ui="{ content: 'z-[9999]' }">
            <u-button
              class="w-full h-[2rem]"
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
        </div>

        <div class=" col-span-1 text-sm">
          尺寸
        </div>
        <div class=" col-span-1 text-sm">
          尺寸
        </div>
      </template>
    </u-slideover>
  </div>
</template>

<script setup lang="ts">
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import type { CSSProperties } from 'vue'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { createReusableTemplate, useElementSize, useToggle, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { computed, h, onMounted, reactive, ref, useId, useTemplateRef, watch } from 'vue'

interface ModelValue {
  text: string;
  x: number;
  y: number;
  angle: number;
  fontSize: number;
  fontWeight: number;
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
  fontSize: `${settings.value.fontSize}px`,
  fontWeight: settings.value.fontWeight,
  color: settings.value.color,
  backgroundColor: settings.value.backgroundColor,
  outline: props.isEditing ? '1px solid #3b82f6' : 'none',
}))
const textDom = ref('')
watchThrottled(() => [settings.value, textRef.value], () => {
  const dom = textRef.value?.cloneNode(true) as HTMLElement
  if (!dom) {
    return
  }
  dom.removeAttribute('contenteditable')
  dom.classList.remove('pointer-events-auto')
  dom.classList.add('pointer-events-none')
  dom.classList.add('outline-none!')
  dom.classList.add('transform-none!')

  textDom.value = dom.outerHTML
}, {
  throttle: 30,
  trailing: true,
  deep: true,
  immediate: true,
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
</style>
