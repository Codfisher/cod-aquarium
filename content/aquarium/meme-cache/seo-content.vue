<!-- eslint-disable vue/no-useless-v-bind -->
<template>
  <!-- 結構化資料（JSON-LD）由 .vitepress/config.mts 的 transformHead 注入 head，
       元件內以 script 標籤輸出會被 SSR 跳脫成 HTML 實體，導致 Google 無法剖析 -->
  <section
    aria-labelledby="meme-gallery-title"
    class="gallery-wrap"
  >
    <h1
      id="meme-gallery-title"
      class="page-title"
    >
      迷因梗圖搜尋
    </h1>

    <p class="lead">
      以文字、圖中文字（OCR）搜尋 {{ seoMemeList.length }} 張以上的迷因梗圖，
      找到記憶中的那一張。以下為最新收錄：
    </p>

    <!-- 圖片清單 -->
    <div class="grid">
      <figure
        v-for="(item) in seoMemeList"
        :key="item.file"
        class="card"
      >
        <picture>
          <img
            :src="fileSrc(item.file)"
            :alt="getMemeAlt(item)"
            loading="lazy"
            decoding="async"
            :width="item.width || undefined"
            :height="item.height || undefined"
          >
        </picture>
        <figcaption class="caption">
          <strong class="name">{{ getMemeName(item) }}</strong>
          <span class="desc">{{ getCaption(item) }}</span>
        </figcaption>
      </figure>
    </div>

    <!-- 關鍵字著陸頁入口，讓爬蟲能從此頁走到各關鍵字頁 -->
    <section
      v-if="seoKeywordList.length"
      class="keyword-section"
    >
      <h2>熱門迷因關鍵字</h2>
      <p class="keyword-list">
        <a
          v-for="item in seoKeywordList"
          :key="item.keyword"
          :href="withBase(`/aquarium/meme-cache/tag/${encodeURIComponent(item.keyword)}`)"
          class="keyword"
        >{{ item.keyword }}（{{ item.count }}）</a>
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import type { MemeItem } from './meme-seo'
import { seoKeywordList, seoMemeList } from 'virtual:seo-meme-list'
import { withBase } from 'vitepress'
import { getMemeAlt, getMemeName } from './meme-seo'

const fileSrc = (file: string) => withBase(`/memes/${file}`)
const getCaption = (item: MemeItem) => item.describe ?? ''
</script>

<style scoped lang="sass">
/** 主體 app 為 fixed 全螢幕 iframe，不佔文件流高度，此區塊若貼齊頂端會直接蓋住 app。
 * 留兩個螢幕高的間距，使用者捲動即可看見，圖片也不會在首屏就被 lazy load 觸發下載
 */
.gallery-wrap
  max-width: 1100px
  margin: 0 auto
  padding: 1rem 1rem 2rem
  padding-top: 200vh

.page-title
  font-size: clamp(1.5rem, 2.5vw, 2rem)
  margin: 0 0 1rem

.lead
  color: var(--vp-c-text-2)
  line-height: 1.7
  margin: 0 0 1.5rem

.grid
  display: grid
  grid-template-columns: repeat(1, minmax(0, 1fr))
  gap: 1rem

.card
  display: flex
  flex-direction: column
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  border-radius: 16px
  overflow: hidden

.card picture, .card img
  display: block
  width: 100%

.card picture
  aspect-ratio: 4 / 3
  background: var(--vp-c-bg-alt)

.card img
  object-fit: cover
  height: 100%

.caption
  padding: .75rem .9rem
  font-size: .95rem
  line-height: 1.35
  color: var(--vp-c-text-2)

.caption .name
  display: block
  font-weight: 600
  color: var(--vp-c-text-1)
  margin-bottom: .2rem

.keyword-section
  margin-top: 2.5rem

  h2
    font-size: 1.2rem
    font-weight: 700
    margin: 0 0 .8rem

.keyword-list
  display: flex
  flex-wrap: wrap
  gap: .5rem
  margin: 0

.keyword
  padding: .2rem .7rem
  border-radius: 999px
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  color: var(--vp-c-text-2)
  font-size: .85rem
  text-decoration: none

  &:hover
    color: var(--vp-c-brand-1)
</style>
