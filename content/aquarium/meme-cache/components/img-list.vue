<template>
  <div
    class="flex flex-col px-4"
    v-bind="containerProps"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data: chunk, index } in virtualList"
        :key="index"
        class="flex justify-center items-center gap-2 pb-4 h-[30vh]"
      >
        <div
          v-for="data in chunk"
          :key="index"
          class="flex-1 item flex justify-center items-center gap-2 h-full "
        >
          <div
            class="flex bg-gray-200 cursor-pointer rounded-xl h-full w-full"
            @click="handleClick(data)"
          >
            <img
              :src="`/memes/${data.file}`"
              loading="lazy"
              class="  object-contain h-full w-full border-none!"
            >
          </div>

          <div
            v-if="props.detailVisible"
            class=" text-sm w-full md:w-[30vw] max-w-[80vw]"
          >
            <div class=" select-all text-xs">
              {{ data.file }}
            </div>
            <div>
              {{ data.describeZhTw }}
            </div>

            <div class="mt-2">
              {{ data.describe }}
            </div>

            <div class="mt-2">
              ocr: {{ data.ocr }}
            </div>
            <div class="mt-2">
              keyword: {{ data.keyword }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MemeData } from '../type'
import { useVirtualList, useWindowSize } from '@vueuse/core'
import { chunk } from 'remeda';
import { computed, reactive, toRef, toRefs } from 'vue'

interface Props {
  list: MemeData[];
  detailVisible?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  detailVisible: false,
})
const emit = defineEmits<{
  select: [data: MemeData];
}>()

const windowSize = reactive(useWindowSize())

const chunkList = computed(() => {
  if (props.detailVisible) {
    return chunk(props.list, 1)
  }

  if (windowSize.width >= 1280) {
    return chunk(props.list, 5)
  }
  if (windowSize.width >= 1024) {
    return chunk(props.list, 4)
  }
  if (windowSize.width >= 768) {
    return chunk(props.list, 3)
  }

  return chunk(props.list, 2)
})
const { list: virtualList, containerProps, wrapperProps } = useVirtualList(
  chunkList,
  {
    itemHeight: windowSize.height * 0.3,
  },
)

function handleClick(data: MemeData) {
  emit('select', data)
}
</script>

<style scoped lang="sass">
// .item
//   content-visibility: auto
//   contain-intrinsic-size: 30vh
</style>
