<template>
  <div
    v-if="props.data"
    class="py-[6vh] flex flex-col h-full bg-gray-300 dark:bg-gray-500 overflow-auto relative"
  >
    <div class="flex-1 flex flex-col items-center bg-gray-300 dark:bg-gray-500">
      <div
        ref="boardRef"
        class="board flex flex-col relative shadow-xl"
        @pointerdown.self="addItem"
      >
        <div
          :style="settingValue.topPadding"
          class="pointer-events-none shrink-0"
        />

        <img
          v-if="props.data"
          ref="imgRef"
          :src="`/memes/${props.data.file}`"
          class="object-contain select-none rounded-none! border-none pointer-events-none w-[80vw] md:max-w-[50vw]"
          draggable="false"
        >

        <div
          :style="settingValue.bottomPadding"
          class="pointer-events-none shrink-0"
        />

        <div class="watermark bottom-0 left-0 py-2 px-4">
          <span class=" text-nowrap ">
            快取梗圖
          </span>
        </div>

        <text-item
          v-for="item in textItemList"
          :key="item.key"
          :model-value="item.data"
          :board-origin="boardBounding"
          :is-editing="item.isEditing"
          :auto-focus="!isFromStorage"
          :align-target-list="item.alignTargetList"
          @click="editTextItem(item)"
          @duplicate="duplicateTextItem(item)"
          @delete="deleteTextItem(item)"
          @update:model-value="(data) => updateTextItem(item, data)"
        />

        <image-item
          v-for="item in imageItemList"
          :key="item.key"
          :model-value="item.data"
          :board-origin="boardBounding"
          :is-editing="item.isEditing"
          :align-target-list="item.alignTargetList"
          @click="editImageItem(item)"
          @duplicate="duplicateImageItem(item)"
          @delete="deleteImageItem(item)"
          @update:model-value="(data) => updateImageItem(item, data)"
        />
      </div>
    </div>

    <help-tip />

    <u-slideover
      v-model:open="layoutSettingVisible"
      :overlay="false"
      side="bottom"
      class="z-100 border border-gray-200 dark:border-gray-600 opacity-95"
      :ui="{
        header: 'min-h-auto ',
        body: 'grid grid-cols-4 gap-1',
      }"
    >
      <template #header="{ close }">
        <div class=" flex w-full">
          <div class="flex-1 text-sm opacity-80">
            圖片設定
          </div>

          <u-button
            icon="i-lucide-x"
            @click="close"
          />
        </div>
      </template>

      <template #body>
        <div class=" text-sm opacity-50 col-span-4">
          快速設定
        </div>
        <div class="style-list col-span-4 flex flex-wrap gap-2">
          <div
            v-for="(item, i) in settingPresetList"
            :key="i"
            class="text p-3 border border-gray-300 dark:border-gray-600 rounded text-sm cursor-pointer"
            @click="presetStyle(item.data)"
          >
            {{ item.label }}
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
            <!-- 頂部空間 -->
            <u-form-field
              class="col-span-2"
              label="頂部顏色"
            >
              <u-popover :ui="{ content: 'z-[9999]' }">
                <u-button
                  class="w-full h-[1.75rem]"
                  variant="outline"
                  :style="{ backgroundColor: layoutSetting.topPadding.backgroundColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="layoutSetting.topPadding.backgroundColor"
                    size="xs"
                    class="p-2"
                  />
                </template>
              </u-popover>
            </u-form-field>
            <u-form-field
              class="col-span-2"
              label="高度"
              :ui="{ container: 'flex gap-1' }"
            >
              <u-input
                v-model="layoutSetting.topPadding.height"
                :ui="{ base: 'p-1 px-2 text-center' }"
              >
                <template #trailing>
                  <span class=" opacity-40 text-xs">px</span>
                </template>
              </u-input>

              <u-button
                icon="i-lucide-x"
                @click="layoutSetting.topPadding.height = 0"
              />
              <u-button
                icon="i-lucide-chevron-down"
                @click="layoutSetting.topPadding.height -= 10"
              />
              <u-button
                icon="i-lucide-chevron-up"
                @click="layoutSetting.topPadding.height += 10"
              />
            </u-form-field>

            <!-- 底部空間 -->
            <u-form-field
              class="col-span-2"
              label="底部顏色"
            >
              <u-popover :ui="{ content: 'z-[9999]' }">
                <u-button
                  class="w-full h-[1.75rem]"
                  variant="outline"
                  :style="{ backgroundColor: layoutSetting.bottomPadding.backgroundColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="layoutSetting.bottomPadding.backgroundColor"
                    size="xs"
                    class="p-2"
                  />
                </template>
              </u-popover>
            </u-form-field>
            <u-form-field
              class="col-span-2"
              label="高度"
              :ui="{ container: 'flex gap-1' }"
            >
              <u-input
                v-model="layoutSetting.bottomPadding.height"
                :ui="{ base: 'p-1 px-2 text-center' }"
              >
                <template #trailing>
                  <span class=" opacity-40 text-xs">px</span>
                </template>
              </u-input>

              <u-button
                icon="i-lucide-x"
                @click="layoutSetting.bottomPadding.height = 0"
              />
              <u-button
                icon="i-lucide-chevron-down"
                @click="layoutSetting.bottomPadding.height -= 10"
              />
              <u-button
                icon="i-lucide-chevron-up"
                @click="layoutSetting.bottomPadding.height += 10"
              />
            </u-form-field>
          </template>
        </u-collapsible>
      </template>
    </u-slideover>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentProps } from 'vue-component-type-helpers'
