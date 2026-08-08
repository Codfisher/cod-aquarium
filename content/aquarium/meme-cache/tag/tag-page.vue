<template>
  <article class="tag-page">
    <nav
      aria-label="麵包屑"
      class="breadcrumb"
    >
      <a href="/">首頁</a>
      <span aria-hidden="true">›</span>
      <a href="/aquarium/meme-cache/">快取梗圖</a>
      <span aria-hidden="true">›</span>
      <span>{{ keyword }}</span>
    </nav>

    <h1 class="title">
      {{ keyword }} 迷因梗圖
    </h1>

    <p class="intro">
      收錄 {{ memeList.length }} 張與「{{ keyword }}」相關的迷因梗圖，
      每張都附上內容描述與圖中文字，方便找到記憶中的那一張。
    </p>

    <p class="action">
      <a :href="searchUrl">到快取梗圖搜尋更多「{{ keyword }}」→</a>
    </p>

    <div class="grid">
      <figure
        v-for="meme in memeList"
        :key="meme.file"
        class="card"
      >
        <img
          :src="withBase(`/memes/${meme.file}`)"
          :alt="getMemeAlt(meme)"
          loading="lazy"
          decoding="async"
        >
        <figcaption>
          <p class="describe">
            {{ meme.describe }}
          </p>
          <p
            v-if="meme.ocr?.trim()"
            class="ocr"
          >
            圖中文字：{{ meme.ocr }}
          </p>
          <p
            v-if="getMemeKeywordList(meme).length"
            class="keyword-list"
          >
            <a
              v-for="item in getMemeKeywordList(meme)"
              :key="item"
              :href="getKeywordUrl(item)"
              class="keyword"
            >{{ item }}</a>
          </p>
        </figcaption>
      </figure>
    </div>

    <!-- 相關關鍵字，串起著陸頁之間的內部連結 -->
    <section
      v-if="relatedKeywordList.length"
      class="related"
    >
      <h2>相關關鍵字</h2>
      <p class="keyword-list">
        <a
          v-for="item in relatedKeywordList"
          :key="item"
          :href="withBase(`/aquarium/meme-cache/tag/${encodeURIComponent(item)}`)"
          class="keyword"
        >{{ item }}</a>
      </p>
    </section>
  </article>
</template>

<script setup lang="ts">
import type { MemeItem } from '../meme-seo'
import { seoKeywordList } from 'virtual:seo-meme-list'
import { withBase } from 'vitepress'
import { computed } from 'vue'
import { getMemeAlt, getMemeKeywordList } from '../meme-seo'

const props = defineProps<{
  keyword: string;
  /** 該關鍵字的迷因清單，以 JSON 字串傳遞，動態路由的 params 僅支援基本型別 */
  memeListJson: string;
}>()

/** 相關關鍵字取前幾個即可，過多反而稀釋內部連結權重 */
const RELATED_KEYWORD_LIMIT = 12

const memeList = computed<MemeItem[]>(() => JSON.parse(props.memeListJson))

const searchUrl = computed(
  () => withBase(`/aquarium/meme-cache/?q=${encodeURIComponent(props.keyword)}`),
)

/** 著陸頁的關鍵字以小寫為鍵，對應回實際頁面採用的寫法 */
const keywordPageMap = new Map(
  seoKeywordList.map((item) => [item.keyword.toLowerCase(), item.keyword]),
)

/** 有著陸頁的關鍵字優先連往該頁，其餘才連到搜尋器 */
function getKeywordUrl(keyword: string) {
  const pageKeyword = keywordPageMap.get(keyword.toLowerCase())
  if (pageKeyword && pageKeyword !== props.keyword) {
    return withBase(`/aquarium/meme-cache/tag/${encodeURIComponent(pageKeyword)}`)
  }

  return withBase(`/aquarium/meme-cache/?q=${encodeURIComponent(keyword)}`)
}

const relatedKeywordList = computed(() => seoKeywordList
  .filter((item) => item.keyword !== props.keyword)
  .slice(0, RELATED_KEYWORD_LIMIT)
  .map((item) => item.keyword))
</script>

<style scoped lang="sass">
.tag-page
  max-width: 1100px
  margin: 0 auto
  padding: 2rem 1rem 4rem

.breadcrumb
  display: flex
  flex-wrap: wrap
  gap: .4rem
  font-size: .9rem
  color: var(--vp-c-text-2)
  margin-bottom: 1rem

  a
    color: var(--vp-c-brand-1)

.title
  font-size: clamp(1.6rem, 3vw, 2.2rem)
  font-weight: 800
  margin: 0 0 .8rem

.intro
  color: var(--vp-c-text-2)
  line-height: 1.7
  margin: 0 0 1rem

.action
  margin: 0 0 2rem

  a
    color: var(--vp-c-brand-1)
    font-weight: 600

.grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr))
  gap: 1.2rem

.card
  display: flex
  flex-direction: column
  margin: 0
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  border-radius: 16px
  overflow: hidden

  img
    display: block
    width: 100%
    aspect-ratio: 4 / 3
    object-fit: contain
    background: var(--vp-c-bg-alt)

  figcaption
    padding: .8rem .9rem
    font-size: .9rem
    line-height: 1.5

.describe
  margin: 0
  color: var(--vp-c-text-1)

.ocr
  margin: .5rem 0 0
  color: var(--vp-c-text-2)
  font-size: .85rem

.keyword-list
  display: flex
  flex-wrap: wrap
  gap: .4rem
  margin: .6rem 0 0

.keyword
  padding: .1rem .5rem
  border-radius: 999px
  background: var(--vp-c-default-soft)
  color: var(--vp-c-text-2)
  font-size: .8rem
  text-decoration: none

  &:hover
    color: var(--vp-c-brand-1)

.related
  margin-top: 3rem
  padding-top: 1.5rem
  border-top: 1px solid var(--vp-c-divider)

  h2
    font-size: 1.2rem
    font-weight: 700
    margin: 0
</style>
