<template>
  <!-- vp-raw：避開 base.css 對 button 的無層級重設，Nuxt UI 按鈕才有正常樣式（見 docs/development-notes.md） -->
  <div class="article-overview vp-raw flex flex-col items-center w-full">
    <div class="flex flex-col lg:flex-row-reverse justify-center items-start gap-4 w-full">
      <!-- 標籤篩選：不選任何標籤時顯示全部文章，選了才只顯示同時含有這些標籤的文章 -->
      <article-tag-filter
        v-model:selected-tag-list="selectedTagList"
        :tag-name-list="tagNameList"
      />

      <div class="flex flex-col gap-4 flex-[3] w-full">
        <h1 class="text-4xl font-bold font-display">
          文章列表
        </h1>

        <p
          class="result-count text-sm"
          aria-live="polite"
        >
          <template v-if="selectedTagList.length === 0">
            共 {{ articleList.length }} 篇文章
          </template>
          <template v-else>
            {{ selectedTagList.length }} 個標籤，符合 {{ articleList.length }} 篇文章
          </template>
        </p>

        <div
          class="link-container"
          :style="linkContainerStyle"
        >
          <!-- 文章列表 -->
          <transition-group
            ref="linkListRef"
            name="list"
            tag="ul"
            class="article-list plain-list flex flex-col gap-2"
            @before-leave="handleBeforeLeave"
          >
            <li
              v-for="(article, index) in articleList"
              :key="article.link"
            >
              <a
                :href="article.href"
                class="article-link flex flex-col md:flex-row-reverse items-center gap-4 rounded-xl p-4 -mx-4"
              >
                <!-- 只渲染一張封面：手機在上方 120px、桌機在右側 140px，用 flex 方向切換位置。
                  原本兩種尺寸各放一個圖片元件以 CSS 切換顯示，90 篇就要 hydration 180 個元件 -->
                <!-- 顯示 140px（手機 120px），取 300 寬涵蓋 2 倍高解析螢幕。
                  首屏的前兩張是 LCP 候選，eager 並預載，不必等版面算完才開始下載 -->
                <theme-image
                  v-if="article.frontmatter.image"
                  :src="article.frontmatter.image"
                  class="article-cover shrink-0"
                  alt=""
                  width="300"
                  height="300"
                  :loading="index < FIRST_SCREEN_COVER_COUNT ? 'eager' : 'lazy'"
                />

                <div class="flex flex-col items-center md:items-start flex-1 gap-2 w-full">

                  <time
                    v-if="article.frontmatter.date"
                    class="article-date text-xs font-mono tracking-wider"
                    :datetime="article.frontmatter.isoDate"
                  >
                    {{ article.frontmatter.date }}
                  </time>

                  <!-- 不用 h2：.vp-doc 的 h2 規則會加上章節編號與分隔線 -->
                  <div
                    role="heading"
                    aria-level="2"
                    class="article-title w-full text-center md:text-left text-xl md:text-2xl font-bold text-pretty leading-snug"
                  >
                    {{ article.frontmatter.title }}
                  </div>

                  <ul
                    v-if="article.frontmatter.tags"
                    class="plain-list flex flex-wrap items-center justify-center md:justify-start gap-1.5"
                    aria-label="標籤"
                  >
                    <li
                      v-for="tag in article.frontmatter.tags"
                      :key="tag"
                      class="tag px-2.5 py-0.5 rounded-full text-xs"
                    >
                      {{ tag }}
                    </li>
                  </ul>

                  <p class="description w-full text-sm leading-relaxed mt-1">
                    {{ article.frontmatter.description }}
                  </p>
                </div>
              </a>
            </li>

            <li
              v-if="articleList.length === 0"
              key="empty"
              class="empty-state flex flex-col items-center gap-3 p-4 text-center text-xl"
            >
              找不到同時符合這些標籤的文章 Σ(ˊДˋ;)
              <u-button
                color="neutral"
                variant="outline"
                size="sm"
                @click="clearAllTags"
              >
                清除篩選，顯示全部
              </u-button>
            </li>
          </transition-group>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import sourceArticleList from '#site/article-list'
import { useElementSize, useMounted } from '@vueuse/core'
import { filter, flatMap, map, pipe, sort, unique } from 'remeda'
import { computed, defineAsyncComponent, hydrateOnIdle, ref } from 'vue'
import ThemeImage from './theme-image.vue'

/** 標籤篩選區閒置時才 hydration，與文章清單拆成不同的任務（見 article-tag-filter.vue） */
const ArticleTagFilter = defineAsyncComponent({
  loader: () => import('./article-tag-filter.vue'),
  hydrate: hydrateOnIdle(2000),
})

