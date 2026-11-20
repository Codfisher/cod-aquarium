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
        <h1 class="overview-title font-display">
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
            class="article-list plain-list flex flex-col"
            @before-leave="handleBeforeLeave"
          >
            <!-- 每個項目固定一個 li，內容再依類型切換：在 transition-group 裡用 template v-for 包 v-if/v-else，
              SSR 會多出註解節點，hydration 時對不上 -->
            <li
              v-for="entry in entryList"
              :key="entry.key"
              :class="entry.type === 'year' ? 'year-heading' : 'article-item'"
            >
              <!-- 年份當章節標題：九十篇一路排下來沒有節奏，用大字年份切開 -->
              <template v-if="entry.type === 'year'">
                <span
                  role="heading"
                  aria-level="2"
                  class="year-number"
                >{{ entry.year }}</span>
                <span class="year-count">{{ entry.count }} 篇</span>
              </template>

              <template v-else>
                <!-- 不用卡片框：條目之間以刻線分隔，只有封面保留圖版框 -->
                <a
                  :href="entry.article.href"
                  class="article-link"
                >
                  <!-- 顯示 140px（手機 88px），取 300 寬涵蓋 2 倍高解析螢幕。
                    首屏的前兩張是 LCP 候選，eager 並預載，不必等版面算完才開始下載 -->
                  <span
                    v-if="entry.article.frontmatter.image"
                    class="article-cover-frame"
                  >
                    <theme-image
                      :src="entry.article.frontmatter.image"
                      class="article-cover"
                      alt=""
                      width="300"
                      height="300"
                      :loading="entry.index < FIRST_SCREEN_COVER_COUNT ? 'eager' : 'lazy'"
                    />
                  </span>

                  <span class="article-body">
                    <span class="article-meta">
                      <span class="section-name">{{ entry.article.sectionName }}</span>
                      <time
                        v-if="entry.article.frontmatter.date"
                        :datetime="entry.article.frontmatter.isoDate"
                      >{{ entry.article.frontmatter.date }}</time>
                    </span>

                    <!-- 不用 h3：.vp-doc 的標題規則會加上章節編號與分隔線 -->
                    <span
                      role="heading"
                      aria-level="3"
                      class="article-title"
                    >
                      {{ entry.article.frontmatter.title }}
                    </span>

                    <span class="description">{{ entry.article.frontmatter.description }}</span>

                    <span
                      v-if="entry.article.frontmatter.tags"
                      class="tag-list"
                    >
                      <span class="sr-only">標籤：</span>
                      <span
                        v-for="tag in entry.article.frontmatter.tags"
                        :key="tag"
                        class="tag"
                      >#{{ tag }}</span>
                    </span>
                  </span>
                </a>
              </template>
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
import { countBy, filter, flatMap, map, pipe, sort, unique } from 'remeda'
import { computed, defineAsyncComponent, hydrateOnIdle, ref } from 'vue'
import { getSectionName } from '../../site/latest-articles'
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
    sectionName: getSectionName(item.link),
    frontmatter: {
      ...item.frontmatter,
      date: toDateText(item.frontmatter.pubDate, '-'),
      isoDate: toDateText(item.frontmatter.pubDate, '-'),
      image: !isDev ? item.frontmatter.image : item.frontmatter.image?.replace('https://codlin.me', ''),
    },
  })),
))

type OverviewArticle = (typeof articleList.value)[number]
type OverviewEntry =
  | { type: 'year'; key: string; year: string; count: number }
  | { type: 'article'; key: string; article: OverviewArticle; index: number }

/** 年份分組標籤。草稿的 pubDate 可能還沒填完整（例如 202），dev 才會列出草稿，歸到「未定日期」 */
function getYearLabel(pubDate: number) {
  const text = String(pubDate)
  return text.length >= 8 ? text.slice(0, 4) : '未定日期'
}

/** 文章依年份分組，年份標題插在每年第一篇之前 */
const entryList = computed(() => {
  const countRecord = countBy(articleList.value, (article) => getYearLabel(article.frontmatter.pubDate))
  const result: OverviewEntry[] = []
  let previousYear = ''
  articleList.value.forEach((article, index) => {
    const year = getYearLabel(article.frontmatter.pubDate)
    if (year !== previousYear) {
      result.push({ type: 'year', key: `year-${year}`, year, count: countRecord[year] ?? 0 })
      previousYear = year
    }
    result.push({ type: 'article', key: article.link, article, index })
  })
  return result
})

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

