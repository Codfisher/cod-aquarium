<template>
  <div
    v-if="props.data"
    class="flex flex-col items-center justify-center h-full"
  >
    <div class="border">
      <div
        ref="boardRef"
        class="flex  max-h-[80dvh] relative"
        @click.self="handleClick"
      >
        <img
          v-if="props.data"
          :src="`/memes/${props.data.file}`"
          class=" object-contain rounded-none border-none pointer-events-none  w-[100vw] md:w-[50vw] "
          draggable="false"
        >

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
  </div>
</template>

<script setup lang="ts">
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
  console.log(`🚀 ~ handleClick:`, targetItem.value)
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
  console.log(`🚀 ~ deleteItem:`, targetItem.value)
}

defineExpose({
  boardRef,
})
</script>

<style scoped lang="sass">
</style>
