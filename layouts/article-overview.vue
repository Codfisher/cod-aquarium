<template>
  <div class=" flex flex-col items-center py-10">
    <div class="w-4/5 lg:w-1/2 flex flex-col gap-4">
      <!-- tag 過濾 -->
      <div class="tag-filter sticky top-[64px] p-4 rounded-lg">
        <p class="mb-4">可以使用 Tag 快速過濾文章！(๑•̀ㅂ•́)و✧</p>

        <div class="flex gap-2">
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
            class="article-link p-4 flex flex-col gap-2 rounded-lg"
          >
            <div
              v-if="content.date"
              class="text-xs opacity-50"
            >
              {{ content.date }}
            </div>

            <div class="text-2xl font-bold">
              {{ content.title }}
            </div>
            <div class="text-sm opacity-50">
              {{ content.description }}
            </div>

            <div
              v-if="content.tags"
              class="flex gap-2"
            >
              <div
                v-for="tag in content.tags"
                :key="tag"
                class="border px-3 py-1 rounded-full bg-gray-100 dark:text-black opacity-80 text-xs"
              >
                {{ tag }}
              </div>
            </div>
          </nuxt-link>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { pipe } from 'remeda';

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
          title: '沒有符合條件的文章。( ´•̥̥̥ ω •̥̥̥` )',
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

.tag-chip 
  opacity: 0.4
.badge-active 
  opacity: 1

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