.result-count
  color: var(--vp-c-text-2)

/* 與首頁區塊標題同一套：顯示字體 */
.overview-title
  font-size: 36px
  font-weight: 800
  line-height: 1.2
  color: var(--vp-c-text-1)

/* 年份章節標題：顯示字體大字，與文章頁左欄的大字版號同一套 */
.year-heading
  display: flex
  align-items: baseline
  gap: 12px
  padding: 40px 0 8px
  border-bottom: 1px solid var(--plate-line)
  &:first-child
    padding-top: 8px

.year-number
  font-family: var(--display-font-family)
  font-size: 44px
  font-weight: 700
  line-height: 1
  letter-spacing: -0.02em
  font-variant-numeric: tabular-nums
  color: var(--plate-ink)

.year-count
  font-size: 13px
  color: var(--vp-c-text-2)

/* 條目之間只用刻線分隔，不加卡片框 */
.article-item
  border-bottom: 1px solid var(--plate-line)

.article-link
  display: flex
  gap: 16px
  padding: 20px 0
  color: var(--vp-c-text-1)
  font-weight: inherit
  /* style.css 的 .vp-doc a 以 !important 強制加底線，整塊連結要拿掉 */
  text-decoration: none !important
  @media (min-width: 768px)
    gap: 28px
    padding: 28px 0
  &:focus-visible
    outline: 2px solid var(--vp-c-brand-1)
    outline-offset: 4px
    border-radius: 12px

/* 封面沿用圖版框：刻線框、圓角，滑過時框線轉墨、封面恢復飽和 */
.article-cover-frame
  flex: none
  width: 88px
  height: 88px
  overflow: hidden
  border: 1px solid var(--plate-line)
  border-radius: 12px
  transition: border-color 0.25s
  @media (min-width: 768px)
    width: 140px
    height: 140px
    border-radius: 14px

.article-link:hover .article-cover-frame,
.article-link:focus-visible .article-cover-frame
  border-color: var(--plate-ink)

/* class 由 theme-image 傳到內層的 <img>（不是根元素），scoped 樣式要用 :deep 才對得到 */
:deep(.article-cover)
  display: block
  width: 100%
  height: 100%
  margin: 0
  object-fit: cover
  border: none
  border-radius: 0
  filter: saturate(0.85)
  transition: filter 0.4s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)

.article-link:hover :deep(.article-cover),
.article-link:focus-visible :deep(.article-cover)
  filter: none
  transform: scale(1.05)

.article-body
  display: flex
  flex: 1
  flex-direction: column
  gap: 8px
  min-width: 0

.article-meta
  display: flex
  flex-wrap: wrap
  gap: 4px 12px
  font-size: 12px
  color: var(--vp-c-text-2)
  font-variant-numeric: tabular-nums

.section-name
  font-weight: 700
  color: var(--plate-ink)

.article-title
  font-size: 18px
  font-weight: 800
  line-height: 1.45
  text-wrap: pretty
  transition: color 0.25s
  @media (min-width: 768px)
    font-size: 21px

.article-link:hover .article-title
  color: var(--vp-c-brand-1)

.description
  font-size: 14px
  line-height: 1.7
  color: var(--vp-c-text-2)
  white-space: unset
  text-wrap: pretty

/* 標籤只是補充資訊：純文字小標，不加框 */
.tag-list
  display: flex
  flex-wrap: wrap
  gap: 2px 12px
  font-size: 12px
  color: var(--vp-c-text-2)
  opacity: 0.85

/* 前幾篇之後延後排版：90 篇的清單首次排版成本高，畫面外的項目等捲到附近再排 */
.article-list > .article-item:nth-child(n+6)
  content-visibility: auto
  contain-intrinsic-size: auto 190px
  @media (min-width: 768px)
    contain-intrinsic-size: auto 200px

.link-container
  will-change: height
  transition-duration: 0.8s
  transition-timing-function: cubic-bezier(0.83, 0, 0.17, 1)

@media (prefers-reduced-motion: reduce)
  .article-cover-frame, .article-title, :deep(.article-cover)
    transition: none
  .article-link:hover :deep(.article-cover)
    transform: none

.list-move, .list-enter-active, .list-leave-active
  transition: all 0.6s cubic-bezier(0.83, 0, 0.17, 1)
.list-enter-from, .list-leave-to
  opacity: 0
  transform: scale(0.96)
.list-leave-active
  position: absolute
</style>