import type { MemeData } from '../meme/type'
import type { AlignTarget } from './type'
import { onClickOutside, promiseTimeout, useElementBounding, useElementSize, useRafFn } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { clone, pipe } from 'remeda'
import { computed, nextTick, reactive, ref, shallowRef, triggerRef, useTemplateRef } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import { IMAGE_MAX_DIMENSION, IMAGE_MIN_DIMENSION } from './constants'
import HelpTip from './help-tip.vue'
import ImageItem from './image-item.vue'
import TextItem from './text-item.vue'

interface TextItemData {
  data: ComponentProps<typeof TextItem>['modelValue'];
  key: string;
}

interface ImageItemData {
  data: ComponentProps<typeof ImageItem>['modelValue'];
  key: string;
}

interface Props {
  data?: MemeData;
}
const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

const layoutSettingVisible = ref(false)
const layoutSetting = ref({
  topPadding: {
    backgroundColor: '#FFF',
    height: 0,
  },
  bottomPadding: {
    backgroundColor: '#FFF',
    height: 0,
  },
})

const boardRef = useTemplateRef('boardRef')
const boardBounding = reactive(useElementBounding(boardRef, {
  updateTiming: 'next-frame',
}))
const imgRef = useTemplateRef('imgRef')
const imgSize = reactive(useElementSize(imgRef))

const targetKey = ref<string>()
const textMap = shallowRef(new Map<string, TextItemData>())
const imageMap = shallowRef(new Map<string, ImageItemData>())

onClickOutside(boardRef, () => {
  targetKey.value = undefined
})

function addItem(event: PointerEvent) {
  if (targetKey.value) {
    targetKey.value = undefined
    return
  }

  const rect = boardRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const newItem: TextItemData = {
    key: nanoid(),
    data: {
      text: '點擊編輯',
      x,
      y,
      angle: 0,
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.2,
      strokeWidth: 4,
      strokeColor: '#FFF',
      color: '#000',
      backgroundColor: '#FFF',
      backgroundOpacity: 0,
    },
  }

  textMap.value.set(newItem.key, newItem)
  triggerRef(textMap)
  targetKey.value = newItem.key
}

function editTextItem(item: TextItemData) {
  targetKey.value = item.key
}
function updateTextItem(item: TextItemData, data: TextItemData['data']) {
  textMap.value.set(item.key, {
    ...item,
    data,
  })
}
function duplicateTextItem(item: TextItemData) {
  const newItem: TextItemData = {
    key: nanoid(),
    data: {
      text: '點擊編輯',
      angle: 0,
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.2,
      strokeWidth: 4,
      strokeColor: '#FFF',
      color: '#000',
      backgroundColor: '#FFF',
      backgroundOpacity: 0,
      ...item.data,
      x: (item.data?.x ?? 0) + 10,
      y: (item.data?.y ?? 0) + 10,
    },
  }

  textMap.value.set(newItem.key, newItem)
  triggerRef(textMap)
  targetKey.value = newItem.key
}
function deleteTextItem(item: TextItemData) {
  textMap.value.delete(item.key)
  triggerRef(textMap)

  targetKey.value = undefined
}

