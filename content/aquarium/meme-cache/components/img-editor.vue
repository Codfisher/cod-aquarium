<template>
  <div
    v-if="props.data"
    class="flex flex-col items-center justify-center h-full"
  >
    <div class="border">
      <div
        ref="boardRef"
        class="flex flex-col max-h-[80dvh] relative"
        @click.self="handleClick"
      >
        <div :style="settingValue.topPadding" />

        <img
          v-if="props.data"
          :src="`/memes/${props.data.file}`"
          class=" object-contain rounded-none! border-none! pointer-events-none  w-[100vw] md:w-[50vw] "
          draggable="false"
        >

        <div :style="settingValue.bottomPadding" />

        <text-item
          v-for="item in list"
          :key="item.key"
          :model-value="item.data"
          :is-editing="item.isEditing"
          @click="editItem(item)"
          @delete="deleteItem(item)"
        />
      </div>
    </div>

    <USlideover
      v-model:open="imgSettingVisible"
      :overlay="false"
      side="bottom"
      class="z-[100] border border-[#EEE]"
      :ui="{
        header: 'min-h-auto ',
        body: 'grid grid-cols-3 gap-1',
      }"
    >
      <template #header="{ close }">
        <div class=" flex w-full">
          <div class="flex-1 text-sm opacity-80">
            圖片設定
          </div>

          <UButton
            icon="i-lucide-x"
            @click="close"
          />
        </div>
      </template>

      <template #body>
        <div class=" col-span-3 text-xs opacity-60">
          頂部空間
        </div>

        <div class=" col-span-1 text-sm">
          顏色
        </div>
        <div class=" col-span-2 text-sm">
          顏色
        </div>

        <div class=" col-span-1 text-sm">
          尺寸
        </div>
        <div class=" col-span-2 text-sm">
          尺寸
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ComponentProps } from 'vue-component-type-helpers'
import type { MemeData } from '../type'
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

const list = computed(() => [...textMap.value.values()].map((item) => ({
  ...item,
  isEditing: targetItem.value?.key === item.key,
})))

function handleClick(event: MouseEvent) {
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
    key: crypto.randomUUID(),
    data: {
      text: '點擊編輯',
      x,
      y,
      fontSize: 16,
      fontWeight: 400,
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
function deleteItem(item: TextItemData) {
  textMap.value.delete(item.key)
  triggerRef(textMap)

  targetItem.value = undefined
}

const imgSettingVisible = ref(false)
const imgSetting = ref({
  topPadding: {
    backgroundColor: '$FFF',
    height: 0,
  },
  bottomPadding: {
    backgroundColor: '$FFF',
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

defineExpose({
  boardRef,
  toggleImgSettingVisible(value?: boolean) {
    imgSettingVisible.value = value !== undefined
      ? value
      : !imgSettingVisible.value
  },
})
</script>

<style scoped lang="sass">
</style>
