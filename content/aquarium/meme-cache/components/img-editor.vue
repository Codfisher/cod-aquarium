<template>
  <div
    v-if="props.data"
    class="flex flex-col pt-[6vh] h-full bg-gray-200"
  >
    <div class="border">
      <div
        ref="boardRef"
        class="flex flex-col max-h-[80dvh] relative "
        @pointerdown.self="addItem"
      >
        <div
          :style="settingValue.topPadding"
          class="pointer-events-none"
        />

        <img
          v-if="props.data"
          :src="`/memes/${props.data.file}`"
          class=" object-contain rounded-none! border-none! pointer-events-none  w-[100vw] md:w-[50vw] "
          draggable="false"
        >

        <div
          :style="settingValue.bottomPadding"
          class="pointer-events-none"
        />

        <text-item
          v-for="item in list"
          :key="item.key"
          :model-value="item.data"
          :is-editing="item.isEditing"
          @click="editItem(item)"
          @delete="deleteItem(item)"
          @update:model-value="(data) => updateItem(item, data)"
        />
      </div>
    </div>

    <u-slideover
      v-model:open="imgSettingVisible"
      :overlay="false"
      side="bottom"
      class="z-[100] border border-[#EEE]"
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
        <div class="style-list col-span-4 flex gap-2">
          <div
            v-for="(item, i) in presetList"
            :key="i"
            class="text p-3 border border-[#DDD] rounded text-sm"
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
                  :style="{ backgroundColor: imgSetting.topPadding.backgroundColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="imgSetting.topPadding.backgroundColor"
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
                v-model="imgSetting.topPadding.height"
                :ui="{ base: 'p-1! px-2! text-center' }"
              >
                <template #trailing>
                  <span class=" opacity-40 text-xs">px</span>
                </template>
              </u-input>

              <u-button
                icon="i-lucide-x"
                @click="imgSetting.topPadding.height = 0"
              />
              <u-button
                icon="i-lucide-chevron-down"
                @click="imgSetting.topPadding.height -= 10"
              />
              <u-button
                icon="i-lucide-chevron-up"
                @click="imgSetting.topPadding.height += 10"
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
                  :style="{ backgroundColor: imgSetting.bottomPadding.backgroundColor }"
                />

                <template #content>
                  <u-color-picker
                    v-model="imgSetting.bottomPadding.backgroundColor"
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
                v-model="imgSetting.bottomPadding.height"
                :ui="{ base: 'p-1! px-2! text-center' }"
              >
                <template #trailing>
                  <span class=" opacity-40 text-xs">px</span>
                </template>
              </u-input>

              <u-button
                icon="i-lucide-x"
                @click="imgSetting.bottomPadding.height = 0"
              />
              <u-button
                icon="i-lucide-chevron-down"
                @click="imgSetting.bottomPadding.height -= 10"
              />
              <u-button
                icon="i-lucide-chevron-up"
                @click="imgSetting.bottomPadding.height += 10"
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
import { onClickOutside, promiseTimeout } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { clone, map, pipe } from 'remeda'
import { computed, ref, shallowRef, triggerRef, useTemplateRef } from 'vue'
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
      strokeWidth: 0,
      strokeColor: '#FFF',
      color: '#000000',
      backgroundColor: 'transparent',
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

const imgSettingVisible = ref(false)
const imgSetting = ref({
  topPadding: {
    backgroundColor: '#FFF',
    height: 80,
  },
  bottomPadding: {
    backgroundColor: '#FFF',
    height: 0,
  },
})

const settingValue = computed(() => ({
  topPadding: {
    ...imgSetting.value.topPadding,
    height: `${imgSetting.value.topPadding.height}px`,
  } as CSSProperties,
  bottomPadding: {
    ...imgSetting.value.bottomPadding,
    height: `${imgSetting.value.bottomPadding.height}px`,
  } as CSSProperties,
}))

const presetList = [
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
function presetStyle(data: typeof imgSetting['value']) {
  imgSetting.value = clone(data)
}

defineExpose({
  boardRef,
  async blur() {
    targetItem.value = undefined
    imgSettingVisible.value = false
    await promiseTimeout(500)
  },
  toggleImgSettingVisible(value?: boolean) {
    imgSettingVisible.value = value !== undefined
      ? value
      : !imgSettingVisible.value
  },
})
</script>

<style scoped lang="sass">
</style>
