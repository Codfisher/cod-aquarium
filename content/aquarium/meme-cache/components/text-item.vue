<template>
  <div
    :id
    ref="boxRef"
    class="box absolute pointer-events-none"
    :style="boxStyle"
    v-bind="$attrs"
  >
    <div
      ref="textRef"
      class="text p-4 min-w-[10rem] whitespace-pre pointer-events-auto text-center"
      contenteditable
      :style="textStyle"
      @input="handleInput"
    />

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
          class="border border-[#EEE] border-dashed col-span-4 p-2 mb-2 text-center pointer-events-none"
          v-html="textDom"
        />

        <div class=" text-sm opacity-50 col-span-4">
          快速樣式
        </div>
        <div class="style-list col-span-4 flex gap-2">
          <div
            v-for="(item, i) in stylePresetList"
            :key="i"
            :style="item.style"
            class="text p-3 border border-[#DDD] rounded"
            @click="presetStyle(item.data)"
          >
            文字
          </div>
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
              label="字級"
              :ui="{ container: 'flex gap-1' }"
            >
              <u-input
                v-model="settings.fontSize"
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
              label="外框寬度"
              :ui="{ container: 'flex gap-1' }"
            >
              <u-input
                v-model="settings.strokeWidth"
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
              label="旋轉"
              hint="也可以直接雙指旋轉文字"
              :ui="{
                hint: 'text-xs opacity-50',
                container: 'flex items-center gap-4 mt-3',
              }"
            >
              <template #label>
                <span class="flex-1">旋轉</span>
                <span class=" text-xs opacity-40 ml-2">{{ settings.angle }}°</span>
              </template>

              <u-slider
                v-model="settings.angle"
                class=""
                :min="-180"
                :max="180"
              />

              <u-button
                icon="i-lucide-x"
                @click="settings.angle = 0"
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
</template>

<script setup lang="ts">
/** 不知道為甚麼，控制點都按不到 */
// import Moveable from 'moveable'
import type { CSSProperties } from 'vue'
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue'
import { useToggle, useVModel, watchThrottled } from '@vueuse/core'
import interact from 'interactjs'
import { map, omit, pipe } from 'remeda'
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
  'update:modelValue': [value: ModelValue];
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
function updateBoxTransform() {
  boxTransform.value = [
    `translate(${settings.value.x}px, ${settings.value.y}px)`,
    `rotate(${settings.value.angle}deg)`,
  ].join(' ')
}

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
  updateBoxTransform()

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
  placement: 'bottom',
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
        fontSize: 16,
        fontWeight: 400,
        strokeWidth: 0,
        strokeColor: '#FFF',
        color: '#000000',
        backgroundColor: '#0000',
      },
    },
    {
      data: {
        fontSize: 30,
        fontWeight: 600,
        strokeWidth: 0,
        strokeColor: '#FFF',
        color: '#000000',
        backgroundColor: '#0000',
      },
    },
    {
      data: {
        fontSize: 16,
        fontWeight: 400,
        strokeWidth: 5,
        strokeColor: '#FFF',
        color: '#F00',
        backgroundColor: '#0000',
      },
    },
    {
      data: {
        fontSize: 16,
        fontWeight: 400,
        strokeWidth: 5,
        strokeColor: '#000',
        color: '#FFF',
        backgroundColor: '#0000',
      },
    },
  ],
  map((item) => ({
    ...item,
    style: {
      ...omit(item.data, ['strokeColor', 'strokeWidth']),
      'fontSize': `${item.data.fontSize}px`,
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

onMounted(() => {
  const box = boxRef.value
  const text = textRef.value
  if (!box || !text) {
    return
  }

  text.textContent = settings.value.text
  settings.value.x -= box.clientWidth / 2
  settings.value.y -= box.clientHeight / 2
  updateBoxTransform()

  interact(box)
    .draggable({
      listeners: {
        move(event) {
          settings.value.x += event.dx
          settings.value.y += event.dy

          updateBoxTransform()
        },
      },
    })
    .gesturable({
      listeners: {
        move(event) {
          settings.value.angle += event.da

          updateBoxTransform()
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
  paint-order: stroke fill
</style>
