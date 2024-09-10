<template>
  <div class=" flex flex-col items-center py-10">
    <div class="w-4/5 lg:w-[700px] flex flex-col gap-4">
      <!-- tag 過濾 -->
      <div class="tag-filter sticky top-[64px] p-4 rounded-lg">
        <p class="mb-4 hidden md:block">
          可以使用 Tag 快速過濾，或使用右上角的
          <icon name="material-symbols-light:search" />，精準搜尋文章！(๑•̀ㅂ•́)و✧
        </p>

        <div class="flex gap-2 mb-3 opacity-70">
          <badge
            type="gray"
            class="cursor-pointer"
            @click="selectAllTags"
          >
            <icon
              name="material-symbols:select"
              class=" mr-1"
            />
            全選
          </badge>

          <badge
            type="gray"
            class="cursor-pointer"
            @click="clearAllTags"
          >
            <icon
              name="material-symbols:remove-selection"
              class=" mr-1"
            />
            清除
          </badge>
        </div>

        <div class="flex flex-wrap gap-2 max-h-[12vh] overflow-auto">
          <badge
            v-for="tag in tagList"
            :key="tag.name"
            class="tag-chip cursor-pointer duration-300"
            :class="{ 'badge-active': tag.selected }"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </badge>
        </div>
      </div>

      <h1 class="text-4xl font-bold mt-6 p-4">
        文章列表
      </h1>

      <div
        class="link-container"
        :style="linkContainerStyle"
      >
        <!-- 文章列表 -->
        <transition-group
          ref="linkListRef"
          name="list"
          tag="div"
          class="flex flex-col gap-4"
          @before-leave="handleBeforeLeave"
        >
          <nuxt-link
            v-for="content in articles"
            :key="content._path"
            :to="content._path"
            class="article-link p-4 flex gap-2 rounded-lg"
          >
            <div class="flex flex-col items-center md:items-start flex-1 gap-2">
              <prose-img
                v-if="content.image"
                :src="content.image"
                class="block md:hidden rounded-lg"
                width="120"
                height="120"
              ></prose-img>

              <div
                v-if="content.date"
                class="text-xs opacity-50"
              >
                {{ content.date }}
              </div>

              <div class="w-full text-center md:text-left text-xl md:text-2xl font-bold text-pretty">
                {{ content.title }}
              </div>

              <div
                v-if="content.tags"
                class="flex flex-wrap items-center justify-center gap-2"
              >
                <div
                  v-for="tag in content.tags"
                  :key="tag"
                  class="tag px-3 py-1 rounded-full opacity-90 text-xs "
                >
                  {{ tag }}
                </div>
              </div>

              <div class="description w-full text-sm opacity-80">
                {{ content.description }}
              </div>
            </div>

            <prose-img
              v-if="content.image"
              :src="content.image"
              class="hidden md:block rounded-lg shadow-lg"
              width="160"
              height="160"
            ></prose-img>
          </nuxt-link>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';

const linkListRef = ref<HTMLElement>();
const { height: linkListHeight } = useElementSize(linkListRef);
const linkContainerStyle = computed(() => ({
  height: `${linkListHeight.value}px`
}));

const selectedTags = ref<string[]>([]);
watch(selectedTags, () => {
  refreshArticles();
}, { deep: true })

function toggleTag(name: string) {
  const index = selectedTags.value.indexOf(name);

  if (index < 0) {
    selectedTags.value.push(name);
  } else {
    selectedTags.value.splice(index, 1);
  }
}

function selectAllTags() {
  selectedTags.value = tagList.value.map(({ name }) => name);
}
function clearAllTags() {
  selectedTags.value = [];
}

const {
  data: tags,
  refresh: refreshTags,
} = await useAsyncData('tags',
  async () => {
    const result = new Set<string>();

    const data: Array<{ tags: string[] }> = await queryContent()
      .only(['tags'])
      .find()

    data
      .flatMap(({ tags }) => tags)
      .forEach((tag) => {
        if (!tag) return;
        result.add(tag);
      });

    return [...result];
  },
  {
    immediate: false,
  },
)

const tagList = computed(() => {
  return tags.value?.map((name) => {
    const selected = selectedTags.value.indexOf(name) >= 0;

    return { name, selected }
  }) ?? [];
});

const {
  data: articles,
  refresh: refreshArticles,
} = await useAsyncData('articles',
  async () => {
    const data = await queryContent()
      .where({
        _path: { $regex: 'blog' },
        _type: 'markdown',
        _draft: false,
        tags: { $in: selectedTags.value },
      })
      .without(['body'])
      .sort({ date: -1 })
      .find();

    if (data.length === 0) {
      return [
        {
          title: '找不到文章 ( ´•̥̥̥ ω •̥̥̥` )',
          description: '請嘗試其他標籤',
          _path: '',
        }
      ]
    }

    const result = data.map((datum) => {
      const date = dayjs(`${datum.date}`, 'YYYYMMDD').format('YYYY/MM/DD');

      return { ...datum, date }
    }) as Array<{
      title: string,
      description: string,
      _path: string,
      image?: string,
      tags?: string[],
      date?: string,
    }>

    return result;
  },
  {
    immediate: false,
  },
)

async function init() {
  await refreshTags();
  selectedTags.value = [...tags.value ?? []];
}
init();

/** 修正 transition-group 元素離開時動畫異常問題 */
function handleBeforeLeave(el: Element) {
  const { marginLeft, marginTop, width, height } = window.getComputedStyle(
    el
  );
  if (!(el instanceof HTMLElement)) return;

  el.style.left = `${el.offsetLeft - parseFloat(marginLeft)}px`;
  el.style.top = `${el.offsetTop - parseFloat(marginTop)}px`;
  el.style.width = width;
  el.style.height = height;
}
</script>

<style scoped lang="sass">
.tag-filter
  z-index: 1
  backdrop-filter: blur(10px)
  background: light-dark(rgba(#FFF, 0.8), rgba(#333, 0.8))
  border-width: 1px
  border-color: light-dark(#F0F0F0, #000)

.tag-chip 
  opacity: 0.4
.badge-active 
  opacity: 1

.description
  white-space: unset
  text-wrap: pretty
.tag
  background: light-dark(#AAA, #FFF)
  color: light-dark(#FFF, #000)
  letter-spacing: 0.6px


.link-container
  will-change: height
  transition-duration: 0.8s
  transition-timing-function: cubic-bezier(0.83, 0, 0.17, 1)

.article-link
  cursor: pointer
  transition: all 0.3s ease
  &:hover
    background: light-dark(#f9f9f9, rgba(#333, 0.8))

.list-move, .list-enter-active, .list-leave-active 
  transition: all 0.6s cubic-bezier(0.83, 0, 0.17, 1)
.list-enter-from, .list-leave-to 
  opacity: 0
  transform: scale(0.96)
.list-leave-active 
  position: absolute
</style>