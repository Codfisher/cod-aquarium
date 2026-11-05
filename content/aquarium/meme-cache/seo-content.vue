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
      以描述或圖中文字（OCR）搜尋 {{ seoMemeTotal }} 張迷因梗圖，找到記憶中的那一張。
    </p>

    <!-- 圖片清單。描述僅寫入 alt 與 head 的結構化資料，不顯示於畫面 -->
    <div class="grid">
      <figure
        v-for="(item) in seoMemeList"
        :key="item.file"
        class="card"
      >
        <img
          :src="fileSrc(item.file)"
          :alt="getMemeAlt(item)"
          loading="lazy"
          decoding="async"
          :width="item.width || undefined"
          :height="item.height || undefined"
        >
      </figure>
    </div>
  </section>
</template>

<script setup lang="ts">
import { seoMemeList, seoMemeTotal } from 'virtual:seo-meme-list'
import { withBase } from 'vitepress'
import { getMemeAlt } from './meme-seo'

const fileSrc = (file: string) => withBase(`/memes/${file}`)
</script>

<style scoped lang="sass">
/** 主體 app 為 fixed 全螢幕，不佔文件流高度，此區塊若貼齊頂端會直接蓋住 app。
 * app 掛載後頁面鎖住捲動，此區塊實際只給爬蟲看，間距要大到圖片不會被 lazy load 提前下載：
 * Chrome 在慢速網路會預載距視窗 2500px 內的 lazy 圖片，原本的 200vh 在手機上只有約 1650px，
 * 9 張原尺寸大圖（約 1.5 MB）因此在首屏就與清單資料搶頻寬
 */
.gallery-wrap
  max-width: 1100px
  margin: 0 auto
  padding: 1rem 1rem 2rem
  padding-top: calc(100vh + 3000px)

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
  margin: 0
  background: var(--vp-c-bg-soft)
  border: 1px solid var(--vp-c-divider)
  border-radius: 16px
  overflow: hidden

.card img
  display: block
  width: 100%
  aspect-ratio: 4 / 3
  object-fit: cover
  background: var(--vp-c-bg-alt)
</style>
