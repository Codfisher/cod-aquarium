<template>
  <client-only>
    <u-app
      :toaster="{
        position: 'top-right',
      }"
    >
      <div
        class="meme-cache flex flex-col"
        @click="handleClick"
      >
        <transition
          name="opacity"
          mode="out-in"
        >
          <div
            ref="tipRef"
            :key="tipText"
            class=" whitespace-pre  text-center py-6 opacity-80 "
            v-html="tipText"
          />
        </transition>

        <img-list
          ref="imgListRef"
          :list="filteredList"
          :detail-visible="settings.detailVisible"
          :style="{ height: listHeight }"
          class="overflow-auto"
          @select="handleSelect"
        />

        <div
          ref="toolbarRef"
          class="toolbar flex gap-2 w-full fixed left-0 p-4 bg-white dark:bg-black "
          :style="toolbarStyle"
        >
          <u-input
            ref="inputRef"
            v-model.trim="keyword"
            placeholder="輸入關鍵字或任何線索 (・∀・)９"
            class="w-full "
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

          <u-dropdown-menu
            :items="mainMenuItems"
            :ui="{
              content: 'z-70',
              item: 'p-2',
            }"
          >
            <u-button
              icon="i-material-symbols:menu-rounded"
              variant="ghost"
              color="neutral"
            />

            <template #detail>
              <u-checkbox
                v-model="settings.detailVisible"
                label="顯示細節"
              />
            </template>

            <template #blur-filter>
              <u-tooltip
                text="過濾模糊圖片，分級由演算法自動評估"
                :ui="{ content: 'z-[9999]' }"
              >
                <div class="flex items-center gap-3 text-sm">
                  <span class="shrink-0">
                    模糊度
                  </span>
                  <u-slider
                    v-model="filterOptions.blurFilter"
                    :min="0"
                    :max="2"
                    :step="1"
                    size="xs"
                    class="w-24"
                  />
                  <span class="text-xs opacity-60 shrink-0 tabular-nums">
                    {{ blurFilterLabel }}
                  </span>
                </div>
              </u-tooltip>
            </template>
          </u-dropdown-menu>
        </div>
      </div>

      <img-editor-modal
        v-model:open="editorVisible"
        :data="targetMeme"
        :meme-data-list="memeDataList"
      />

      <div class=" fixed right-0 top-0 p-2 px-3 text-xs opacity-10">
        {{ version }}
      </div>
    </u-app>
  </client-only>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { MemeData } from './domains/meme/type'
