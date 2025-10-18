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
        class=" object-contain rounded-none border-none  w-[100vw] md:w-[50vw]"
        draggable="false"
      >

      <textarea
        ref="target"
        v-model="text"
        class="target absolute"
      />

      <moveable
        :target="target"
        :draggable="true"
        :rotatable="true"
        @drag="onDrag"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { MemeData } from '../type'
import { computed, ref, useTemplateRef } from 'vue'
import Moveable from 'vue3-moveable'

interface Props {
  data?: MemeData;
}
const props = withDefaults(defineProps<Props>(), {})

const emit = defineEmits<{
  'update:model-value': [value: string];
}>()

const boardStyle = computed<CSSProperties>(() => ({
  backgroundImage: props.data
    ? `url('/memes/${props.data.file}')`
    : 'none',
}))

const boardRef = useTemplateRef('boardRef')

const text = ref('Hello World')
const target = useTemplateRef('target')
function onDrag({ transform }: any) {
  const el = target.value as HTMLElement | undefined
  if (el)
    el.style.transform = transform
}
</script>

<style scoped lang="sass">
</style>
