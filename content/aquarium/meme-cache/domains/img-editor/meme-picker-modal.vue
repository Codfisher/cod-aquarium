<template>
  <u-modal
    v-model:open="open"
    title="選擇迷因"
    fullscreen
    class="z-80"
    :ui="{
      overlay: 'z-80',
      content: 'z-80',
      header: 'hidden',
      body: 'p-0 h-full',
    }"
  >
    <template #body>
      <div class="flex flex-col h-full">
        <div class="py-4 shrink-0 text-center text-sm opacity-80">
          {{ tipText }}
        </div>

        <img-list
          ref="imgListRef"
          :list="searchedList"
          class="flex-1 min-h-0 overflow-auto"
          @select="handleSelect"
        />

        <div class="shrink-0 flex gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-black">
          <u-input
            ref="inputRef"
            v-model.trim="keyword"
            placeholder="輸入關鍵字或任何線索 (・∀・)９"
            class="w-full"
            :ui="{
              base: 'py-4 px-6 rounded-full',
              trailing: 'pe-4',
            }"
            data-clarity-unmask="true"
            @keydown.enter="handleEnter"
          >
            <template
              v-if="keyword?.length"
              #trailing
            >
              <u-button
                color="neutral"
                variant="link"
                size="sm"
                icon="i-material-symbols:cancel-rounded"
                aria-label="Clear input"
                @click="keyword = ''"
              />
            </template>
          </u-input>

          <u-button
            icon="i-material-symbols:close-rounded"
            color="error"
            size="sm"
            @click="open = false"
          />
        </div>
      </div>
    </template>
  </u-modal>
</template>

<script setup lang="ts">
import type { MemeData } from '../meme/type'
import { promiseTimeout, useActiveElement, watchThrottled } from '@vueuse/core'
import { shuffle } from 'remeda'
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { nextFrame } from '../../../../../web/common/utils'
import { useMemeSearch } from '../meme/use-meme-search'
import ImgList from '../img-list/img-list.vue'

interface Props {
  dataList: MemeData[];
}
const props = withDefaults(defineProps<Props>(), {})

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  select: [data: MemeData];
}>()

const inputRef = useTemplateRef('inputRef')
const imgListRef = useTemplateRef('imgListRef')

const keyword = ref('')
const searchedList = shallowRef<MemeData[]>([])

const { search: searchMeme } = useMemeSearch()

const activeElement = useActiveElement()
function handleEnter() {
  activeElement.value?.blur()
}

let searchId = 0
watchThrottled(() => [keyword.value, props.dataList], async () => {
  const currentId = ++searchId

  if (!keyword.value) {
    searchedList.value = shuffle(props.dataList)
    return
  }

  const result = await searchMeme(props.dataList, keyword.value)
  if (currentId !== searchId)
    return

  searchedList.value = result
}, {
  deep: true,
  throttle: 300,
  immediate: true,
})

const tipText = computed(() => {
  if (!keyword.value) {
    return '輸入關鍵字搜尋迷因 ԅ(´∀` ԅ)'
  }
  if (searchedList.value.length === 0) {
    return '沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )'
  }
  return `找到 ${searchedList.value.length} 個候選項目 ੭ ˙ᗜ˙ )੭`
})

watch(open, async (isOpen) => {
  if (!isOpen)
    return

  await nextTick()
  await nextFrame()
  await promiseTimeout(100)
  imgListRef.value?.scrollTo(0)
  inputRef.value?.inputRef?.focus()
})

watch(keyword, async () => {
  await nextFrame()
  await promiseTimeout(200)
  imgListRef.value?.scrollTo(0)
})

function handleSelect(data: MemeData) {
  emit('select', data)
  open.value = false
}
</script>
