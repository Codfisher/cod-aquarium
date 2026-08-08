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
      最新梗圖
    </h1>

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
  </section>
</template>

<script setup lang="ts">
import type { MemeItem } from './meme-seo'
import { seoMemeList } from 'virtual:seo-meme-list'
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
</style>
