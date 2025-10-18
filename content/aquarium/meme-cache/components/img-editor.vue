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
          v-for="data in textList"
          :key="data.key"
          :model-value="data"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemeData } from '../type'
import { ref, useTemplateRef } from 'vue'
import TextItem from './text-item.vue'
import { ComponentProps } from 'vue-component-type-helpers';

type TextItemData = ComponentProps<typeof TextItem>['modelValue'] & {
  key: string
}

interface Props {
  data?: MemeData;
}
const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

const boardRef = useTemplateRef('boardRef')

const textList = ref<TextItemData[]>([])

function handleClick(event: MouseEvent) {
  const rect = boardRef.value?.getBoundingClientRect()
  if (!rect) return

  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  textList.value.push({
    key: crypto.randomUUID(),
    text: '點擊編輯',
    x,
    y,
    fontSize: 16,
    fontWeight: 400,
    color: '#000000',
    backgroundColor: 'transparent',
  })
}

defineExpose({
  boardRef,
})
</script>

<style scoped lang="sass">
</style>
