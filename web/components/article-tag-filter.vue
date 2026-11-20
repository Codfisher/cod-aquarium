<template>
  <!-- 標籤篩選：不選任何標籤時顯示全部文章，選了才只顯示同時含有這些標籤的文章 -->
  <section
    class="tag-filter w-full lg:w-auto flex-1 sticky top-[4.5rem] md:top-[5.5rem] p-3 md:p-4 rounded-lg"
    aria-labelledby="tag-filter-title"
  >
    <div class="flex items-center gap-3">
      <div
        id="tag-filter-title"
        role="heading"
        aria-level="2"
        class="filter-title text-sm font-bold"
      >
        依標籤篩選
      </div>

      <u-button
        class="md:hidden"
        :icon="isFilterVisible ? 'i-material-symbols:keyboard-arrow-up-rounded' : 'i-material-symbols:keyboard-arrow-down-rounded'"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-expanded="isFilterVisible"
        aria-controls="tag-filter-list"
        :aria-label="isFilterVisible ? '收合標籤' : '展開標籤'"
        @click="isFilterVisible = !isFilterVisible"
      />

      <u-button
        v-if="selectedTagList.length > 0"
        class="ml-auto"
        color="neutral"
        variant="outline"
        size="xs"
        @click="clearAllTags"
      >
        清除篩選（{{ selectedTagList.length }}）
      </u-button>
    </div>

    <p class="filter-hint hidden md:block text-sm mt-2 mb-3">
      點標籤只看相關文章，或用「搜尋（Ctrl+K）」精準找到文章
      <span class="text-nowrap">(๑•̀ㅂ•́)و✧</span>
    </p>

    <div
      id="tag-filter-list"
      class="grid duration-300 ease-out md:grid-rows-[1fr]"
      :class="isFilterVisible ? 'grid-rows-[1fr] pt-2 md:pt-0' : 'grid-rows-[0fr]'"
    >
      <ul class="plain-list flex flex-wrap gap-2 overflow-hidden min-h-0 md:max-h-[24vh] lg:max-h-none md:overflow-auto">
        <li
          v-for="tag in tagList"
          :key="tag.name"
        >
          <u-button
            :color="tag.selected ? 'primary' : 'neutral'"
            :variant="tag.selected ? 'solid' : 'soft'"
            size="xs"
            class="rounded-full"
            :aria-pressed="tag.selected"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </u-button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

/** 文章總覽的標籤篩選區。從 article-overview 拆出來，以閒置時 hydration 載入：
 * 60 個 UButton 與 90 篇文章原本在同一個 hydration 長任務裡，拆開後各自成為較短的任務
 */
interface Props {
  /** 全部標籤名稱 */
  tagNameList: string[];
}
const props = defineProps<Props>()
const selectedTagList = defineModel<string[]>('selectedTagList', { required: true })

const isFilterVisible = ref(false)
const tagList = computed(() => props.tagNameList.map((name) => ({
  name,
  selected: selectedTagList.value.includes(name),
})))

function toggleTag(name: string) {
  selectedTagList.value = selectedTagList.value.includes(name)
    ? selectedTagList.value.filter((item) => item !== name)
    : [...selectedTagList.value, name]
}

function clearAllTags() {
  selectedTagList.value = []
}
</script>

<style scoped lang="sass">
.tag-filter
  z-index: 1
  background: light-dark(oklch(0.99 0.005 175), oklch(0.21 0.02 190))
  border-width: 1px
  border-color: light-dark(oklch(0.92 0.01 175), oklch(0.25 0.01 175))

/* .vp-doc 的清單規則（縮排、項目符號、li 間距）不在 cascade layer 內，scoped 選擇器的權重才壓得過 */
.plain-list
  list-style: none
  padding: 0
  margin: 0
  > li
    margin: 0

.filter-hint
  color: var(--vp-c-text-2)
</style>
