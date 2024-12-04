<template>
  <div class=" flex flex-col items-center w-full">
    <div class="flex flex-col lg:flex-row-reverse  justify-center items-start gap-4 w-full">
      <!-- tag 過濾 -->
      <div class="tag-filter flex-1 sticky top-[5.5rem] p-4 rounded-lg">
        <div class="mb-4 hidden md:block">
          可以根據 Tag 快速過濾，或使用「搜尋（Ctrl+K）」，精準找到文章！
          <span class="text-nowrap">(๑•̀ㅂ•́)و✧</span>
        </div>

        <div class="flex gap-2 mb-3 opacity-70">
          <div
            role="button"
            class="cursor-pointer text-sm border p-1 px-4 rounded-full"
            @click="selectAllTags"
          >
            全選
          </div>

          <div
            role="button"
            class="cursor-pointer text-sm border p-1 px-4 rounded-full"
            @click="clearAllTags"
          >
            清除
          </div>
        </div>

        <div class="flex flex-wrap gap-2 max-h-[12vh] lg:max-h-none overflow-auto">
          <badge
            v-for="tag in tagList"
            :key="tag.name"
            class="tag-chip cursor-pointer duration-300 text-sm py-1 rounded-full"
            :class="{ 'badge-active': tag.selected }"
            @click="toggleTag(tag.name)"
          >
            {{ tag.name }}
          </badge>
        </div>
      </div>

      <div class="flex flex-col gap-4 flex-[3]">
        <h1 class="text-4xl font-bold">
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
            class="flex flex-col gap-10"
            @before-leave="handleBeforeLeave"
          >
            <div
              v-for="article in articleList"
              :key="article.link"
              role="link"
              class="article-link flex items-center gap-2 rounded-sm"
              @click="to(article.link)"
            >
              <div class="flex flex-col items-center md:items-start flex-1 gap-2">
                <img
                  v-if="article.frontmatter.image"
                  :src="article.frontmatter.image"
                  class="block md:hidden rounded-lg"
                  width="120"
                  height="120"
                  backlight
                  loading="lazy"
                >

                <div
                  v-if="article.frontmatter.date"
                  class="text-xs opacity-50"
                >
                  {{ article.frontmatter.date }}
                </div>

                <div class="w-full text-center md:text-left text-xl md:text-2xl font-bold text-pretty">
                  {{ article.frontmatter.title }}
                </div>

                <div
                  v-if="article.frontmatter.tags"
                  class="flex flex-wrap items-center justify-center gap-2"
                >
                  <div
                    v-for="tag in article.frontmatter.tags"
                    :key="tag"
                    class="tag px-3 py-1 rounded-full opacity-90 text-xs "
                  >
                    {{ tag }}
                  </div>
                </div>

                <div class="description w-full text-sm opacity-80">
                  {{ article.frontmatter.description }}
                </div>
              </div>

              <img
                v-if="article.frontmatter.image"
                :src="article.frontmatter.image"
                class="hidden md:block rounded-lg shadow-sm"
                width="160"
                height="160"
                backlight
                loading="lazy"
              >
            </div>

            <div
              v-if="articleList.length === 0"
              class=" p-4 text-center text-xl opacity-50"
            >
              找不到任何文章 Σ(ˊДˋ;)
            </div>
          </transition-group>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Config } from '../.vitepress/config.mts'
import { useElementSize } from '@vueuse/core'
import dayjs from 'dayjs'
import { filter, flatMap, map, pipe, unique } from 'remeda'
import { useData, useRouter } from 'vitepress'
import { computed, ref } from 'vue'

const router = useRouter()
const { theme } = useData<Config>()

const linkListRef = ref<HTMLElement>()
const { height: linkListHeight } = useElementSize(linkListRef)
/** 為了讓容器高度有動畫，不要瞬間長高 */
const linkContainerStyle = computed(() => ({
  height: `${linkListHeight.value}px`,
}))

const selectedTags = ref<string[]>([])
const tagList = computed(() => {
  const result = pipe(
    theme.value.articleList ?? [],
    flatMap(({ frontmatter }) => frontmatter.tags ?? []),
    unique(),
    map((name) => {
      const selected = selectedTags.value.includes(name)
      return { name, selected }
    }),
  )

  return result ?? []
})

function toggleTag(name: string) {
  const index = selectedTags.value.indexOf(name)

  if (index < 0) {
    selectedTags.value.push(name)
  }
  else {
    selectedTags.value.splice(index, 1)
  }
}

function selectAllTags() {
  selectedTags.value = tagList.value.map(({ name }) => name)
}
selectAllTags()

function clearAllTags() {
  selectedTags.value = []
}

const articleList = computed(() => pipe(
  theme.value.articleList ?? [],
  filter((article) => {
    if (selectedTags.value.length === 0)
      return false

    return article.frontmatter.tags?.some((tag) => selectedTags.value.includes(tag))
  }),
  map((item) => ({
    ...item,
    frontmatter: {
      ...item.frontmatter,
      date: dayjs(`${item.frontmatter.date}`, 'YYYYMMDD').format('YYYY/MM/DD'),
    },
  })),
))

function to(link: string) {
  router.go(link)
}

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
  outline: 2px solid transparent
  outline-offset: 0.5rem
  &:hover
    outline: 2px solid rgba(0, 0, 0, 0.05)

.list-move, .list-enter-active, .list-leave-active
  transition: all 0.6s cubic-bezier(0.83, 0, 0.17, 1)
.list-enter-from, .list-leave-to
  opacity: 0
  transform: scale(0.96)
.list-leave-active
  position: absolute
</style>
