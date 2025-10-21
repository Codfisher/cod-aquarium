<template>
  <div
    class="flex flex-col px-4"
    v-bind="containerProps"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data } in virtualList"
        :key="data.file"
        class="item flex justify-center items-center gap-2 pb-4 h-[30vh] "
      >
        <div
          class="flex aspect-square h-[28vh] md:max-w-[30dvw] bg-gray-200 cursor-pointer rounded-xl"
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
</template>

<script setup lang="ts">
import type { MemeData } from '../type'
import { useVirtualList, useWindowSize } from '@vueuse/core'
import { reactive, toRef, toRefs } from 'vue'

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

const { list } = toRefs(props)
const { list: virtualList, containerProps, wrapperProps } = useVirtualList(
  list,
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