function editImageItem(item: ImageItemData) {
  targetKey.value = item.key
}
function updateImageItem(item: ImageItemData, data: ImageItemData['data']) {
  imageMap.value.set(item.key, {
    ...item,
    data,
  })
}
function duplicateImageItem(item: ImageItemData) {
  const newItem: ImageItemData = {
    key: nanoid(),
    data: {
      url: '',
      width: 100,
      height: 100,
      angle: 0,
      ...item.data,
      x: (item.data?.x ?? 0) + 10,
      y: (item.data?.y ?? 0) + 10,
    },
  }

  imageMap.value.set(newItem.key, newItem)
  triggerRef(imageMap)
  targetKey.value = newItem.key
}
function deleteImageItem(item: ImageItemData) {
  imageMap.value.delete(item.key)
  triggerRef(imageMap)

  targetKey.value = undefined
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader 失敗'))
    reader.readAsDataURL(blob)
  })
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('圖片載入失敗'))
    image.src = url
  })
}

async function addImage(source: Blob | string) {
  const url = typeof source === 'string'
    ? source
    : await blobToDataUrl(source)

  const { width: naturalWidth, height: naturalHeight } = await loadImageSize(url)
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error('圖片尺寸無效')
  }

  let scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight))
  // 若縮放後最短邊仍小於下限，放大補齊以維持長寬比
  if (Math.min(naturalWidth, naturalHeight) * scale < IMAGE_MIN_DIMENSION) {
    scale = IMAGE_MIN_DIMENSION / Math.min(naturalWidth, naturalHeight)
  }
  const width = Math.round(naturalWidth * scale)
  const height = Math.round(naturalHeight * scale)

  const rect = boardRef.value?.getBoundingClientRect()
  const x = rect ? rect.width / 2 : width / 2
  const y = rect ? rect.height / 2 : height / 2

  const newItem: ImageItemData = {
    key: nanoid(),
    data: { url, x, y, width, height, angle: 0 },
  }

  imageMap.value.set(newItem.key, newItem)
  triggerRef(imageMap)
  targetKey.value = newItem.key
}

const settingValue = computed(() => ({
  topPadding: {
    ...layoutSetting.value.topPadding,
    height: `${layoutSetting.value.topPadding.height}px`,
  } as CSSProperties,
  bottomPadding: {
    ...layoutSetting.value.bottomPadding,
    height: `${layoutSetting.value.bottomPadding.height}px`,
  } as CSSProperties,
}))

const settingPresetList = [
  {
    label: '無空白',
    data: {
      topPadding: {
        backgroundColor: '#FFF',
        height: 0,
      },
      bottomPadding: {
        backgroundColor: '#FFF',
        height: 0,
      },
    },
  },
  {
    label: '上空白',
    data: {
      topPadding: {
        backgroundColor: '#FFF',
        height: 80,
      },
      bottomPadding: {
        backgroundColor: '#FFF',
        height: 0,
      },
    },
  },
  {
    label: '上下空白',
    data: {
      topPadding: {
        backgroundColor: '#FFF',
        height: 80,
      },
      bottomPadding: {
        backgroundColor: '#FFF',
        height: 80,
      },
    },
  },
  {
    label: '上黑底',
    data: {
      topPadding: {
        backgroundColor: '#000',
        height: 80,
      },
      bottomPadding: {
        backgroundColor: '#000',
        height: 0,
      },
    },
  },
  {
    label: '上下黑底',
    data: {
      topPadding: {
        backgroundColor: '#000',
        height: 80,
      },
      bottomPadding: {
        backgroundColor: '#000',
        height: 80,
      },
    },
  },
]
function presetStyle(data: typeof layoutSetting['value']) {
  layoutSetting.value = clone(data)
}

