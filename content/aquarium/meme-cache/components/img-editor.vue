<template>
  <div
    v-if="props.data"
    class="flex flex-col items-center justify-center h-full"
  >
    <div
      ref="boardRef"
      class="flex border max-h-[80dvh] relative"
    >
      <img
        v-if="props.data"
        :src="`/memes/${props.data.file}`"
        class=" object-contain rounded-none border-none  w-[100vw] md:w-[50vw] "
        draggable="false"
      >

      <text-item />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemeData } from '../type'
import { useTemplateRef } from 'vue'
import TextItem from './text-item.vue'

interface Props {
  data?: MemeData;
}
const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

const boardRef = useTemplateRef('boardRef')
</script>

<style scoped lang="sass">
</style>