const isDev = import.meta.env.DEV
/** pubDate（例如 20241007）轉成日期字串。直接切字串，不必為此在總覽頁載入 dayjs */
function toDateText(pubDate: number, separator: string) {
  const text = String(pubDate)
  return [text.slice(0, 4), text.slice(4, 6), text.slice(6, 8)].join(separator)
}

/** 首屏可見的封面數，這幾張不延遲載入 */
const FIRST_SCREEN_COVER_COUNT = 2

const linkListRef = ref<HTMLElement>()
const { height: linkListHeight } = useElementSize(linkListRef)
const isMounted = useMounted()
/** 為了讓容器高度有動畫，不要瞬間長高。
 * 掛載前量不到高度（SSR 為 0），不設高度，否則預先渲染的清單會被壓成 0 高、等 JS 跑完才出現
 */
const linkContainerStyle = computed(() => isMounted.value && linkListHeight.value > 0
  ? { height: `${linkListHeight.value}px` }
  : undefined)

const selectedTagList = ref<string[]>([])

/** 全部標籤名稱，依文章順序去重 */
const tagNameList = pipe(
  sourceArticleList,
  flatMap(({ frontmatter }) => frontmatter.tags ?? []),
  unique(),
)

function clearAllTags() {
  selectedTagList.value = []
}

const articleList = computed(() => pipe(
  sourceArticleList,
  /** 沒選標籤時顯示全部；選了則只留同時含有所有已選標籤的文章，選越多範圍越窄 */
  filter((article) => selectedTagList.value.every((tag) => article.frontmatter.tags?.includes(tag))),
  sort((a, b) => b.frontmatter.pubDate - a.frontmatter.pubDate),
  map((item) => ({
    ...item,
    /** 文章清單的 link 沒有開頭斜線（例如 blog-vue/xxx），補成站內絕對路徑 */
    href: `/${item.link.replace(/^\//, '')}`,
    frontmatter: {
      ...item.frontmatter,
      date: toDateText(item.frontmatter.pubDate, '/'),
      isoDate: toDateText(item.frontmatter.pubDate, '-'),
      image: !isDev ? item.frontmatter.image : item.frontmatter.image?.replace('https://codlin.me', ''),
    },
  })),
))

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
/* .vp-doc 的清單規則（縮排、項目符號、li 間距）不在 cascade layer 內，scoped 選擇器的權重才壓得過 */
.plain-list
  list-style: none
  padding: 0
  margin: 0
  > li
    margin: 0

.result-count, .article-date, .description
  color: var(--vp-c-text-2)

/* class 由 theme-image 傳到內層的 <img>（不是根元素），scoped 樣式要用 :deep 才對得到 */
:deep(.article-cover)
  display: block
  width: 120px
  height: 120px
  object-fit: cover
  border-radius: 0.5rem
  @media (min-width: 768px)
    width: 140px
    height: 140px
    border-radius: 0.75rem

/* 前幾篇之後延後排版：90 篇的清單首次排版成本高，畫面外的項目等捲到附近再排 */
.article-list > li:nth-child(n+5)
  content-visibility: auto
  contain-intrinsic-size: auto 260px
  @media (min-width: 768px)
    contain-intrinsic-size: auto 200px

.description
  white-space: unset
  text-wrap: pretty
.tag
  background: light-dark(
    color-mix(in oklch, var(--vp-c-brand-soft) 60%, oklch(0.94 0.01 175)),
    color-mix(in oklch, var(--vp-c-brand-soft) 50%, oklch(0.22 0.01 175))
  )
  color: light-dark(
    var(--vp-code-color),
    var(--vp-c-brand-2)
  )
  letter-spacing: 0.6px
  font-weight: 500

.link-container
  will-change: height
  transition-duration: 0.8s
  transition-timing-function: cubic-bezier(0.83, 0, 0.17, 1)

.article-link
  color: var(--vp-c-text-1)
  font-weight: inherit
  /* style.css 的 .vp-doc a 以 !important 強制加底線，整塊卡片式連結要拿掉 */
  text-decoration: none !important
  transition: background-color 0.25s, transform 0.25s
  &:hover
    background: light-dark(oklch(0.97 0.01 175 / 0.6), oklch(0.22 0.015 175 / 0.5))
    transform: translateX(2px)
  &:focus-visible
    outline: 2px solid var(--vp-c-brand-1)
    outline-offset: 2px
  @media (prefers-reduced-motion: reduce)
    &:hover
      transform: none

.list-move, .list-enter-active, .list-leave-active
  transition: all 0.6s cubic-bezier(0.83, 0, 0.17, 1)
.list-enter-from, .list-leave-to
  opacity: 0
  transform: scale(0.96)
.list-leave-active
  position: absolute
</style>