const baseAlignTargetList = computed<AlignTarget[]>(() => {
  const result: AlignTarget[] = []
  const { x, y } = boardBounding

  const boardXCenter = x + boardBounding.width / 2
  const { topPadding, bottomPadding } = layoutSetting.value

  if (boardBounding.width > 0) {
    result.push({
      type: 'axis',
      x: boardXCenter,
    })
  }

  if (topPadding.height !== 0) {
    result.push({
      type: 'point',
      x: boardXCenter,
      y: y + topPadding.height / 2,
    })
    result.push({
      type: 'axis',
      y: y + topPadding.height / 2,
    })
  }

  if (bottomPadding.height !== 0) {
    result.push({
      type: 'point',
      x: boardXCenter,
      y: y + topPadding.height + imgSize.height + bottomPadding.height / 2,
    })
    result.push({
      type: 'axis',
      y: y + topPadding.height + imgSize.height + bottomPadding.height / 2,
    })
  }

  return result
})

const allItemCenterList = computed(() => [
  ...[...textMap.value.values()].map((item) => ({
    key: item.key,
    x: item.data?.x ?? 0,
    y: item.data?.y ?? 0,
  })),
  ...[...imageMap.value.values()].map((item) => ({
    key: item.key,
    x: item.data?.x ?? 0,
    y: item.data?.y ?? 0,
  })),
])

function buildAlignTargetList(itemKey: string): AlignTarget[] {
  const { x: originX, y: originY } = boardBounding

  return [
    ...baseAlignTargetList.value,
    ...allItemCenterList.value
      .filter(({ key }) => key !== itemKey)
      .flatMap(({ x, y }): AlignTarget[] => [
        { type: 'axis', x: originX + x },
        { type: 'axis', y: originY + y },
      ]),
  ]
}

const textItemList = computed(() => [...textMap.value.values()].map((item) => ({
  ...item,
  isEditing: targetKey.value === item.key,
  alignTargetList: buildAlignTargetList(item.key),
})))

const imageItemList = computed(() => [...imageMap.value.values()].map((item) => ({
  ...item,
  isEditing: targetKey.value === item.key,
  alignTargetList: buildAlignTargetList(item.key),
})))

// 儲存設定值至 localStorage
const isFromStorage = ref(true)
const storageKey = computed(() => `img-data:${props.data?.file}`)
useRafFn(() => {
  const { file } = props.data ?? {}
  if (!localStorage || !file) {
    return
  }

  localStorage.setItem(
    `${storageKey.value}:textMap`,
    JSON.stringify([...textMap.value.entries()]),
  )

  localStorage.setItem(
    `${storageKey.value}:layoutSetting`,
    JSON.stringify(layoutSetting.value),
  )
}, {
  fpsLimit: 2,
})
/** 從 localStorage 取得上次紀錄 */
async function initData() {
  isFromStorage.value = true

  const prevTextMap = pipe(
    localStorage.getItem(`${storageKey.value}:textMap`),
    (value) => {
      try {
        return JSON.parse(value ?? '')
      }
      catch {
        return undefined
      }
    },
  )
  if (prevTextMap) {
    textMap.value = new Map<string, TextItemData>(prevTextMap)
  }

  const prevImgSetting = pipe(
    localStorage.getItem(`${storageKey.value}:layoutSetting`),
    (value) => {
      try {
        return JSON.parse(value ?? '')
      }
      catch {
        return undefined
      }
    },
  )
  if (prevImgSetting) {
    layoutSetting.value = prevImgSetting
  }

  await nextFrame()
  await nextTick()
  isFromStorage.value = false
}
if (!import.meta.env.SSR) {
  initData()
}

defineExpose({
  boardRef,
  addImage,
  async blur() {
    targetKey.value = undefined
    layoutSettingVisible.value = false
    await nextFrame()
    await promiseTimeout(200)
  },
  toggleLayoutSettingVisible(value?: boolean) {
    layoutSettingVisible.value = value !== undefined
      ? value
      : !layoutSettingVisible.value
  },
  clean() {
    textMap.value.clear()
    imageMap.value.clear()
    triggerRef(textMap)
    triggerRef(imageMap)
  },
})
</script>

<style scoped lang="sass">
.watermark
  position: absolute
  font-size: 3vmax
  font-weight: 100
  mix-blend-mode: exclusion
  color: white
  opacity: 0.04
</style>