import { promiseTimeout, useActiveElement, useColorMode, useElementSize, useWindowSize, watchThrottled } from '@vueuse/core'
import { filter, isNullish, isTruthy, pipe, shuffle } from 'remeda'
import { computed, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { BlurLevel } from '../../../.vitepress/utils/blur-level'
import { nextFrame } from '../../../web/common/utils'
import { usePageNoScroll } from '../../../web/composables/use-page-no-scroll'
import { useKeywordQuery } from './composables/use-keyword-query'
import { useStickyToolbar } from './composables/use-sticky-toolbar'
import ImgEditorModal from './domains/img-editor/img-editor-modal.vue'
import ImgList from './domains/img-list/img-list.vue'
import { useMemeData } from './domains/meme/use-meme-data'
import { useMemeSearch } from './domains/meme/use-meme-search'

const version = '0.6.0'

const uploadUrl = 'https://drive.google.com/drive/u/2/folders/1UUpzhZPdI-i_7PhCYZNDS-BxbulATMlN'

const isDev = import.meta.env.DEV

// Nuxt UI 接管 vitepress 的 dark 設定，故改用 useColorMode
const colorMode = useColorMode()

const toast = useToast()

const windowSize = reactive(useWindowSize())

const { memeDataMap, memeDataList } = useMemeData()
const activeElement = useActiveElement()
function handleEnter() {
  activeElement.value?.blur()
}

const inputRef = useTemplateRef('inputRef')
const keyword = useKeywordQuery()
const settings = ref({
  detailVisible: false,
})

const filterOptions = ref({
  /** 0 = 全部、1 = 排除非常模糊、2 = 只看清晰 */
  blurFilter: 0,
})

const BLUR_FILTER_LABEL_LIST = ['全部', '微糊', '清晰'] as const
const blurFilterLabel = computed(() => BLUR_FILTER_LABEL_LIST[filterOptions.value.blurFilter] ?? '全部')

const searchedList = shallowRef<MemeData[]>([])
const filteredList = computed(() => filterList(searchedList.value))

const mainMenuItems = pipe(
  [
    filter([
      isDev
        ? { slot: 'detail' }
        : undefined,
      { slot: 'blur-filter' },
      {
        icon: 'i-lets-icons:sort-random',
        label: '洗牌',
        onSelect() {
          searchedList.value = shuffle(searchedList.value)
        },
      },
      {
        icon: 'i-material-symbols:nightlight-badge-rounded',
        label: '切換日夜模式',
        onSelect() {
          colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
        },
      } satisfies DropdownMenuItem,
    ], isTruthy),
    [
      {
        icon: 'i-ph:fish-simple-duotone',
        label: '關於鱈魚',
        onSelect() {
          window.open('/', '_blank')
        },
      },
      {
        icon: 'i-material-symbols:favorite',
        label: '鼓勵我',
        onSelect() {
          window.open('https://portaly.cc/codfish/support', '_blank')
        },
      },
    ] satisfies DropdownMenuItem[],
  ],
  filter(isTruthy),
)

const editorVisible = ref(false)
const targetMeme = shallowRef<MemeData>()
function handleSelect(data: MemeData) {
  targetMeme.value = data
  editorVisible.value = true
}

const { search: searchMeme } = useMemeSearch()

function filterList(list: MemeData[]): MemeData[] {
  const filter = filterOptions.value.blurFilter
  if (filter === 0)
    return list

  const maxAllowedLevel = filter === 1 ? BlurLevel.LEVEL_1 : BlurLevel.LEVEL_0
  return list.filter((item) => {
    if (isNullish(item.blurLevel))
      return true
    return item.blurLevel <= maxAllowedLevel
  })
}

let searchId = 0
watchThrottled(() => [keyword.value, memeDataMap.value], async () => {
  const currentId = ++searchId

  if (!keyword.value) {
    searchedList.value = shuffle(memeDataList.value)
    return
  }

  const result = await searchMeme(memeDataList.value, keyword.value)
  // 避免舊的非同步結果覆蓋新的搜尋
  if (currentId !== searchId)
    return

  searchedList.value = result
}, {
  deep: true,
  throttle: 300,
  immediate: true,
})

const imgListRef = useTemplateRef('imgListRef')
watch(keyword, async () => {
  await nextFrame()
  await promiseTimeout(200)
  imgListRef.value?.scrollTo(0)
  window.scrollTo({ top: 0 })
})

const toolbarRef = useTemplateRef('toolbarRef')
const toolbarSize = reactive(useElementSize(toolbarRef, undefined, {
  box: 'border-box',
}))
const { toolbarStyle } = useStickyToolbar(toolbarRef)

const tipRef = useTemplateRef('tipRef')
const tipSize = reactive(useElementSize(tipRef, undefined, {
  box: 'border-box',
}))

const listHeight = computed(
  () => `${windowSize.height - toolbarSize.height - tipSize.height}px`,
)

const tipText = computed(() => {
  if (!keyword.value) {
    return '常常找不到記憶中的梗圖嗎？\n我來幫你找找 ԅ(´∀` ԅ)'
  }

  if (keyword.value && filteredList.value.length === 0) {
    return [
      '沒找到相關圖片 ( ´•̥̥̥ ω •̥̥̥` )<br>可以<a href="',
      uploadUrl,
      '" target="_blank" class="text-teal-600 font-extrabold">在此上傳圖片</a>，我會努力建檔',
    ].join('')
  }

  return `找到 ${filteredList.value.length} 個候選項目 ੭ ˙ᗜ˙ )੭`
})

onMounted(async () => {
  toast.add({
    icon: 'line-md:emoji-grin',
    title: '歡迎來到快取梗圖 ( ´ ▽ ` )ﾉ',
    description: [
      '常常找不到記憶中的梗圖嗎？在下方輸入框輸入任何線索，我來幫你找找 ԅ(´∀` ԅ)',
    ].join(''),
    duration: 60000,
    actions: [{
      icon: 'line-md:uploading-loop',
      label: '按此投稿圖片',
      color: 'neutral',
      class: 'py-1 px-2',
      variant: 'outline',
      onClick: () => {
        window.open(uploadUrl)
      },
    }],
  })

  await nextFrame()
  inputRef.value?.inputRef?.focus()
})

function handleClick() {
  if (keyword.value === '') {
    inputRef.value?.inputRef?.focus()
  }
}

usePageNoScroll()
</script>

<style scoped lang="sass">
</style>

<style lang="sass">
.meme-cache
  position: fixed
  top: 0
  left: 0
  width: 100vw
  height: 100dvh

.opacity
  &-enter-active, &-leave-active
    transition-duration: 0.3s
  &-enter-from, &-leave-to
    opacity: 0 !important

.list
  &-move, &-enter-active, &-leave-active
    transition: all 0.5s ease
  &-enter-from, &-leave-to
    opacity: 0
    transform: translateY(3px)
  &-leave-active
    position: absolute
</style>
