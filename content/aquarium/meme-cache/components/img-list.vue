<template>
  <div class=" flex flex-col p-4 ">
    <transition name="opacity">
      <div
        v-if="props.list.length > 0"
        class=" text-center opacity-50 mb-6"
      >
        找到 {{ props.list.length }} 個候選項目 ੭ ˙ᗜ˙ )੭
      </div>
    </transition>

    <transition-group
      name="list"
      tag="div"
      class="flex flex-wrap justify-center gap-4"
      @before-leave="handleBeforeLeave"
    >
      <div
        v-for="item in props.list"
        :key="item.file"
        class="item flex gap-2"
        @click="handleClick(item)"
      >
        <div class="aspect-square max-w-[35dvw] bg-slate-100 cursor-pointer rounded-xl overflow-hidden">
          <img
            :src="`/memes/${item.file}`"
            loading="lazy"
            class=" object-contain h-full w-full rounded-none border-none"
          >
        </div>

        <div
          v-if="props.detailVisible"
          class=" text-sm w-full md:w-[30vw] "
        >
          <div class=" select-all">
            {{ item.file }}
          </div>
          <div>
            {{ item.describeZhTw }}
          </div>

          <div class="mt-2">
            {{ item.describe }}
          </div>

          <div class="mt-2">
            ocr: {{ item.ocr }}
          </div>
          <div class="mt-2">
            keyword: {{ item.keyword }}
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { MemeData } from '../type';

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
.item
  content-visibility: auto
  contain-intrinsic-size: 30svh
</style>
