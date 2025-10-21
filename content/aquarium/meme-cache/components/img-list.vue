<template>
  <div
    class=" flex flex-col p-4 overflow-auto h-[90svh]"
    v-bind="containerProps"
  >
    <transition name="opacity">
      <div
        v-if="props.list.length > 0"
        class=" text-center opacity-50 mb-6"
      >
        找到 {{ props.list.length }} 個候選項目 ੭ ˙ᗜ˙ )੭
      </div>
    </transition>

    <div v-bind="wrapperProps">
      <div
        v-for="{ data, index } in virtualList"
        :key="index"
        class="item flex flex-col md:flex-row gap-2 pb-4 h-[30vh]"
      >
        <div
          class="flex aspect-square w-[80vw] md:w-[30dvw] bg-gray-200 cursor-pointer rounded-xl overflow-hidden"
          @click="handleClick(data)"
        >
          <img
            :src="`/memes/${data.file}`"
            loading="lazy"
            class="  object-contain h-full w-full rounded-none! border-none!"
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
console.log('🚀 ~ windowSize.height * 0.3:', windowSize.height * 0.3);

/** 修正 transition-group 元素離開時動畫異常問題 */
function handleBeforeLeave(el: Element) {
  const { marginLeft, marginTop, width, height } = window.getComputedStyle(
    el,
  )
  if (!(el instanceof HTMLElement))
    return

  el.style.left = `${el.offsetLeft - Number.parseFloat(marginLeft)}px`
  el.style.top = `${el.offsetTop - Number.parseFloat(marginTop)}px`
  el.style.width = width
  el.style.height = height
}

function handleClick(data: MemeData) {
  emit('select', data)
}
</script>

<style scoped lang="sass">
// .item
//   content-visibility: auto
//   contain-intrinsic-size: 30vh
</style>
