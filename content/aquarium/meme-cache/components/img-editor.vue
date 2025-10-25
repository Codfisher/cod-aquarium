<template>
  <div
    v-if="props.data"
    class="py-[6vh] flex flex-col h-full bg-gray-300 overflow-auto relative"
  >
    <div class="flex-1 flex flex-col items-center bg-gray-300 ">
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
          :src="`/memes/${props.data.file}`"
          class=" object-contain rounded-none! border-none! pointer-events-none w-[80vw] md:max-w-[50vw]!"
          draggable="false"
        >

        <div
          :style="settingValue.bottomPadding"
          class="pointer-events-none shrink-0"
        />

        <text-item
          v-for="item in list"
          :key="item.key"
          :model-value="item.data"
          :is-editing="item.isEditing"
          :fix-origin="!isFromStorage"
          :auto-focus="!isFromStorage"
          @click="editItem(item)"
          @delete="deleteItem(item)"
          @update:model-value="(data) => updateItem(item, data)"
        />
      </div>
    </div>

    <u-popover
      :ui="{
        content: 'z-[9999] p-2 flex flex-col gap-2 text-sm',
      }"
      arrow
    >
      <div class="absolute left-0 top-0 p-4! opacity-60">
        <u-icon
          name="i-material-symbols:help-outline-rounded"
          class="size-8 text-white"
        />
      </div>

      <template #content>
        <div>
          點擊即可在指定位置新增文字
        </div>
        <div class="">
          拖動文字可以移動文字
        </div>
        <div class="">
          兩指可以旋轉文字
        </div>
      </template>
    </u-popover>

    <u-slideover
      v-model:open="layoutSettingVisible"
      :overlay="false"
      side="bottom"
      class="z-[100] border border-[#EEE] opacity-95"
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
            class="text p-3 border border-[#DDD] rounded text-sm cursor-pointer"
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
                :ui="{ base: 'p-1! px-2! text-center' }"
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
                :ui="{ base: 'p-1! px-2! text-center' }"
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
import type { MemeData } from '../type'
import { onClickOutside, promiseTimeout, useElementSize, useIntervalFn, useRafFn, useWindowSize, watchThrottled } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { clone, map, pipe, sum } from 'remeda'
import { computed, nextTick, reactive, ref, shallowRef, triggerRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../web/common/utils'
import TextItem from './text-item.vue'

interface TextItemData {
  data: ComponentProps<typeof TextItem>['modelValue'];
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

const targetItem = ref<TextItemData>()
const textMap = shallowRef(new Map<string, TextItemData>())

onClickOutside(boardRef, () => {
  targetItem.value = undefined
})

const list = computed(() => [...textMap.value.values()].map((item) => ({
  ...item,
  isEditing: targetItem.value?.key === item.key,
})))

function addItem(event: PointerEvent) {
  if (targetItem.value) {
    targetItem.value = undefined
    return
  }

  const rect = boardRef.value?.getBoundingClientRect()
  if (!rect)
    return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const newItem = {
    key: nanoid(),
    data: {
      text: '點擊編輯',
      x,
      y,
      angle: 0,
      fontSize: 16,
      fontWeight: 400,
      strokeWidth: 4,
      strokeColor: '#FFF',
      color: '#000',
      backgroundColor: '#FFF',
      backgroundOpacity: 0,
    },
  }

  textMap.value.set(newItem.key, newItem)
  triggerRef(textMap)
  targetItem.value = newItem
}

function editItem(item: TextItemData) {
  targetItem.value = item
}
function updateItem(item: TextItemData, data: TextItemData['data']) {
  textMap.value.set(item.key, {
    ...item,
    data,
  })
}
function deleteItem(item: TextItemData) {
  textMap.value.delete(item.key)
  triggerRef(textMap)

  targetItem.value = undefined
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
    `${storageKey.value}:imgSetting`,
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
    localStorage.getItem(`${storageKey.value}:imgSetting`),
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
  async blur() {
    targetItem.value = undefined
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
    triggerRef(textMap)
  },
})
</script>

<style scoped lang="sass">
</style>
